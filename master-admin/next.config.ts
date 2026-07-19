import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  output: "standalone",
  turbopack: { root: process.cwd() },
  serverExternalPackages: [],
  experimental: {
    serverActions: {
      bodySizeLimit: "10gb",
    },
  },
  async redirects() {
    return [{ source: "/favicon.ico", destination: "/icon.svg", permanent: true }];
  },
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "ferf1mheo22r9ira.public.blob.vercel-storage.com",
        pathname: "/**",
      },
    ],
  },
};

export default nextConfig;
