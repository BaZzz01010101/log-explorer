import { defineConfig } from "vitest/config";
export default defineConfig({
  test: {
    include: ["tests/**/*.test.{ts,tsx}"],
    setupFiles: ["tests/isolation.ts"],
    environment: "node",
    testTimeout: 10000,
  },
});
