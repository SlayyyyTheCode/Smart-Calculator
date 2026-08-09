import { fileURLToPath, URL } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      // The shipped app's source, imported directly rather than copied. If a
      // rule changes there, it changes here, and a divergence becomes a build
      // error instead of a quiet disagreement between two codebases.
      "@app": fileURLToPath(new URL("../src", import.meta.url)),
      "@": fileURLToPath(new URL("../src", import.meta.url)),
    },
  },
  server: {
    port: 5174,
    // Evolu runs SQLite in a worker backed by OPFS, which browsers only expose
    // to cross-origin-isolated pages.
    headers: {
      "Cross-Origin-Opener-Policy": "same-origin",
      "Cross-Origin-Embedder-Policy": "require-corp",
    },
  },
  optimizeDeps: { exclude: ["@evolu/react-web", "@evolu/common"] },
  worker: { format: "es" },
});
