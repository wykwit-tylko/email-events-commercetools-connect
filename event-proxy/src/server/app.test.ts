import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createApp } from './app.js';
import type { AppConfig } from '../config/env.js';
import { InspectionStore } from '../dev-inspection/inspection-store.js';
import { createSilentLogger, FakePublisher } from '../test/test-utils.js';

const baseConfig: AppConfig = {
  port: 8080,
  cloudflareAccountId: 'account-id',
  cloudflareQueueId: 'queue-id',
  cloudflareApiToken: 'token',
  maxBodyBytes: 1024,
  forwardingTimeoutMs: 50,
  dryRunForwarding: false,
  devInspectionEnabled: false,
  devInspectionMaxMessages: 100,
};

describe('event proxy app', () => {
  it('publishes parsed Commerce Notification JSON to the outbound publisher', async () => {
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
    expect(publisher.published[0]?.payload).toEqual({
      type: 'OrderCreated',
      spacing: true,
    });
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
    expect(publisher.published[0]?.payload).toEqual({
      notificationType: 'Message',
      type: 'OrderCreated',
    });
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

  it('returns 503 when the publisher is not ready', async () => {
    const publisher = new FakePublisher();
    publisher.ready = false;
    const app = createApp({
      config: baseConfig,
      publisher,
      logger: createSilentLogger(),
    });

    await request(app)
      .post('/event-proxy')
      .set('Content-Type', 'application/json')
      .send('{"type":"OrderCreated"}')
      .expect(503);

    expect(publisher.published).toHaveLength(0);
  });

  it('returns 503 when forwarding fails', async () => {
    const publisher = new FakePublisher();
    publisher.error = new Error('publish failed');
    const app = createApp({
      config: baseConfig,
      publisher,
      logger: createSilentLogger(),
    });

    await request(app)
      .post('/event-proxy')
      .set('Content-Type', 'application/json')
      .send('{"type":"OrderCreated"}')
      .expect(503);
  });

  it('returns 503 when forwarding times out', async () => {
    const publisher = new FakePublisher();
    publisher.neverResolve = true;
    const app = createApp({
      config: { ...baseConfig, forwardingTimeoutMs: 1 },
      publisher,
      logger: createSilentLogger(),
    });

    await request(app)
      .post('/event-proxy')
      .set('Content-Type', 'application/json')
      .send('{"type":"OrderCreated"}')
      .expect(503);
  });

  it('stores messages in the dev inspection log when enabled', async () => {
    const publisher = new FakePublisher();
    const inspectionStore = new InspectionStore(2);
    const app = createApp({
      config: {
        ...baseConfig,
        devInspectionEnabled: true,
        dryRunForwarding: true,
      },
      publisher,
      logger: createSilentLogger(),
      inspectionStore,
    });

    await request(app)
      .post('/event-proxy')
      .set('Content-Type', 'application/json')
      .send('{"type":"OrderCreated"}')
      .expect(200);

    expect(publisher.published).toHaveLength(0);

    const listResponse = await request(app)
      .get('/event-proxy/dev/messages')
      .expect(200);

    expect(listResponse.body.results).toHaveLength(1);
    expect(listResponse.body.results[0].bodyBase64).toBe(
      Buffer.from('{"type":"OrderCreated"}').toString('base64'),
    );
  });

  it('returns 400 for invalid Commerce Notification JSON', async () => {
    const publisher = new FakePublisher();
    const app = createApp({
      config: baseConfig,
      publisher,
      logger: createSilentLogger(),
    });

    await request(app).post('/event-proxy').send('not-json').expect(400);

    expect(publisher.published).toHaveLength(0);
  });

  it('does not expose dev inspection endpoints when disabled', async () => {
    const publisher = new FakePublisher();
    const app = createApp({
      config: baseConfig,
      publisher,
      logger: createSilentLogger(),
    });

    await request(app).get('/event-proxy/dev/messages').expect(404);
  });
});
