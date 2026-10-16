import {
  _electron as electron,
  expect,
  test,
  type ElectronApplication,
  type Page,
} from "@playwright/test";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join, resolve, sep } from "node:path";
import type { Workspace } from "../../src/shared/contracts";
import {
  createTab,
  createWorkspace,
  workspaceReducer,
} from "../../src/renderer/workspace";
import { desktopExecutablePath } from "./desktop-app";

test.setTimeout(45000);
const temporaryRoot = resolve(".tmp", "desktop-tab-layout");
let directory: string;
let app: ElectronApplication | undefined;
let page: Page;
let errors: string[];

async function launch(
  layout: "scroll" | "wrap",
  split = false,
  reuseSaved = false,
) {
  let workspace = createWorkspace();
  workspace.sidebarVisible = false;
  workspace.preferences.tabBarLayout = layout;
  for (let index = 1; index <= 9; index++) {
    const tab = createTab("offline", [
      {
        logGroup:
          index % 2
            ? "/aws/lambda/payments-worker"
            : "/aws/lambda/media-pipeline",
      },
    ]);
    tab.customTitle = `Service ${index} application logs`;
    workspace = workspaceReducer(workspace, { type: "tab/open", tab });
  }
  if (split)
    workspace = workspaceReducer(workspace, {
      type: "pane/show-tabs",
      tabIds: workspace.tabs.slice(0, 2).map((tab) => tab.id),
    });
  if (!reuseSaved)
    await writeFile(
      join(directory, "workspace.json"),
      JSON.stringify(workspace),
    );
  const env: Record<string, string> = {};
  for (const name of ["PATH", "SystemRoot", "WINDIR", "TEMP", "TMP", "COMSPEC"])
    if (process.env[name]) env[name] = process.env[name]!;
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
  page = await app.firstWindow();
  page.setDefaultTimeout(6000);
  page.on("pageerror", (error) => errors.push(error.message));
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Emulation.setFocusEmulationEnabled", { enabled: true });
  await page.setViewportSize({ width: 1040, height: 820 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.addStyleTag({
    content:
      "*,*::before,*::after { transition-duration:0s!important;animation-duration:0s!important }",
  });
  const environment = await page.evaluate(() => window.explorer.environment());
  expect(environment.awsEnabled).toBe(false);
  expect(environment.canEnableAws).toBe(false);
  expect(
    await app.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows().every((window) => !window.isVisible()),
    ),
  ).toBe(true);
  await app.evaluate(({ dialog }) => {
    dialog.showMessageBox = async () => {
      throw new Error(
        "Unexpected native dialog during hidden tab-layout verification",
      );
    };
  });
  await expect(page.locator(".workspace-tab")).toHaveCount(split ? 9 : 10);
  await expect(page.locator(".query-status").first()).toHaveAttribute(
    "data-query-state",
    "complete",
  );
  return workspace;
}

async function closeNaturally() {
  if (!app || app.process().exitCode !== null) return;
  const closed = app.waitForEvent("close", { timeout: 7000 });
  const exited = new Promise<number | null>((done) =>
    app!.process().once("exit", done),
  );
  await app.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows()[0].close(),
  );
  await closed;
  expect(await exited).toBe(0);
  app = undefined;
}
test.beforeEach(async () => {
  await mkdir(temporaryRoot, { recursive: true });
  directory = await mkdtemp(join(temporaryRoot, "case-"));
  errors = [];
  app = undefined;
});
test.afterEach(async () => {
  await closeNaturally();
  expect(errors).toEqual([]);
  if (!resolve(directory).startsWith(temporaryRoot + sep + "case-"))
    throw new Error("Unsafe tab-layout cleanup path");
  await rm(directory, {
    recursive: true,
    force: true,
    maxRetries: 10,
    retryDelay: 100,
  });
});

async function saved(): Promise<Workspace> {
  return JSON.parse(await readFile(join(directory, "workspace.json"), "utf8"));
}
async function geometry() {
  return page.locator(".workspace-tab").evaluateAll((elements) =>
    elements.map((element) => {
      const box = element.getBoundingClientRect();
      return {
        id: element.getAttribute("data-tab-id")!,
        x: box.x,
        y: box.y,
        width: box.width,
        height: box.height,
      };
    }),
  );
}
async function preferences() {
  await page
    .getByRole("button", { name: "Workspace settings", exact: true })
    .click();
  await page.getByRole("tab", { name: "Preferences", exact: true }).click();
}

test("wrap preference lays out multiple rows, preserves tab selection/context menus and persists on restart", async () => {
  const workspace = await launch("scroll");
  const scroll = await page
    .locator(".workspace-tab-list")
    .evaluate((element) => ({
      width: element.clientWidth,
      content: element.scrollWidth,
    }));
  expect(scroll.content).toBeGreaterThan(scroll.width);
  await preferences();
  await page.getByRole("combobox", { name: "Tab layout", exact: true }).click();
  await page
    .getByRole("option", { name: "Multiple rows", exact: true })
    .click();
  await page.keyboard.press("Escape");
  await expect(page.locator(".workspace-tab-list")).toHaveClass(/is-wrapped/);
  const boxes = await geometry();
  expect(new Set(boxes.map((box) => Math.round(box.y))).size).toBeGreaterThan(
    1,
  );
  expect(
    await page
      .locator(".workspace-tab-list")
      .evaluate((element) => element.scrollWidth <= element.clientWidth + 1),
  ).toBe(true);
  const target = boxes.find((box) => box.y > boxes[0].y)!;
  await page.locator(`[data-tab-id="${target.id}"]`).getByRole("tab").click();
  await expect(
    page.locator(`[data-tab-id="${target.id}"]`).getByRole("tab"),
  ).toHaveAttribute("aria-selected", "true");
  await page
    .locator(`[data-tab-id="${workspace.tabs[0].id}"]`)
    .getByRole("tab")
    .click({ modifiers: ["Control"] });
  await expect(page.locator(".workspace-tab.is-selected")).toHaveCount(2);
  await page.locator(`[data-tab-id="${target.id}"]`).click({ button: "right" });
  await expect(
    page.getByRole("menuitem", { name: "Show in split mode", exact: true }),
  ).toBeEnabled();
  await page.keyboard.press("Escape");
  await expect
    .poll(async () => (await saved()).preferences.tabBarLayout)
    .toBe("wrap");
  await closeNaturally();
  // Relaunch the saved state through the same isolated environment.
  const persisted = await saved();
  expect(persisted.preferences.tabBarLayout).toBe("wrap");
  await launch("wrap", false, true);
  await expect(page.locator(".workspace-tab-list")).toHaveClass(/is-wrapped/);
  expect(
    new Set((await geometry()).map((box) => Math.round(box.y))).size,
  ).toBeGreaterThan(1);
});

for (const layout of ["scroll", "wrap"] as const)
  test(`middle click closes one inactive tab without changing the active view in ${layout} mode`, async () => {
    const workspace = await launch(layout);
    const targetId = workspace.tabs[layout === "scroll" ? 6 : 0].id;
    const target = page.locator(`[data-tab-id="${targetId}"]`);
    const active = workspace.activeTabId;
    if (layout === "scroll") {
      await page.locator(".workspace-tab-list").hover();
      await page.mouse.wheel(800, 0);
      await target.scrollIntoViewIfNeeded();
      expect(
        await page
          .locator(".workspace-tab-list")
          .evaluate((element) => element.scrollLeft),
      ).toBeGreaterThan(0);
    }
    await target.getByRole("tab").click({ button: "middle" });
    await expect(target).toHaveCount(0);
    await expect(page.locator(".workspace-tab")).toHaveCount(9);
    await expect(
      page.locator(`[data-tab-id="${active}"]`).getByRole("tab"),
    ).toHaveAttribute("aria-selected", "true");
    await expect
      .poll(async () => (await saved()).closedTabs.map((tab) => tab.id))
      .toEqual([targetId]);
    await page.mouse.move(800, 500);
    expect(
      await page
        .locator(".workspace-tab-list")
        .evaluate((element) => element.scrollTop),
    ).toBe(0);
  });

test("wrapped tabs reorder across rows and panels detach at the indicated lower-row position", async () => {
  const workspace = await launch("wrap", true);
  const initial = await geometry();
  const source = initial[0];
  const destination = initial.find((box) => box.y > source.y)!;
  await page.mouse.move(source.x + 70, source.y + source.height / 2);
  await page.mouse.down();
  await page.mouse.move(source.x + 80, source.y + source.height / 2, {
    steps: 2,
  });
  await page.mouse.move(
    destination.x + destination.width / 2,
    destination.y + destination.height / 2,
    { steps: 5 },
  );
  await page.mouse.up();
  await expect
    .poll(async () => (await geometry()).map((box) => box.id))
    .not.toEqual(initial.map((box) => box.id));
  const splitId = workspace.splitTabs![0].id;
  await page.locator(`[data-tab-id="${splitId}"]`).getByRole("tab").click();
  await expect(page.locator(".workspace-pane")).toHaveCount(2);
  const before = (await geometry()).find(
    (box, _index, boxes) => box.y > boxes[0].y && box.id !== splitId,
  )!;
  const header = (await page
    .locator("[data-pane-header]")
    .first()
    .boundingBox())!;
  await page.mouse.move(header.x + 80, header.y + header.height / 2);
  await page.mouse.down();
  await page.mouse.move(header.x + 90, header.y + header.height / 2, {
    steps: 2,
  });
  await page.mouse.move(before.x + 10, before.y + before.height / 2, {
    steps: 3,
  });
  await expect(page.locator(".workspace-tab-insertion")).toHaveAttribute(
    "data-tab-insertion-before",
    before.id,
  );
  const marker = (await page
    .locator(".workspace-tab-insertion")
    .boundingBox())!;
  expect(Math.abs(marker.y - before.y)).toBeLessThanOrEqual(1);
  expect(marker.height).toBeLessThanOrEqual(before.height + 1);
  await page.mouse.up();
  await expect(page.locator(".workspace-pane")).toHaveCount(1);
  await expect(page.locator(".workspace-tab")).toHaveCount(10);
  const order = (await geometry()).map((box) => box.id);
  expect(order[order.indexOf(before.id) - 1]).toBe(workspace.panes[0].tabId);
  await expect.poll(async () => (await saved()).tabs.length).toBe(10);
  expect((await saved()).closedTabs).toEqual([]);
});

test("split separators have visible grips and pane headers retain an active cue in both themes", async () => {
  await launch("wrap", true);
  for (const theme of ["dark", "light"] as const) {
    await preferences();
    await page.getByRole("combobox", { name: "Theme", exact: true }).click();
    await page.getByRole("option", { name: theme, exact: true }).click();
    await page.keyboard.press("Escape");
    const style = await page
      .locator(".pane-layout-divider")
      .evaluate((element) => {
        const divider = getComputedStyle(element);
        const grip = getComputedStyle(element, "::after");
        const active = getComputedStyle(
          document.querySelector(".active-pane .pane-heading")!,
        );
        const inactive = getComputedStyle(
          document.querySelector(
            ".workspace-pane:not(.active-pane) .pane-heading",
          )!,
        );
        return {
          divider: divider.backgroundColor,
          grip: grip.backgroundColor,
          width: element.getBoundingClientRect().width,
          active: active.backgroundColor,
          inactive: inactive.backgroundColor,
          accent: active.boxShadow,
          height: active.height,
        };
      });
    expect(style.width).toBe(6);
    expect(style.grip).not.toBe("rgba(0, 0, 0, 0)");
    expect(style.divider).not.toBe(style.grip);
    expect(style.active).not.toBe(style.inactive);
    expect(style.accent).not.toBe("none");
    expect(style.height).toBe("38px");
    await expect(
      page.getByRole("button", { name: "Close pane 1", exact: true }),
    ).toBeVisible();
  }
});
