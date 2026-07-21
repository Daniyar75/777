import { defineConfig } from "vitest/config";

// See services-or-modules/governance/vitest.config.ts for why file parallelism is disabled:
// integration tests here truncate shared tables in one local Postgres test database.
export default defineConfig({
  test: {
    fileParallelism: false,
  },
});
