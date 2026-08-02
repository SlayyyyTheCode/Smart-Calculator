import type { MetadataRoute } from "next";

/**
 * Web app manifest, served at /manifest.webmanifest.
 *
 * `start_url` is the quick add screen rather than the dashboard: the reason to
 * put this on a home screen is to record something in two taps, and the app
 * should open ready to do that.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Smart Planner",
    short_name: "Planner",
    description:
      "Track daily and monthly expenses, active and passive income, and stay inside your budgets.",
    start_url: "/quick-add",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#ffffff",
    theme_color: "#4f46e5",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      // Maskable icons keep the artwork inside the safe zone, so Android can
      // crop them to whatever shape the launcher uses without clipping it.
      {
        src: "/icons/icon-maskable-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "maskable",
      },
      {
        src: "/icons/icon-maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
    shortcuts: [
      {
        name: "Quick add",
        short_name: "Add",
        description: "Record an expense",
        url: "/quick-add",
      },
      {
        name: "Transactions",
        short_name: "History",
        description: "Everything you have recorded",
        url: "/transactions",
      },
    ],
  };
}
