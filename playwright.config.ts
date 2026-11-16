import { mkdirSync, readdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { defineConfig } from "@playwright/test";

// Every test launches its own app with a private user-data directory, hidden
// window and mocked IPC, so tests run in parallel, even within one file. No
// test reads the system clipboard: copy tests capture the app's clipboard
// writes or cancel the native copy event, so they need no serial lane.
// Tests without color checks run in the light theme only; DESKTOP_THEMES=all
// adds their dark copies (see behaviorThemes in tests/desktop/desktop-app.ts).

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
  // The suite is CPU-bound. On a 14-core laptop at full power, 8 workers ran
  // it in about 4.3 min; 10 gained only seconds while loading every app more.
  workers: Number(process.env.DESKTOP_WORKERS) || 8,
  fullyParallel: true,
  timeout: 90000,
  reporter: [
    ["list"],
    ["json", { outputFile: join(runs, `${stamp}.json`) }],
  ],
  // Failure traces keep DOM snapshots and the action log; screencast frames
  // are left out to save each app the encoding work.
  use: {
    trace: { mode: "retain-on-failure", screenshots: false },
    actionTimeout: 5000,
  },
  projects: [{ name: "desktop" }],
});
