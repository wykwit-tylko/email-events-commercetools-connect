import type { Env } from "../env";
import { errorFields, logger } from "../shared/logger";
import {
  emptyStats,
  GLOBAL_STATS_NAME,
  type Stats,
} from "./stats-do";

export { emptyStats, type Stats };

/**
 * Read the current counters from the stats Durable Object. Never throws: stats
 * are observability, never a reason to fail a queue message.
 */
export async function getStats(env: Env): Promise<Stats> {
  try {
    const stub = env.STATS.get(env.STATS.idFromName(GLOBAL_STATS_NAME));
    return await stub.read();
  } catch (error) {
    logger.error("email-worker stats read failed", { ...errorFields(error) });
    return { ...emptyStats };
  }
}

/**
 * Atomically increment one counter via the stats Durable Object. Never throws:
 * a stats failure must not retry (and therefore duplicate) a queue message.
 */
export async function incrementStats(env: Env, field: keyof Stats): Promise<void> {
  try {
    const stub = env.STATS.get(env.STATS.idFromName(GLOBAL_STATS_NAME));
    await stub.increment(field);
    logger.info("email-worker stats incremented", { field });
  } catch (error) {
    logger.error("email-worker stats increment failed", {
      field,
      ...errorFields(error),
    });
  }
}
