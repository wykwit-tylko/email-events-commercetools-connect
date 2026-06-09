import express, { type Express, type Request, type Response } from 'express';
import {
  DecodedPayloadTooLargeError,
  extractCommerceNotificationBody,
} from './commerce-notification-body.js';
import { PayloadTooLargeError, readRawBody } from './raw-body.js';
import type { AppConfig } from '../config/env.js';
import type { NatsPublisher } from '../infra/nats-publisher.js';
import { errorFields, type Logger } from '../shared/logger.js';
import { TimeoutError, withTimeout } from '../shared/timeout.js';

export function createApp(options: {
  config: AppConfig;
  publisher: NatsPublisher;
  logger: Logger;
}): Express {
  const app = express();

  app.post('/event-proxy', async (request: Request, response: Response) => {
    const startedAt = Date.now();

    try {
      if (!options.publisher.isReady()) {
        response.status(503).send('NATS connection is not ready');
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

      await withTimeout(
        options.publisher.publish(
          options.config.natsSubject,
          commerceNotification.body,
          { contentType: commerceNotification.contentType },
        ),
        'NATS publish',
        options.config.natsPublishTimeoutMs,
      );

      options.logger.info('commerce notification forwarded', {
        natsSubject: options.config.natsSubject,
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

      if (error instanceof TimeoutError) {
        options.logger.error('commerce notification forwarding timed out', {
          natsSubject: options.config.natsSubject,
          durationMs: Date.now() - startedAt,
          ...errorFields(error),
        });
        response.status(503).send(error.message);
        return;
      }

      options.logger.error('commerce notification forwarding failed', {
        natsSubject: options.config.natsSubject,
        durationMs: Date.now() - startedAt,
        ...errorFields(error),
      });
      response.status(503).send('NATS publish failed');
    }
  });

  return app;
}
