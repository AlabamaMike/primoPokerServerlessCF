import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  // Remove trailingSlash to fix 404 issues with dynamic routes in production
  images: {
    unoptimized: true
  },
  eslint: {
    // Disable ESLint during builds for deployment
    ignoreDuringBuilds: true,
  },
  typescript: {
    // Disable type checking during builds for deployment
    ignoreBuildErrors: true,
  }
};

export default nextConfig;
