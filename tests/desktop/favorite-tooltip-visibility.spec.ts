import {
  _electron as electron,
  expect,
  test,
  type ElectronApplication,
  type Locator,
  type Page,
} from "@playwright/test";
import { execFileSync } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { join, resolve, sep } from "node:path";
import {
  createTab,
  createWorkspace,
  workspaceReducer,
} from "../../src/renderer/workspace";
import { desktopExecutablePath } from "./desktop-app";

// Keep every fixture, result and native process private to this checkout. The
// background/offline flags prohibit visible windows and AWS credential access.
const temporaryRoot = resolve(".tmp/desktop-favorite-tooltip-visibility");
// Two fully visible wrapped lines; longer metadata is intentionally clamped.
const groupName = `/aws/lambda/${"component-name-".repeat(3)}orders-api`;
let app: ElectronApplication, page: Page, directory: string, errors: string[];

test.beforeEach(async ({}, info) => {
  errors = [];
  await mkdir(temporaryRoot, { recursive: true });
  directory = await mkdtemp(join(temporaryRoot, "case-"));
  let workspace = createWorkspace();
  workspace.preferences.theme = info.title.startsWith("dark")
    ? "dark"
    : "light";
  workspace.preferences.highlightProfiles = [];
  const automatic = workspace.tabs[0];
  automatic.filterPattern = "";
  automatic.view.mode = "hybrid";
  automatic.view.inspectorInfoCollapsed = false;
  const renamed = createTab("offline", [
    { logGroup: "/aws/lambda/payments-worker" },
  ]);
  renamed.customTitle = "Incident review";
  const multiple = createTab("offline", [
    { logGroup: "/aws/lambda/orders-api" },
    { logGroup: "/aws/lambda/media-pipeline" },
  ]);
  multiple.customTitle = "Mixed Sources";
  for (const tab of [renamed, multiple])
    workspace = workspaceReducer(workspace, { type: "tab/open", tab });
  workspace = workspaceReducer(workspace, {
    type: "tab/select",
    tabId: automatic.id,
  });
  workspace.favorites = [
    { id: "favorite-auto", title: "orders-api", tab: automatic },
    { id: "favorite-renamed", title: "Incident review", tab: renamed },
    { id: "favorite-multiple", title: "Mixed Sources", tab: multiple },
  ].map(({ id, title, tab }) => ({
    id,
    title,
    tabs: [structuredClone(tab)],
    connections: structuredClone(workspace.connections),
    timezone: "utc" as const,
  }));
  await writeFile(join(directory, "workspace.json"), JSON.stringify(workspace));
  const env: Record<string, string> = {};
  for (const name of ["PATH", "SystemRoot", "WINDIR", "TEMP", "TMP", "COMSPEC"])
    if (process.env[name]) env[name] = process.env[name]!;
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
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Emulation.setFocusEmulationEnabled", { enabled: true });
  await page.emulateMedia({ reducedMotion: "reduce" });
  expect(
    (await page.evaluate(() => window.explorer.environment())).canEnableAws,
  ).toBe(false);
  expect(
    await app.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()[0].isVisible(),
    ),
  ).toBe(false);
  await expect(page.locator('[data-node-kind="group"]')).toHaveCount(9);
  await expect(page.locator(".query-status:visible")).toHaveAttribute(
    "data-query-state",
    "complete",
  );
  await app.evaluate(({ BrowserWindow, dialog, ipcMain }, fixtureGroup) => {
    const window = BrowserWindow.getAllWindows()[0];
    window.setContentSize(1700, 1150);
    window.webContents.setBackgroundThrottling(false);
    dialog.showMessageBox = async () => {
      throw new Error("Unexpected favorite-tooltip verification dialog");
    };
    ipcMain.removeHandler("explorer:query");
    ipcMain.handle("explorer:query", (event, request) => {
      if (
        event.sender !== window.webContents ||
        request.connection.mode !== "offline" ||
        request.kind !== "events"
      )
        throw new Error("Unexpected favorite-tooltip verification request");
      setImmediate(() =>
        event.sender.send("explorer:update", {
          requestId: request.requestId,
          state: "complete",
          events: [
            {
              id: "tooltip-event",
              timestamp: Date.UTC(2026, 9, 30, 12),
              logGroup: fixtureGroup,
              logStream: "2026/10/30/[$LATEST]abcdef0123456789",
              message: '{"level":"INFO","msg":"Tooltip visibility fixture"}',
            },
          ],
          replace: true,
        }),
      );
    });
  }, groupName);
  await page.locator('[data-testid="run-query"]:visible').click();
  await expect(
    page.locator('.virtual-event[data-event-id="tooltip-event"]'),
  ).toBeVisible();
});

test.afterEach(async () => {
  const child = app?.process();
  let closeFailure: unknown;
  if (child && child.exitCode === null && child.signalCode === null) {
    const closed = app.waitForEvent("close", { timeout: 8000 });
    const exited = new Promise<number | null>((done) =>
      child.once("exit", done),
    );
    try {
      await app.evaluate(({ BrowserWindow }) =>
        BrowserWindow.getAllWindows()[0].close(),
      );
      await closed;
      expect(await exited).toBe(0);
    } catch (error) {
      closeFailure = error;
    } finally {
      if (child.exitCode === null && child.signalCode === null) {
        try {
          execFileSync("taskkill", ["/PID", String(child.pid), "/T", "/F"], {
            stdio: "ignore",
            windowsHide: true,
          });
        } catch (error) {
          closeFailure ??= error;
        }
      }
    }
  }
  if (closeFailure) throw closeFailure;
  expect(errors).toEqual([]);
  if (
    !directory ||
    !resolve(directory).startsWith(temporaryRoot + sep + "case-")
  )
    throw new Error("Unsafe favorite-tooltip verification cleanup");
  await rm(directory, {
    recursive: true,
    force: true,
    maxRetries: 10,
    retryDelay: 100,
  });
});

const favorite = (id: string) =>
  page.locator(`[data-favorite-id="favorite-${id}"]`);
const favoriteName = (id: string, title: string) =>
  favorite(id).getByRole("button", { name: title, exact: true });
const tab = (title: string) =>
  page.getByRole("tab").filter({
    has: page.locator("span", { hasText: new RegExp(`^${title}$`) }),
  });
const local = () =>
  page.getByRole("textbox", {
    name: "Local filter loaded events",
    exact: true,
  });
const tooltip = () => page.getByRole("tooltip");
async function leave() {
  await page.mouse.move(1200, 30);
  await expect(tooltip()).toHaveCount(0);
}
async function absent(target: Locator) {
  await leave();
  await target.hover();
  // Both tooltip paths have opened by 500 ms. Absence needs a full delay, not
  // an immediate assertion before the scheduled popup could be rendered.
  await page.waitForTimeout(900);
  await expect(tooltip()).toHaveCount(0);
}
async function capture(name: string) {
  let png = "";
  for (let frame = 0; frame < 3; frame++)
    png = await app.evaluate(async ({ BrowserWindow }) => {
      const window = BrowserWindow.getAllWindows()[0];
      if (window.isVisible())
        throw new Error("Favorite-tooltip verification became visible");
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
async function contrast(row: Locator) {
  return row.evaluate((element) => {
    const rgba = (color: string) => {
      const canvas = document.createElement("canvas");
      canvas.width = canvas.height = 1;
      const context = canvas.getContext("2d")!;
      context.fillStyle = color;
      context.fillRect(0, 0, 1, 1);
      return Array.from(context.getImageData(0, 0, 1, 1).data);
    };
    let sidebar: Element | null = element.closest(".sidebar-view-favorites");
    let background = [0, 0, 0, 0];
    while (sidebar && background[3] === 0) {
      background = rgba(getComputedStyle(sidebar).backgroundColor);
      sidebar = sidebar.parentElement;
    }
    const style = getComputedStyle(element);
    const foreground = rgba(style.backgroundColor);
    return {
      difference:
        foreground
          .slice(0, 3)
          .reduce(
            (sum, value, index) => sum + Math.abs(value - background[index]!),
            0,
          ) / 3,
      background: style.backgroundColor,
      color: style.color,
      openColor: getComputedStyle(
        element.querySelector(".saved-view-favorite")!,
      ).color,
    };
  });
}
async function clipText(label: Locator) {
  await label.evaluate((element) =>
    Object.assign((element as HTMLElement).style, {
      display: "block",
      flex: "0 0 24px",
      width: "24px",
      maxWidth: "24px",
      whiteSpace: "nowrap",
      overflow: "hidden",
      textOverflow: "ellipsis",
    }),
  );
  expect(
    await label.evaluate(
      (element) => element.scrollWidth > element.clientWidth,
    ),
  ).toBe(true);
}

for (const theme of ["light", "dark"]) {
  test(`${theme} favorite hover and persistent confirmation visibly cover the row with compact buttons`, async () => {
    const row = favorite("auto");
    await leave();
    const initialHeight = (await row.boundingBox())!.height;
    await row.hover();
    const hover = await contrast(row);
    expect(hover.difference).toBeGreaterThanOrEqual(12);
    expect(hover.openColor).toBe(hover.color);
    expect(
      await row
        .locator(".saved-view-favorite")
        .evaluate((element) => getComputedStyle(element).backgroundColor),
    ).toBe("rgba(0, 0, 0, 0)");
    await capture(`${theme}-favorite-hover-contrast.png`);
    await row
      .getByRole("button", { name: "Delete favorite orders-api", exact: true })
      .click();
    const confirmation = row.getByRole("group", {
      name: "Delete favorite orders-api",
      exact: true,
    });
    await expect(confirmation.getByRole("button")).toHaveText([
      "Delete",
      "Cancel",
    ]);
    await local().click();
    await leave();
    await expect(row).toHaveAttribute("data-confirming-delete", "true");
    const confirming = await contrast(row);
    expect(confirming.difference).toBeGreaterThanOrEqual(12);
    expect(confirming.background).not.toBe(hover.background);
    expect(confirming.openColor).toBe(confirming.color);
    expect(
      Math.abs((await row.boundingBox())!.height - initialHeight),
    ).toBeLessThanOrEqual(1);
    const buttons = await confirmation
      .getByRole("button")
      .evaluateAll((elements) =>
        elements.map((element) => {
          const style = getComputedStyle(element);
          const bounds = element.getBoundingClientRect();
          return {
            height: bounds.height,
            border: parseFloat(style.borderTopWidth),
            borderStyle: style.borderTopStyle,
            background: style.backgroundColor,
            cursor: style.cursor,
            x: bounds.x,
          };
        }),
      );
    for (const button of buttons) {
      expect(button.height).toBeGreaterThanOrEqual(22);
      expect(button.height).toBeLessThanOrEqual(30);
      expect(button.border).toBeGreaterThan(0);
      expect(button.borderStyle).toBe("solid");
      expect(button.background).not.toBe("rgba(0, 0, 0, 0)");
      expect(button.cursor).toBe("pointer");
    }
    expect(buttons[0].x).toBeLessThan(buttons[1].x);
    await capture(`${theme}-favorite-confirmation-contrast.png`);
    await confirmation
      .getByRole("button", { name: "Cancel", exact: true })
      .click();
    await local().click();
    await leave();
    await expect(row).not.toHaveAttribute("data-confirming-delete", "true");
    await expect(favoriteName("auto", "orders-api")).toBeVisible();
    expect((await contrast(row)).background).not.toBe(confirming.background);
  });

  test(`${theme} automatic names suppress redundant tooltips while clipped and descriptive favorite or tab hints remain`, async () => {
    const automatic = favoriteName("auto", "orders-api");
    await expect(automatic).toHaveAttribute("data-tooltip", "orders-api");
    const favoriteLabel = automatic.locator("span").last();
    expect(
      await favoriteLabel.evaluate(
        (element) => element.scrollWidth <= element.clientWidth,
      ),
    ).toBe(true);
    await absent(automatic);
    const automaticTab = tab("orders-api");
    const tabLabel = automaticTab.locator("span").first();
    expect(
      await tabLabel.evaluate(
        (element) => element.scrollWidth <= element.clientWidth,
      ),
    ).toBe(true);
    await absent(automaticTab);

    await leave();
    await clipText(favoriteLabel);
    await automatic.hover();
    await expect(tooltip()).toHaveText("orders-api");
    await leave();
    await favoriteLabel.evaluate((element) => element.removeAttribute("style"));
    await clipText(tabLabel);
    await automaticTab.hover();
    await expect(tooltip()).toHaveText("orders-api");
    await leave();
    await tabLabel.evaluate((element) => element.removeAttribute("style"));

    for (const [target, sources] of [
      [favoriteName("renamed", "Incident review"), ["payments-worker"]],
      [tab("Incident review"), ["payments-worker"]],
      [
        favoriteName("multiple", "Mixed Sources"),
        ["orders-api", "media-pipeline"],
      ],
      [tab("Mixed Sources"), ["orders-api", "media-pipeline"]],
    ] as const) {
      await target.hover();
      await expect(tooltip()).toContainText("Sources:");
      for (const source of sources)
        await expect(tooltip()).toContainText(source);
      await expect(tooltip()).not.toContainText("/aws/lambda/");
      await leave();
    }
    await expect(page.locator("[title]")).toHaveCount(0);
  });

  test(`${theme} wrapped inspector metadata stays quiet while clipped values and actionable hints remain selectable`, async () => {
    await page
      .locator('.virtual-event[data-event-id="tooltip-event"] .inspect-cell')
      .first()
      .click();
    await page
      .getByRole("grid", { name: "Log events", exact: true })
      .press("Enter");
    const inspector = page.getByRole("region", {
      name: "Event inspector",
      exact: true,
    });
    const code = inspector.locator(".inspector-source code").first();
    await expect(code).toHaveText(groupName);
    await code.scrollIntoViewIfNeeded();
    const geometry = await code.evaluate((element) => {
      const range = document.createRange();
      range.selectNodeContents(element);
      const box = element.getBoundingClientRect();
      const lines = Array.from(range.getClientRects());
      return {
        lines: lines.length,
        contained: lines.every(
          (line) =>
            line.left >= box.left - 1 &&
            line.right <= box.right + 1 &&
            line.top >= box.top - 1 &&
            line.bottom <= box.bottom + 1,
        ),
        fits:
          element.scrollWidth <= element.clientWidth + 1 &&
          element.scrollHeight <= element.clientHeight + 1,
      };
    });
    expect(geometry.lines).toBeGreaterThan(1);
    expect(geometry.contained).toBe(true);
    expect(geometry.fits).toBe(true);
    await absent(code);
    await leave();
    await clipText(code);
    await code.hover();
    await expect(tooltip()).toHaveText(groupName);
    await capture(`${theme}-clipped-inspector-tooltip.png`);
    await leave();

    await page.getByRole("button", { name: "Settings", exact: true }).hover();
    await expect(tooltip()).toContainText("Settings");
    await leave();
    await page
      .getByRole("button", { name: "Match local filter case", exact: true })
      .hover();
    await expect(tooltip()).toContainText("Alt+C");
    await tooltip().hover();
    await page.waitForTimeout(550);
    await expect(tooltip()).toBeVisible();
    expect(
      await tooltip().evaluate(
        (element) => getComputedStyle(element).userSelect,
      ),
    ).toBe("text");
    const textRects = await tooltip().evaluate((element) => {
      const range = document.createRange();
      range.selectNodeContents(element);
      return Array.from(range.getClientRects()).map((rect) => ({
        x: rect.x,
        y: rect.y,
        width: rect.width,
        height: rect.height,
      }));
    });
    const first = textRects[0],
      last = textRects.at(-1)!;
    await page.mouse.move(first.x + 1, first.y + first.height / 2);
    await page.mouse.down();
    await page.mouse.move(last.x + last.width - 1, last.y + last.height / 2, {
      steps: 8,
    });
    await page.mouse.up();
    expect(await page.evaluate(() => getSelection()?.toString())).toContain(
      "Alt+C",
    );
    await expect(tooltip()).toBeVisible();
    await expect(page.locator("[title]")).toHaveCount(0);
  });
}
