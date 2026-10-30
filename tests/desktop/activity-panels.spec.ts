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
const root = resolve(".tmp/desktop-activity-panels");
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
  const width = info.title.includes("narrow") ? 860 : 1500;
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
  test(`${theme} activity buttons switch the left pane and settings expand into a modal`, async () => {
    await expect(page.locator(".activity-bar button")).toHaveCount(3);
    await expect(
      page.locator(
        '.workspace-tab-tools [aria-label="Toggle explorer"],.workspace-tab-tools [aria-label="Add split pane"]',
      ),
    ).toHaveCount(0);
    await expect(
      page.getByRole("button", { name: "Manage connections", exact: true }),
    ).toHaveCount(0);
    const filter = page.getByRole("textbox", {
      name: "Search log groups",
      exact: true,
    });
    await filter.fill("orders");
    await activity("Settings").click();
    const pane = page.getByRole("region", {
      name: "Settings",
      exact: true,
    });
    await expect(pane).toBeVisible();
    await expect(
      page.getByRole("dialog", { name: "Settings", exact: true }),
    ).toHaveCount(0);
    await expect(filter).toBeHidden();
    await pane.getByRole("tab", { name: "Preferences", exact: true }).click();
    const font = pane.getByLabel("Log font size", { exact: true });
    await font.fill("15");
    await expect(font).toHaveValue("15");
    await activity("Open settings in window").click();
    const modal = page.getByRole("dialog", {
      name: "Settings",
      exact: true,
    });
    await expect(modal).toBeVisible();
    await expect(
      modal.getByRole("tab", { name: "Preferences", exact: true }),
    ).toHaveAttribute("aria-selected", "true");
    await expect(
      modal.getByLabel("Log font size", { exact: true }),
    ).toHaveValue("15");
    await page.keyboard.press("Escape");
    await expect(modal).toHaveCount(0);
    await expect(filter).toBeVisible();
    await expect(filter).toHaveValue("orders");
    await activity("AWS logs explorer").click();
    await expect(page.locator(".sidebar-shell")).toBeHidden();
    await activity("Settings").click();
    await expect(modal).toBeVisible();
    await activity("Return settings to pane").click();
    await expect(pane).toBeVisible();
    await activity("AWS logs explorer").click();
    await expect(filter).toBeVisible();
    await expect(filter).toHaveValue("orders");
  });
}

for (const layout of ["light", "dark narrow wrapped"]) {
  test(`${layout} empty pin row reveals only at the top edge and accepts an above-window drop`, async () => {
    await expect(page.locator('[data-tab-strip="pinned"]')).toHaveCount(0);
    const point = await beginTabDrag();
    await expect(page.locator('[data-tab-strip="pinned"]')).toHaveCount(0);
    await page.mouse.move(point.x, 4, { steps: 4 });
    await expect(page.locator('[data-tab-strip="pinned"]')).toBeVisible();
    await page.mouse.move(point.x, -40, { steps: 4 });
    await expect(page.locator('[data-tab-strip="pinned"]')).toBeVisible();
    await page.mouse.up();
    await expect(tabNode("tab-orders")).toHaveAttribute("data-pinned", "true");
    await expect(
      page.locator('[data-tab-strip="pinned"] [data-tab-id="tab-orders"]'),
    ).toBeVisible();
    await activity("Unpin orders-api").click();
    await expect(page.locator('[data-tab-strip="pinned"]')).toHaveCount(0);
    await expect
      .poll(
        async () =>
          (await stored()).tabs.find((tab) => tab.id === "tab-orders")?.pinned,
      )
      .toBe(false);
  });
}

test("pin reveal cancels cleanly and shared row never creates an empty pinned strip", async () => {
  const before = await page
    .locator("[data-tab-id]")
    .evaluateAll((elements) =>
      elements.map((element) => element.getAttribute("data-tab-id")),
    );
  const point = await beginTabDrag();
  await page.mouse.move(point.x, 2);
  await expect(page.locator('[data-tab-strip="pinned"]')).toBeVisible();
  await page.keyboard.press("Escape");
  await page.mouse.up();
  await expect(page.locator('[data-tab-strip="pinned"]')).toHaveCount(0);
  expect(
    await page
      .locator("[data-tab-id]")
      .evaluateAll((elements) =>
        elements.map((element) => element.getAttribute("data-tab-id")),
      ),
  ).toEqual(before);
  await activity("Settings").click();
  await page.getByRole("tab", { name: "Preferences", exact: true }).click();
  await page
    .getByLabel("Put pinned tabs on a separate row", { exact: true })
    .uncheck();
  await activity("AWS logs explorer").click();
  const sharedPoint = await beginTabDrag();
  await page.mouse.move(sharedPoint.x, 2);
  await expect(page.locator('[data-tab-strip="pinned"]')).toHaveCount(0);
  await page.keyboard.press("Escape");
  await page.mouse.up();
});

test("legacy tab groups disappear without hiding tabs or split actions", async () => {
  await expect(page.locator("[data-tab-id]")).toHaveCount(3);
  await activity("Workspace tab menu").click();
  await expect(page.getByRole("menuitem", { name: /group/i })).toHaveCount(0);
  await page.keyboard.press("Escape");
  await tabNode("tab-orders").click({ button: "right" });
  await expect(page.getByRole("menuitem", { name: /group/i })).toHaveCount(0);
  await expect(
    page.getByRole("menuitem", { name: "Move to a new split", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("menuitem", { name: "Show in split mode", exact: true }),
  ).toBeVisible();
  await page.keyboard.press("Escape");
  await expect.poll(async () => "groups" in (await stored())).toBe(false);
  expect((await stored()).tabs.every((tab) => !("groupId" in tab))).toBe(true);
});

test("pane-header drag reveals the empty pin row and detaches a pinned tab without losing view state", async () => {
  await expect(page.locator(".workspace-pane")).toHaveCount(2);
  await expect(page.locator('[data-tab-strip="pinned"]')).toHaveCount(0);
  const header = (await page
    .locator("[data-pane-header]")
    .first()
    .boundingBox())!;
  const x =
    (await page.locator('[data-tab-strip="regular"]').boundingBox())!.x + 60;
  await page.mouse.move(header.x + 75, header.y + header.height / 2);
  await page.mouse.down();
  await page.mouse.move(header.x + 87, header.y + header.height / 2, {
    steps: 3,
  });
  await page.mouse.move(x, -20, { steps: 8 });
  await expect(page.locator('[data-tab-strip="pinned"]')).toBeVisible();
  await page.mouse.up();
  await expect(tabNode("tab-orders")).toHaveAttribute("data-pinned", "true");
  await expect(page.locator(".workspace-pane")).toHaveCount(1);
  await expect
    .poll(async () => (await stored()).splitTabs?.length ?? 0)
    .toBe(0);
  expect(
    (await stored()).tabs.find((tab) => tab.id === "tab-orders")?.sources,
  ).toEqual([{ logGroup: "/aws/lambda/orders-api" }]);
});

test("dark narrow settings categories stay inside the left pane with reachable expand control", async ({}, info) => {
  await activity("Settings").click();
  const pane = page.getByRole("region", {
    name: "Settings",
    exact: true,
  });
  for (const category of [
    "Connections",
    "Preferences",
    "Highlights",
    "Shortcuts",
    "Workspace",
  ]) {
    await pane.getByRole("tab", { name: category, exact: true }).click();
    await expect(activity("Open settings in window")).toBeVisible();
    const bounds = await pane.evaluate((element) => {
      const rect = element.getBoundingClientRect();
      const button = element
        .querySelector('[aria-label="Open settings in window"]')!
        .getBoundingClientRect();
      return {
        fits: button.right <= rect.right && button.left >= rect.left,
        bodyFits: document.documentElement.scrollWidth <= innerWidth,
        width: rect.width,
      };
    });
    expect(bounds.fits).toBe(true);
    expect(bounds.bodyFits).toBe(true);
    expect(bounds.width).toBeLessThanOrEqual(260);
  }
  await pane.getByRole("tab", { name: "Preferences", exact: true }).click();
  const png = await app.evaluate(async ({ BrowserWindow }) => {
    let image;
    for (let i = 0; i < 3; i++)
      image = await BrowserWindow.getAllWindows()[0].webContents.capturePage(
        undefined,
        { stayHidden: true, stayAwake: true },
      );
    return image!.toPNG().toString("base64");
  });
  await writeFile(
    info.outputPath("settings-pane.png"),
    Buffer.from(png, "base64"),
  );
});
