import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // @lastwell/core exports TypeScript source.
  transpilePackages: ["@lastwell/core"],
};

export default nextConfig;
