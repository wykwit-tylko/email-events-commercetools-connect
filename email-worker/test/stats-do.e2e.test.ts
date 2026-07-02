/// <reference types="@cloudflare/vitest-pool-workers/types" />
import { SELF, env } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import type { Env } from "../src/env";

/**
 * End-to-end test for the stats Durable Object, running inside the Workers
 * runtime via Miniflare against the local `wrangler.e2e.toml`.
 *
 * The Node-based unit tests (src/stats/stats-do.test.ts) instantiate the DO
 * directly through a `cloudflare:workers` shim, so they cannot catch the failure
 * mode this guards against: a DO class that does not extend `DurableObject`
 * (RPC never reaches it) or a missing `STATS` binding in wrangler config. Both
 * would make `increment`/`/stats` silently no-op. This test increments a counter
 * through the real binding and asserts `/stats` reflects it.
 *
 * `env` is typed `Cloudflare.Env` (empty by default); cast through the app's
 * `Env` so `STATS` is checked without a generated worker-configuration.d.ts.
 */
describe("/stats end-to-end (real STATS Durable Object binding)", () => {
  it("reflects an increment performed through the actual binding", async () => {
    const stats = (env as unknown as Env).STATS;
    const id = stats.idFromName("global");
    await stats.get(id).increment("dlq");

    const response = await SELF.fetch("https://example.com/stats");

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ dlq: 1 });
  });
});
