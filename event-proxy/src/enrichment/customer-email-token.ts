import type { CommercetoolsClient } from '../infra/commercetools-client.js';
import type { CommerceNotificationEnricher, EnrichmentResult } from './pipeline.js';

export const customerEmailTokenEnricher: CommerceNotificationEnricher = {
  messageType: 'CustomerEmailTokenCreated',
  async enrich(
    payload: Record<string, unknown>,
    client: CommercetoolsClient | undefined,
  ): Promise<EnrichmentResult> {
    if (typeof payload.value !== 'string') {
      return { kind: 'skipped', reason: 'token value absent (check token validity ≤ 60 minutes)' };
    }

    if (typeof payload.customerEmail === 'string' && payload.customerEmail.length > 0) {
      return { kind: 'unchanged', payload };
    }

    const customerId = payload.customerId;
    if (typeof customerId !== 'string' || !client) {
      return { kind: 'skipped', reason: 'customerId missing or no commercetools client available' };
    }

    const customer = await client.getCustomerById(customerId);
    if (!customer) {
      return { kind: 'skipped', reason: `customer ${customerId} not found` };
    }

    return {
      kind: 'enriched',
      payload: {
        ...payload,
        customerEmail: customer.email,
      },
    };
  },
};
