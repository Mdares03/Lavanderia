import type { NextConfig } from "next";

const useStandaloneOutput = process.env.NEXT_OUTPUT_STANDALONE === "1";

const nextConfig: NextConfig = {
  ...(useStandaloneOutput ? { output: "standalone" } : {}),
  experimental: {
    serverActions: {
      bodySizeLimit: "2mb"
    }
  }
};

export default nextConfig;
