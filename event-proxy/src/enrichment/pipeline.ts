import type { CommercetoolsClient } from '../infra/commercetools-client.js';

export type EnrichmentResult =
  | { kind: 'enriched'; payload: Record<string, unknown> }
  | { kind: 'skipped'; reason: string }
  | { kind: 'unchanged'; payload: Record<string, unknown> };

export type CommerceNotificationEnricher = {
  messageType: string;
  enrich(
    payload: Record<string, unknown>,
    client: CommercetoolsClient | undefined,
  ): Promise<EnrichmentResult>;
};

export async function enrichCommerceNotification(
  payload: Record<string, unknown>,
  client: CommercetoolsClient | undefined,
  enrichers: CommerceNotificationEnricher[],
): Promise<EnrichmentResult> {
  const messageType = payload.type;

  if (typeof messageType !== 'string') {
    return { kind: 'unchanged', payload };
  }

  const enricher = enrichers.find((e) => e.messageType === messageType);

  if (!enricher) {
    return { kind: 'unchanged', payload };
  }

  return enricher.enrich(payload, client);
}
