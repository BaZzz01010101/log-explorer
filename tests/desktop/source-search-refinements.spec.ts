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
const temporaryRoot = resolve(".tmp/desktop-source-search-refinements");
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
  test(`${theme} protected columns can only be hidden in the columns editor`, async () => {
    await page
      .getByRole("button", { name: "Configure columns", exact: true })
      .click();
    const dialog = page.getByRole("dialog", { name: "Customize columns" });
    await expect(dialog).toBeVisible();
    await expect(
      dialog.locator(".column-list").getByRole("checkbox"),
    ).toHaveCount(0);
    for (const label of ["Timestamp", "Level", "Message", "Source"]) {
      await expect(
        dialog.getByRole("button", { name: `Remove ${label}`, exact: true }),
      ).toHaveCount(0);
      const hide = dialog.getByRole("button", {
        name: `Hide ${label}`,
        exact: true,
      });
      await expect(hide).toBeEnabled();
      await expect(hide).toHaveAttribute("aria-pressed", "true");
      const entry = dialog.locator(".column-config").filter({
        has: page.getByRole("button", { name: `Hide ${label}`, exact: true }),
      });
      const color = await entry
        .locator(".column-path")
        .evaluate((el) => getComputedStyle(el).color);
      const toggleBox = (await hide.boundingBox())!,
        labelBox = (await entry.locator(".column-path").boundingBox())!;
      expect(toggleBox.x + toggleBox.width).toBeLessThanOrEqual(labelBox.x);
      await hide.click();
      const show = dialog.getByRole("button", {
        name: `Show ${label}`,
        exact: true,
      });
      await expect(show).toBeEnabled();
      await expect(show).toHaveAttribute("aria-pressed", "false");
      const hidden = dialog.locator(".column-config").filter({
        has: page.getByRole("button", { name: `Show ${label}`, exact: true }),
      });
      await expect(hidden).toHaveClass(/column-hidden/);
      expect(
        await hidden
          .locator(".column-path")
          .evaluate((el) => getComputedStyle(el).color),
      ).not.toBe(color);
      await show.click();
      await expect(hide).toBeEnabled();
      await expect(hide).toHaveAttribute("aria-pressed", "true");
    }
    await dialog
      .getByRole("button", { name: "Hide /payload", exact: true })
      .click();
    await expect(
      dialog.getByRole("button", { name: "Show /payload", exact: true }),
    ).toBeEnabled();
    await dialog
      .getByRole("button", { name: "Show /payload", exact: true })
      .click();
    await dialog
      .getByRole("button", { name: "Remove /payload", exact: true })
      .click();
    await expect(
      dialog.getByRole("button", { name: "Hide /payload", exact: true }),
    ).toHaveCount(0);
    for (const label of ["Timestamp", "Level", "Source"])
      await dialog
        .getByRole("button", { name: `Hide ${label}`, exact: true })
        .click();
    const last = dialog.getByRole("button", {
      name: "Hide Message",
      exact: true,
    });
    await expect(last).toBeEnabled();
    await last.click();
    await expect(last).toHaveAttribute("aria-pressed", "true");
    await expect(dialog.getByRole("status")).toHaveText(
      "Keep at least one column visible.",
    );
    await dialog
      .getByRole("button", { name: "Show Timestamp", exact: true })
      .click();
    await expect(dialog.getByRole("status")).toHaveCount(0);
    let png = "";
    for (let frame = 0; frame < 3; frame++) {
      png = await app.evaluate(async ({ BrowserWindow }) => {
        const win = BrowserWindow.getAllWindows()[0];
        if (win.isVisible()) throw new Error("Verification became visible");
        return (
          await win.webContents.capturePage(undefined, {
            stayHidden: true,
            stayAwake: true,
          })
        )
          .toPNG()
          .toString("base64");
      });
    }
    await mkdir(test.info().outputDir, { recursive: true });
    await writeFile(
      test.info().outputPath(`${theme}-column-visibility.png`),
      Buffer.from(png, "base64"),
    );
  });

  test(`${theme} Left and Right fold only the current event and leave nested controls alone`, async () => {
    const first = page.locator('.virtual-event[data-event-id="refinement-0"]');
    const second = page.locator('.virtual-event[data-event-id="refinement-1"]');
    const grid = page.getByRole("grid", { name: "Log events", exact: true });
    await first.locator(".inspect-cell").first().click();
    await grid.press("ArrowRight");
    await expect(
      first.getByRole("region", { name: "Expanded event content" }),
    ).toBeVisible();
    const resize = first.getByRole("separator", {
      name: "Resize expanded event",
      exact: true,
    });
    await resize.press("ArrowLeft");
    await expect(
      first.getByRole("region", { name: "Expanded event content" }),
    ).toBeVisible();
    await resize.press("ArrowRight");
    await expect(
      first.getByRole("region", { name: "Expanded event content" }),
    ).toBeVisible();
    await grid.press("ArrowRight");
    await expect(
      first.getByRole("region", { name: "Expanded event content" }),
    ).toBeVisible();
    await grid.press("ArrowDown");
    await grid.press("ArrowRight");
    await expect(
      second.getByRole("region", { name: "Expanded event content" }),
    ).toBeVisible();
    await grid.press("ArrowLeft");
    await expect(
      second.getByRole("region", { name: "Expanded event content" }),
    ).toHaveCount(0);
    await expect(
      first.getByRole("region", { name: "Expanded event content" }),
    ).toBeVisible();
    const nested = first.getByRole("button", {
      name: "Expand /payload",
      exact: true,
    });
    await nested.press("ArrowLeft");
    await expect(
      first.getByRole("region", { name: "Expanded event content" }),
    ).toBeVisible();
    await first
      .getByRole("button", { name: "Collapse event details", exact: true })
      .press("ArrowLeft");
    await expect(
      first.getByRole("region", { name: "Expanded event content" }),
    ).toHaveCount(0);
    await page
      .locator("label")
      .filter({ hasText: /^Table$/ })
      .click();
    await grid.press("ArrowRight");
    await expect(
      first.getByRole("region", { name: "Expanded event content" }),
    ).toBeVisible();
    await grid.press("ArrowLeft");
    await expect(
      first.getByRole("region", { name: "Expanded event content" }),
    ).toHaveCount(0);
  });

  test(`${theme} event contents and source cells do not open hover tooltips`, async () => {
    const cells = page.locator(".virtual-event .log-cell");
    await expect(cells).not.toHaveCount(0);
    await expect(cells.locator("[data-tooltip], [title]")).toHaveCount(0);
    await page
      .locator("label")
      .filter({ hasText: /^JSON$/ })
      .click();
    await expect(
      page.locator(".virtual-event .event-source[data-tooltip]"),
    ).toHaveCount(0);
    await expect(
      page.locator(".virtual-event .event-source[title]"),
    ).toHaveCount(0);
  });

  test(`${theme} Explorer shows only the last source in a collapsible details pane`, async () => {
    const details = page.getByRole("region", {
      name: "Current source details",
      exact: true,
    });
    await expect(page.getByText("Recent sources", { exact: true })).toHaveCount(
      0,
    );
    await page
      .getByRole("button", { name: "/aws/lambda/orders-api", exact: true })
      .click();
    await expect(details.locator(".source-details-name")).toHaveText(
      "/aws/lambda/orders-api",
    );
    await page
      .getByRole("checkbox", {
        name: "Select /aws/lambda/payments-worker",
        exact: true,
      })
      .check();
    await expect(details.locator(".source-details-name")).toHaveText(
      "/aws/lambda/payments-worker",
    );
    await expect(details).toContainText("Retention");
    await expect(details).toContainText("Stored in group");
    await expect(details).toContainText("eu-west-1");
    await expect(
      page.locator(".resource-label[data-tooltip],.resource-label[title]"),
    ).toHaveCount(0);
    await details
      .getByRole("button", { name: "Copy source name", exact: true })
      .click();
    expect(
      await app.evaluate(() => (globalThis as any).__refinementCopies.at(-1)),
    ).toBe("/aws/lambda/payments-worker");
    const disclosure = details.getByRole("button", {
      name: "Toggle source details",
      exact: true,
    });
    await disclosure.click();
    await expect(details.locator(".source-details-body")).toHaveCount(0);
    await disclosure.click();
    await page
      .getByRole("button", {
        name: "Expand /aws/lambda/payments-worker",
        exact: true,
      })
      .click();
    const stream = page
      .locator('[data-node-kind="stream"] .resource-label')
      .first();
    await expect(stream).toBeVisible();
    const name = await stream.innerText();
    await stream.click({ modifiers: ["Control"] });
    await expect(details.locator(".source-details-name")).toHaveText(name);
    await expect(details).toContainText("Last event");
    await expect(details).toContainText("/aws/lambda/payments-worker");
    let png = "";
    for (let frame = 0; frame < 3; frame++) {
      png = await app.evaluate(async ({ BrowserWindow }) => {
        const win = BrowserWindow.getAllWindows()[0];
        if (win.isVisible()) throw new Error("Verification became visible");
        return (
          await win.webContents.capturePage(undefined, {
            stayHidden: true,
            stayAwake: true,
          })
        )
          .toPNG()
          .toString("base64");
      });
    }
    await mkdir(test.info().outputDir, { recursive: true });
    await writeFile(
      test.info().outputPath(`${theme}-source-details.png`),
      Buffer.from(png, "base64"),
    );
  });

  test(`${theme} saved search menu is beside Run and its selected name can be replaced and deleted`, async () => {
    const filter = page.getByRole("combobox", {
      name: "CloudWatch filter pattern",
      exact: true,
    });
    const query = "  request   failed   status:500  ";
    await filter.fill(query);
    const menu = page.getByRole("button", {
      name: "Saved and recent searches",
      exact: true,
    });
    const inputBox = (await filter.boundingBox())!,
      menuBox = (await menu.boundingBox())!,
      runBox = (await page.getByTestId("run-query").boundingBox())!;
    expect(menuBox.x).toBeGreaterThanOrEqual(inputBox.x + inputBox.width);
    expect(menuBox.x + menuBox.width).toBeLessThanOrEqual(runBox.x);
    await menu.click();
    await expect(
      page
        .getByRole("menu")
        .getByText("Visualization presets", { exact: true }),
    ).toHaveCount(0);
    await expect(
      page
        .getByRole("menu")
        .getByText("Save view for this log group…", { exact: true }),
    ).toHaveCount(0);
    await page
      .getByRole("menuitem", { name: "Save search…", exact: true })
      .click();
    const dialog = page.getByRole("dialog", {
      name: "Save search",
      exact: true,
    });
    const name = dialog.getByRole("textbox", { name: "Name", exact: true });
    const suggestion = "request failed status:500";
    await expect(name).toHaveValue(suggestion);
    await expect(name).toBeFocused();
    expect(
      await name.evaluate((el) => ({
        start: (el as HTMLInputElement).selectionStart,
        end: (el as HTMLInputElement).selectionEnd,
      })),
    ).toEqual({ start: 0, end: suggestion.length });
    await page.keyboard.type("My saved search");
    await expect(name).toHaveValue("My saved search");
    await dialog.getByRole("button", { name: "Save", exact: true }).click();
    await expect(dialog).toHaveCount(0);
    await menu.click();
    await expect(
      page.getByRole("menuitem", { name: "My saved search", exact: true }),
    ).toBeVisible();
    const remove = page.getByRole("menuitem", {
      name: "Delete saved search My saved search",
      exact: true,
    });
    if (theme === "light") await remove.press("Enter");
    else await remove.click();
    await expect(page.getByRole("menu")).toHaveCount(0);
    await expect(menu).toBeFocused();
    await menu.click();
    await expect(
      page.getByRole("menuitem", { name: "My saved search", exact: true }),
    ).toHaveCount(0);
    await page.keyboard.press("Escape");
    await expect
      .poll(async () =>
        (await stored()).savedQueries.some((q) => q.name === "My saved search"),
      )
      .toBe(false);
  });

  test(`${theme} Events undo and redo stay independent across tabs without replacing loaded content`, async () => {
    const filter = () =>
      page.getByRole("combobox", {
        name: "CloudWatch filter pattern",
        exact: true,
      });
    const loaded = page.locator('.virtual-event[data-event-id="refinement-0"]');
    await loaded
      .getByRole("button", { name: "Expand event details", exact: true })
      .click();
    await filter().fill("orders");
    await page.getByTestId("run-query").focus();
    await filter().focus();
    await filter().press("End");
    await filter().pressSequentially(" warning");
    const edited = "orders warning";
    await filter().press("Control+z");
    await expect(filter()).toHaveValue("orders");
    await filter().press("Control+Shift+z");
    await expect(filter()).toHaveValue(edited);
    const originalTab = page.getByRole("tab", { name: /orders-api/ }).first();
    await page
      .getByRole("button", { name: "/aws/lambda/payments-worker", exact: true })
      .dblclick();
    await filter().fill("payment");
    await page.getByTestId("run-query").focus();
    await filter().focus();
    await filter().press("End");
    await filter().pressSequentially(" failure");
    await originalTab.click();
    await expect(filter()).toHaveValue(edited);
    await expect(
      loaded.getByRole("region", { name: "Expanded event content" }),
    ).toBeVisible();
    await filter().press("Control+z");
    await expect(filter()).toHaveValue("orders");
    await page
      .getByRole("tab", { name: /payments-worker/ })
      .first()
      .click();
    await expect(filter()).toHaveValue("payment failure");
    await filter().press("Control+z");
    await expect(filter()).toHaveValue("payment");
  });
}

test("recent search count is editable in Preferences and retained after reload", async () => {
  await openSettingsWindow(page);
  await page.getByRole("tab", { name: "Preferences", exact: true }).click();
  const limit = page.getByRole("textbox", {
    name: "Recent searches to keep",
    exact: true,
  });
  await limit.fill("2");
  await limit.press("Tab");
  await expect
    .poll(async () => (await stored()).preferences.recentSearchesLimit)
    .toBe(2);
  await page.reload();
  await expect
    .poll(async () => (await stored()).preferences.recentSearchesLimit)
    .toBe(2);
});
