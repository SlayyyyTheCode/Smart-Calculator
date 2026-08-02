import path from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Pin the workspace root. Without this, an unrelated lockfile higher up the
  // filesystem can make Turbopack infer the wrong root directory.
  turbopack: {
    root: path.resolve(process.cwd()),
  },
};

export default nextConfig;
