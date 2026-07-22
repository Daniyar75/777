import { defineConfig } from "vitest/config";

// Integration tests in this package truncate shared tables in a single local Postgres test
// database (see @network-crm/test-support). Running this package's own test files
// concurrently would race two files' beforeEach(truncateAll) against each other, so file
// parallelism is disabled here; cross-package concurrency is avoided by running the
// workspace test script with concurrency 1 (see root package.json).
export default defineConfig({
  test: {
    fileParallelism: false,
  },
});
