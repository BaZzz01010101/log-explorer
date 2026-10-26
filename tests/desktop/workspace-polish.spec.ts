import {
  _electron as electron,
  expect,
  test,
  type ElectronApplication,
  type Page,
} from "@playwright/test";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join, resolve, sep } from "node:path";
import {
  createTab,
  createWorkspace,
  workspaceReducer,
} from "../../src/renderer/workspace";
import { desktopExecutablePath } from "./desktop-app";

test.setTimeout(90000);
const root = resolve(".tmp/desktop-workspace-polish");
let directory: string, app: ElectronApplication, page: Page, errors: string[];
let child: ReturnType<ElectronApplication["process"]>;
test.beforeEach(async ({}, info) => {
  await mkdir(root, { recursive: true });
  directory = await mkdtemp(join(root, "case-"));
  errors = [];
  let workspace = createWorkspace();
  workspace.preferences.theme = info.title.includes("dark") ? "dark" : "light";
  workspace.sidebarVisible = true;
  workspace.sidebarWidth = info.title.includes("narrow") ? 600 : 280;
  workspace.tabs[0].filterPattern = "";
  workspace.preferences.pinnedTabsSeparateRow = true;
  workspace.preferences.tabBarLayout = info.title.includes("wrapped")
    ? "wrap"
    : "scroll";
  for (let i = 0; i < (info.title.includes("wrapped") ? 7 : 2); i++) {
    const tab = createTab("offline", [
      { logGroup: "/aws/lambda/payments-worker" },
    ]);
    tab.id = `activity-tab-${i}`;
    tab.customTitle = `Another service ${i}`;
    tab.filterPattern = "";
    workspace = workspaceReducer(workspace, { type: "tab/open", tab });
  }
  workspace = workspaceReducer(workspace, {
    type: "tab/select",
    tabId: "tab-orders",
  });
  if (info.title.includes("pane-header"))
    workspace = workspaceReducer(workspace, {
      type: "pane/show-tabs",
      tabIds: ["tab-orders", "activity-tab-0"],
    });
  if (info.title.includes("legacy")) {
    Object.assign(workspace, {
      groups: [
        { id: "old-group", name: "Old group", color: "blue", collapsed: true },
      ],
    });
    workspace.tabs.forEach((tab) =>
      Object.assign(tab, { groupId: "old-group" }),
    );
  }
  if (!("groups" in workspace)) Object.assign(workspace, { groups: [] });
  const midnight = new Date();
  midnight.setHours(0, 0, 0, 0);
  workspace.closedTabs = [0, 1, 3].map((days, index) => ({
    ...createTab("offline", [{ logGroup: "/aws/lambda/closed-" + index }]),
    id: "closed-" + index,
    title: "Closed service " + index,
    closedAt: new Date(
      midnight.getFullYear(),
      midnight.getMonth(),
      midnight.getDate() - days,
      0,
      0,
      1,
    ).getTime(),
  }));
  if (info.title.includes("mixed"))
    workspace.tabs[0].sources.push({ logGroup: "/aws/lambda/payments-worker" });
  await writeFile(join(directory, "workspace.json"), JSON.stringify(workspace));
  const env: Record<string, string> = {};
  for (const key of ["PATH", "SystemRoot", "WINDIR", "TEMP", "TMP", "COMSPEC"])
    if (process.env[key]) env[key] = process.env[key]!;
  Object.assign(env, {
    EXPLORER_TEST_USER_DATA: directory,
    USERPROFILE: directory,
    APPDATA: directory,
    LOCALAPPDATA: directory,
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
  page.setDefaultTimeout(10000);
  page.on("pageerror", (error) => errors.push(error.message));
  const session = await page.context().newCDPSession(page);
  await session.send("Emulation.setFocusEmulationEnabled", { enabled: true });
  // Resize the native hidden window itself so WCO geometry and the content use
  // the same real dimensions, rather than emulating only the page viewport.
  const width = info.title.includes("wide")
    ? 2200
    : info.title.includes("narrow")
      ? 860
      : 1500;
  await app.evaluate(
    ({ BrowserWindow }, width) =>
      BrowserWindow.getAllWindows()[0].setContentSize(width, 850),
    width,
  );
  await expect.poll(() => page.evaluate(() => innerWidth)).toBe(width);
  expect(
    (await page.evaluate(() => window.explorer.environment())).canEnableAws,
  ).toBe(false);
  await app.evaluate(({ dialog }) => {
    dialog.showMessageBox = async () => {
      throw new Error("Unexpected close-save dialog");
    };
  });
  await expect(page.locator('[data-node-kind="group"]')).toHaveCount(9);
  await app.evaluate(async ({ BrowserWindow }) => {
    for (let i = 0; i < 3; i++)
      await BrowserWindow.getAllWindows()[0].webContents.capturePage(
        undefined,
        { stayHidden: true, stayAwake: true },
      );
  });
});
test.afterEach(async () => {
  if (child?.exitCode === null) {
    expect(
      await app.evaluate(({ BrowserWindow }) =>
        BrowserWindow.getAllWindows().every((w) => !w.isVisible()),
      ),
    ).toBe(true);
    const closed = app.waitForEvent("close");
    await app.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()[0].close(),
    );
    await closed;
    expect(child.exitCode).toBe(0);
  }
  expect(errors).toEqual([]);
  if (directory?.startsWith(root + sep))
    await rm(directory, { recursive: true, force: true });
});

const activity = (name: string) =>
  page.getByRole("button", { name, exact: true });
const stored = async () =>
  (await page.evaluate(() => window.explorer.loadWorkspace()))
    .workspace as ReturnType<typeof createWorkspace>;
const tabNode = (id: string) => page.locator(`[data-tab-id="${id}"]`);
async function beginTabDrag(id = "tab-orders") {
  const box = (await tabNode(id).boundingBox())!;
  const point = { x: box.x + 32, y: box.y + box.height / 2 };
  await page.mouse.move(point.x, point.y);
  await page.mouse.down();
  await page.mouse.move(point.x + 12, point.y, { steps: 3 });
  return point;
}

for (const theme of ["light", "dark"]) {
  test(`${theme} wide pane grows past 600px and settings remembers detach and dock across reload`, async () => {
    const resize = (await page
      .getByRole("separator", { name: "Resize explorer", exact: true })
      .boundingBox())!;
    await page.mouse.move(resize.x + resize.width / 2, resize.y + 160);
    await page.mouse.down();
    await page.mouse.move(resize.x + 900, resize.y + 160, { steps: 12 });
    await page.mouse.up();
    await expect
      .poll(
        async () => (await page.locator(".sidebar-shell").boundingBox())!.width,
      )
      .toBeGreaterThan(1100);
    // A saved wide preference must not create a dead zone after narrowing.
    await app.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()[0].setContentSize(1500, 850),
    );
    const separator = page.getByRole("separator", {
      name: "Resize explorer",
      exact: true,
    });
    const beforeKey = (await page.locator(".sidebar-shell").boundingBox())!
      .width;
    await separator.press("ArrowLeft");
    await expect
      .poll(
        async () => (await page.locator(".sidebar-shell").boundingBox())!.width,
      )
      .toBeLessThan(beforeKey - 15);
    const start = (await separator.boundingBox())!;
    const beforePointer = (await page.locator(".sidebar-shell").boundingBox())!
      .width;
    await page.mouse.move(start.x + start.width / 2, start.y + 160);
    await page.mouse.down();
    await page.mouse.move(start.x - 48, start.y + 160, { steps: 5 });
    await page.mouse.up();
    await expect
      .poll(
        async () => (await page.locator(".sidebar-shell").boundingBox())!.width,
      )
      .toBeLessThan(beforePointer - 40);
    await activity("Workspace settings").click();
    const pane = page.getByRole("region", {
      name: "Workspace settings",
      exact: true,
    });
    await pane.getByRole("tab", { name: "Preferences", exact: true }).click();
    await expect(
      activity("Open settings in window").locator("svg"),
    ).toHaveClass(/icon-external-link/);
    await activity("Open settings in window").click();
    const dialog = page.getByRole("dialog", {
      name: "Workspace settings",
      exact: true,
    });
    await expect(dialog).toBeVisible();
    await expect(
      dialog.getByRole("tab", { name: "Preferences", exact: true }),
    ).toHaveAttribute("aria-selected", "true");
    await expect
      .poll(async () => (await stored()).preferences.settingsDetached)
      .toBe(true);
    await page.keyboard.press("Escape");
    await activity("Workspace settings").click();
    await expect(dialog).toBeVisible();
    await activity("Return settings to pane").click();
    await expect(dialog).toHaveCount(0);
    await expect(pane).toBeVisible();
    await expect
      .poll(async () => (await stored()).preferences.settingsDetached)
      .toBe(false);
    await activity("Open settings in window").click();
    await expect
      .poll(async () => (await stored()).preferences.settingsDetached)
      .toBe(true);
    await page.reload();
    await expect(page.locator('[data-node-kind="group"]')).toHaveCount(9);
    await activity("Workspace settings").click();
    await expect(dialog).toBeVisible();
    await activity("Return settings to pane").click();
    await expect
      .poll(async () => (await stored()).preferences.settingsDetached)
      .toBe(false);
    await page.reload();
    await expect(page.locator('[data-node-kind="group"]')).toHaveCount(9);
    await activity("Workspace settings").click();
    await expect(pane).toBeVisible();
    await expect(dialog).toHaveCount(0);
  });

  test(`${theme} closed tab menu shows dated closing history only and reopening an older entry preserves order`, async () => {
    await activity("Workspace tab menu").click();
    const menu = page.getByRole("menu");
    await expect(menu.getByRole("menuitem")).toHaveCount(4);
    await expect(menu).toContainText("Today");
    await expect(menu).toContainText("Yesterday");
    await expect(menu.getByRole("menuitem").first()).toContainText(
      "Reopen closed tab",
    );
    await expect(menu).not.toContainText("Another service");
    expect((await menu.boundingBox())!.width).toBeGreaterThanOrEqual(360);
    expect(
      await menu.evaluate((element) => getComputedStyle(element).boxShadow),
    ).not.toBe("none");
    expect(
      await menu
        .locator(".closed-tab-entry")
        .first()
        .evaluate((element) => getComputedStyle(element).borderBottomStyle),
    ).toBe("solid");
    await capturePolish("closed-history.png");
    await menu
      .getByRole("menuitem", { name: "Closed service 1", exact: true })
      .click();
    await expect(tabNode("closed-1")).toBeVisible();
    await expect
      .poll(async () => (await stored()).closedTabs.map((tab) => tab.id))
      .toEqual(["closed-0", "closed-2"]);
    await activity("Workspace tab menu").click();
    await page
      .getByRole("menuitem", { name: "Reopen closed tab", exact: true })
      .click();
    await expect(tabNode("closed-0")).toBeVisible();
    await expect
      .poll(async () => (await stored()).closedTabs.map((tab) => tab.id))
      .toEqual(["closed-2"]);
  });
}

test("time templates configure quick access and dropdown independently and repeatedly open the matching settings page", async () => {
  await activity("Workspace settings").click();
  const pane = page.getByRole("region", {
    name: "Workspace settings",
    exact: true,
  });
  await pane.getByRole("tab", { name: "Time ranges", exact: true }).click();
  await expect(pane.locator("[title]")).toHaveCount(0);
  await pane
    .getByLabel("Quick toolbar Minutes slot 1", { exact: true })
    .fill("7");
  await pane
    .getByLabel("Relative dropdown Minutes slot 1", { exact: true })
    .fill("9");
  await activity("AWS logs explorer").click();
  await page
    .getByRole("button", { name: "Set last 7 minutes", exact: true })
    .click();
  await expect.poll(async () => (await stored()).tabs[0].timePreset).toBe("7m");
  await page.getByRole("button", { name: "Time range", exact: true }).click();
  const popup = page.locator(".time-range-popover");
  await expect(popup).toBeVisible();
  expect((await popup.boundingBox())!.width).toBeLessThanOrEqual(610);
  await expect(
    popup.getByRole("button", { name: "Last 9 minutes", exact: true }),
  ).toBeVisible();
  await popup
    .getByRole("button", { name: "Last 9 minutes", exact: true })
    .click();
  await popup.getByRole("button", { name: "Apply", exact: true }).click();
  await expect.poll(async () => (await stored()).tabs[0].timePreset).toBe("9m");
  for (let i = 0; i < 2; i++) {
    await page.getByRole("button", { name: "Time range", exact: true }).click();
    await page
      .getByRole("button", { name: "Time range settings", exact: true })
      .click();
    await expect(
      pane.getByRole("tab", { name: "Time ranges", exact: true }),
    ).toHaveAttribute("aria-selected", "true");
    await pane.getByRole("tab", { name: "Preferences", exact: true }).click();
    await activity("AWS logs explorer").click();
  }
});

test("mixed source badges survive renaming and query or LIVE icons stay before pin without changing width", async () => {
  const tab = tabNode("tab-orders");
  await expect(tab.locator(".tab-source-count")).toHaveText("2");
  await expect(tab).toContainText("Mixed Sources");
  await expect(tab).not.toContainText("(2)");
  await tab.click({ button: "right" });
  await page.getByRole("menuitem", { name: "Rename tab", exact: true }).click();
  const rename = page.getByRole("dialog", { name: "Rename tab", exact: true });
  await rename.getByRole("textbox").fill("My view");
  await rename.getByRole("button", { name: "Rename", exact: true }).click();
  await expect(tab).toContainText("My view");
  await expect(tab.locator(".tab-source-count")).toHaveText("2");
  await tab.click({ button: "right" });
  await page.getByRole("menuitem", { name: "Pin tab", exact: true }).click();
  const width = (await tab.boundingBox())!.width;
  await app.evaluate(({ ipcMain }) => {
    ipcMain.removeHandler("explorer:query");
    ipcMain.handle("explorer:query", () => undefined);
  });
  await activity("Run").click();
  await expect(tab.locator('[data-tab-activity="query"]')).toBeVisible();
  expect((await tab.boundingBox())!.width).toBeCloseTo(width, 1);
  await activity("Cancel query").click();
  await activity("Live").click();
  await expect(tab.locator('[data-tab-activity="live"]')).toBeVisible();
  expect((await tab.boundingBox())!.width).toBeCloseTo(width, 1);
  const icon = (await tab.locator("[data-tab-activity]").boundingBox())!;
  const pin = (await tab.locator(".tab-close").boundingBox())!;
  expect(icon.x + icon.width).toBeLessThanOrEqual(pin.x);
});

test("floating surfaces and dragged tabs share tooltip elevation and active pane has no blue border", async () => {
  const inspectorHeader = page.locator(".event-inspector-header");
  const headerBox = (await inspectorHeader.boundingBox())!;
  const hideBox = (await inspectorHeader
    .locator(".event-inspector-hide")
    .boundingBox())!;
  expect(
    headerBox.x + headerBox.width - hideBox.x - hideBox.width,
  ).toBeLessThan(20);
  expect(hideBox.x).toBeGreaterThan(headerBox.x + headerBox.width / 2);
  const heading = page.locator(".active-pane .pane-heading");
  expect(
    await heading.evaluate((element) => getComputedStyle(element).boxShadow),
  ).toBe("none");
  expect(
    await heading.evaluate(
      (element) => getComputedStyle(element).borderTopColor,
    ),
  ).not.toBe("rgb(92, 124, 250)");
  await activity("Workspace tab menu").click();
  const expected = await page
    .getByRole("menu")
    .evaluate((element) => getComputedStyle(element).boxShadow);
  await page.keyboard.press("Escape");
  await activity("Workspace settings").click();
  await page.getByRole("tab", { name: "Preferences", exact: true }).click();
  await page.getByRole("combobox", { name: "Theme", exact: true }).click();
  expect(
    await page
      .locator(".mantine-Select-dropdown:visible")
      .evaluate((element) => getComputedStyle(element).boxShadow),
  ).toBe(expected);
  await page.keyboard.press("Escape");
  await activity("AWS logs explorer").click();
  const point = await beginTabDrag();
  await page.mouse.move(point.x + 60, point.y, { steps: 5 });
  const preview = page.locator("[data-tab-row-preview]");
  await expect(preview).toBeVisible();
  expect(
    await preview.evaluate((element) => getComputedStyle(element).boxShadow),
  ).toBe(expected);
  await page.keyboard.press("Escape");
  await page.mouse.up();
});

async function capturePolish(name: string) {
  await page.evaluate(
    () =>
      new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      ),
  );
  const png = await app.evaluate(async ({ BrowserWindow }) => {
    const window = BrowserWindow.getAllWindows()[0];
    if (window.isVisible()) throw new Error("Verification became visible");
    await window.webContents.capturePage(undefined, {
      stayHidden: true,
      stayAwake: true,
    });
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
