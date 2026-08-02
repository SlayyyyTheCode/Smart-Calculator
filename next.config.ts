import path from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Pin the workspace root. Without this, an unrelated lockfile higher up the
  // filesystem can make Turbopack infer the wrong root directory.
  turbopack: {
    root: path.resolve(process.cwd()),
  },

  // Both export libraries are CommonJS Node packages that misbehave when
  // bundled into the server build; leave them to be required at runtime.
  serverExternalPackages: ["exceljs", "@react-pdf/renderer"],

  async headers() {
    return [
      {
        // The service worker must be able to control the whole origin, and it
        // must never be served from a stale cache or an update can never land.
        source: "/sw.js",
        headers: [
          { key: "Service-Worker-Allowed", value: "/" },
          { key: "Cache-Control", value: "public, max-age=0, must-revalidate" },
        ],
      },
    ];
  },
};

export default nextConfig;
