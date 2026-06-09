import type { Env } from '../env';
import { logger } from '../shared/logger';

const STATS_KEY = 'stats:summary';

export type Stats = {
  processed: number;
  ignored: number;
  duplicate: number;
  disabled: number;
  emailsSent: number;
  errors: number;
};

const emptyStats: Stats = {
  processed: 0,
  ignored: 0,
  duplicate: 0,
  disabled: 0,
  emailsSent: 0,
  errors: 0,
};

export async function getStats(env: Env): Promise<Stats> {
  const raw = await env.EMAIL_DEDUPE.get(STATS_KEY);
  if (!raw) return { ...emptyStats };
  try {
    const parsed = JSON.parse(raw) as Partial<Stats>;
    return {
      processed: parsed.processed ?? 0,
      ignored: parsed.ignored ?? 0,
      duplicate: parsed.duplicate ?? 0,
      disabled: parsed.disabled ?? 0,
      emailsSent: parsed.emailsSent ?? 0,
      errors: parsed.errors ?? 0,
    };
  } catch {
    return { ...emptyStats };
  }
}

export async function incrementStats(
  env: Env,
  field: keyof Stats,
): Promise<void> {
  const stats = await getStats(env);
  stats[field] += 1;
  await env.EMAIL_DEDUPE.put(STATS_KEY, JSON.stringify(stats));
  logger.info('email-worker stats incremented', { field, value: stats[field] });
}
