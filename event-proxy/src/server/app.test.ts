import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createApp } from './app.js';
import type { AppConfig } from '../config/env.js';
import { createSilentLogger, FakePublisher } from '../test/test-utils.js';

const baseConfig: AppConfig = {
  port: 8080,
  natsUrl: 'nats://localhost:4222',
  natsAuthToken: 'token',
  natsSubject: 'commerce-notifications.email',
  maxBodyBytes: 1024,
  natsPublishTimeoutMs: 50,
};

describe('event proxy app', () => {
  it('publishes the exact raw request body to NATS', async () => {
    const publisher = new FakePublisher();
    const app = createApp({
      config: baseConfig,
      publisher,
      logger: createSilentLogger(),
    });
    const bodyText = '{"type":"OrderCreated","spacing": true}';
    const body = Buffer.from(bodyText);

    await request(app)
      .post('/event-proxy')
      .set('Content-Type', 'application/json')
      .send(bodyText)
      .expect(200);

    expect(publisher.published).toHaveLength(1);
    expect(publisher.published[0]?.subject).toBe(baseConfig.natsSubject);
    expect(publisher.published[0]?.payload.equals(body)).toBe(true);
    expect(publisher.published[0]?.options?.contentType).toContain(
      'application/json',
    );
  });

  it('unwraps a Connect Google Pub/Sub transport envelope without parsing the Commerce Notification', async () => {
    const publisher = new FakePublisher();
    const app = createApp({
      config: {
        ...baseConfig,
        connectSubscriptionDestination: 'GoogleCloudPubSub',
      },
      publisher,
      logger: createSilentLogger(),
    });
    const commerceNotification = Buffer.from(
      '{"notificationType":"Message","type":"OrderCreated"}',
    );
    const envelope = {
      message: {
        data: commerceNotification.toString('base64'),
        messageId: 'message-id',
      },
      subscription: 'subscription',
    };

    await request(app)
      .post('/event-proxy')
      .set('Content-Type', 'application/json')
      .send(JSON.stringify(envelope))
      .expect(200);

    expect(publisher.published).toHaveLength(1);
    expect(publisher.published[0]?.payload.equals(commerceNotification)).toBe(
      true,
    );
  });

  it('returns 413 when the request body exceeds the configured limit', async () => {
    const publisher = new FakePublisher();
    const app = createApp({
      config: { ...baseConfig, maxBodyBytes: 4 },
      publisher,
      logger: createSilentLogger(),
    });

    await request(app).post('/event-proxy').send('12345').expect(413);

    expect(publisher.published).toHaveLength(0);
  });

  it('returns 503 when NATS is not ready', async () => {
    const publisher = new FakePublisher();
    publisher.ready = false;
    const app = createApp({
      config: baseConfig,
      publisher,
      logger: createSilentLogger(),
    });

    await request(app).post('/event-proxy').send('body').expect(503);

    expect(publisher.published).toHaveLength(0);
  });

  it('returns 503 when NATS publish fails', async () => {
    const publisher = new FakePublisher();
    publisher.error = new Error('publish failed');
    const app = createApp({
      config: baseConfig,
      publisher,
      logger: createSilentLogger(),
    });

    await request(app).post('/event-proxy').send('body').expect(503);
  });

  it('returns 503 when NATS publish times out', async () => {
    const publisher = new FakePublisher();
    publisher.neverResolve = true;
    const app = createApp({
      config: { ...baseConfig, natsPublishTimeoutMs: 1 },
      publisher,
      logger: createSilentLogger(),
    });

    await request(app).post('/event-proxy').send('body').expect(503);
  });
});
