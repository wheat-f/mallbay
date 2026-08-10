// @ts-nocheck
import type { NextConfig } from "next";
import path from "path";
import { fileURLToPath } from "url";

const webConfigDir = path.dirname(fileURLToPath(import.meta.url));
const apiBaseUrl = (process.env.NEXT_PUBLIC_API_URL ?? "http://127.0.0.1:4001").replace(/\/+$/, "");

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
        destination: `${apiBaseUrl}/:path*`
      }
    ];
  }
};

export default nextConfig;
