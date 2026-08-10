import { fileURLToPath, URL } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      // Precaching the shell is the whole point: a local-first app that cannot
      // start without a network is not local-first, it is a website that
      // happens to keep a copy.
      workbox: {
        globPatterns: ["**/*.{js,css,html,ico,png,svg,wasm}"],
        // The SQLite wasm binary is large and is not optional — without it the
        // database cannot open and every screen reads empty.
        maximumFileSizeToCacheInBytes: 8 * 1024 * 1024,
        navigateFallback: "index.html",
      },
      includeAssets: ["icon.svg"],
      manifest: {
        name: "Smart Planner",
        short_name: "Planner",
        description: "Expenses, income and budgets, kept on your device.",
        theme_color: "#1d4ed8",
        background_color: "#ffffff",
        display: "standalone",
        start_url: "/",
        icons: [
          { src: "icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
          { src: "icon-192.png", sizes: "192x192", type: "image/png" },
          { src: "icon-512.png", sizes: "512x512", type: "image/png" },
          { src: "icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
        ],
      },
    }),
  ],
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
  preview: {
    port: 5175,
    // The production preview needs the same isolation, or OPFS disappears and
    // the app silently falls back to holding everything in memory.
    headers: {
      "Cross-Origin-Opener-Policy": "same-origin",
      "Cross-Origin-Embedder-Policy": "require-corp",
    },
  },
  optimizeDeps: { exclude: ["@evolu/react-web", "@evolu/common"] },
  worker: { format: "es" },
});
