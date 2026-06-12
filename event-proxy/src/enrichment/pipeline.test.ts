import { describe, expect, it } from 'vitest';
import { enrichCommerceNotification } from './pipeline';
import type { CommerceNotificationEnricher } from './pipeline';

describe('enrichCommerceNotification', () => {
  it('returns unchanged when no enricher matches', async () => {
    const payload = { type: 'UnknownType' };
    const result = await enrichCommerceNotification(payload, undefined, []);

    expect(result).toEqual({ kind: 'unchanged', payload });
  });

  it('returns unchanged when payload has no type', async () => {
    const payload = { data: 'test' };
    const result = await enrichCommerceNotification(payload, undefined, []);

    expect(result).toEqual({ kind: 'unchanged', payload });
  });

  it('delegates to the matching enricher', async () => {
    const testEnricher: CommerceNotificationEnricher = {
      messageType: 'TestMessage',
      async enrich(payload) {
        return { kind: 'enriched', payload: { ...payload, added: true } };
      },
    };

    const payload = { type: 'TestMessage' };
    const result = await enrichCommerceNotification(payload, undefined, [testEnricher]);

    expect(result).toEqual({
      kind: 'enriched',
      payload: { type: 'TestMessage', added: true },
    });
  });

  it('skips when enricher returns skip', async () => {
    const testEnricher: CommerceNotificationEnricher = {
      messageType: 'TestMessage',
      async enrich() {
        return { kind: 'skipped', reason: 'test reason', retryable: false };
      },
    };

    const payload = { type: 'TestMessage' };
    const result = await enrichCommerceNotification(payload, undefined, [testEnricher]);

    expect(result).toEqual({ kind: 'skipped', reason: 'test reason', retryable: false });
  });
});
