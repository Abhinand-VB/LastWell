import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // @lastwell/core exports TypeScript source.
  transpilePackages: ["@lastwell/core"],
  // The projector must not show Next's dev badge during the demo.
  devIndicators: false,
  // Core's relative imports use NodeNext-style ".js" specifiers for ".ts" files (gotcha G-34).
  // Turbopack cannot alias extensions, so dev and build run on webpack.
  webpack: (config) => {
    config.resolve = config.resolve ?? {};
    config.resolve.extensionAlias = {
      ".js": [".ts", ".tsx", ".js"],
      ".mjs": [".mts", ".mjs"],
    };
    return config;
  },
};

export default nextConfig;
