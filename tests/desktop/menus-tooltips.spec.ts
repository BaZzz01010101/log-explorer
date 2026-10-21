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
const temporaryRoot = resolve(".tmp/desktop-menus-tooltips");
let app: ElectronApplication, page: Page, directory: string, errors: string[];
test.beforeEach(async () => {
  errors = [];
  await mkdir(temporaryRoot, { recursive: true });
  directory = await mkdtemp(join(temporaryRoot, "case-"));
  const workspace = createWorkspace();
  workspace.tabs[0].filterPattern = "";
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

test("tooltip trigger icons keep their size and tooltip styles do not affect controls", async () => {
  const regex = page.getByRole("button", {
    name: "Use regular expression",
    exact: true,
  });
  const refresh = page.getByRole("button", {
    name: "Refresh resources",
    exact: true,
  });
  for (const button of [regex, refresh]) {
    const geometry = await button.evaluate((element) => ({
      iconWidth: element.querySelector("svg")!.getBoundingClientRect().width,
      cursor: getComputedStyle(element).cursor,
    }));
    expect(geometry.iconWidth).toBeGreaterThanOrEqual(14);
    expect(geometry.cursor).toBe("pointer");
  }
  await regex.hover();
  await expect(
    page.getByRole("tooltip").filter({ hasText: "Alt+E" }),
  ).toBeVisible();
  await expect(page.getByRole("tooltip")).toHaveCount(1);
});

test("menu and Popover tooltips support native mouse selection and copying without closing their owner", async () => {
  await page.evaluate(() =>
    document.addEventListener("copy", (event) => {
      event.preventDefault();
      (window as any).__rawTooltipCopy = getSelection()?.toString();
    }),
  );
  const selectAndCopy = async (text: string) => {
    const tooltip = page
      .locator('[role="tooltip"][data-text-tooltip]')
      .filter({ hasText: text });
    await expect(tooltip).toBeVisible();
    await tooltip.hover();
    await page.waitForTimeout(550);
    await app.evaluate(async ({ BrowserWindow }) => {
      const window = BrowserWindow.getAllWindows()[0];
      if (window.isVisible()) throw new Error("Verification became visible");
      await window.webContents.capturePage(undefined, {
        stayHidden: true,
        stayAwake: true,
      });
    });
    const rects = await tooltip.evaluate((element) => {
      const range = document.createRange();
      range.selectNodeContents(element);
      return Array.from(range.getClientRects()).map((rect) => ({
        x: rect.left,
        y: rect.top,
        right: rect.right,
        height: rect.height,
      }));
    });
    await page.mouse.move(rects[0].x + 0.5, rects[0].y + rects[0].height / 2);
    await page.mouse.down();
    await page.mouse.move(
      rects.at(-1)!.right + 1,
      rects.at(-1)!.y + rects.at(-1)!.height / 2,
      { steps: 12 },
    );
    await page.mouse.up();
    expect(await page.evaluate(() => getSelection()?.toString())).toBe(text);
    await page.keyboard.press("Control+c");
    expect(await page.evaluate(() => (window as any).__rawTooltipCopy)).toBe(
      text,
    );
    await expect(tooltip).toBeVisible();
  };
  const query = "request id = abc-123; status >= 500";
  await page
    .getByRole("button", { name: "Saved queries and presets", exact: true })
    .click();
  await page.getByRole("menuitem", { name: query, exact: true }).hover();
  await selectAndCopy(query);
  await expect(
    page.getByRole("menuitem", { name: query, exact: true }),
  ).toBeVisible();
  await page.keyboard.press("Escape");
  await page
    .getByRole("button", { name: "Local level filter", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Select only WARN", exact: true })
    .hover();
  await selectAndCopy(
    "Click to select only this level; Ctrl or Cmd click to toggle",
  );
  await expect(
    page.getByRole("button", { name: "Select only WARN", exact: true }),
  ).toBeVisible();
  await page.keyboard.press("Escape");
});

test("context menus are exclusive across components and outside clicks dismiss them", async () => {
  const group = row("/aws/lambda/orders-api");
  await page.locator(".workspace-tab").first().click({ button: "right" });
  await action("Save view to Favorites").click();
  const favorite = page.locator(".saved-view-favorite").first();
  await favorite.click({ button: "right" });
  await expect(action("Open saved view")).toBeVisible();
  await page.locator(".workspace-tab").first().click({ button: "right" });
  await expect(action("Rename tab")).toBeVisible();
  await expect(page.getByRole("menu")).toHaveCount(1);
  // Keyboard/context events have no preceding pointerdown to dismiss the old
  // menu. Exclusivity must also hold when the next menu opens directly.
  await group.dispatchEvent("contextmenu", { clientX: 140, clientY: 420 });
  await expect(action("Copy group name")).toBeVisible();
  await expect(page.getByRole("menu")).toHaveCount(1);
  await expect(page.getByRole("button", { name: /^Details for/ })).toHaveCount(
    0,
  );
  await page
    .getByRole("textbox", { name: "Search log groups", exact: true })
    .click();
  await expect(page.getByRole("menu")).toHaveCount(0);
  await favorite.click({ button: "right" });
  await page.locator(".app-header").click({ position: { x: 170, y: 20 } });
  await expect(page.getByRole("menu")).toHaveCount(0);
  await favorite.dispatchEvent("contextmenu", { clientX: 150, clientY: 350 });
  await expect(action("Open saved view")).toBeVisible();
  await page.evaluate(() => window.dispatchEvent(new Event("blur")));
  await expect(page.getByRole("menu")).toHaveCount(0);
});

test("resource copy actions and delegated tooltips retain selectable raw text", async () => {
  const groupArn =
    "arn:aws:logs:eu-west-1:000000000000:log-group:/aws/lambda/orders-api";
  await app.evaluate(({ clipboard, ipcMain }, arn) => {
    (globalThis as any).__copiedResources = [];
    clipboard.writeText = async (text) => {
      (globalThis as any).__copiedResources.push(text);
    };
    ipcMain.removeHandler("explorer:groups");
    ipcMain.handle("explorer:groups", () => ({
      items: [{ name: "/aws/lambda/orders-api", arn: arn + ":*" }],
    }));
  }, groupArn);
  await page
    .getByRole("button", { name: "Refresh resources", exact: true })
    .click();
  await expect(page.locator('[data-node-kind="group"]')).toHaveCount(1);
  const group = row("/aws/lambda/orders-api");
  await group.click({ button: "right", position: { x: 90, y: 16 } });
  await action("Copy group name").click();
  expect(
    await app.evaluate(() => (globalThis as any).__copiedResources),
  ).toEqual(["/aws/lambda/orders-api"]);
  await group.click({ button: "right", position: { x: 90, y: 16 } });
  await action("Copy ARN").click();
  expect(
    (await app.evaluate(() => (globalThis as any).__copiedResources)).at(-1),
  ).toBe(groupArn + ":*");
  await page
    .getByRole("button", { name: "Expand /aws/lambda/orders-api", exact: true })
    .click();
  const stream = page.locator('[data-node-kind="stream"]').first();
  const name = await stream.getAttribute("aria-label");
  await stream.click({ button: "right", position: { x: 90, y: 16 } });
  await action("Copy stream name").click();
  expect(
    (await app.evaluate(() => (globalThis as any).__copiedResources)).at(-1),
  ).toBe(name);
  await stream.click({ button: "right", position: { x: 90, y: 16 } });
  await action("Copy ARN").click();
  expect(
    (await app.evaluate(() => (globalThis as any).__copiedResources)).at(-1),
  ).toBe(groupArn + ":log-stream:" + name);
  await group.locator(".resource-label").hover();
  const tooltip = page.locator('[role="tooltip"][data-text-tooltip]');
  await expect(tooltip).toContainText("/aws/lambda/orders-api");
  await tooltip.hover();
  await page.waitForTimeout(550);
  await expect(tooltip).toBeVisible();
  await tooltip.evaluate((element) => {
    const range = document.createRange();
    range.selectNodeContents(element);
    getSelection()!.removeAllRanges();
    getSelection()!.addRange(range);
    document.addEventListener(
      "copy",
      (event) => {
        event.preventDefault();
        (window as any).__tooltipCopy = getSelection()?.toString();
      },
      { once: true },
    );
  });
  await page.keyboard.press("Control+c");
  expect(await page.evaluate(() => (window as any).__tooltipCopy)).toContain(
    "/aws/lambda/orders-api",
  );
  await group.dispatchEvent("contextmenu", { clientX: 140, clientY: 420 });
  await expect(tooltip).toHaveCount(0);
  await page.keyboard.press("Escape");
});

test("Explorer shortcut edits are saved and only apply inside the group filter", async () => {
  await page
    .getByRole("button", { name: "Workspace settings", exact: true })
    .click();
  await page.getByRole("tab", { name: "Shortcuts", exact: true }).click();
  await page
    .getByRole("textbox", { name: "Explorer regex", exact: true })
    .fill("Alt+R");
  await page
    .getByRole("textbox", { name: "Explorer match case", exact: true })
    .fill("Alt+M");
  await page.keyboard.press("Escape");
  const regex = page.getByRole("button", {
    name: "Use regular expression",
    exact: true,
  });
  const matchCase = page.getByRole("button", {
    name: "Match case",
    exact: true,
  });
  await page.keyboard.press("Alt+r");
  await expect(regex).toHaveAttribute("aria-pressed", "false");
  const search = page.getByRole("textbox", {
    name: "Search log groups",
    exact: true,
  });
  await search.focus();
  await search.press("Alt+e");
  await expect(regex).toHaveAttribute("aria-pressed", "false");
  await search.press("Alt+r");
  await search.press("Alt+m");
  await expect(regex).toHaveAttribute("aria-pressed", "true");
  await expect(matchCase).toHaveAttribute("aria-pressed", "true");
  await expect
    .poll(async () => (await stored()).preferences.shortcuts.explorerRegex)
    .toBe("Alt+R");
  expect((await stored()).preferences.shortcuts.explorerCaseSensitive).toBe(
    "Alt+M",
  );
  await regex.hover();
  await expect(
    page.getByRole("tooltip").filter({ hasText: "Alt+R" }),
  ).toBeVisible();
});

test("Explorer case and regex shortcuts are scoped, configurable and shown in selectable themed tooltips", async () => {
  const search = page.getByRole("textbox", {
    name: "Search log groups",
    exact: true,
  });
  const regex = page.getByRole("button", {
    name: "Use regular expression",
    exact: true,
  });
  const matchCase = page.getByRole("button", {
    name: "Match case",
    exact: true,
  });
  await expect(matchCase).toHaveAttribute("aria-pressed", "false");
  await search.fill("ORDERS");
  await expect(row("/aws/lambda/orders-api")).toBeVisible();
  await search.press("Alt+c");
  await expect(matchCase).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator('[data-node-kind="group"]')).toHaveCount(0);
  await search.press("Alt+c");
  await search.press("Alt+e");
  await expect(regex).toHaveAttribute("aria-pressed", "true");
  await expect(row("/aws/lambda/orders-api")).toBeVisible();
  for (const theme of ["light", "dark"] as const) {
    await page
      .getByRole("button", { name: "Workspace settings", exact: true })
      .click();
    await page.getByRole("tab", { name: "Preferences", exact: true }).click();
    await page.getByRole("combobox", { name: "Theme", exact: true }).click();
    await page
      .getByRole("option", {
        name: theme,
        exact: true,
      })
      .click();
    await expect(page.locator("html")).toHaveAttribute(
      "data-mantine-color-scheme",
      theme,
    );
    await page.keyboard.press("Escape");
    await regex.hover();
    const tooltip = page.getByRole("tooltip").filter({ hasText: "Alt+E" });
    await expect(tooltip).toBeVisible();
    await tooltip.hover();
    await page.waitForTimeout(550);
    await expect(tooltip).toBeVisible();
    expect(
      await tooltip.evaluate((element) => getComputedStyle(element).userSelect),
    ).toBe("text");
    await tooltip.evaluate((element) => {
      const range = document.createRange();
      range.selectNodeContents(element);
      getSelection()!.removeAllRanges();
      getSelection()!.addRange(range);
    });
    expect(await page.evaluate(() => getSelection()?.toString())).toContain(
      "Alt+E",
    );
    const colors = await tooltip.evaluate((element) => {
      const probe = document.createElement("span");
      probe.style.cssText =
        "background:var(--mantine-color-body);color:var(--mantine-color-text)";
      element.append(probe);
      const actual = getComputedStyle(element),
        expected = getComputedStyle(probe);
      const result = {
        bg: actual.backgroundColor,
        color: actual.color,
        expectedBg: expected.backgroundColor,
        expectedColor: expected.color,
      };
      probe.remove();
      return result;
    });
    expect(colors.bg).toBe(colors.expectedBg);
    expect(colors.color).toBe(colors.expectedColor);
    const screenshot = await app.evaluate(async ({ BrowserWindow }) => {
      const window = BrowserWindow.getAllWindows()[0];
      if (window.isVisible())
        throw new Error("Verification window became visible");
      return (
        await window.webContents.capturePage(undefined, {
          stayHidden: true,
          stayAwake: true,
        })
      )
        .toPNG()
        .toString("base64");
    });
    await test.info().attach("tooltip-" + theme + ".png", {
      body: Buffer.from(screenshot, "base64"),
      contentType: "image/png",
    });
    await test.info().attach("tooltip-" + theme, {
      body: JSON.stringify(colors),
      contentType: "application/json",
    });
    await search.click();
    await expect(tooltip).toHaveCount(0);
  }
  expect(await page.locator("[title]").count()).toBe(0);
});
