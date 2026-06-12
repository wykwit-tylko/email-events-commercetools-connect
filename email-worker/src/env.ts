export type Env = {
  EMAIL_DEDUPE: KVNamespace;
  EMAIL: EmailBinding;
  EMAIL_SENDING_ENABLED: string;
  FROM_EMAIL: string;
  DEDUPE_TTL_SECONDS: string;
  STORE_URL: string;
  /** Shared secret with the storefront for guest order link keys; links omit the key when unset. */
  ORDER_LINK_SECRET?: string;
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
  return env.EMAIL_SENDING_ENABLED === 'true';
}

export function dedupeTtlSeconds(env: Env): number {
  const value = Number(env.DEDUPE_TTL_SECONDS || '2592000');
  return Number.isInteger(value) && value > 0 ? value : 2_592_000;
}
