import type { MetadataRoute } from "next";

/**
 * Web app manifest, served at /manifest.webmanifest.
 *
 * Enough to give the app a name, colour and standalone display when added to a
 * home screen. Phase 5 replaces the placeholder SVG with proper 192/512 PNG and
 * maskable icons, and adds the service worker that makes it work offline.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Smart Planner",
    short_name: "Planner",
    description:
      "Track daily and monthly expenses, active and passive income, and stay inside your budgets.",
    start_url: "/dashboard",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#ffffff",
    theme_color: "#4f46e5",
    icons: [
      {
        src: "/icons/icon.svg",
        sizes: "any",
        type: "image/svg+xml",
        purpose: "any",
      },
    ],
    shortcuts: [
      {
        name: "Quick add",
        short_name: "Add",
        description: "Record an expense",
        url: "/quick-add",
      },
    ],
  };
}
