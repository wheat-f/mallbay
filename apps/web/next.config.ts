import type { NextConfig } from "next";
import path from "node:path";
import { fileURLToPath } from "node:url";

const webConfigDir = path.dirname(fileURLToPath(import.meta.url));

const nextConfig: NextConfig = {
  output: "standalone",
  transpilePackages: ["@mallbay/shared"],
  turbopack: {
    root: path.resolve(webConfigDir, "../..")
  },
  allowedDevOrigins: [
    "localhost",
    "100.127.34.58",
    "shendemac-mini.tail116707.ts.net"
  ],
  async rewrites() {
    return [
      {
        source: "/api/:path*",
        destination: "http://127.0.0.1:3001/:path*"
      }
    ];
  }
};

export default nextConfig;
