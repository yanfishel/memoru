import { existsSync } from "node:fs";
import path from "node:path";
import { defineConfig } from "vitest/config";

if (existsSync(".env")) process.loadEnvFile(".env");

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
      // The server modules guard themselves with `import "server-only"`, which only a React Server
      // Components bundler can resolve; tests import them directly, so it maps to an empty module.
      "server-only": path.resolve(__dirname, "tests/stubs/server-only.ts"),
    },
  },
  test: {
    include: ["tests/integration/**/*.test.ts"],
    environment: "node",
    testTimeout: 60_000,
    fileParallelism: false,
  },
});
