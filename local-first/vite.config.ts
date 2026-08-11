import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath, URL } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

/**
 * TLS for testing on a real phone, if a certificate has been made.
 *
 * The database is SQLite in OPFS, which browsers only hand to a page that is
 * cross-origin-isolated — and isolation requires a secure context. `localhost`
 * counts as secure; a bare `http://192.168.x.x` does not. So over plain HTTP on
 * the network the app loads, looks completely fine, and silently keeps
 * everything in memory: every entry gone on refresh. A working-looking app that
 * loses your data is worse than no link at all.
 *
 * `npm run certs` writes the pair and `npm run preview:lan` serves with it.
 * Off by default and behind an env flag rather than "on if the files exist", so
 * the test suite's target does not change scheme underneath it the moment
 * somebody generates a certificate.
 */
const certDir = fileURLToPath(new URL("./certs", import.meta.url));
const key = `${certDir}/lan.key`;
const cert = `${certDir}/lan.crt`;
const wantsLan = process.env.LAN === "1";

if (wantsLan && !(existsSync(key) && existsSync(cert))) {
  throw new Error("LAN=1 needs a certificate — run `npm run certs` first.");
}

const https = wantsLan ? { key: readFileSync(key), cert: readFileSync(cert) } : undefined;

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
    // Bound to every interface only when serving the LAN, so the default
    // `npm run preview` stays on localhost and is not quietly exposed to the
    // network by a config change.
    host: wantsLan,
    https,
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
