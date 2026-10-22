import { desktopExecutablePath } from "./desktop-app";
import {
  _electron as electron,
  test,
  expect,
  type ElectronApplication,
  type Page,
  type Locator,
} from "@playwright/test";
import { mkdtemp, readFile, writeFile, rm } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join, resolve, sep } from "node:path";

test.setTimeout(150000);
let app: ElectronApplication;
let child: ReturnType<ElectronApplication["process"]>;
let page: Page;
let directory: string;
let environment: Record<string, string>;
let errors: string[];
const packaged = process.env.EXPLORER_DESKTOP_PACKAGED === "1";

async function launch(waitForQuery = true) {
  app = await electron.launch({
    executablePath: packaged ? desktopExecutablePath() : undefined,
    args: [
      ...(packaged ? [] : [process.cwd()]),
      "--offline-verification",
      "--background-verification",
      "--disable-background-networking",
      "--disable-component-update",
    ],
    env: environment,
  });
  child = app.process();
  page = await app.firstWindow();
  page.setDefaultTimeout(10000);
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Emulation.setFocusEmulationEnabled", { enabled: true });
  await page.emulateMedia({ reducedMotion: "reduce" });
  page.on("pageerror", (error) => errors.push(error.message));
  expect(
    await app.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()[0].isVisible(),
    ),
  ).toBe(false);
  await app.evaluate(({ dialog }) => {
    dialog.showMessageBox = async () => {
      throw new Error(
        "Unexpected native dialog during hidden combined-tab verification",
      );
    };
  });
  const info = await page.evaluate(() => window.explorer.environment());
  expect(info.awsEnabled).toBe(false);
  expect(info.canEnableAws).toBe(false);
  if (waitForQuery)
    await expect(
      page.locator('.query-status[data-query-state="complete"]').first(),
    ).toBeAttached();
  else
    await expect(
      page.getByText("Saved locally", { exact: true }),
    ).toBeVisible();
}
async function closeNaturally() {
  const closed = app.waitForEvent("close", { timeout: 10000 });
  const exited = new Promise<number | null>((done) => child.once("exit", done));
  await app.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows()[0].close(),
  );
  await closed;
  expect(await exited).toBe(0);
}
test.beforeEach(async ({}, info) => {
  directory = await mkdtemp(join(tmpdir(), "aws-log-explorer-combined-"));
  errors = [];
  environment = {};
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
  Object.assign(environment, {
    EXPLORER_TEST_USER_DATA: directory,
    AWS_CONFIG_FILE: join(directory, "absent-config"),
    AWS_SHARED_CREDENTIALS_FILE: join(directory, "absent-credentials"),
    AWS_EC2_METADATA_DISABLED: "true",
  });
  if (info.title.includes("connection")) {
    await writeFile(
      join(directory, "workspace.json"),
      JSON.stringify({
        version: 1,
        name: "Connection retention test",
        closedTabs: [],
        groups: [],
        favorites: [],
        recents: [],
        savedQueries: [],
        history: [],
        presets: [],
        sidebarWidth: 280,
        sidebarVisible: true,
        preferences: {
          theme: "dark",
          density: "compact",
          fontSize: 12,
          maxEvents: 20000,
          refreshSeconds: 0,
          timezone: "local",
          highlightText: "",
          shortcuts: {
            closeTab: "Control+w",
            reopenTab: "Control+Shift+t",
            nextTab: "Control+Tab",
            previousTab: "Control+Shift+Tab",
            splitPane: "Control+\\",
            toggleSidebar: "Control+b",
            runQuery: "Control+Enter",
          },
        },
        connections: [
          {
            id: "offline",
            name: "Offline fixtures",
            profile: "fixture-only",
            region: "eu-west-1",
            mode: "offline",
          },
          {
            id: "retained",
            name: "Retained connection",
            profile: "fixture-only",
            region: "eu-west-1",
            mode: "offline",
          },
        ],
        activeConnectionId: "retained",
        tabs: [
          {
            id: "tab-retained",
            title: "orders-api",
            connectionId: "retained",
            sources: [{ logGroup: "/aws/lambda/orders-api" }],
            kind: "events",
            timePreset: "1h",
            filterPattern: "",
            query: "",
            view: {
              mode: "hybrid",
              columns: [],
              localSearch: "",
              level: "",
              wrap: false,
            },
          },
        ],
        panes: [{ id: "pane-retained", tabId: "tab-retained" }],
        activePaneId: "pane-retained",
        layout: { type: "leaf", paneId: "pane-retained" },
      }),
    );
  }
  await launch();
});
test.afterEach(async () => {
  if (child?.exitCode === null) {
    await Promise.race([
      app.close().catch(() => {}),
      new Promise((done) => setTimeout(done, 3000)),
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
  if (
    !resolve(directory).startsWith(
      resolve(tmpdir()) + sep + "aws-log-explorer-combined-",
    )
  )
    throw new Error("Unsafe combined verification cleanup path");
  await rm(directory, {
    recursive: true,
    force: true,
    maxRetries: 10,
    retryDelay: 100,
  });
  expect(errors).toEqual([]);
});
const regular = (name: string) => page.getByRole("tab", { name, exact: true });
const combined = () =>
  page.locator('.workspace-tab[data-entry-kind="split"]').getByRole("tab");
async function open(name: string) {
  await page
    .getByRole("treeitem", { name: `/aws/lambda/${name}`, exact: true })
    .locator(".resource-label")
    .dblclick();
}
async function merge(first: string, second: string) {
  await regular(first).click();
  await regular(second).click({ modifiers: ["Control"] });
  await regular(first).click({ button: "right" });
  await page
    .getByRole("menuitem", { name: "Show in split mode", exact: true })
    .click();
}
async function rename(tab: Locator, title: string) {
  await tab.click({ button: "right" });
  await page.getByRole("menuitem", { name: "Rename tab", exact: true }).click();
  await page
    .getByRole("textbox", { name: "Tab name", exact: true })
    .fill(title);
  await page.getByRole("button", { name: "Rename", exact: true }).click();
}
async function startDrag(tab: Locator) {
  const from = (await tab.boundingBox())!;
  await page.mouse.move(from.x + 35, from.y + from.height / 2);
  await page.mouse.down();
  await page.mouse.move(from.x + 45, from.y + from.height / 2, { steps: 2 });
}

test("combined tabs own their layout, member tooltip, rename and exit lifecycle", async () => {
  await open("payments-worker");
  await open("media-pipeline");
  await merge("orders-api", "payments-worker");
  await expect(page.locator(".workspace-tab")).toHaveCount(2);
  await expect(page.locator(".workspace-pane")).toHaveCount(2);
  await expect(page.locator(".workspace-pane-list")).toHaveCount(0);
  await expect(
    page.locator('.workspace-tab[data-entry-kind="split"] .tab-source-icon'),
  ).toBeVisible();
  await combined().hover();
  const tooltip = page.getByRole("tooltip");
  await expect(tooltip).toContainText("orders-api");
  await expect(tooltip).toContainText("payments-worker");
  await page.mouse.move(10, 10);
  await expect(tooltip).toHaveCount(0);
  await rename(combined(), "Backend investigation");
  await expect(combined()).toContainText("Backend investigation");
  await expect(tooltip).toHaveCount(0);
  await regular("media-pipeline").click();
  await expect(page.locator(".workspace-pane")).toHaveCount(1);
  await expect(page.locator(".pane-title")).toHaveText("media-pipeline");
  await expect(page.locator(".pane-layout-divider")).toHaveCount(0);
  await combined().click();
  await expect(page.locator(".workspace-pane")).toHaveCount(2);
  await closeNaturally();
  const saved = JSON.parse(
    await readFile(join(directory, "workspace.json"), "utf8"),
  );
  expect(saved.splitTabs).toHaveLength(1);
  expect(saved.splitTabs[0].title).toBe("Backend investigation");
  await launch();
  await expect(combined()).toContainText("Backend investigation");
  await expect(page.locator(".workspace-pane")).toHaveCount(2);
  await combined().click({ button: "right" });
  await page
    .getByRole("menuitem", { name: "Exit split screen", exact: true })
    .click();
  await expect(
    page.locator('.workspace-tab[data-entry-kind="split"]'),
  ).toHaveCount(0);
  await expect(page.locator(".workspace-tab")).toHaveCount(3);
  await expect(page.locator(".workspace-pane")).toHaveCount(1);
  await rename(regular("orders-api"), "Requests");
  await regular("Requests").click();
  await expect(page.locator(".pane-title")).toHaveText("Requests");
  await page
    .getByRole("button", { name: "Close Requests", exact: true })
    .click();
  await page.keyboard.press("Control+Shift+T");
  await expect(regular("orders-api")).toBeVisible();
  await expect(regular("Requests")).toHaveCount(0);
  await closeNaturally();
});

test("dragging selects a destination split, pane headers reorder in place, and a combined tab merges as one unit", async () => {
  await open("payments-worker");
  await open("media-pipeline");
  await open("notifications");
  await merge("orders-api", "payments-worker");
  await regular("media-pipeline").click();
  await expect(page.locator(".workspace-pane")).toHaveCount(1);
  await startDrag(regular("notifications"));
  let rect = (await page.locator("[data-pane-drop-target]").boundingBox())!;
  await page.mouse.move(rect.x + rect.width / 2, rect.y + rect.height / 2, {
    steps: 3,
  });
  const destination = (await combined().boundingBox())!;
  await page.mouse.move(
    destination.x + destination.width / 2,
    destination.y + destination.height / 2,
    { steps: 3 },
  );
  await expect(page.locator(".workspace-pane")).toHaveCount(2);
  rect = (await page.locator("[data-pane-drop-target]").first().boundingBox())!;
  await page.mouse.move(rect.x + 20, rect.y + rect.height / 2, { steps: 4 });
  await expect(page.locator(".pane-drop-overlay")).toBeVisible();
  await page.mouse.up();
  await expect(page.locator(".workspace-pane")).toHaveCount(3);
  await expect(page.locator(".workspace-tab")).toHaveCount(2);
  const before = await page.locator(".pane-title").allTextContents();
  const headers = page.locator("[data-pane-header]");
  const from = (await headers.first().boundingBox())!;
  const to = (await page.locator(".workspace-pane").last().boundingBox())!;
  await page.mouse.move(from.x + 80, from.y + from.height / 2);
  await page.mouse.down();
  await page.mouse.move(from.x + 90, from.y + from.height / 2, { steps: 2 });
  await page.mouse.move(to.x + to.width / 2, to.y + to.height / 2, {
    steps: 4,
  });
  await expect(page.locator('[data-split-preview="center"]')).toBeVisible();
  await page.mouse.up();
  await expect(page.locator(".pane-title")).toHaveText([
    before[2],
    before[1],
    before[0],
  ]);
  await combined().hover();
  await expect(page.getByRole("tooltip")).toBeVisible();
  const combinedOrigin = (await combined().boundingBox())!;
  await startDrag(combined());
  rect = (await page.locator("[data-pane-drop-target]").first().boundingBox())!;
  await page.mouse.move(rect.x + rect.width / 2, rect.y + rect.height / 2, {
    steps: 3,
  });
  await expect(page.getByRole("tooltip")).toHaveCount(0);
  const normal = (await regular("media-pipeline").boundingBox())!;
  await page.mouse.move(
    // Dwell while covering 30% of the smaller neighbor, before it shifts
    // across the gap. Its old center no longer identifies the hovered tab.
    combinedOrigin.x + 35 + normal.width * 0.3,
    normal.y + normal.height / 2,
    { steps: 3 },
  );
  await expect(page.locator(".workspace-pane")).toHaveCount(1);
  rect = (await page.locator("[data-pane-drop-target]").boundingBox())!;
  await page.mouse.move(rect.x + rect.width / 2, rect.y + rect.height - 25, {
    steps: 4,
  });
  await expect(page.locator(".pane-drop-overlay")).toBeVisible();
  const projected = (await page.locator(".pane-drop-overlay").boundingBox())!;
  await page.mouse.up();
  await expect(page.locator(".workspace-pane")).toHaveCount(4);
  await expect(page.locator(".workspace-tab")).toHaveCount(1);
  expect(projected.height).toBeCloseTo((rect.height - 6) / 2, 0);
  await closeNaturally();
});

test("closing the last tab preserves the explorer connection and restart selection", async () => {
  const connection = page.getByRole("combobox", {
    name: "Explorer region",
    exact: true,
  });
  await expect(connection).toHaveValue("eu-west-1");
  await page
    .getByRole("button", { name: "Close orders-api", exact: true })
    .click();
  await expect(page.locator(".workspace-tab")).toHaveCount(0);
  // Observe the settled connection after close effects and the save debounce,
  // rather than accepting the previous select value before its effect runs.
  await page.waitForTimeout(750);
  await expect(connection).toHaveValue("eu-west-1");
  await closeNaturally();
  const saved = JSON.parse(
    await readFile(join(directory, "workspace.json"), "utf8"),
  );
  expect(saved.activeConnectionId).toBe("retained");
  expect(saved.tabs).toHaveLength(0);
  await launch(false);
  await expect(
    page.getByRole("combobox", { name: "Explorer region", exact: true }),
  ).toHaveValue("eu-west-1");
  await expect(page.locator(".workspace-tab")).toHaveCount(0);
  await closeNaturally();
});
