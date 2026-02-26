/**
 * Vitest Configuration – Contract Tests
 *
 * Separate config for running contract tests across all repos.
 * Tests are organized by type:
 *
 *   Consumer tests (standalone, no Docker needed):
 *     npx vitest run --config vitest.config.contract.ts consumer
 *
 *   Provider tests (requires Docker stack):
 *     npx vitest run --config vitest.config.contract.ts provider
 *
 *   All contract tests:
 *     npx vitest run --config vitest.config.contract.ts
 */

import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: [
      "core-app-1/tests/contract/**/*.test.ts",
      "siebel/tests/contract/**/*.test.ts",
      "integration-layer/tests/contract/**/*.test.ts",
    ],
    testTimeout: 30_000,
    hookTimeout: 30_000,
    // Run sequentially — pact file generation order matters
    fileParallelism: false,
    sequence: { concurrent: false },
  },
});
