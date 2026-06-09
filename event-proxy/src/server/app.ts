import express, { type Express, type Request, type Response } from 'express';
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
import { errorFields, type Logger } from '../shared/logger.js';
import { TimeoutError, withTimeout } from '../shared/timeout.js';

export function createApp(options: {
  config: AppConfig;
  publisher: CommerceNotificationPublisher;
  logger: Logger;
  inspectionStore?: InspectionStore;
}): Express {
  const app = express();

  if (options.config.devInspectionEnabled && options.inspectionStore) {
    app.get('/event-proxy/dev/messages', (_request, response) => {
      response.status(200).json({ results: options.inspectionStore?.list() || [] });
    });

    app.get('/event-proxy/dev/messages/:id', (request, response) => {
      const entry = options.inspectionStore?.get(request.params.id);
      if (!entry) {
        response.status(404).send('Inspection entry not found');
        return;
      }
      response.status(200).json(entry);
    });

    app.delete('/event-proxy/dev/messages', (_request, response) => {
      options.inspectionStore?.clear();
      response.status(204).send();
    });
  }

  app.post('/event-proxy', async (request: Request, response: Response) => {
    const startedAt = Date.now();

    try {
      if (!options.config.dryRunForwarding && !options.publisher.isReady()) {
        response.status(503).send('Publisher is not ready');
        return;
      }

      const rawBody = await readRawBody(request, options.config.maxBodyBytes);
      const commerceNotification = extractCommerceNotificationBody({
        rawBody,
        contentType: request.header('content-type'),
        connectSubscriptionDestination:
          options.config.connectSubscriptionDestination,
        maxBodyBytes: options.config.maxBodyBytes,
      });

      const queuePayload = toQueueCommerceNotification(commerceNotification.body);

      if (!options.config.dryRunForwarding) {
        await withTimeout(
          options.publisher.publish(queuePayload, {
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
        bodyBase64: commerceNotification.body.toString('base64'),
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
