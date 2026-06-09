import { describe, expect, it } from 'vitest';
import { loadAppConfig, loadSubscriptionConfig } from './env.js';

describe('config', () => {
  it('requires NATS token for app config', () => {
    expect(() =>
      loadAppConfig({
        NATS_URL: 'nats://localhost:4222',
      }),
    ).toThrow('NATS_AUTH_TOKEN is required');
  });

  it('loads app defaults', () => {
    const config = loadAppConfig({
      NATS_URL: 'nats://localhost:4222',
      NATS_AUTH_TOKEN: 'token',
    });

    expect(config.port).toBe(8080);
    expect(config.natsSubject).toBe('commerce-notifications.email');
    expect(config.maxBodyBytes).toBe(1_048_576);
    expect(config.natsPublishTimeoutMs).toBe(2_000);
  });

  it('loads subscription config with resource type de-duplication', () => {
    const config = loadSubscriptionConfig({
      CTP_REGION: 'europe-west1.gcp',
      CTP_PROJECT_KEY: 'project',
      CTP_CLIENT_ID: 'client-id',
      CTP_CLIENT_SECRET: 'client-secret',
      CTP_SCOPE: 'manage_subscriptions:project',
      CT_MESSAGE_RESOURCE_TYPES: 'order, customer, order',
    });

    expect(config.messageResourceTypes).toEqual(['order', 'customer']);
    expect(config.deliveryFormat).toBe('Platform');
  });
});
