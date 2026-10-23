import type { NextConfig } from "next";

const securityHeaders = [
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
];

const nextConfig: NextConfig = {
  // Production defaults, baked in at build time so a deploy works without
  // dashboard variables. A local .env or a host variable still overrides them.
  env: {
    BACKEND_URL: process.env.BACKEND_URL ?? "https://api.tablapos.com",
    APP_URL: process.env.APP_URL ?? "https://tablapos.com",
  },
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
    ];
  },
};

export default nextConfig;
