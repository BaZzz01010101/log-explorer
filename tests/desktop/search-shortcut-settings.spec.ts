import { openSettingsWindow } from "./settings-panel";
import {
  _electron as electron,
  expect,
  test,
  type ElectronApplication,
  type Locator,
  type Page,
} from "@playwright/test";
import { execFileSync } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { join, resolve, sep } from "node:path";
import {
  createTab,
  createWorkspace,
  restoreWorkspace,
  workspaceReducer,
} from "../../src/renderer/workspace";
import { desktopExecutablePath } from "./desktop-app";

// Keep every fixture, result and native process private to this checkout. The
// background/offline flags prohibit visible windows and AWS credential access.
const temporaryRoot = resolve(".tmp/desktop-search-shortcut-settings");
// Two fully visible wrapped lines; longer metadata is intentionally clamped.
const groupName = `/aws/lambda/${"component-name-".repeat(3)}orders-api`;
let app: ElectronApplication, page: Page, directory: string, errors: string[];

test.beforeEach(async ({}, info) => {
  errors = [];
  await mkdir(temporaryRoot, { recursive: true });
  directory = await mkdtemp(join(temporaryRoot, "case-"));
  let workspace = createWorkspace();
  workspace.preferences.theme = info.title.startsWith("dark")
    ? "dark"
    : "light";
  workspace.preferences.highlightProfiles = [];
  const automatic = workspace.tabs[0];
  automatic.filterPattern = "";
  automatic.view.mode = "hybrid";
  automatic.view.inspectorInfoCollapsed = false;
  const renamed = createTab("offline", [
    { logGroup: "/aws/lambda/payments-worker" },
  ]);
  renamed.customTitle = "Incident review";
  const multiple = createTab("offline", [
    { logGroup: "/aws/lambda/orders-api" },
    { logGroup: "/aws/lambda/media-pipeline" },
  ]);
  multiple.customTitle = "Mixed Sources";
  for (const tab of [renamed, multiple])
    workspace = workspaceReducer(workspace, { type: "tab/open", tab });
  workspace = workspaceReducer(workspace, {
    type: "tab/select",
    tabId: automatic.id,
  });
  workspace.favorites = [
    { id: "favorite-auto", title: "orders-api", tab: automatic },
    { id: "favorite-renamed", title: "Incident review", tab: renamed },
    { id: "favorite-multiple", title: "Mixed Sources", tab: multiple },
  ].map(({ id, title, tab }) => ({
    id,
    title,
    tabs: [structuredClone(tab)],
    connections: structuredClone(workspace.connections),
    timezone: "utc" as const,
  }));
  workspace.savedQueries = [
    {
      id: "saved-failures",
      name: "Failures",
      kind: "events",
      text: "error",
      filterMode: "plain",
    },
    {
      id: "saved-requests",
      name: "Requests",
      kind: "events",
      text: "request",
      filterMode: "plain",
    },
  ];
  await writeFile(join(directory, "workspace.json"), JSON.stringify(workspace));
  const env: Record<string, string> = {};
  for (const name of ["PATH", "SystemRoot", "WINDIR", "TEMP", "TMP", "COMSPEC"])
    if (process.env[name]) env[name] = process.env[name]!;
  Object.assign(env, {
    EXPLORER_TEST_USER_DATA: directory,
    USERPROFILE: directory,
    APPDATA: directory,
    LOCALAPPDATA: directory,
    TEMP: directory,
    TMP: directory,
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
  page = await app.firstWindow();
  page.on("pageerror", (error) => errors.push(error.message));
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Emulation.setFocusEmulationEnabled", { enabled: true });
  await page.emulateMedia({ reducedMotion: "reduce" });
  expect(
    (await page.evaluate(() => window.explorer.environment())).canEnableAws,
  ).toBe(false);
  expect(
    await app.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()[0].isVisible(),
    ),
  ).toBe(false);
  await expect(page.locator('[data-node-kind="group"]')).toHaveCount(9);
  await expect(page.locator(".query-status:visible")).toHaveAttribute(
    "data-query-state",
    "complete",
  );
  await app.evaluate(({ BrowserWindow, dialog, ipcMain }, fixtureGroup) => {
    const window = BrowserWindow.getAllWindows()[0];
    window.setContentSize(1700, 1150);
    window.webContents.setBackgroundThrottling(false);
    dialog.showMessageBox = async () => {
      throw new Error("Unexpected favorite-tooltip verification dialog");
    };
    (globalThis as any).__searchShortcutQueries = 0;
    ipcMain.removeHandler("explorer:query");
    ipcMain.handle("explorer:query", (event, request) => {
      (globalThis as any).__searchShortcutQueries++;
      if (
        event.sender !== window.webContents ||
        request.connection.mode !== "offline" ||
        request.kind !== "events"
      )
        throw new Error("Unexpected favorite-tooltip verification request");
      setImmediate(() =>
        event.sender.send("explorer:update", {
          requestId: request.requestId,
          state: "complete",
          events: [
            {
              id: "tooltip-event",
              timestamp: Date.UTC(2026, 9, 30, 12),
              logGroup: fixtureGroup,
              logStream: "2026/10/30/[$LATEST]abcdef0123456789",
              message: '{"level":"INFO","msg":"Tooltip visibility fixture"}',
            },
          ],
          replace: true,
        }),
      );
    });
  }, groupName);
  await page.locator('[data-testid="run-query"]:visible').click();
  await expect(
    page.locator('.virtual-event[data-event-id="tooltip-event"]'),
  ).toBeVisible();
});

test.afterEach(async () => {
  const child = app?.process();
  let closeFailure: unknown;
  if (child && child.exitCode === null && child.signalCode === null) {
    const closed = app.waitForEvent("close", { timeout: 8000 });
    const exited = new Promise<number | null>((done) =>
      child.once("exit", done),
    );
    try {
      await app.evaluate(({ BrowserWindow }) =>
        BrowserWindow.getAllWindows()[0].close(),
      );
      await closed;
      expect(await exited).toBe(0);
    } catch (error) {
      closeFailure = error;
    } finally {
      if (child.exitCode === null && child.signalCode === null) {
        try {
          execFileSync("taskkill", ["/PID", String(child.pid), "/T", "/F"], {
            stdio: "ignore",
            windowsHide: true,
          });
        } catch (error) {
          closeFailure ??= error;
        }
      }
    }
  }
  if (closeFailure) throw closeFailure;
  expect(errors).toEqual([]);
  if (
    !directory ||
    !resolve(directory).startsWith(temporaryRoot + sep + "case-")
  )
    throw new Error("Unsafe favorite-tooltip verification cleanup");
  await rm(directory, {
    recursive: true,
    force: true,
    maxRetries: 10,
    retryDelay: 100,
  });
});

async function capture(name: string) {
  let png = "";
  for (let frame = 0; frame < 3; frame++)
    png = await app.evaluate(async ({ BrowserWindow }) => {
      const window = BrowserWindow.getAllWindows()[0];
      if (window.isVisible())
        throw new Error("Favorite-tooltip verification became visible");
      return (
        await window.webContents.capturePage(undefined, {
          stayHidden: true,
          stayAwake: true,
        })
      )
        .toPNG()
        .toString("base64");
    });
  await mkdir(test.info().outputDir, { recursive: true });
  await writeFile(test.info().outputPath(name), Buffer.from(png, "base64"));
}

const stored = async () =>
  restoreWorkspace(
    (await page.evaluate(() => window.explorer.loadWorkspace())).workspace,
  );
const requests = async () =>
  app.evaluate(() => (globalThis as any).__searchShortcutQueries as number);
const menu = () => page.locator(".query-searches-menu");
const saved = (id: string) =>
  page.locator(`[data-saved-search-id="saved-${id}"]`);
async function searches() {
  await page
    .getByRole("button", { name: "Saved and recent searches", exact: true })
    .click();
  await expect(menu()).toBeVisible();
}
async function shortcuts() {
  await openSettingsWindow(page);
  const dialog = page.getByRole("dialog", { name: "Settings", exact: true });
  await dialog.getByRole("tab", { name: "Shortcuts", exact: true }).click();
  return dialog;
}
async function record(dialog: Locator, action: string, combo: string) {
  await dialog
    .getByRole("button", { name: `Edit shortcut for ${action}`, exact: true })
    .click();
  await expect(dialog.locator('[data-shortcut-recording="true"]')).toHaveCount(
    1,
  );
  await page.keyboard.press(combo);
  await expect(dialog.locator('[data-shortcut-recording="true"]')).toHaveCount(
    0,
  );
}
for (const theme of ["light", "dark"]) {
  test(`${theme} saved-search Delete Cancel remains inline and persistent without loading or running a search`, async () => {
    const count = await requests();
    await searches();
    await saved("failures")
      .getByRole("menuitem", {
        name: "Delete saved search Failures",
        exact: true,
      })
      .click();
    const confirmation = () =>
      saved("failures").getByRole("group", {
        name: "Delete saved search Failures",
        exact: true,
      });
    await expect(confirmation().getByRole("button")).toHaveText([
      "Delete",
      "Cancel",
    ]);
    await expect(saved("failures")).toHaveAttribute(
      "data-confirming-delete",
      "true",
    );
    const style = await saved("failures").evaluate((element) => ({
      background: getComputedStyle(element).backgroundColor,
      buttons: Array.from(
        element.querySelectorAll(".inline-delete-confirmation button"),
      ).map((button) => ({
        height: button.getBoundingClientRect().height,
        border: getComputedStyle(button).borderTopWidth,
        background: getComputedStyle(button).backgroundColor,
      })),
    }));
    expect(style.background).not.toBe("rgba(0, 0, 0, 0)");
    expect(style.buttons).toHaveLength(2);
    for (const button of style.buttons) {
      expect(button.height).toBeGreaterThanOrEqual(22);
      expect(parseFloat(button.border)).toBeGreaterThan(0);
      expect(button.background).not.toBe("rgba(0, 0, 0, 0)");
    }
    await capture(`${theme}-saved-search-confirmation.png`);
    await page
      .getByRole("textbox", { name: "Local filter loaded events", exact: true })
      .click();
    await expect(menu()).toHaveCount(0);
    await searches();
    await expect(confirmation()).toBeVisible();
    expect(await requests()).toBe(count);
    await confirmation()
      .getByRole("button", { name: "Cancel", exact: true })
      .click();
    await expect(confirmation()).toHaveCount(0);
    expect((await stored()).savedQueries).toHaveLength(2);
    await saved("failures")
      .getByRole("menuitem", {
        name: "Delete saved search Failures",
        exact: true,
      })
      .click();
    await confirmation()
      .getByRole("button", { name: "Delete", exact: true })
      .click();
    await expect(saved("failures")).toHaveCount(0);
    await expect
      .poll(async () => (await stored()).savedQueries.map((query) => query.id))
      .toEqual(["saved-requests"]);
    await saved("requests")
      .getByRole("menuitem", { name: "Requests", exact: true })
      .click();
    await expect(
      page.getByRole("combobox", {
        name: "CloudWatch filter pattern",
        exact: true,
      }),
    ).toHaveValue("request");
    expect(await requests()).toBe(count);
  });
  test(`${theme} shortcuts record real keys, suppress app actions, resolve conflicts and persist clear and reset`, async () => {
    const tabCount = await page
      .locator('.workspace-tab-label[role="tab"]')
      .count();
    const dialog = await shortcuts();
    await record(dialog, "New tab", "F11");
    await expect(dialog.getByRole("alert")).toContainText("reserved");
    expect(
      await app.evaluate(({ BrowserWindow }) =>
        BrowserWindow.getAllWindows()[0].isFullScreen(),
      ),
    ).toBe(false);
    await dialog
      .getByRole("button", { name: "Cancel shortcut for New tab", exact: true })
      .click();
    await dialog
      .getByRole("button", { name: "Edit shortcut for New tab", exact: true })
      .click();
    await page.keyboard.press("Escape");
    await expect(dialog).toBeVisible();
    await expect(
      dialog.locator('[data-shortcut-recording="true"]'),
    ).toHaveCount(0);
    await record(dialog, "New tab", "Control+Shift+Y");
    expect(await page.locator('.workspace-tab-label[role="tab"]').count()).toBe(
      tabCount,
    );
    const save = dialog.getByRole("button", {
      name: "Save shortcut for New tab",
      exact: true,
    });
    await expect(save).toBeEnabled();
    await page.keyboard.press("Tab");
    await expect(save).toBeFocused();
    await save.click();
    await expect
      .poll(async () => (await stored()).preferences.shortcuts.newTab)
      .toBe("Control+Shift+Y");
    await record(dialog, "New tab", "Control+W");
    await expect(dialog.getByRole("alert")).toContainText("Close tab");
    await expect(save).toBeDisabled();
    await capture(`${theme}-shortcut-conflict.png`);
    await dialog
      .getByRole("button", {
        name: "Replace conflicting shortcuts for New tab",
        exact: true,
      })
      .click();
    await expect
      .poll(async () => {
        const keys = (await stored()).preferences.shortcuts;
        return [keys.newTab, keys.closeTab, keys.openSettings];
      })
      .toEqual(["Control+W", "", "Control+,"]);
    await dialog
      .getByRole("button", { name: "Clear shortcut for New tab", exact: true })
      .click();
    await expect
      .poll(async () => (await stored()).preferences.shortcuts.newTab)
      .toBe("");
    await dialog
      .getByRole("button", { name: "Reset shortcut for New tab", exact: true })
      .click();
    await dialog
      .getByRole("button", {
        name: "Reset shortcut for Close tab",
        exact: true,
      })
      .click();
    await record(dialog, "New tab", "Control+Shift+Y");
    await save.click();
    await dialog
      .getByRole("searchbox", { name: "Search commands", exact: true })
      .fill("highlight");
    await expect(dialog.locator(".shortcut-editor-row")).toHaveCount(2);
    await expect(dialog.getByRole("alert")).toHaveCount(0);
    await dialog.locator(".mantine-Modal-close").click();
    await expect(dialog).toHaveCount(0);
    await page.keyboard.press("Control+T");
    expect(await page.locator('.workspace-tab-label[role="tab"]').count()).toBe(
      tabCount,
    );
    await page.keyboard.press("Control+Shift+Y");
    await expect(page.locator('.workspace-tab-label[role="tab"]')).toHaveCount(
      tabCount + 1,
    );
    expect((await stored()).preferences.shortcuts.closeTab).toBe("Control+W");
  });
}
