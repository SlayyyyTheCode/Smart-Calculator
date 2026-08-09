import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
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
