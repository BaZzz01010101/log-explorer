import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./tests/desktop",
  workers: 1,
  timeout: 90000,
  reporter: "list",
  use: { trace: "retain-on-failure", actionTimeout: 5000 },
});
