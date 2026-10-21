import { defineConfig } from "vitest/config";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  resolve: { alias: { "@": projectRoot } },
  test: {
    environment: "node",
    fileParallelism: false,
    pool: "forks",
    maxWorkers: 1,
    minWorkers: 1,
    testTimeout: 20000,
    include: ["tests/**/*.test.js"],
  },
});
