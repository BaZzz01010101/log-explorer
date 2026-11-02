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
const root = resolve(".tmp/desktop-interface-polish");
let directory: string, app: ElectronApplication, page: Page, errors: string[];
let child: ReturnType<ElectronApplication["process"]>;
test.beforeEach(async ({}, info) => {
  await mkdir(root, { recursive: true });
  directory = await mkdtemp(join(root, "case-"));
  errors = [];
  let workspace = createWorkspace();
  workspace.preferences.theme = info.title.includes("dark") ? "dark" : "light";
  workspace.sidebarVisible = true;
  workspace.sidebarWidth = 600;
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
  workspace.closedTabs = Array.from({ length: 29 }, (_, index) => ({
    ...createTab("offline", [
      { logGroup: "/aws/lambda/closed-" + index },
      ...(index === 0 ? [{ logGroup: "/aws/lambda/extra" }] : []),
    ]),
    id: "closed-" + index,
    title:
      index === 1
        ? "Very long history name " + "-service".repeat(35)
        : "Closed service " + index,
    closedAt: Date.now() - (index % 7) * 86400000,
  }));
  workspace.closedTabs.push({
    ...createTab("offline", []),
    id: "expired",
    title: "Expired view",
    closedAt: Date.now() - 8 * 86400000,
  });
  if (info.title.includes("intrinsic")) {
    workspace.closedTabs = workspace.closedTabs
      .slice(0, 3)
      .map((tab, index) => ({
        ...tab,
        title: info.title.includes("short")
          ? `View ${index}`
          : `Payment reconciliation service with detailed source ${index}`,
      }));
  }
  if (info.title.includes("source tooltips")) {
    workspace.closedTabs = [
      {
        ...createTab("offline", [{ logGroup: "/aws/lambda/orders-api" }]),
        id: "closed-alias",
        customTitle: "Order investigation",
        closedAt: Date.now(),
      },
      {
        ...createTab("offline", [
          {
            logGroup: "/aws/lambda/orders-api",
            logStreams: [
              "2026/10/28/[$LATEST]abcdef123456",
              "2026/10/28/[$LATEST]ghijkl789012",
            ],
          },
          { logGroup: "/aws/lambda/payments-worker" },
        ]),
        id: "closed-multiple",
        customTitle: "Checkout investigation",
        closedAt: Date.now(),
      },
    ];
  }
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

for (const theme of ["light", "dark"]) {
  test(`${theme} closed history hover stability after crossing other UI`, async () => {
    await activity("Workspace tab menu").click();
    const entry = page.locator('[data-closed-tab-id="closed-2"]');
    const tooltip = page
      .getByRole("tooltip")
      .filter({ hasText: "Closed service 2" });
    await entry.hover();
    await expect(tooltip).toBeVisible();
    const controls = await page
      .locator(
        `input[aria-label="Search log groups"], [aria-label="CloudWatch filter pattern"], input[aria-label="Local filter loaded events"]`,
      )
      .evaluateAll((elements) =>
        elements.slice(0, 3).map((element) => {
          const box = element.getBoundingClientRect();
          return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
        }),
      );
    expect(controls).toHaveLength(3);
    const destination = (await entry.boundingBox())!;
    for (let cycle = 0; cycle < 3; cycle++) {
      // Real pointer events cross unrelated controls before the close delay
      // expires. Slow locator.hover actions conceal the leaked-timer race.
      for (const point of controls) await page.mouse.move(point.x, point.y);
      await page.mouse.move(
        destination.x + destination.width / 2,
        destination.y + destination.height / 2,
      );
      // Check after both the 350ms close and 450ms open deadlines: the old
      // visible tooltip must not make the assertion pass before either fires.
      await page.waitForTimeout(700);
      await expect(tooltip, `rapid pointer entry ${cycle}`).toBeVisible({
        timeout: 1500,
      });
    }
    await page.mouse.move(controls[0].x, controls[0].y);
    await expect(tooltip).toHaveCount(0);
    await page.evaluate(() => {
      const [first, second] = document.querySelectorAll(
        `input[aria-label="Search log groups"], [aria-label="CloudWatch filter pattern"], input[aria-label="Local filter loaded events"]`,
      );
      const next = document.querySelector('[data-closed-tab-id="closed-2"]')!;
      // Keep these exits in one event-loop turn. Hidden native input is
      // frame-paced, which otherwise lets the leaked close timers expire.
      first.dispatchEvent(
        new MouseEvent("mouseout", { bubbles: true, relatedTarget: second }),
      );
      second.dispatchEvent(
        new MouseEvent("mouseout", { bubbles: true, relatedTarget: next }),
      );
      next.dispatchEvent(
        new MouseEvent("mouseover", { bubbles: true, relatedTarget: second }),
      );
    });
    await page.waitForTimeout(700);
    await expect(
      tooltip,
      "queued exits must not cancel the next tooltip",
    ).toBeVisible({ timeout: 1500 });
  });

  test(`${theme} closed history source tooltips use automatic source names only for renamed or multisource views`, async () => {
    await activity("Workspace tab menu").click();
    const menu = page.getByRole("menu");
    await expect(
      menu.locator('[data-closed-tab-id="closed-alias"]'),
    ).toHaveAttribute(
      "data-tooltip",
      "Order investigation\n\nSources:\norders-api",
    );
    await menu.locator('[data-closed-tab-id="closed-alias"]').hover();
    const tooltip = page.getByRole("tooltip");
    await expect(tooltip).toContainText("Order investigation");
    await expect(tooltip).toHaveText(
      "Order investigation\n\nSources:\norders-api",
    );
    await menu.locator('[data-closed-tab-id="closed-multiple"]').hover();
    const names = ["abcdef123456", "ghijkl789012"].map(
      (id) =>
        createTab("offline", [
          {
            logGroup: "/aws/lambda/orders-api",
            logStreams: [`2026/10/28/[$LATEST]${id}`],
          },
        ]).title,
    );
    await expect(tooltip).toHaveText(
      `Checkout investigation\n\nSources:\n${names.join("\n")}\npayments-worker`,
    );
    await expect(tooltip).not.toContainText("/aws/");
    await expect(tooltip).not.toContainText("eu-west-1");
    await tooltip.hover();
    await expect(tooltip).toBeVisible();
    expect(
      await tooltip.evaluate((el) => getComputedStyle(el).userSelect),
    ).toBe("text");
    await captureInterface("history-source-tooltip.png");
    await page.keyboard.press("Escape");
    // An ordinary generated name must not gain a redundant Sources section.
    const plainTab = tabNode("tab-orders");
    await plainTab.click({ button: "right" });
    await menuItem("Close tab").click();
    await activity("Workspace tab menu").click();
    const original = page.locator('[data-closed-tab-id="tab-orders"]');
    await expect(original).toHaveAttribute("data-tooltip", "orders-api");
    expect(
      await original
        .locator(".closed-tab-title")
        .evaluate((element) => element.scrollWidth <= element.clientWidth),
    ).toBe(true);
    await original.hover();
    await page.waitForTimeout(900);
    await expect(page.getByRole("tooltip")).toHaveCount(0);
  });
}
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

const settings = () =>
  page.getByRole("region", { name: "Settings", exact: true });
const menuItem = (name: string) =>
  page.getByRole("menuitem", { name, exact: true });

for (const theme of ["light", "dark"]) {
  for (const length of ["short", "medium"]) {
    test(`${theme} intrinsic ${length} closed-tab menu sizes to its content instead of a fixed width`, async () => {
      await activity("Workspace tab menu").click();
      const menu = page.getByRole("menu"),
        box = (await menu.boundingBox())!;
      expect(box.width).toBeLessThan(length === "short" ? 300 : 650);
      expect(box.width).toBeGreaterThan(length === "short" ? 150 : 320);
      expect(
        await menu
          .locator(".closed-tab-history-list")
          .evaluate((el) => el.scrollWidth <= el.clientWidth),
      ).toBe(true);
      await expect(menu.locator("[data-closed-tab-id]")).toHaveCount(3);
      await captureInterface(`history-intrinsic-${length}.png`);
    });
  }
  test(`${theme} history expands to available height, truncates without horizontal scroll and shows source metadata`, async () => {
    await activity("Workspace tab menu").click();
    const menu = page.getByRole("menu");
    const box = (await menu.boundingBox())!;
    expect(box.width).toBeGreaterThanOrEqual(750);
    expect(box.width).toBeLessThanOrEqual(760);
    expect(box.height).toBeGreaterThan(700);
    expect(box.y).toBeGreaterThanOrEqual(0);
    expect(box.y + box.height).toBeLessThanOrEqual(
      await page.evaluate(() => innerHeight),
    );
    expect(
      await menu
        .locator(".closed-tab-history-list")
        .evaluate((el) => el.scrollWidth <= el.clientWidth),
    ).toBe(true);
    const first = menu.locator('[data-closed-tab-id="closed-0"]');
    await expect(first.locator("svg.tab-source-icon")).toBeVisible();
    await expect(first.locator(".tab-source-count")).toHaveText("2");
    expect(
      await menu
        .locator('[data-closed-tab-id="closed-1"] .closed-tab-title')
        .evaluate((el) => ({
          overflow: getComputedStyle(el).textOverflow,
          clipped: el.scrollWidth > el.clientWidth,
        })),
    ).toEqual({ overflow: "ellipsis", clipped: true });
    await expect(menu.locator("[title]")).toHaveCount(0);
    await menu.locator('[data-closed-tab-id="closed-1"]').hover();
    const tooltip = page.getByRole("tooltip");
    await expect(tooltip).toContainText("Very long history name");
    await tooltip.hover();
    await expect(tooltip).toBeVisible();
    await captureInterface("history-expanded.png");
    await activity("Settings").click();
    await expect(menu).toHaveCount(0);
    await app.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()[0].setContentSize(860, 700),
    );
    await activity("Workspace tab menu").click();
    const narrow = (await menu.boundingBox())!;
    expect(narrow.x).toBeGreaterThanOrEqual(0);
    expect(narrow.x + narrow.width).toBeLessThanOrEqual(
      await page.evaluate(() => innerWidth),
    );
    expect(narrow.y + narrow.height).toBeLessThanOrEqual(
      await page.evaluate(() => innerHeight),
    );
    expect(
      await menu
        .locator(".closed-tab-history-list")
        .evaluate((el) => el.scrollWidth <= el.clientWidth),
    ).toBe(true);
    await menu
      .locator(".closed-tab-history-list")
      .evaluate((el) => (el.scrollTop = el.scrollHeight));
    await menu.locator('[data-closed-tab-id="closed-28"]').click();
    await expect(tabNode("closed-28")).toBeVisible();
  });

  test(`${theme} settings uses shaped tabs, quick inputs on one axis and activity toggles preserve page`, async () => {
    const gear = activity("Settings");
    await expect(gear.locator("svg")).toHaveAttribute("class", /settings/);
    await expect(activity("AWS logs explorer").locator("img")).toBeVisible();
    await gear.click();
    const pane = settings();
    await pane.getByRole("tab", { name: "Time ranges", exact: true }).click();
    const tabs = pane.getByRole("tab");
    expect(
      await tabs.evaluateAll((elements) =>
        elements.every(
          (el) =>
            parseFloat(getComputedStyle(el).borderTopWidth) > 0 &&
            getComputedStyle(el).borderTopStyle === "solid",
        ),
      ),
    ).toBe(true);
    const active = pane.getByRole("tab", { name: "Time ranges", exact: true });
    const inactive = pane.getByRole("tab", {
      name: "Connections",
      exact: true,
    });
    expect(
      await active.evaluate((el) => getComputedStyle(el).backgroundColor),
    ).not.toBe(
      await inactive.evaluate((el) => getComputedStyle(el).backgroundColor),
    );
    expect(
      await active.evaluate((el) => {
        const style = getComputedStyle(el);
        const list = getComputedStyle(el.closest('[role="tablist"]')!);
        const panel = getComputedStyle(
          document.getElementById(el.getAttribute("aria-controls")!)!,
        );
        return {
          squareBottom:
            parseFloat(style.borderBottomLeftRadius) === 0 &&
            parseFloat(style.borderBottomRightRadius) === 0,
          roundTop: parseFloat(style.borderTopLeftRadius) > 0,
          joinsPanel:
            style.borderBottomColor === panel.backgroundColor &&
            style.backgroundColor === panel.backgroundColor,
          noButtonContainer:
            parseFloat(list.borderLeftWidth) === 0 &&
            parseFloat(list.borderTopWidth) === 0 &&
            list.backgroundColor === "rgba(0, 0, 0, 0)",
        };
      }),
    ).toEqual({
      squareBottom: true,
      roundTop: true,
      joinsPanel: true,
      noButtonContainer: true,
    });
    const paneBorder = await pane.evaluate((el) => {
      const list = el
        .querySelector('[role="tablist"]')!
        .getBoundingClientRect();
      const outer = el.getBoundingClientRect();
      const panel = getComputedStyle(
        el.querySelector('[role="tabpanel"]:not([hidden])')!,
      );
      return {
        left: Math.abs(list.left - outer.left),
        right: Math.abs(list.right - outer.right),
        sideBorders: [
          panel.borderLeftWidth,
          panel.borderRightWidth,
          panel.borderBottomWidth,
        ],
      };
    });
    expect(paneBorder.left).toBeLessThanOrEqual(1);
    expect(paneBorder.right).toBeLessThanOrEqual(1);
    expect(
      paneBorder.sideBorders.every((width) => parseFloat(width) === 0),
    ).toBe(true);
    // The compact pane may wrap units; the continuous single-row guide remains
    // the wide-layout contract.
    const resize = (await page.locator(".sidebar-resizer").boundingBox())!;
    const initialWidth = (await page.locator(".sidebar-shell").boundingBox())!
      .width;
    await page.mouse.move(resize.x + resize.width / 2, 200);
    await page.mouse.down();
    await page.mouse.move(
      resize.x + resize.width / 2 + 900 - initialWidth,
      200,
      { steps: 6 },
    );
    await page.mouse.up();
    await expect
      .poll(async () =>
        Math.round((await page.locator(".sidebar-shell").boundingBox())!.width),
      )
      .toBe(900);
    const quick = pane.getByRole("region", {
      name: "Quick toolbar templates",
      exact: true,
    });
    const inputs = quick.getByRole("textbox");
    await expect(inputs).toHaveCount(6);
    const positions = await inputs.evaluateAll((elements) =>
      elements.map((el) => el.getBoundingClientRect().top),
    );
    expect(Math.max(...positions) - Math.min(...positions)).toBeLessThan(1);
    const captions = quick.locator(".time-template-quick-caption");
    await expect(captions).toHaveText(["Minutes", "Hours", "Days"]);
    const guides = await captions.evaluateAll((elements) =>
      elements.map((el) => {
        const rect = el.getBoundingClientRect();
        const style = getComputedStyle(el);
        const tick = getComputedStyle(el, "::before");
        return {
          left: rect.left,
          right: rect.right,
          top: rect.top,
          line: style.borderTopStyle,
          tick: tick.top,
        };
      }),
    );
    expect(
      guides.every(
        (guide) => guide.line === "solid" && parseFloat(guide.tick) < 0,
      ),
    ).toBe(true);
    expect(Math.abs(guides[0].right - guides[1].left)).toBeLessThan(1);
    expect(Math.abs(guides[1].right - guides[2].left)).toBeLessThan(1);
    expect(
      Math.max(...guides.map((guide) => guide.top)) -
        Math.min(...guides.map((guide) => guide.top)),
    ).toBeLessThan(1);
    expect((await captions.first().boundingBox())!.y).toBeGreaterThan(
      (await inputs.first().boundingBox())!.y,
    );
    const selected = active.getAttribute("aria-selected");
    expect(await selected).toBe("true");
    await captureInterface("settings-pane.png");
    await gear.click();
    await expect(page.locator(".sidebar-shell")).toBeHidden();
    await gear.click();
    await expect(active).toHaveAttribute("aria-selected", "true");
    await activity("Open settings in window").click();
    const dialog = page.getByRole("dialog", {
      name: "Settings",
      exact: true,
    });
    await expect(dialog).toBeVisible();
    const modalBorder = await dialog.evaluate((el) => {
      const list = el
        .querySelector('[role="tablist"]')!
        .getBoundingClientRect();
      const outer = el.getBoundingClientRect();
      const panel = getComputedStyle(
        el.querySelector('[role="tabpanel"]:not([hidden])')!,
      );
      return {
        left: Math.abs(list.left - outer.left),
        right: Math.abs(list.right - outer.right),
        sideBorders: [
          panel.borderLeftWidth,
          panel.borderRightWidth,
          panel.borderBottomWidth,
        ],
      };
    });
    expect(modalBorder.left).toBeLessThanOrEqual(1);
    expect(modalBorder.right).toBeLessThanOrEqual(1);
    expect(
      modalBorder.sideBorders.every((width) => parseFloat(width) === 0),
    ).toBe(true);
    expect(
      await dialog
        .getByRole("tablist")
        .evaluate((el) => el.scrollWidth <= el.clientWidth),
    ).toBe(true);
    await expect(
      dialog.getByRole("tab", { name: "Time ranges", exact: true }),
    ).toHaveAttribute("aria-selected", "true");
    await captureInterface("settings-modal.png");
    await activity("Return settings to pane").click();
    await app.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()[0].setContentSize(860, 700),
    );
    expect(
      await pane
        .getByRole("tablist")
        .evaluate(
          (el) =>
            getComputedStyle(el).overflowX === "auto" &&
            document.documentElement.scrollWidth <= innerWidth,
        ),
    ).toBe(true);
    await pane.getByRole("tab", { name: "Preferences", exact: true }).click();
    await expect(
      pane.getByLabel("Log font size", { exact: true }),
    ).toBeVisible();
    await activity("AWS logs explorer").click();
    await expect(page.locator('[data-node-kind="group"]')).toHaveCount(9);
  });

  test(`${theme} history retention defaults to seven days and persists a smaller age across reload`, async () => {
    await activity("Settings").click();
    await settings()
      .getByRole("tab", { name: "Preferences", exact: true })
      .click();
    const days = settings().getByLabel("Closed tab history (days)", {
      exact: true,
    });
    await expect(days).toHaveValue("7");
    await days.fill("3");
    await days.press("Tab");
    await expect
      .poll(async () => (await stored()).preferences.closedTabHistoryDays)
      .toBe(3);
    await expect
      .poll(async () =>
        (await stored()).closedTabs.some((tab) =>
          ["expired", "closed-6"].includes(tab.id),
        ),
      )
      .toBe(false);
    await page.reload();
    await expect(page.locator('[data-node-kind="group"]')).toHaveCount(9);
    await activity("Settings").click();
    await settings()
      .getByRole("tab", { name: "Preferences", exact: true })
      .click();
    await expect(days).toHaveValue("3");
    await activity("Workspace tab menu").click();
    await expect(
      page.getByRole("menu").locator('[data-closed-tab-id="closed-6"]'),
    ).toHaveCount(0);
    await page.keyboard.press("Escape");
  });
}

test("application menu shows version, working hints and independent side-panel toggle", async () => {
  await activity("Settings").click();
  await settings()
    .getByRole("tab", { name: "Time ranges", exact: true })
    .click();
  await activity("Application menu").click();
  const menu = page.getByRole("menu");
  const waitForPaintedMenu = async () => {
    // Hidden Chromium windows can suspend CSS transitions until their compositor
    // is asked to paint. Wake it without showing/focusing the window, and wait
    // for the real transition to finish before inspecting the captured pixels.
    await expect
      .poll(async () => {
        await app.evaluate(async ({ BrowserWindow }) => {
          await BrowserWindow.getAllWindows()[0].webContents.capturePage(
            undefined,
            {
              stayHidden: true,
              stayAwake: true,
            },
          );
        });
        return menu.evaluate((el) => getComputedStyle(el).opacity);
      })
      .toBe("1");
  };
  const version = await page.evaluate(
    async () => (await window.explorer.environment()).version,
  );
  await expect(menu).toContainText(`v${version}`);
  await expect(menuItem("Zoom in").locator("kbd")).toHaveText(["Ctrl", "+"]);
  await expect(
    menuItem("Zoom in").locator(".application-menu-key-separator"),
  ).toHaveText("+");
  await expect(menuItem("Reopen closed tab").locator("kbd")).toHaveText([
    "Ctrl",
    "Shift",
    "T",
  ]);
  expect(
    await menu.locator("kbd").evaluateAll((elements) =>
      elements.every((el) => {
        const style = getComputedStyle(el);
        return (
          el.getBoundingClientRect().height <= 20 &&
          style.borderTopStyle === "solid" &&
          parseFloat(style.borderTopWidth) <= 1 &&
          parseFloat(style.paddingLeft) <= 3
        );
      }),
    ),
  ).toBe(true);
  await waitForPaintedMenu();
  await captureInterface("application-menu.png");
  expect(
    await menu
      .getByRole("menuitem")
      .evaluateAll((elements) =>
        elements.every((el) => !!el.querySelector("kbd")?.textContent?.trim()),
      ),
  ).toBe(true);
  await expect(menuItem("Toggle side panel")).toContainText("Ctrl+B");
  await menuItem("Toggle side panel").click();
  await expect(page.locator(".sidebar-shell")).toBeHidden();
  await page.keyboard.press("Control+b");
  await expect(settings()).toBeVisible();
  await expect(
    settings().getByRole("tab", { name: "Time ranges", exact: true }),
  ).toHaveAttribute("aria-selected", "true");
  await activity("AWS logs explorer").click();
  await page.keyboard.press("Control+t");
  await expect(
    page.getByRole("tab", { name: "Log view", exact: true }),
  ).toBeVisible();
  await page.keyboard.press("Control+Shift+l");
  await expect(page.locator(".desktop-app")).toHaveAttribute(
    "data-theme",
    "dark",
  );
  await activity("Application menu").click();
  await waitForPaintedMenu();
  await expect(menuItem("Zoom in").locator("kbd")).toHaveText(["Ctrl", "+"]);
  await captureInterface("application-menu-dark.png");
  await page.keyboard.press("Escape");
  await page.keyboard.press("Control+,");
  await expect(settings()).toBeVisible();
  await settings().getByRole("tab", { name: "Shortcuts", exact: true }).click();
  const shortcut = settings().getByLabel("toggle Sidebar", { exact: true });
  await shortcut.fill("Alt+B");
  await shortcut.press("Tab");
  await activity("Application menu").click();
  await expect(menuItem("Toggle side panel")).toContainText("Alt+B");
  await page.keyboard.press("Escape");
  await page.keyboard.press("Alt+b");
  await expect(page.locator(".sidebar-shell")).toBeHidden();
});

test("pinned and normal rows have no heavy separator and keep pin behavior", async () => {
  await tabNode("tab-orders").click({ button: "right" });
  await menuItem("Pin tab").click();
  const row = page.locator(".pinned-tab-row");
  await expect(row).toBeVisible();
  expect(
    await row.evaluate((el) =>
      parseFloat(getComputedStyle(el).borderBottomWidth),
    ),
  ).toBe(0);
  await expect(
    tabNode("tab-orders").locator('.tab-close[aria-label^="Unpin"] svg'),
  ).toBeVisible();
  await tabNode("tab-orders").click({ button: "middle" });
  await expect(tabNode("tab-orders")).toBeVisible();
});
async function captureInterface(name: string) {
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
