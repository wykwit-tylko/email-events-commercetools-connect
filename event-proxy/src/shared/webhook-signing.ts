import { hmacSha256Hex } from "./hmac.js";

/**
 * Signing scheme version. It is the first line of the canonical message so the
 * scheme can evolve without ambiguity. The proxy and the shelfmarket receiver
 * must agree on this exact string.
 */
export const WEBHOOK_SIGNATURE_VERSION = "webhook-v1";

export const WEBHOOK_TIMESTAMP_HEADER = "X-Webhook-Timestamp";
export const WEBHOOK_ID_HEADER = "X-Webhook-Id";
export const WEBHOOK_SIGNATURE_HEADER = "X-Webhook-Signature";

export type WebhookSigningParts = {
  /** Unix seconds, as a decimal string. */
  timestamp: string;
  /** Stable notification id, used by the receiver for replay dedupe. */
  messageId: string;
  /** The exact request body string that will be POSTed. */
  body: string;
};

/**
 * Canonical string covered by the HMAC. Newline-delimited and version-prefixed
 * so the three concerns (timestamp freshness, idempotency id, exact body bytes)
 * cannot bleed into one another. The body is included verbatim, which is why
 * the receiver must verify over the raw bytes it received, not a re-serialized
 * copy.
 */
export function buildWebhookCanonicalMessage(parts: WebhookSigningParts): string {
  return [WEBHOOK_SIGNATURE_VERSION, parts.timestamp, parts.messageId, parts.body].join("\n");
}

export function signWebhook(secret: string, parts: WebhookSigningParts): Promise<string> {
  return hmacSha256Hex(secret, buildWebhookCanonicalMessage(parts));
}
