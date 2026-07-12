import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Prevents Turbopack from using a stray lockfile outside the repo as the workspace root
  turbopack: {
    root: __dirname,
  },
};

export default nextConfig;
