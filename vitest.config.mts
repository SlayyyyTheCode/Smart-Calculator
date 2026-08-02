import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

/**
 * Unit tests cover the domain layer and the export builders: money arithmetic,
 * date math, budget thresholds, derived metrics, and the workbook and report a
 * user actually downloads. All of it is pure enough to run without a database
 * or a browser.
 */
export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
  },
  resolve: {
    alias: {
      // `server-only` throws by design when imported outside a server
      // component. That guard is for the bundler; the test runner has no client
      // bundle, so it is stubbed out here rather than worked around in source.
      "server-only": fileURLToPath(new URL("./src/test/server-only-stub.ts", import.meta.url)),
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
});
