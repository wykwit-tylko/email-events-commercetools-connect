import type { StatsDurableObject } from "./stats/stats-do";
export type Env = {
  EMAIL_DEDUPE: KVNamespace;
  EMAIL: EmailBinding;
  EMAIL_SENDING_ENABLED: string;
  FROM_EMAIL: string;
  INTERNAL_NOTIFICATION_EMAILS?: string;
  DEDUPE_TTL_SECONDS: string;
  STORE_URL: string;
  /** Shared secret with the storefront for guest order link keys; links omit the key when unset. */
  ORDER_LINK_SECRET?: string;

  /** Atomic counters. Single global Durable Object instance, addressed by name. */
  STATS: DurableObjectNamespace<StatsDurableObject>;

  /** Producer binding back to the main queue, used to replay dead-lettered messages. */
  EMAIL_QUEUE: Queue<QueuePayload>;

  /** Name of the dead-letter queue this worker also consumes for alerting and replay. */
  DLQ_QUEUE_NAME: string;
  /** TTL (seconds) for replay-backup copies of dead-lettered messages stored in KV. */
  DLQ_REPLAY_TTL_SECONDS?: string;
  /** Bearer token gating the /admin/* endpoints (replay, inspection). Required for replay. */
  ADMIN_TOKEN?: string;
  /** Optional webhook URL POSTed when the dead-letter queue receives a message. */
  ALERT_WEBHOOK_URL?: string;
};

export type EmailBinding = {
  send(message: {
    to: string;
    from: string;
    subject: string;
    html: string;
    text: string;
  }): Promise<{ messageId?: string }>;
};

export type QueuePayload = Record<string, unknown>;

export type CommerceNotification = QueuePayload & {
  notificationType?: unknown;
  id?: unknown;
  type?: unknown;
};

export function emailSendingEnabled(env: Env): boolean {
  return env.EMAIL_SENDING_ENABLED === "true";
}

export function dedupeTtlSeconds(env: Env): number {
  const value = Number(env.DEDUPE_TTL_SECONDS || "2592000");
  return Number.isInteger(value) && value > 0 ? value : 2_592_000;
}

export function dlqReplayTtlSeconds(env: Env): number {
  const value = Number(env.DLQ_REPLAY_TTL_SECONDS || "2592000");
  return Number.isInteger(value) && value > 0 ? value : 2_592_000;
}

export function internalNotificationEmails(env: Env): string[] {
  const raw = env.INTERNAL_NOTIFICATION_EMAILS ?? "";
  return [...new Set(raw.split(",").map((email) => email.trim()).filter(Boolean))];
}
