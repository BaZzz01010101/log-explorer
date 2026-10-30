import { openSettingsWindow } from "./settings-panel";
import {
  _electron as electron,
  expect,
  test,
  type ElectronApplication,
  type Page,
} from "@playwright/test";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { join, resolve, sep } from "node:path";
import { execFileSync } from "node:child_process";
import {
  createWorkspace,
  restoreWorkspace,
} from "../../src/renderer/workspace";
import { desktopExecutablePath } from "./desktop-app";

// Every process, fixture and result stays within the checkout. Background mode
// prevents native windows and the offline flag prevents AWS credential access.
const temporaryRoot = resolve(".tmp/desktop-query-mode-history");
let app: ElectronApplication, page: Page, directory: string, errors: string[];
test.beforeEach(async ({}, info) => {
  errors = [];
  await mkdir(temporaryRoot, { recursive: true });
  directory = await mkdtemp(join(temporaryRoot, "case-"));
  const workspace = createWorkspace();
  workspace.tabs[0].filterPattern = "";
  workspace.preferences.theme = info.title.includes("dark") ? "dark" : "light";
  workspace.tabs[0].view.mode = "hybrid";
  workspace.tabs[0].view.columns = [
    { path: "@timestamp", width: 194, pinned: true },
    { path: "@level", width: 84 },
    { path: "@source", width: 200 },
    { path: "@message", width: 420 },
    { path: "/payload", width: 180 },
  ];
  workspace.preferences.highlightProfiles = [
    {
      id: "map",
      name: "Map",
      enabled: true,
      groupPattern: "",
      groupIgnoreCase: false,
      rules: [
        {
          id: "pale",
          enabled: true,
          scope: "text",
          path: "",
          pattern: "Alpha",
          ignoreCase: false,
          target: "row",
          colors: { background: "#fdfbf5" },
          separateThemeColors: true,
          lightColors: { background: "#fdfbf5" },
          darkColors: { background: "#1b2432" },
        },
      ],
    },
  ];
  workspace.history = [
    {
      id: "tooltip-history",
      name: "Tooltip history",
      kind: "events",
      text: "request id = abc-123; status >= 500",
    },
  ];
  await writeFile(join(directory, "workspace.json"), JSON.stringify(workspace));
  const env: Record<string, string> = {};
  for (const key of ["PATH", "SystemRoot", "WINDIR", "TEMP", "TMP", "COMSPEC"])
    if (process.env[key]) env[key] = process.env[key]!;
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
  const session = await page.context().newCDPSession(page);
  await session.send("Emulation.setFocusEmulationEnabled", { enabled: true });
  await page.emulateMedia({ reducedMotion: "reduce" });
  expect(
    (await page.evaluate(() => window.explorer.environment())).canEnableAws,
  ).toBe(false);
  expect(
    await app.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()[0].isVisible(),
    ),
  ).toBe(false);
  await app.evaluate(({ dialog }) => {
    dialog.showMessageBox = async () => {
      throw new Error("Unexpected verification dialog");
    };
  });
  await expect(page.locator('[data-node-kind="group"]')).toHaveCount(9);
});
test.afterEach(async () => {
  if (app?.process().exitCode === null) {
    const child = app.process();
    const closed = app.waitForEvent("close", { timeout: 8000 });
    await app.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()[0].close(),
    );
    try {
      await closed;
    } finally {
      if (child.exitCode === null)
        execFileSync("taskkill", ["/PID", String(child.pid), "/T", "/F"], {
          stdio: "ignore",
        });
    }
  }
  expect(errors).toEqual([]);
  if (
    !directory ||
    !resolve(directory).startsWith(temporaryRoot + sep + "case-")
  )
    throw new Error("Unsafe verification cleanup");
  await rm(directory, {
    recursive: true,
    force: true,
    maxRetries: 10,
    retryDelay: 100,
  });
});
const row = (name: string) => page.getByRole("treeitem", { name, exact: true });
const action = (name: string) =>
  page.getByRole("menuitem", { name, exact: true });
const selected = () => page.locator('.resource-row[aria-selected="true"]');
const stored = async () =>
  restoreWorkspace(
    (await page.evaluate(() => window.explorer.loadWorkspace())).workspace,
  );

test.beforeEach(async ({}, info) => {
  await app.evaluate(({ ipcMain, BrowserWindow, clipboard }, longList) => {
    const win = BrowserWindow.getAllWindows()[0];
    win.setContentSize(1700, 1150);
    win.webContents.setBackgroundThrottling(false);
    (globalThis as any).__refinementCopies = [];
    clipboard.writeText = async (text) => {
      (globalThis as any).__refinementCopies.push(text);
    };
    ipcMain.removeHandler("explorer:query");
    ipcMain.handle("explorer:query", (event, request) => {
      if (
        event.sender !== win.webContents ||
        request.connection.mode !== "offline"
      )
        throw new Error("Unexpected refinement request");
      const events = Array.from({ length: longList ? 120 : 2 }, (_, index) => ({
        id: `refinement-${index}`,
        timestamp: Date.now() - 1000 + index,
        logGroup: "/aws/lambda/orders-api",
        logStream: "test",
        message: JSON.stringify({
          level: "INFO",
          msg: "Alpha abc123 / ABC456",
          payload: {
            nested: {
              list: Array.from(
                { length: index === 0 ? 12 : index === 1 ? 100 : 1 },
                (_, id) => ({
                  id,
                }),
              ),
            },
          },
          "a/b~c": "value",
        }),
      }));
      setImmediate(() =>
        event.sender.send("explorer:update", {
          requestId: request.requestId,
          state: "complete",
          events,
          replace: true,
        }),
      );
    });
  }, info.title.includes("virtualization"));
  await page.getByTestId("run-query").click();
  await expect(
    page.locator('.virtual-event[data-event-id="refinement-0"]'),
  ).toBeVisible();
});
const local = () =>
  page.getByRole("textbox", {
    name: "Local filter loaded events",
    exact: true,
  });
const quick = () =>
  page.getByRole("textbox", {
    name: "Highlight text in loaded events",
    exact: true,
  });
const inspector = () =>
  page.getByRole("region", { name: "Event inspector", exact: true });
const manualMarks = () =>
  page.locator('.virtual-event mark[data-highlight-origins~="manual"]');

for (const theme of ["light", "dark"]) {
  test(`${theme} Events undo survives tab switches and clear buttons independently of other fields`, async () => {
    const events = () =>
      page.getByRole("combobox", {
        name: "CloudWatch filter pattern",
        exact: true,
      });
    await events().fill("alpha");
    await page.getByTestId("run-query").focus();
    await events().focus();
    await events().press("End");
    await events().pressSequentially(" beta");
    await local().fill("Alpha");
    await quick().fill("ABC456");
    await local().focus();
    await local().press("End");
    await local().pressSequentially(" abc123");
    await events().press("Control+z");
    await expect(events()).toHaveValue("alpha");
    await expect(local()).toHaveValue("Alpha abc123");
    await expect(quick()).toHaveValue("ABC456");
    await events().press("Control+Shift+z");
    await expect(events()).toHaveValue("alpha beta");
    await local().press("Control+z");
    await expect(local()).toHaveValue("Alpha");
    await expect(events()).toHaveValue("alpha beta");
    await expect(quick()).toHaveValue("ABC456");
    const originalTab = page.getByRole("tab", { name: /orders-api/ }).first();
    await page
      .getByRole("button", { name: "/aws/lambda/payments-worker", exact: true })
      .dblclick();
    await events().fill("payment");
    await page.getByTestId("run-query").focus();
    await events().focus();
    await events().press("End");
    await events().pressSequentially(" warning");
    await originalTab.click();
    await expect(
      page.locator('.virtual-event[data-event-id="refinement-0"]'),
    ).toBeVisible();
    await expect(local()).toHaveValue("Alpha");
    await expect(quick()).toHaveValue("ABC456");
    await events().press("Control+z");
    await expect(events()).toHaveValue("alpha");
    await events().press("Control+y");
    await expect(events()).toHaveValue("alpha beta");
    await page
      .getByRole("button", { name: "Clear server filter", exact: true })
      .click();
    await expect(events()).toHaveValue("");
    const otherTab = page.getByRole("tab", { name: /payments-worker/ }).first();
    await otherTab.click();
    await originalTab.click();
    await events().press("Control+z");
    await expect(events()).toHaveValue("alpha beta");
    await expect(local()).toHaveValue("Alpha");
    await expect(quick()).toHaveValue("ABC456");
    await otherTab.click();
    await expect(events()).toHaveValue("payment warning");
    await events().press("Control+z");
    await expect(events()).toHaveValue("payment");
    await expect(
      page.getByText("Could not stop previous query", { exact: true }),
    ).toHaveCount(0);
  });
}
