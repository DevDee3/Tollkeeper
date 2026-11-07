import path from "node:path";
import type { NextConfig } from "next";

const config: NextConfig = {
  // The shared and agent packages ship TypeScript source.
  transpilePackages: ["@tollkeeper/shared", "@tollkeeper/agent"],
  turbopack: { root: path.resolve(__dirname, "..") },
};

export default config;
