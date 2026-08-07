import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Remotion's renderer + @google-cloud/text-to-speech are Node-only server
  // dependencies; keep them out of the client/edge bundle.
  serverExternalPackages: [
    "@remotion/renderer",
    "@remotion/bundler",
    "@google-cloud/text-to-speech",
    "@google/genai",
  ],
};

export default nextConfig;
