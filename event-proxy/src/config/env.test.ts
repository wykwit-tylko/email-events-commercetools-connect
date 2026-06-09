import { describe, expect, it } from 'vitest';
import { loadAppConfig, loadSubscriptionConfig } from './env.js';

describe('config', () => {
  it('requires Cloudflare API token for app config', () => {
    expect(() =>
      loadAppConfig({
        CLOUDFLARE_ACCOUNT_ID: 'account-id',
        CLOUDFLARE_QUEUE_ID: 'queue-id',
      }),
    ).toThrow('CLOUDFLARE_API_TOKEN is required');
  });

  it('loads app defaults', () => {
    const config = loadAppConfig({
      CLOUDFLARE_ACCOUNT_ID: 'account-id',
      CLOUDFLARE_QUEUE_ID: 'queue-id',
      CLOUDFLARE_API_TOKEN: 'token',
    });

    expect(config.port).toBe(8080);
    expect(config.maxBodyBytes).toBe(90_000);
    expect(config.forwardingTimeoutMs).toBe(2_000);
    expect(config.dryRunForwarding).toBe(false);
    expect(config.devInspectionEnabled).toBe(false);
    expect(config.devInspectionMaxMessages).toBe(100);
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
