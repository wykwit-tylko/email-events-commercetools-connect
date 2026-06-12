import { describe, expect, it } from 'vitest';
import { customerPasswordTokenEnricher } from './customer-password-token';

describe('customerPasswordTokenEnricher', () => {
  it('skips permanently when value is absent', async () => {
    const result = await customerPasswordTokenEnricher.enrich(
      { type: 'CustomerPasswordTokenCreated', customerId: 'cust-1' },
      undefined,
    );

    expect(result).toMatchObject({ kind: 'skipped', retryable: false });
  });

  it('skips retryably when no commercetools client is available', async () => {
    const result = await customerPasswordTokenEnricher.enrich(
      { type: 'CustomerPasswordTokenCreated', customerId: 'cust-1', value: 'token-123' },
      undefined,
    );

    expect(result).toMatchObject({ kind: 'skipped', retryable: true });
  });

  it('skips permanently when customer fetch returns undefined', async () => {
    const client = {
      async getCustomerById() {
        return undefined;
      },
    };

    const result = await customerPasswordTokenEnricher.enrich(
      { type: 'CustomerPasswordTokenCreated', customerId: 'cust-1', value: 'token-123' },
      client as any,
    );

    expect(result).toMatchObject({ kind: 'skipped', retryable: false });
  });

  it('passes through when customerEmail already present', async () => {
    const payload = {
      type: 'CustomerPasswordTokenCreated',
      customerId: 'cust-1',
      customerEmail: 'user@example.com',
      value: 'token-123',
    };
    const result = await customerPasswordTokenEnricher.enrich(payload, undefined);

    expect(result).toEqual({ kind: 'unchanged', payload });
  });

  it('enriches by fetching customer from API', async () => {
    const client = {
      async getCustomerById(id: string) {
        expect(id).toBe('cust-1');
        return { email: 'fetched@example.com' };
      },
    };

    const payload = {
      type: 'CustomerPasswordTokenCreated',
      customerId: 'cust-1',
      value: 'token-123',
    };
    const result = await customerPasswordTokenEnricher.enrich(payload, client as any);

    expect(result.kind).toBe('enriched');
    expect((result as any).payload.customerEmail).toBe('fetched@example.com');
  });
});
