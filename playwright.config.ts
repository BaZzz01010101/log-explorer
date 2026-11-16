import { mkdirSync, readdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { defineConfig } from "@playwright/test";

// Every spec launches its own app with a private user-data directory, hidden
// window and mocked IPC, so files run in parallel. Specs that read or write the
// system clipboard share one global resource and run one at a time.
const clipboardSpecs = [
  "event-copy-records",
  "event-multi-selection",
  "event-view-details",
  "events-controls",
  "json-field-actions",
  "log-view-refinements",
  "manual-mode-switch",
  "menus-tooltips",
  "query-mode-history",
  "source-details-resize",
  "source-search-refinements",
].map((name) => `**/${name}.spec.ts`);

// Each run keeps a full JSON record (errors, durations, retries) under
// .tmp/desktop-runs, so a failure stays inspectable after later runs replace
// the test-results folder. Records older than the last 20 are removed.
const runs = ".tmp/desktop-runs";
mkdirSync(runs, { recursive: true });
for (const old of readdirSync(runs)
  .filter((name) => name.endsWith(".json"))
  .sort()
  .slice(0, -19))
  rmSync(join(runs, old), { force: true });
const stamp = new Date().toISOString().replace(/[:.]/g, "-");

export default defineConfig({
  testDir: "./tests/desktop",
  outputDir: "./.tmp/test-results",
  workers: Number(process.env.DESKTOP_WORKERS) || 4,
  timeout: 90000,
  reporter: [
    ["list"],
    ["json", { outputFile: join(runs, `${stamp}.json`) }],
  ],
  use: { trace: "retain-on-failure", actionTimeout: 5000 },
  projects: [
    { name: "desktop", testIgnore: clipboardSpecs },
    { name: "clipboard", testMatch: clipboardSpecs, workers: 1 },
  ],
});
