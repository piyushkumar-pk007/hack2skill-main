import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    globalSetup: "./src/test/globalSetup.ts",
    setupFiles: ["./src/test/setup.ts"],
    testTimeout: 30_000,
    pool: "vmForks",
    poolOptions: {
      vmForks: {
        singleFork: true,
      },
    },
    // Suppress the ECONNRESET that fires when supertest tears down an SSE connection.
    // All meaningful test failures are caught at the assertion level.
    dangerouslyIgnoreUnhandledErrors: true,
    env: {
      // Disable the 15-second replan debounce so integration tests can replan immediately.
      REPLAN_DEBOUNCE_MS: "0",
    },
  },
});
