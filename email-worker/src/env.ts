export type Env = {
  EMAIL_DEDUPE: KVNamespace;
  EMAIL: EmailBinding;
  EMAIL_SENDING_ENABLED: string;
  FROM_EMAIL: string;
  DEDUPE_TTL_SECONDS: string;
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

export type EnqueuedCommerceNotification = {
  notificationType?: string;
  id?: string;
  type?: string;
  order?: {
    id?: string;
    customerEmail?: string;
    orderNumber?: string;
    totalPrice?: {
      currencyCode?: string;
      centAmount?: number;
      fractionDigits?: number;
    };
  };
};

export function emailSendingEnabled(env: Env): boolean {
  return env.EMAIL_SENDING_ENABLED === 'true';
}

export function dedupeTtlSeconds(env: Env): number {
  const value = Number(env.DEDUPE_TTL_SECONDS || '2592000');
  return Number.isInteger(value) && value > 0 ? value : 2_592_000;
}
