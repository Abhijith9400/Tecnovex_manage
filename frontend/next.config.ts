import type { NextConfig } from "next";

/**
 * Hosted setup: the browser calls /api/v1 on the frontend's own domain and Vercel forwards it to the API (BACKEND_URL),
 * so the login cookie is first-party and works in browsers that block third-party cookies.
 */
const backendUrl = process.env.BACKEND_URL?.replace(/\/$/, "");

const nextConfig: NextConfig = {
  async rewrites() {
    return backendUrl ? [{ source: "/api/v1/:path*", destination: `${backendUrl}/api/v1/:path*` }] : [];
  },
  cacheComponents: true,
  partialPrefetching: true,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
