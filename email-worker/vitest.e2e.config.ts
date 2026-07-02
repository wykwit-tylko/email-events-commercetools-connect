import { cloudflareTest } from "@cloudflare/vitest-pool-workers";
import { defineConfig } from "vitest/config";

// Runs end-to-end tests inside the Workers runtime (Miniflare) against the real
// wrangler.toml, so Durable Object RPC, the STATS binding, and the `/stats` path
// are exercised for real rather than through Node shims. Run with `npm run
// test:e2e`; the default `npm run test` still runs the Node unit-test suite.
export default defineConfig({
  plugins: [cloudflareTest({ wrangler: { configPath: "./wrangler.e2e.toml" } })],
  test: {
    include: ["test/**/*.e2e.test.ts"],
  },
});
