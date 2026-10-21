import { desktopExecutablePath } from "./desktop-app";
import {
  _electron as electron,
  expect,
  test,
  type ElectronApplication,
  type Page,
} from "@playwright/test";
import { execFileSync } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { join, resolve, sep } from "node:path";
import { createWorkspace } from "../../src/renderer/workspace";
import type { Workspace } from "../../src/shared/contracts";

test.setTimeout(180000);
test.describe.configure({ mode: "parallel" });
let app: ElectronApplication | undefined;
let child: ReturnType<ElectronApplication["process"]> | undefined;
let page: Page;
let directory: string;
let errors: string[];
const temporaryRoot = resolve(".tmp", "desktop-highlight-scroll");

test.beforeEach(async () => {
  await mkdir(temporaryRoot, { recursive: true });
  directory = await mkdtemp(join(temporaryRoot, "case-"));
  errors = [];
});

async function launch(workspace: Workspace) {
  workspace.tabs[0]!.filterPattern = "";
  await writeFile(join(directory, "workspace.json"), JSON.stringify(workspace));
  const env: Record<string, string> = {};
  for (const key of ["PATH", "SystemRoot", "WINDIR", "TEMP", "TMP", "COMSPEC"])
    if (process.env[key]) env[key] = process.env[key]!;
  Object.assign(env, {
    EXPLORER_TEST_USER_DATA: directory,
    USERPROFILE: directory,
    LOCALAPPDATA: directory,
    APPDATA: directory,
    AWS_CONFIG_FILE: join(directory, "absent-config"),
    AWS_SHARED_CREDENTIALS_FILE: join(directory, "absent-credentials"),
    AWS_EC2_METADATA_DISABLED: "true",
  });
  const packaged = process.env.EXPLORER_DESKTOP_PACKAGED === "1";
  app = await electron.launch({
    executablePath: packaged ? desktopExecutablePath() : undefined,
    args: [
      ...(packaged ? [] : [process.cwd()]),
      "--offline-verification",
      "--background-verification",
      "--disable-background-networking",
      "--disable-component-update",
    ],
    env,
  });
  child = app.process();
  page = await app.firstWindow();
  page.setDefaultTimeout(6000);
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Emulation.setFocusEmulationEnabled", { enabled: true });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.addStyleTag({
    content:
      "*,*::before,*::after { transition-duration: 0s !important; animation-duration: 0s !important; }",
  });
  page.on("pageerror", (error) => errors.push(error.message));
  const environment = await page.evaluate(() => window.explorer.environment());
  expect(environment.canEnableAws).toBe(false);
  expect(environment.awsEnabled).toBe(false);
  expect(
    await app.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()[0].isVisible(),
    ),
  ).toBe(false);
  await app.evaluate(({ dialog }) => {
    dialog.showMessageBox = async () => {
      throw new Error(
        "Unexpected native dialog during hidden query/hover verification",
      );
    };
  });
  await expect(
    page.locator('.query-status[data-query-state="complete"]'),
  ).toBeAttached();
}

test.afterEach(async () => {
  try {
    if (app && child && child.exitCode === null) {
      const closed = app.waitForEvent("close", { timeout: 7000 });
      const exited = new Promise<number | null>((done) =>
        child!.once("exit", done),
      );
      await app.evaluate(({ BrowserWindow }) =>
        BrowserWindow.getAllWindows()[0].close(),
      );
      await closed;
      expect(await exited).toBe(0);
    }
  } finally {
    if (child && child.exitCode === null) {
      if (process.platform === "win32")
        execFileSync("taskkill", ["/PID", String(child.pid), "/T", "/F"], {
          stdio: "ignore",
        });
      else child.kill();
    }
    child = undefined;
    app = undefined;
  }
  expect(errors).toEqual([]);
  if (!resolve(directory).startsWith(temporaryRoot + sep + "case-"))
    throw new Error("Unsafe query/hover cleanup path");
  await rm(directory, {
    recursive: true,
    force: true,
    maxRetries: 10,
    retryDelay: 100,
  });
});

for (const theme of ["light", "dark"] as const)
  test(`fast scrolling retains row and text regex highlights in ${theme}`, async () => {
    const workspace = createWorkspace();
    workspace.preferences.theme = theme;
    workspace.tabs[0].view.columns = [
      { path: "@timestamp", width: 210, pinned: true },
      { path: "@message", width: 800 },
    ];
    workspace.preferences.highlightProfiles = [
      {
        id: "all",
        name: "All",
        enabled: true,
        groupPattern: "",
        groupIgnoreCase: false,
        rules: [
          {
            id: "rows",
            enabled: true,
            scope: "text",
            path: "",
            pattern: ".+",
            ignoreCase: false,
            target: "row",
            colors: { background: "#335533", foreground: "#ffffff" },
            separateThemeColors: false,
          },
          {
            id: "text",
            enabled: true,
            scope: "text",
            path: "",
            pattern: ".+",
            ignoreCase: false,
            target: "text",
            colors: { background: "#ffee00", foreground: "#000000" },
            separateThemeColors: false,
          },
        ],
      },
    ];
    await launch(workspace);
    await page.addInitScript(() => {
      const Original = window.Worker;
      window.Worker = class extends Original {
        postMessage(message: any, ...rest: any[]) {
          if (message?.events && message?.profiles)
            setTimeout(() => super.postMessage(message, ...(rest as [])), 60);
          else super.postMessage(message, ...(rest as []));
        }
      };
    });
    await page.reload();
    await expect(
      page.locator('.query-status[data-query-state="complete"]'),
    ).toBeAttached();
    for (const mode of ["Table", "Hybrid", "JSON"]) {
      await page
        .locator("label")
        .filter({ hasText: new RegExp(`^${mode}$`) })
        .click();
      const fold = page.getByRole("button", {
        name: "Fold all messages",
        exact: true,
      });
      if (await fold.count()) await fold.click();
      await expect(
        page.locator('.virtual-event[data-highlighted="true"]').first(),
      ).toBeVisible();
      const samples = { visible: 0, bare: 0, missingText: 0, pending: 0 };
      for (const position of [
        0.4, 0.1, 0.8, 0.2, 0.65, 0.35, 0.9, 0.05, 0.5, 0.15, 0.75, 0.3,
      ]) {
        await page.locator(".viewer-scroll").evaluate((viewer, fraction) => {
          viewer.scrollTop =
            fraction * (viewer.scrollHeight - viewer.clientHeight);
        }, position);
        await app!.evaluate(async ({ BrowserWindow }) => {
          const window = BrowserWindow.getAllWindows()[0];
          if (window.isVisible())
            throw new Error("Scroll verification became visible");
          await window.webContents.capturePage(undefined, {
            stayHidden: true,
            stayAwake: true,
          });
        });
        const frame = await page.evaluate(() => {
          const viewer = document.querySelector<HTMLElement>(".viewer-scroll")!;
          const sample = { visible: 0, bare: 0, missingText: 0, pending: 0 };
          const box = viewer.getBoundingClientRect();
          for (const row of viewer.querySelectorAll<HTMLElement>(
            ".virtual-event",
          )) {
            const rect = row.getBoundingClientRect();
            if (rect.bottom <= box.top || rect.top >= box.bottom) continue;
            sample.visible++;
            if (row.dataset.highlightPending === "true") {
              sample.pending++;
              continue;
            }
            if (row.dataset.highlighted !== "true") sample.bare++;
            if (!row.querySelector(".profile-highlight-text"))
              sample.missingText++;
          }
          return sample;
        });
        for (const key of [
          "visible",
          "bare",
          "missingText",
          "pending",
        ] as const)
          samples[key] += frame[key];
      }
      expect(samples.visible).toBeGreaterThan(30);
      await mkdir(test.info().outputDir, { recursive: true });
      await writeFile(
        test.info().outputPath(`scroll-${mode.toLowerCase()}.json`),
        JSON.stringify(samples, null, 2),
      );
      expect
        .soft(
          samples.bare,
          `${mode}: no unchecked row is painted as unhighlighted`,
        )
        .toBe(0);
      expect
        .soft(
          samples.missingText,
          `${mode}: no unchecked message is painted without its regex spans`,
        )
        .toBe(0);
      await expect(
        page.locator('.virtual-event[data-highlight-pending="true"]'),
      ).toHaveCount(0);
      await expect(
        page.locator('.virtual-event[data-highlighted="true"]').first(),
      ).toBeVisible();
      // Returning to already prepared rows must be immediate.
      await page.locator(".viewer-scroll").evaluate((viewer) => {
        viewer.scrollTop = 0;
      });
      await page.evaluate(
        () => new Promise<void>((done) => setTimeout(done, 25)),
      );
      await expect(
        page.locator('.virtual-event[data-highlight-pending="true"]'),
      ).toHaveCount(0);
    }
  });
