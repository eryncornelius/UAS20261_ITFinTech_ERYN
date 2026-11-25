import type { NextConfig } from "next";

const appHost = process.env.APP_URL ? new URL(process.env.APP_URL).hostname : undefined;

const nextConfig: NextConfig = {
  allowedDevOrigins: appHost ? [appHost] : [],
  turbopack: {
    root: process.cwd(),
  },
};

export default nextConfig;
