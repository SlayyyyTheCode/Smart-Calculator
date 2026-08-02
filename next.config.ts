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
};

export default nextConfig;
