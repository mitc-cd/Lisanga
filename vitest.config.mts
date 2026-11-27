import path from "node:path";
import { config } from "dotenv";
import { defineConfig } from "vitest/config";

const env = config({ path: ".env.test", quiet: true }).parsed ?? {};

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "src"),
      // Le paquet server-only refuse d'être importé hors de React Server Components.
      "server-only": path.resolve(import.meta.dirname, "tests/stubs/empty.ts"),
    },
  },
  test: {
    environment: "node",
    env: { ...env, NODE_ENV: "test" },
    include: ["tests/**/*.test.ts"],
    fileParallelism: false,
    hookTimeout: 30_000,
    testTimeout: 30_000,
  },
});
