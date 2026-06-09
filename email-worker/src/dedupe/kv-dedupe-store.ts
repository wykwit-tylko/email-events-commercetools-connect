import { dedupeTtlSeconds, type Env } from '../env';

export async function wasAlreadySent(
  env: Env,
  notificationId: string,
): Promise<boolean> {
  return (await env.EMAIL_DEDUPE.get(dedupeKey(notificationId))) !== null;
}

export async function markSent(
  env: Env,
  notificationId: string,
): Promise<void> {
  await env.EMAIL_DEDUPE.put(
    dedupeKey(notificationId),
    new Date().toISOString(),
    { expirationTtl: dedupeTtlSeconds(env) },
  );
}

function dedupeKey(notificationId: string): string {
  return `sent:${notificationId}`;
}
