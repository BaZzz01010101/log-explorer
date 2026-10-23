import { openSettingsWindow } from "./settings-panel";
import { desktopExecutablePath } from "./desktop-app";
import {
  _electron as electron,
  expect,
  test,
  type ElectronApplication,
  type Page,
  type Locator,
} from "@playwright/test";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readFile, rm } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { join, resolve, sep } from "node:path";

let app: ElectronApplication;
let childProcess: ReturnType<ElectronApplication["process"]> | undefined;
let page: Page;
let directory: string;
let environment: Record<string, string>;
const temporaryRoot = resolve(".tmp", "desktop-lifecycle");
const errors: string[] = [];

// Trusted Chromium input exercises focus, pointer and keyboard behavior.
async function input(locator: Locator, value: string) {
  await locator.click();
  await locator.fill(value);
}
async function click(locator: Locator) {
  await locator.click();
}
async function key(
  key: string,
  modifiers: { ctrlKey?: boolean; shiftKey?: boolean } = {},
) {
  const chord = [
    modifiers.ctrlKey ? "Control" : "",
    modifiers.shiftKey ? "Shift" : "",
    key,
  ]
    .filter(Boolean)
    .join("+");
  await page.keyboard.press(chord);
  if (key === "Escape") await expect(page.getByRole("dialog")).toHaveCount(0);
}
async function launch(
  executablePath = process.env.EXPLORER_DESKTOP_PACKAGED === "1"
    ? desktopExecutablePath()
    : undefined,
) {
  app = await electron.launch({
    executablePath,
    args: executablePath
      ? [
          "--offline-verification",
          "--background-verification",
          "--disable-background-networking",
          "--disable-component-update",
        ]
      : [
          process.cwd(),
          "--background-verification",
          "--disable-background-networking",
          "--disable-component-update",
        ],
    env: environment,
  });
  childProcess = app.process();
  await app.evaluate(({ dialog }) => {
    // Unexpected native dialogs must never interrupt the user's desktop.
    (globalThis as any).unexpectedNativeDialogs = [];
    dialog.showMessageBox = (async (...args: unknown[]) => {
      (globalThis as any).unexpectedNativeDialogs.push(args.at(-1));
      return { response: 0, checkboxChecked: false };
    }) as typeof dialog.showMessageBox;
  });
  page = await app.firstWindow();
  page.setDefaultTimeout(10000);
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Emulation.setFocusEmulationEnabled", { enabled: true });
  expect(
    await app.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()[0].isVisible(),
    ),
  ).toBe(false);
  page.on("pageerror", (error) => errors.push(error.message));
  await expect(
    page.locator('.query-status[data-query-state="complete"]'),
  ).toBeAttached();
}
async function close() {
  if (!app || !childProcess || childProcess.exitCode !== null) return;
  const child = childProcess;
  await Promise.race([
    app.close().catch(() => {}),
    new Promise((resolve) => setTimeout(resolve, 5000)),
  ]);
  if (child.exitCode === null) {
    if (process.platform === "win32") {
      try {
        execFileSync("taskkill", ["/PID", String(child.pid), "/T", "/F"], {
          stdio: "ignore",
        });
      } catch {}
    } else child.kill();
  }
}

test.beforeAll(async () => {
  await mkdir(temporaryRoot, { recursive: true });
  directory = await mkdtemp(join(temporaryRoot, "case-"));
  environment = {};
  // Whitelist OS variables; never inherit AWS secrets, profiles or token paths.
  for (const key of [
    "PATH",
    "SystemRoot",
    "WINDIR",
    "TEMP",
    "TMP",
    "USERPROFILE",
    "LOCALAPPDATA",
    "APPDATA",
    "COMSPEC",
  ])
    if (process.env[key]) environment[key] = process.env[key]!;
  environment.EXPLORER_TEST_USER_DATA = directory;
  for (const key of ["USERPROFILE", "LOCALAPPDATA", "APPDATA"])
    environment[key] = directory;
  environment.AWS_CONFIG_FILE = join(directory, "no-config");
  environment.AWS_SHARED_CREDENTIALS_FILE = join(directory, "no-credentials");
  environment.AWS_EC2_METADATA_DISABLED = "true";
  await launch();
});
test.afterAll(async () => {
  await close();
  if (!resolve(directory).startsWith(temporaryRoot + sep + "case-"))
    throw new Error("Unsafe test cleanup path");
  await rm(directory, {
    recursive: true,
    force: true,
    maxRetries: 10,
    retryDelay: 100,
  });
});

test.afterEach(async () => {
  if (childProcess?.exitCode === null)
    expect(
      await app.evaluate(() => (globalThis as any).unexpectedNativeDialogs),
    ).toEqual([]);
});

test("desktop vertical slice stays isolated and supports investigation", async () => {
  await expect(
    page.getByRole("button", { name: "Application menu", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("Isolated local development", { exact: true }),
  ).toBeVisible();
  const info = await page.evaluate(() => window.explorer.environment());
  expect(info.awsEnabled).toBe(false);
  expect(info.canEnableAws).toBe(false);
  expect(info.packaged).toBe(process.env.EXPLORER_DESKTOP_PACKAGED === "1");
  expect(info.version).toBe(
    JSON.parse(await readFile(resolve("package.json"), "utf-8")).version,
  );
  await expect(
    page.evaluate(() => window.explorer.enableAws(true)),
  ).rejects.toThrow(/development/);
  expect(await page.evaluate(() => window.explorer.profiles())).toEqual([]);
  await input(page.getByLabel("CloudWatch filter pattern"), "Payment");
  await expect(
    page.getByText(/Displayed events belong to the previous request/),
  ).toBeVisible();
  await click(page.getByTestId("run-query"));
  await expect(
    page.locator('.query-status[data-query-state="complete"]'),
  ).toBeAttached();
  await click(page.locator("label").filter({ hasText: /^JSON$/ }));
  await expect(page.locator(".json-event-card").first()).toBeVisible();
  await click(page.locator("label").filter({ hasText: /^Table$/ }));
  await expect(page.locator(".log-table-row").first()).toBeVisible();
  await click(page.locator("label").filter({ hasText: /^Hybrid$/ }));
  await click(page.getByLabel("Expand event details").first());
  await expect(page.locator(".hybrid-detail").first()).toBeVisible();
  await page.locator(".inspect-cell").first().dblclick();
  const inspector = page.getByRole("region", {
    name: "Event inspector",
    exact: true,
  });
  await expect(inspector).toBeVisible();
  await click(
    inspector.getByRole("button", { name: "Hide inspector", exact: true }),
  );
  await click(page.getByLabel("Split pane", { exact: true }));
  await expect(page.locator(".workspace-pane")).toHaveCount(2);
  await expect(page.locator("[data-pane-drop-target]")).toHaveCount(2);
  const divider = page.getByRole("separator", {
    name: "Resize panes horizontally",
  });
  await divider.focus();
  await page.keyboard.press("ArrowRight");
  await expect(divider).toHaveAttribute("aria-valuenow", "52");
  await click(
    page
      .getByRole("region", { name: "Pane 2", exact: true })
      .getByLabel("Close pane 2", { exact: true }),
  );
  await expect(page.locator(".workspace-pane")).toHaveCount(1);
  const tree = page.getByRole("tree", { name: "Log groups and streams" });
  await tree.focus();
  await page.keyboard.press("End");
  await expect(tree).toHaveAttribute("aria-activedescendant", /-row-\d+$/);
  expect(
    await tree.evaluate(
      (element) =>
        !!document.getElementById(
          element.getAttribute("aria-activedescendant")!,
        ),
    ),
  ).toBe(true);
  await click(page.getByRole("button", { name: "Live", exact: true }));
  await expect(page.locator(".query-status")).toContainText("Live stream");
  await expect(page.locator(".query-status")).toHaveAttribute(
    "data-query-state",
    "running",
  );
  await click(page.getByRole("button", { name: "Stop Live", exact: true }));
  await expect(page.locator(".query-status")).toHaveAttribute(
    "data-query-state",
    "cancelled",
  );
  await openSettingsWindow(page);
  await expect(page.getByLabel("Enable AWS access")).toBeDisabled();
  await click(page.getByRole("tab", { name: "Preferences", exact: true }));
  await expect(page.getByLabel("Maximum events per view")).toBeVisible();
  await key("Escape");
  await click(
    page.getByRole("button", { name: "Application menu", exact: true }),
  );
  await expect(
    page.getByRole("menuitem", { name: "Reopen closed tab", exact: true }),
  ).toBeVisible();
  await key("Escape");
  await expect(page.getByText("Saved locally", { exact: true })).toBeVisible();
  expect(errors).toEqual([]);
});

test("saves the final edit before immediate quit and restores it on restart", async () => {
  await openSettingsWindow(page);
  await click(page.getByRole("tab", { name: "Workspace", exact: true }));
  await input(
    page.getByLabel("Workspace name"),
    "Desktop restoration verified",
  );
  // Close immediately, before the 400ms persistence debounce expires.
  await close();
  const saved = JSON.parse(
    await readFile(join(directory, "workspace.json"), "utf8"),
  );
  expect(saved.name).toBe("Desktop restoration verified");
  expect(JSON.stringify(saved)).not.toContain("secretAccessKey");
  expect(saved).not.toHaveProperty("events");
  await launch();
  await openSettingsWindow(page);
  await click(page.getByRole("tab", { name: "Workspace", exact: true }));
  await expect(page.getByLabel("Workspace name", { exact: true })).toHaveValue(
    "Desktop restoration verified",
  );
  await key("Escape");
  expect(
    (await page.evaluate(() => window.explorer.environment())).awsEnabled,
  ).toBe(false);
  expect(errors).toEqual([]);
});

test("packaged executable loads fixtures with AWS hard-disabled in verification mode", async () => {
  const executable = desktopExecutablePath();
  test.skip(
    process.platform !== "win32" || !existsSync(executable),
    "Build a Windows package first",
  );
  await close();
  await launch(executable);
  const info = await page.evaluate(() => window.explorer.environment());
  // Stop here before any provider operation if this is an old, unsafe artifact.
  expect(info.canEnableAws).toBe(false);
  expect(info.awsEnabled).toBe(false);
  expect(info.packaged).toBe(true);
  await expect(
    page.evaluate(() => window.explorer.enableAws(true)),
  ).rejects.toThrow(/disabled/);
  expect(await page.evaluate(() => window.explorer.profiles())).toEqual([]);
  expect(errors).toEqual([]);
});

test("native window close exits naturally after saving, including the discard-save-failure path", async () => {
  await close();
  await launch();
  await openSettingsWindow(page);
  await click(page.getByRole("tab", { name: "Workspace", exact: true }));
  await input(page.getByLabel("Workspace name"), "Native close verified");
  let exited = app.waitForEvent("close", { timeout: 10000 });
  let processExit = new Promise<number | null>((resolve) =>
    childProcess!.once("exit", resolve),
  );
  await app.evaluate(({ BrowserWindow }) => {
    BrowserWindow.getAllWindows()[0].close();
  });
  await exited;
  expect(await processExit).toBe(0);
  expect(
    JSON.parse(await readFile(join(directory, "workspace.json"), "utf8")).name,
  ).toBe("Native close verified");

  await launch();
  await app.evaluate(({ ipcMain, dialog }) => {
    ipcMain.removeHandler("explorer:save");
    ipcMain.handle("explorer:save", () => {
      throw new Error("Injected save failure");
    });
    dialog.showMessageBox = async () => ({
      response: 1,
      checkboxChecked: false,
    });
  });
  exited = app.waitForEvent("close", { timeout: 10000 });
  processExit = new Promise<number | null>((resolve) =>
    childProcess!.once("exit", resolve),
  );
  await app.evaluate(({ BrowserWindow }) => {
    BrowserWindow.getAllWindows()[0].close();
  });
  await exited;
  expect(await processExit).toBe(0);
});
