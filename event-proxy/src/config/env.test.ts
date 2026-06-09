import { describe, expect, it } from 'vitest';
import { loadAppConfig, loadSubscriptionConfig } from './env.js';

const publisherConfig = JSON.stringify({
  type: 'cloudflare-queue',
  accountId: 'account-id',
  queueId: 'queue-id',
  apiToken: 'token',
});

describe('config', () => {
  it('requires outbound publisher config for app config', () => {
    expect(() =>
      loadAppConfig({}),
    ).toThrow('OUTBOUND_PUBLISHER_CONFIG is required');
  });

  it('loads app defaults', () => {
    const config = loadAppConfig({
      OUTBOUND_PUBLISHER_CONFIG: publisherConfig,
    });

    expect(config.port).toBe(8080);
    expect(config.publisherConfig).toEqual({
      type: 'cloudflare-queue',
      accountId: 'account-id',
      queueId: 'queue-id',
      apiToken: 'token',
    });
    expect(config.messageTypes).toEqual([]);
    expect(config.maxBodyBytes).toBe(90_000);
    expect(config.forwardingTimeoutMs).toBe(2_000);
    expect(config.dryRunForwarding).toBe(false);
    expect(config.devInspectionEnabled).toBe(false);
    expect(config.devInspectionMaxMessages).toBe(100);
  });

  it('loads message type filters with de-duplication', () => {
    const config = loadAppConfig({
      OUTBOUND_PUBLISHER_CONFIG: publisherConfig,
      CT_MESSAGE_TYPES: 'OrderCreated, CustomerCreated, OrderCreated',
    });

    expect(config.messageTypes).toEqual(['OrderCreated', 'CustomerCreated']);
  });

  it('rejects unsupported publisher config types', () => {
    expect(() =>
      loadAppConfig({
        OUTBOUND_PUBLISHER_CONFIG: JSON.stringify({ type: 'sns' }),
      }),
    ).toThrow('OUTBOUND_PUBLISHER_CONFIG type must be cloudflare-queue');
  });

  it('loads subscription config with resource type de-duplication', () => {
    const config = loadSubscriptionConfig({
      CTP_API_URL: 'https://api.europe-west1.gcp.commercetools.com',
      CTP_AUTH_URL: 'https://auth.europe-west1.gcp.commercetools.com',
      CTP_PROJECT_KEY: 'project',
      CTP_CLIENT_ID: 'client-id',
      CTP_CLIENT_SECRET: 'client-secret',
      CTP_SCOPE: 'manage_subscriptions:project',
      CT_DELIVERY_FORMAT: 'CloudEvents',
      CT_MESSAGE_RESOURCE_TYPES: 'order, customer, order',
    });

    expect(config.messageResourceTypes).toEqual(['order', 'customer']);
    expect(config.deliveryFormat).toBe('Platform');
  });
});
