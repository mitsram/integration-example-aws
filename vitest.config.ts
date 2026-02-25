import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Run test files sequentially — they share live infrastructure
    // and the same Redis Pub/Sub topic
    fileParallelism: false,
    sequence: { concurrent: false },
    testTimeout: 30_000,
    hookTimeout: 30_000,

    // Test file patterns
    include: ["tests/**/*.test.ts"],
  },
});
