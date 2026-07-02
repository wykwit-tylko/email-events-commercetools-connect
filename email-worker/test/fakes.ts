import type { QueuePayload } from "../src/env";

/**
 * Shared in-memory fakes for the Cloudflare bindings the Node unit tests rely
 * on. Centralized so every test sees the same behavior (pagination cursors,
 * failure injection) instead of five divergent copies.
 */

/** In-memory `KVNamespace` fake with optional pagination and failure injection. */
export class FakeKV {
  private readonly values = new Map<string, string>();
  readonly failGetKeys = new Set<string>();
  readonly failPutKeys = new Set<string>();
  private readonly pageSize: number;

  constructor(options: { pageSize?: number; entries?: Array<[string, unknown]> } = {}) {
    this.pageSize = options.pageSize ?? 1000;
    for (const [key, value] of options.entries ?? []) {
      this.values.set(key, typeof value === "string" ? value : JSON.stringify(value));
    }
  }

  async get(key: string): Promise<string | null> {
    if (this.failGetKeys.has(key)) throw new Error(`KV get failed for ${key}`);
    return this.values.get(key) ?? null;
  }

  async put(key: string, value: string, _options?: { expirationTtl?: number }): Promise<void> {
    if (this.failPutKeys.has(key)) throw new Error(`KV put failed for ${key}`);
    this.values.set(key, value);
  }

  async delete(key: string): Promise<void> {
    this.values.delete(key);
  }

  async list(options?: { prefix?: string; cursor?: string; limit?: number }): Promise<{
    keys: Array<{ name: string }>;
    list_complete: boolean;
    cursor: string;
  }> {
    const prefix = options?.prefix ?? "";
    const all = [...this.values.keys()]
      .filter((key) => (prefix ? key.startsWith(prefix) : true))
      .sort();
    const start = options?.cursor ? Number(options.cursor) : 0;
    // Effective page is the smaller of the requested limit and this fake's page
    // size, mirroring real KV (which caps keys per call at the requested limit).
    const limit = Math.min(options?.limit ?? this.pageSize, this.pageSize);
    const page = all.slice(start, start + limit);
    const listComplete = start + limit >= all.length;
    return {
      keys: page.map((name) => ({ name })),
      list_complete: listComplete,
      cursor: listComplete ? "" : String(start + limit),
    };
  }
}

/** In-memory `DurableObjectNamespace` fake for the STATS counters. */
export class FakeStatsNamespace {
  private readonly stats = {
    processed: 0,
    ignored: 0,
    duplicate: 0,
    disabled: 0,
    emailsSent: 0,
    errors: 0,
    dlq: 0,
  };

  idFromName(_name: string): string {
    return "stats-id";
  }

  get(_id: string) {
    const stats = this.stats;
    return {
      async increment(field: keyof typeof stats) {
        stats[field] += 1;
      },
      async read() {
        return { ...stats };
      },
    };
  }
}

/** In-memory Queue producer fake with an optional one-shot failure. */
export class FakeQueue {
  readonly sent: QueuePayload[] = [];
  private shouldFail = false;

  failOnNext(): void {
    this.shouldFail = true;
  }

  async send(message: QueuePayload): Promise<{ metadata: { metrics: unknown } }> {
    if (this.shouldFail) {
      this.shouldFail = false;
      throw new Error("queue send failed");
    }
    this.sent.push(message);
    return { metadata: { metrics: {} } };
  }
}
