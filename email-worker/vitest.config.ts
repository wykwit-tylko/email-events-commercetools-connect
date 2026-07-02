import { fileURLToPath, URL } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
  resolve: {
    alias: {
      // The Workers runtime provides `cloudflare:workers`; vitest runs under Node,
      // so resolve it to the local shim used only for unit tests.
      "cloudflare:workers": fileURLToPath(
        new URL("./test/cloudflare-workers-shim.ts", import.meta.url),
      ),
    },
  },
});
