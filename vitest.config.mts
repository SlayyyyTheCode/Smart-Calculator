import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

/**
 * Unit tests cover the domain layer only: money arithmetic, date math, budget
 * thresholds and derived metrics. Those are the parts where a quiet bug turns
 * into a wrong number on screen, and they are all pure functions, so they need
 * no database and no browser.
 */
export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
});
