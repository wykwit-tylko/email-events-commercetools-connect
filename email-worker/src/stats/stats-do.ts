import { DurableObject } from "cloudflare:workers";
/**
 * Atomic counters for the email worker.
 *
 * Backed by a single Durable Object so every increment serializes through one
 * single-threaded instance. The previous implementation did read-modify-write
 * on a KV key, which lost increments whenever concurrent batch deliveries (or
 * separate isolates) read the same stale value. Counters drive operational
 * alerting, so silent undercounting was unacceptable.
 *
 * The Durable Object is addressed by a fixed name (a single global instance),
 * which keeps `/stats` reading exact, synchronous totals.
 */
export type Stats = {
  processed: number;
  ignored: number;
  duplicate: number;
  disabled: number;
  emailsSent: number;
  errors: number;
  /** Messages that exhausted queue retries and landed in the dead-letter queue. */
  dlq: number;
};

export const emptyStats: Stats = {
  processed: 0,
  ignored: 0,
  duplicate: 0,
  disabled: 0,
  emailsSent: 0,
  errors: 0,
  dlq: 0,
};

/** Single global Durable Object name; one instance holds every counter. */
export const GLOBAL_STATS_NAME = "global";
const STATS_KEY = "stats";

/** RPC surface the worker calls; implemented by StatsDurableObject. */
export type StatsStore = {
  increment(field: keyof Stats): Promise<void>;
  read(): Promise<Stats>;
};

/**
 * Durable Object that owns all counters. Requests serialize through it, so
 * increments are atomic and reads are exact. Backed by SQLite storage, which
 * persists across evictions without a separate migration class beyond the
 * `new_sqlite_classes` entry in wrangler.toml.
 */
export class StatsDurableObject extends DurableObject {
  // ctx/env are provided by the base class. Constructor accepts an unknown env
  // so unit tests can instantiate directly with a fake DurableObjectState.
  constructor(ctx: DurableObjectState, env?: unknown) {
    super(ctx, env as never);
  }

  async increment(field: keyof Stats): Promise<void> {
    const current = await this.read();
    current[field] += 1;
    await this.ctx.storage.put(STATS_KEY, current);
  }

  async read(): Promise<Stats> {
    const stored = await this.ctx.storage.get<Stats>(STATS_KEY);
    return { ...emptyStats, ...(stored ?? {}) };
  }
}
