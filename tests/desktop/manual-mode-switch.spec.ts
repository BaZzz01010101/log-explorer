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
const temporaryRoot = resolve(".tmp/desktop-manual-mode");
let app: ElectronApplication, page: Page, directory: string, errors: string[];
test.beforeEach(async ({}, info) => {
  errors = [];
  await mkdir(temporaryRoot, { recursive: true });
  directory = await mkdtemp(join(temporaryRoot, "case-"));
  const workspace = createWorkspace();
  workspace.tabs[0].kind = "insights";
  workspace.tabs[0].query = "fields @message | limit 5";
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
    (globalThis as any).__modeRuns = [];
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
      (globalThis as any).__modeRuns.push({
        kind: request.kind,
        filter: request.filterPattern,
        query: request.query,
      });
      const runNumber = (globalThis as any).__modeRuns.length;
      const events = Array.from({ length: longList ? 120 : 2 }, (_, index) => ({
        id: `manual-${runNumber}-${index}`,
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
    page.locator('.virtual-event[data-event-id="manual-1-0"]'),
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
  test(`${theme} Events drafts wait for Run or Enter and loaded content survives tab switches`, async () => {
    const status = page.locator(".query-status");
    const count = () =>
      app.evaluate(() => (globalThis as any).__modeRuns.length);
    const events = () =>
      page.getByRole("combobox", {
        name: "CloudWatch filter pattern",
        exact: true,
      });
    await expect.poll(count).toBe(1);
    await expect(events()).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Live", exact: true }),
    ).toBeEnabled();
    const restored = (await stored()).tabs.find(
      (tab) => tab.id === "tab-orders",
    );
    expect(restored).toMatchObject({
      kind: "events",
      sources: [{ logGroup: "/aws/lambda/orders-api" }],
      view: {
        mode: "hybrid",
        columns: [
          { path: "@timestamp", width: 194, pinned: true },
          { path: "@level", width: 84 },
          { path: "@source", width: 200 },
          { path: "@message", width: 420 },
          { path: "/payload", width: 180 },
        ],
      },
    });
    await events().fill("events draft");
    await page.waitForTimeout(450);
    await expect(status).toHaveAttribute("data-query-state", "complete");
    await expect(
      page.locator('.virtual-event[data-event-id="manual-1-0"]'),
    ).toBeVisible();
    await expect(page.getByTestId("run-query")).toBeEnabled();
    expect(await count()).toBe(1);
    await page.getByTestId("run-query").click();
    await expect(status).toHaveAttribute("data-query-state", "complete");
    await expect.poll(count).toBe(2);
    expect(
      await app.evaluate(() => (globalThis as any).__modeRuns.at(-1)),
    ).toMatchObject({ kind: "events", filter: '"events draft"' });
    await expect(
      page.locator('.virtual-event[data-event-id="manual-2-0"]'),
    ).toBeVisible();
    await events().fill("next draft");
    await page.waitForTimeout(450);
    expect(await count()).toBe(2);
    await expect(
      page.locator('.virtual-event[data-event-id="manual-2-0"]'),
    ).toBeVisible();
    await events().press("Enter");
    await expect(status).toHaveAttribute("data-query-state", "complete");
    await expect.poll(count).toBe(3);
    expect(
      await app.evaluate(() => (globalThis as any).__modeRuns.at(-1)),
    ).toMatchObject({ kind: "events", filter: '"next draft"' });
    await expect(
      page.locator('.virtual-event[data-event-id="manual-3-0"]'),
    ).toBeVisible();
    const first = page.getByRole("tab", { name: /orders-api/ }).first();
    await page
      .getByRole("button", { name: "/aws/lambda/payments-worker", exact: true })
      .dblclick();
    await expect.poll(count).toBe(4);
    await expect(
      page.locator('.virtual-event[data-event-id="manual-4-0"]'),
    ).toBeVisible();
    await events().fill("payment draft");
    await page.waitForTimeout(450);
    expect(await count()).toBe(4);
    await first.click();
    await expect(events()).toHaveValue("next draft");
    await expect(status).toHaveAttribute("data-query-state", "complete");
    await expect(
      page.locator('.virtual-event[data-event-id="manual-3-0"]'),
    ).toBeVisible();
    expect(await count()).toBe(4);
    await page
      .getByRole("tab", { name: /payments-worker/ })
      .first()
      .click();
    await expect(events()).toHaveValue("payment draft");
    await expect(
      page.locator('.virtual-event[data-event-id="manual-4-0"]'),
    ).toBeVisible();
    expect(await count()).toBe(4);
    expect(
      await app.evaluate(() =>
        (globalThis as any).__modeRuns.map((request: any) => ({
          kind: request.kind,
          query: request.query,
        })),
      ),
    ).toEqual([
      { kind: "events", query: "" },
      { kind: "events", query: "" },
      { kind: "events", query: "" },
      { kind: "events", query: "" },
    ]);
  });
}
