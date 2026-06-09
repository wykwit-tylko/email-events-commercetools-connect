import { dedupeTtlSeconds, type Env } from '../env';
import { logger } from '../shared/logger';

export async function wasAlreadySent(
  env: Env,
  notificationId: string,
): Promise<boolean> {
  const key = dedupeKey(notificationId);
  const existing = await env.EMAIL_DEDUPE.get(key);
  const alreadySent = existing !== null;
  logger.info('email-worker dedupe checked', {
    notificationId,
    key,
    alreadySent,
  });
  return alreadySent;
}

export async function markSent(
  env: Env,
  notificationId: string,
): Promise<void> {
  const key = dedupeKey(notificationId);
  const ttl = dedupeTtlSeconds(env);
  await env.EMAIL_DEDUPE.put(
    key,
    new Date().toISOString(),
    { expirationTtl: ttl },
  );
  logger.info('email-worker dedupe recorded', {
    notificationId,
    key,
    ttl,
  });
}

function dedupeKey(notificationId: string): string {
  return `sent:${notificationId}`;
}
