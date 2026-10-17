import type { NextConfig } from "next";

const BACKEND_URL = (process.env.BACKEND_URL ?? "http://127.0.0.1:8081").replace(/\/$/, "");

const securityHeaders = [
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  typedRoutes: false,
  // Server action arguments include passwords and payment details — never
  // print them to the terminal.
  logging: { serverFunctions: false },
  experimental: {
    serverActions: {
      bodySizeLimit: "2mb",
    },
  },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
  async rewrites() {
    return [
      // Browsers and crawlers still ask for /favicon.ico; serve the app icon.
      { source: "/favicon.ico", destination: "/icon.svg" },
      { source: "/api/v1/:path*", destination: `${BACKEND_URL}/api/v1/:path*` },
    ];
  },
};

export default nextConfig;
