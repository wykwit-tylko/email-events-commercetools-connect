import { fileURLToPath, URL } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts", "src/**/*.integration.test.ts"],
    coverage: {
      provider: "v8",
      include: ["src/**/*.{ts,tsx,js,jsx}"],
      reporter: ["text"],
    },
  },
  resolve: {
    alias: {
      // The cross-package integration test imports the email worker, which uses
      // the `cloudflare:workers` DurableObject base class. Resolve it to the
      // worker's Node shim under vitest (types still come from @cloudflare/workers-types).
      "cloudflare:workers": fileURLToPath(
        new URL("../email-worker/test/cloudflare-workers-shim.ts", import.meta.url),
      ),
    },
  },
});
