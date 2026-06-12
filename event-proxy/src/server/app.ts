import express, {
  type Express,
  type NextFunction,
  type Request,
  type Response,
} from 'express';
import {
  DecodedPayloadTooLargeError,
  extractCommerceNotificationBody,
} from './commerce-notification-body.js';
import { PayloadTooLargeError, readRawBody } from './raw-body.js';
import {
  InvalidCommerceNotificationJsonError,
  toQueueCommerceNotification,
} from './queue-payload.js';
import type { AppConfig } from '../config/env.js';
import type { InspectionStore } from '../dev-inspection/inspection-store.js';
import type { CommerceNotificationPublisher } from '../infra/commerce-notification-publisher.js';
import { CommercetoolsClient } from '../infra/commercetools-client.js';
import { defaultEnrichers } from '../enrichment/registry.js';
import { enrichCommerceNotification } from '../enrichment/pipeline.js';
import { errorFields, type Logger } from '../shared/logger.js';
import { TimeoutError, withTimeout } from '../shared/timeout.js';

export function createApp(options: {
  config: AppConfig;
  publisher: CommerceNotificationPublisher;
  logger: Logger;
  inspectionStore?: InspectionStore;
  commercetoolsClient?: CommercetoolsClient;
}): Express {
  const app = express();

  if (options.config.devInspectionEnabled && options.inspectionStore) {
    const inspectionToken = options.config.devInspectionToken;

    if (!inspectionToken) {
      // Fail closed: without a token the inspection endpoints stay
      // unregistered and respond 404 even when inspection is enabled.
      options.logger.warn(
        'dev inspection enabled but DEV_INSPECTION_TOKEN is not set; inspection endpoints are disabled',
      );
    } else {
      const requireInspectionAuth = (
        request: Request,
        response: Response,
        next: NextFunction,
      ): void => {
        if (request.header('authorization') !== `Bearer ${inspectionToken}`) {
          response.status(401).send('Unauthorized');
          return;
        }
        next();
      };

      app.get('/event-proxy/dev/messages', requireInspectionAuth, (_request, response) => {
        response.status(200).json({ results: options.inspectionStore?.list() || [] });
      });

      app.get('/event-proxy/dev/messages/:id', requireInspectionAuth, (request, response) => {
        const entry = options.inspectionStore?.get(request.params.id);
        if (!entry) {
          response.status(404).send('Inspection entry not found');
          return;
        }
        response.status(200).json(entry);
      });

      app.delete('/event-proxy/dev/messages', requireInspectionAuth, (_request, response) => {
        options.inspectionStore?.clear();
        response.status(204).send();
      });
    }
  }

  app.post('/event-proxy', async (request: Request, response: Response) => {
    const startedAt = Date.now();

    try {
      const rawBody = await readRawBody(request, options.config.maxBodyBytes);
      const commerceNotification = extractCommerceNotificationBody({
        rawBody,
        contentType: request.header('content-type'),
        connectSubscriptionDestination:
          options.config.connectSubscriptionDestination,
        maxBodyBytes: options.config.maxBodyBytes,
      });

      const queuePayload = toQueueCommerceNotification(commerceNotification.body);

      if (!matchesMessageTypeFilter(queuePayload, options.config.messageTypes)) {
        options.inspectionStore?.add({
          contentType: commerceNotification.contentType,
          requestBytes: rawBody.length,
          publishedBytes: commerceNotification.body.length,
          dryRun: options.config.dryRunForwarding,
          body: queuePayload,
        });

        options.logger.info('commerce notification skipped by message type filter', {
          messageType: queuePayload.type,
          allowedMessageTypes: options.config.messageTypes,
          requestBytes: rawBody.length,
          durationMs: Date.now() - startedAt,
        });

        response.status(200).send();
        return;
      }

      const enrichmentResult = await enrichCommerceNotification(
        queuePayload,
        options.commercetoolsClient,
        defaultEnrichers,
      );

      if (enrichmentResult.kind === 'skipped') {
        if (enrichmentResult.retryable) {
          // Transient (e.g. commercetools client not configured): tell
          // Connect to redeliver instead of dropping the notification.
          options.logger.warn('commerce notification enrichment unavailable, requesting retry', {
            messageType: queuePayload.type,
            reason: enrichmentResult.reason,
            requestBytes: rawBody.length,
            durationMs: Date.now() - startedAt,
          });
          response.status(503).send('Commerce Notification enrichment unavailable');
          return;
        }

        // Permanently unrecoverable; acknowledge so Connect stops retrying.
        options.logger.warn('commerce notification skipped: enrichment failed', {
          messageType: queuePayload.type,
          reason: enrichmentResult.reason,
          requestBytes: rawBody.length,
          durationMs: Date.now() - startedAt,
        });
        response.status(200).send();
        return;
      }

      const enrichedPayload = enrichmentResult.payload;

      if (!options.config.dryRunForwarding && !options.publisher.isReady()) {
        response.status(503).send('Publisher is not ready');
        return;
      }

      if (!options.config.dryRunForwarding) {
        await withTimeout(
          options.publisher.publish(enrichedPayload, {
            contentType: commerceNotification.contentType,
          }),
          'Commerce Notification forwarding',
          options.config.forwardingTimeoutMs,
        );
      }

      options.inspectionStore?.add({
        contentType: commerceNotification.contentType,
        requestBytes: rawBody.length,
        publishedBytes: commerceNotification.body.length,
        dryRun: options.config.dryRunForwarding,
        body: enrichedPayload,
      });

      options.logger.info('commerce notification forwarded', {
        dryRun: options.config.dryRunForwarding,
        contentType: commerceNotification.contentType,
        requestBytes: rawBody.length,
        publishedBytes: commerceNotification.body.length,
        durationMs: Date.now() - startedAt,
      });

      response.status(200).send();
    } catch (error) {
      if (
        error instanceof PayloadTooLargeError ||
        error instanceof DecodedPayloadTooLargeError
      ) {
        response.status(413).send(error.message);
        return;
      }

      if (error instanceof InvalidCommerceNotificationJsonError) {
        response.status(400).send(error.message);
        return;
      }

      if (error instanceof TimeoutError) {
        options.logger.error('commerce notification forwarding timed out', {
          dryRun: options.config.dryRunForwarding,
          durationMs: Date.now() - startedAt,
          ...errorFields(error),
        });
        response.status(503).send(error.message);
        return;
      }

      options.logger.error('commerce notification forwarding failed', {
        dryRun: options.config.dryRunForwarding,
        durationMs: Date.now() - startedAt,
        ...errorFields(error),
      });
      response.status(503).send('Commerce Notification forwarding failed');
    }
  });

  return app;
}

function matchesMessageTypeFilter(
  payload: Record<string, unknown>,
  messageTypes: string[],
): boolean {
  if (messageTypes.length === 0) {
    return true;
  }

  return typeof payload.type === 'string' && messageTypes.includes(payload.type);
}


