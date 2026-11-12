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
import type { LogTab } from "../../src/shared/contracts";
import {
  createTab,
  createWorkspace,
  restoreWorkspace,
  workspaceReducer,
} from "../../src/renderer/workspace";
import { desktopExecutablePath } from "./desktop-app";

// Hidden native windows, isolated user data and missing AWS config keep these
// cases inside the checkout and independent of the running installed app.
const temporaryRoot = resolve(".tmp/desktop-tab-navigation-split");
let app: ElectronApplication | undefined;
let page: Page;
let directory: string;
let errors: string[];

test.beforeEach(async ({}, info) => {
  errors = [];
  app = undefined;
  await mkdir(temporaryRoot, { recursive: true });
  directory = await mkdtemp(join(temporaryRoot, "case-"));
  let workspace = createWorkspace();
  for (const [id, group] of [
    ["tab-payments", "payments-worker"],
    ["tab-media", "media-pipeline"],
  ]) {
    const tab = createTab("offline", [{ logGroup: `/aws/lambda/${group}` }]);
    tab.id = id;
    workspace = workspaceReducer(workspace, { type: "tab/open", tab });
  }
  for (const [index, tab] of workspace.tabs.entries()) {
    tab.customTitle = ["Orders", "Payments", "Media"][index];
    tab.filterPattern = `${tab.customTitle.toLowerCase()}-filter`;
    tab.filterMode = "plain";
    tab.timePreset = ["1h", "6h", "12h"][index];
    tab.view.mode = "hybrid";
    tab.view.columns = [
      { path: "@timestamp", width: 194, pinned: true },
      { path: "@message", width: 420 },
      { path: "/payload", width: 180 },
    ];
    tab.view.wrap = index === 0;
    tab.view.localSearch = "";
  }
  workspace.preferences.theme = info.title.startsWith("dark")
    ? "dark"
    : "light";
  // Reproduce a saved workspace from before recent-tab shortcuts existed. The
  // app must migrate only these old defaults to the new visual-order bindings.
  workspace.preferences.shortcuts.nextTab = "Control+Tab";
  workspace.preferences.shortcuts.previousTab = "Control+Shift+Tab";
  delete workspace.preferences.shortcuts.recentTab;
  delete workspace.preferences.shortcuts.previousRecentTab;
  workspace.savedQueries = [];
  workspace.history = info.title.includes("search menu")
    ? Array.from({ length: 50 }, (_, index) => ({
        id: `recent-${index}`,
        name: "",
        kind: "events" as const,
        filterMode: "plain" as const,
        text: `recent-filter-${index + 1}`,
      }))
    : [];
  workspace.preferences.recentSearchesLimit = 100;
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
      BrowserWindow.getAllWindows().every((window) => !window.isVisible()),
    ),
  ).toBe(true);
  await app.evaluate(({ BrowserWindow, dialog }) => {
    const win = BrowserWindow.getAllWindows()[0];
    win.setContentSize(1700, 1100);
    win.webContents.setBackgroundThrottling(false);
    dialog.showMessageBox = async () => {
      throw new Error("Unexpected tab-navigation verification dialog");
    };
  });
  await expect(page.locator('[data-node-kind="group"]')).toHaveCount(9);
  await expect(page.locator(".workspace-tab")).toHaveCount(3);
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
    throw new Error("Unsafe tab-navigation verification cleanup");
  await rm(directory, {
    recursive: true,
    force: true,
    maxRetries: 10,
    retryDelay: 100,
  });
});

const tab = (title: string) =>
  page.getByRole("tab", { name: title, exact: true });
const active = async (title: string) =>
  expect(tab(title)).toHaveAttribute("aria-selected", "true");
const stored = async () =>
  restoreWorkspace(
    (await page.evaluate(() => window.explorer.loadWorkspace())).workspace,
  );
const config = (value: LogTab) => ({
  connectionId: value.connectionId,
  sources: value.sources,
  filterPattern: value.filterPattern,
  filterMode: value.filterMode,
  timePreset: value.timePreset,
  customStart: value.customStart,
  customEnd: value.customEnd,
  view: value.view,
});

for (const theme of ["light", "dark"]) {
  test(`${theme} recent shortcuts freeze focus order while held and visual shortcuts follow the tab strip`, async () => {
    // Visual order is Orders, Payments, Media. The latest previously focused
    // tab is Media, so MRU navigation must skip the adjacent Payments tab.
    await tab("Orders").click();
    await tab("Payments").click();
    await tab("Media").click();
    await tab("Orders").click();
    await active("Orders");
    await page.keyboard.press("Control+Tab");
    await active("Media");
    await page.keyboard.press("Control+Tab");
    await active("Orders");

    await page
      .getByRole("combobox", { name: "CloudWatch filter pattern", exact: true })
      .focus();
    await page.keyboard.down("Control");
    try {
      await page.keyboard.press("Tab");
      await active("Media");
      await page.keyboard.press("Tab");
      await active("Payments");
      await page.keyboard.down("Shift");
      try {
        await page.keyboard.press("Tab");
        await active("Media");
      } finally {
        await page.keyboard.up("Shift");
      }
      await page.keyboard.press("Tab");
      await active("Payments");
    } finally {
      await page.keyboard.up("Control");
    }
    // Releasing Control commits Payments as the latest selection. Separate
    // shortcut presses now toggle it with Orders rather than continuing a cycle.
    await page.keyboard.press("Control+Tab");
    await active("Orders");
    await page.keyboard.press("Control+Tab");
    await active("Payments");

    await page.keyboard.press("Control+PageDown");
    await active("Media");
    await page.keyboard.press("Control+PageDown");
    await active("Orders");
    await page.keyboard.press("Control+PageUp");
    await active("Media");
    await page.keyboard.press("Control+PageUp");
    await active("Payments");

    // A modifier-held Tab navigates tabs while autocomplete is open; it must
    // leave the draft untouched instead of accepting the selected keyword.
    await page
      .getByRole("button", { name: "Filter mode: Text", exact: true })
      .click();
    await page
      .getByRole("menuitem", { name: "Pattern", exact: true })
      .click();
    const input = page.getByRole("combobox", {
      name: "CloudWatch filter pattern",
      exact: true,
    });
    const suggestion = page
      .getByRole("listbox", { name: "AWS pattern suggestions", exact: true })
      .getByRole("option", { name: /^NOT EXISTS/ });
    await input.fill("{ $.level N");
    await expect(suggestion).toBeVisible();
    await page.keyboard.press("Control+Tab");
    await active("Media");
    await page.keyboard.press("Control+Tab");
    await active("Payments");
    await expect(input).toHaveValue("{ $.level N");

    await input.focus();
    await expect(suggestion).toBeVisible();
    await page.keyboard.press("Control+Shift+Tab");
    await active("Orders");
    await page.keyboard.press("Control+Tab");
    await active("Payments");
    await expect(input).toHaveValue("{ $.level N");
  });

  test(`${theme} Split pane duplicates the active source and configuration while retaining unrelated tabs`, async () => {
    await tab("Orders").click();
    const before = await stored();
    const original = before.tabs.find((value) => value.id === "tab-orders")!;
    const unrelated = before.tabs.filter((value) => value.id !== original.id);
    await page.getByRole("button", { name: "Split pane", exact: true }).click();
    await expect(page.locator(".workspace-pane")).toHaveCount(2);
    await expect(page.locator(".workspace-tab")).toHaveCount(3);
    await expect(tab("Payments")).toBeVisible();
    await expect(tab("Media")).toBeVisible();
    await expect.poll(async () => (await stored()).tabs.length).toBe(4);
    const firstSplit = await stored();
    expect(firstSplit.splitTabs).toHaveLength(1);
    expect(firstSplit.splitTabs![0].panes).toHaveLength(2);
    const firstClone = firstSplit.tabs.find(
      (value) => !before.tabs.some((previous) => previous.id === value.id),
    )!;
    expect(config(firstClone)).toEqual(config(original));
    expect(
      firstSplit.splitTabs![0].panes.map((pane) => pane.tabId).sort(),
    ).toEqual([original.id, firstClone.id].sort());
    for (const other of unrelated)
      expect(firstSplit.tabs.find((value) => value.id === other.id)).toEqual(
        other,
      );

    const secondPane = page.locator(".workspace-pane").nth(1);
    await secondPane
      .getByRole("combobox", { name: "CloudWatch filter pattern", exact: true })
      .fill("split-only-filter");
    await secondPane
      .getByRole("textbox", { name: "Local filter loaded events", exact: true })
      .fill("split-local-filter");
    await expect
      .poll(
        async () =>
          (await stored()).tabs.find((value) => value.id === firstClone.id)
            ?.view.localSearch,
      )
      .toBe("split-local-filter");
    const modifiedClone = (await stored()).tabs.find(
      (value) => value.id === firstClone.id,
    )!;
    expect(modifiedClone.filterPattern).toBe("split-only-filter");
    await secondPane
      .getByRole("button", { name: "Split pane", exact: true })
      .click();
    await expect(page.locator(".workspace-pane")).toHaveCount(3);
    await expect(page.locator(".workspace-tab")).toHaveCount(3);
    await expect.poll(async () => (await stored()).tabs.length).toBe(5);
    const secondSplit = await stored();
    const secondClone = secondSplit.tabs.find(
      (value) => !firstSplit.tabs.some((previous) => previous.id === value.id),
    )!;
    expect(config(secondClone)).toEqual(config(modifiedClone));
    expect(
      config(secondSplit.tabs.find((value) => value.id === original.id)!),
    ).toEqual(config(original));
    expect(secondSplit.splitTabs![0].panes).toHaveLength(3);
    for (const other of unrelated) {
      await expect(tab(other.customTitle!)).toBeVisible();
      expect(secondSplit.tabs.find((value) => value.id === other.id)).toEqual(
        other,
      );
    }
  });

  test(`${theme} search menu hides an empty Saved section and scrolls within its larger viewport bound`, async () => {
    await page
      .getByRole("button", { name: "Saved and recent searches", exact: true })
      .click();
    const menu = page.locator(".query-searches-menu");
    await expect(menu).toBeVisible();
    await expect(menu.getByText("Saved searches", { exact: true })).toHaveCount(
      0,
    );
    await expect(
      menu.getByText("Recent searches", { exact: true }),
    ).toBeVisible();
    await expect(
      menu.getByRole("menuitem", { name: "Save search…", exact: true }),
    ).toBeEnabled();
    const size = await menu.evaluate((element) => {
      const bounds = element.getBoundingClientRect();
      return {
        height: bounds.height,
        top: bounds.top,
        bottom: bounds.bottom,
        viewport: innerHeight,
        scrollable: element.scrollHeight > element.clientHeight,
        overflow: getComputedStyle(element).overflowY,
      };
    });
    expect(size.height).toBeGreaterThan(480);
    expect(size.height).toBeLessThanOrEqual(721);
    expect(size.height).toBeLessThanOrEqual(size.viewport * 0.85 + 1);
    expect(size.top).toBeGreaterThanOrEqual(0);
    expect(size.bottom).toBeLessThanOrEqual(size.viewport);
    expect(size.scrollable).toBe(true);
    expect(size.overflow).toBe("auto");
    await menu
      .getByRole("menuitem", { name: "recent-filter-50", exact: true })
      .scrollIntoViewIfNeeded();
    expect(await menu.evaluate((element) => element.scrollTop)).toBeGreaterThan(
      0,
    );
  });
}
