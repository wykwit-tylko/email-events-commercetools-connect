import type { CommerceNotificationEnricher, EnrichmentResult } from './pipeline.js';

export const orderCreatedEnricher: CommerceNotificationEnricher = {
  messageType: 'OrderCreated',
  async enrich(payload): Promise<EnrichmentResult> {
    return { kind: 'unchanged', payload };
  },
};
