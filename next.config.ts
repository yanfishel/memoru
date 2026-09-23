import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The image copies `.next/standalone` and runs `server.js`: it carries only the traced server
  // dependencies, not the whole node_modules tree (spec §8, image size).
  output: "standalone",
  // The pg driver loads native/optional modules at runtime; keep it out of the bundle.
  serverExternalPackages: ["pg"],
  // The OG image routes read these fonts from disk at request time (assets/, see opengraph-image.tsx).
  // Tracing does not follow a runtime `readFile`, so a standalone build would ship without them and
  // every social card would 500 — name them here while it costs nothing to remember.
  outputFileTracingIncludes: {
    "/opengraph-image": ["./assets/**"],
    "/person/[id]/opengraph-image": ["./assets/**"],
  },
};

export default nextConfig;
