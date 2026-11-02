import { openSettingsWindow } from "./settings-panel";
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
const root = resolve(".tmp/desktop-window-chrome");
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
  if (info.title.includes("wrapped")) {
    workspace.preferences.tabBarLayout = "wrap";
    workspace.preferences.pinnedTabsSeparateRow = true;
    for (let i = 0; i < 7; i++) {
      const tab = createTab("offline", [
        { logGroup: "/aws/lambda/orders-api" },
      ]);
      tab.customTitle = `A long service name ${i}`;
      tab.pinned = i < 2;
      workspace = workspaceReducer(workspace, { type: "tab/open", tab });
    }
  }
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

for (const mode of [
  "light",
  "dark",
  "light narrow wrapped",
  "dark narrow wrapped",
]) {
  test(`${mode} chrome starts at top with tabs clear of native controls`, async ({}, info) => {
    expect(
      await app.evaluate(({ Menu }) => Menu.getApplicationMenu() !== null),
    ).toBe(false);
    await expect(page.locator(".app-header,.command-trigger")).toHaveCount(0);
    await expect(
      page.getByRole("button", { name: "Commands", exact: true }),
    ).toHaveCount(0);
    await expect(page.locator(".activity-bar button")).toHaveCount(3);
    const geometry = await page.evaluate(() => {
      const rect = (selector: string) => {
        const r = document.querySelector(selector)!.getBoundingClientRect();
        return {
          x: r.x,
          y: r.y,
          right: r.right,
          bottom: r.bottom,
          width: r.width,
          height: r.height,
        };
      };
      const overlay = (
        navigator as Navigator & {
          windowControlsOverlay: {
            visible: boolean;
            getTitlebarAreaRect(): DOMRect;
          };
        }
      ).windowControlsOverlay;
      const area = overlay.getTitlebarAreaRect();
      return {
        rail: rect(".activity-bar"),
        explorer: rect(".sidebar-shell"),
        tabs: rect(".workspace-tab-list"),
        tools: rect(".workspace-tab-tools"),
        menu: rect('[aria-label="Application menu"]'),
        overlay: {
          visible: overlay.visible,
          right: area.right,
          height: area.height,
        },
        drag: getComputedStyle(
          document.querySelector(".window-drag-handle")!,
        ).getPropertyValue("-webkit-app-region"),
        tabDrag: getComputedStyle(
          document.querySelector(".workspace-tab-list")!,
        ).getPropertyValue("-webkit-app-region"),
        overflow: document.documentElement.scrollWidth > innerWidth,
      };
    });
    expect(geometry.rail.y).toBe(0);
    expect(geometry.explorer.y).toBe(0);
    expect(geometry.explorer.x).toBe(geometry.rail.right);
    expect(geometry.tabs.y).toBeLessThanOrEqual(1);
    expect(geometry.tabs.x).toBeGreaterThanOrEqual(geometry.explorer.right);
    expect(geometry.overlay.visible).toBe(true);
    expect(geometry.overlay.height).toBeGreaterThanOrEqual(39);
    expect(
      Math.abs(geometry.tools.right - geometry.overlay.right),
    ).toBeLessThanOrEqual(1);
    expect(geometry.tools.width).toBeGreaterThan(50);
    expect(geometry.drag).toBe("drag");
    expect(geometry.tabDrag).toBe("no-drag");
    expect(geometry.overflow).toBe(false);
    expect(
      await page
        .locator(".sidebar-resizer")
        .evaluate((element) =>
          getComputedStyle(element).getPropertyValue("-webkit-app-region"),
        ),
    ).toBe("no-drag");
    if (!mode.includes("narrow")) {
      const resizer = (await page.locator(".sidebar-resizer").boundingBox())!;
      const before = (await page.locator(".sidebar-shell").boundingBox())!
        .width;
      await page.mouse.move(resizer.x + resizer.width / 2, 12);
      await page.mouse.down();
      await page.mouse.move(resizer.x + resizer.width / 2 + 20, 12, {
        steps: 3,
      });
      await page.mouse.up();
      await expect
        .poll(
          async () =>
            (await page.locator(".sidebar-shell").boundingBox())!.width,
        )
        .toBe(before + 20);
    }
    await page.keyboard.press("Control+k");
    await expect(
      page.getByRole("dialog", { name: "Command palette" }),
    ).toHaveCount(0);
    await page
      .getByRole("button", { name: "Application menu", exact: true })
      .click();
    await page
      .getByRole("menuitem", { name: "Toggle side panel", exact: true })
      .click();
    await expect(page.locator(".sidebar-shell")).toBeHidden();
    await page
      .getByRole("button", { name: "AWS logs explorer", exact: true })
      .click();
    await expect(page.locator(".sidebar-shell")).toBeVisible();
    await page
      .getByRole("button", { name: "New log view", exact: true })
      .click();
    await expect(
      page.getByRole("tab", { name: "Log view", exact: true }),
    ).toBeVisible();
    await page.mouse.move(700, 500);
    // Paint the real Chromium/native overlay without showing or focusing the window.
    const shot = await app.evaluate(async ({ BrowserWindow }) => {
      for (let i = 0; i < 3; i++)
        await BrowserWindow.getAllWindows()[0].webContents.capturePage(
          undefined,
          { stayHidden: true, stayAwake: true },
        );
      const image =
        await BrowserWindow.getAllWindows()[0].webContents.capturePage(
          undefined,
          { stayHidden: true, stayAwake: true },
        );
      return image.toPNG().toString("base64");
    });
    await writeFile(info.outputPath("chrome.png"), Buffer.from(shot, "base64"));
  });
}

test("application menu theme, zoom, exclusivity and close save work without a native menu bar", async () => {
  const menu = () =>
    page.getByRole("button", { name: "Application menu", exact: true }).click();
  await menu();
  await page
    .getByRole("menuitem", { name: "Switch to dark theme", exact: true })
    .click();
  await expect(page.locator(".desktop-app")).toHaveAttribute(
    "data-theme",
    "dark",
  );
  await menu();
  await page.getByRole("menuitem", { name: "Zoom in", exact: true }).click();
  await expect
    .poll(() =>
      app.evaluate(({ BrowserWindow }) =>
        BrowserWindow.getAllWindows()[0].webContents.getZoomLevel(),
      ),
    )
    .toBe(1);
  await menu();
  await page.getByRole("menuitem", { name: "Reset zoom", exact: true }).click();
  await expect
    .poll(() =>
      app.evaluate(({ BrowserWindow }) =>
        BrowserWindow.getAllWindows()[0].webContents.getZoomLevel(),
      ),
    )
    .toBe(0);
  await page.keyboard.press("Control+=");
  await expect
    .poll(() =>
      app.evaluate(({ BrowserWindow }) =>
        BrowserWindow.getAllWindows()[0].webContents.getZoomLevel(),
      ),
    )
    .toBe(1);
  await page.keyboard.press("Control+0");
  await expect
    .poll(() =>
      app.evaluate(({ BrowserWindow }) =>
        BrowserWindow.getAllWindows()[0].webContents.getZoomLevel(),
      ),
    )
    .toBe(0);
  await menu();
  await page
    .getByRole("button", { name: "Workspace tab menu", exact: true })
    .click();
  await expect(page.getByRole("menu")).toHaveCount(1);
  await page.keyboard.press("Escape");
  await openSettingsWindow(page);
  await page.getByRole("tab", { name: "Preferences", exact: true }).click();
  await page.getByLabel("Log font size", { exact: true }).fill("16");
  await page.keyboard.press("Escape");
  await menu();
  const closed = app.waitForEvent("close");
  await page
    .getByRole("menuitem", { name: "Close window", exact: true })
    .click();
  await closed;
  expect(child.exitCode).toBe(0);
  const workspace = JSON.parse(
    await readFile(join(directory, "workspace.json"), "utf8"),
  );
  expect(workspace.preferences.fontSize).toBe(16);
  expect(workspace.preferences.theme).toBe("dark");
});

test("caption space follows overlay visibility and window IPC rejects invalid payloads", async () => {
  await expect(
    page.evaluate(() =>
      window.explorer.windowAction("arbitrary-method" as never),
    ),
  ).rejects.toThrow();
  await expect(
    page.evaluate(() => window.explorer.setWindowTheme("invalid" as never)),
  ).rejects.toThrow();
  await page
    .getByRole("button", { name: "Application menu", exact: true })
    .click();
  expect(
    await page
      .getByRole("menu")
      .evaluate((element) =>
        getComputedStyle(element).getPropertyValue("-webkit-app-region"),
      ),
  ).toBe("no-drag");
  await page.keyboard.press("Escape");
  // Exercise the real geometry-change subscriber without physically entering
  // full screen: Windows may show a hidden window when that native call runs.
  await page.evaluate(() => {
    const overlay = (
      navigator as Navigator & { windowControlsOverlay: EventTarget }
    ).windowControlsOverlay;
    Object.defineProperty(overlay, "visible", {
      value: false,
      configurable: true,
    });
    overlay.dispatchEvent(new Event("geometrychange"));
  });
  await expect(page.locator(".desktop-app")).toHaveAttribute(
    "data-window-controls-overlay",
    "false",
  );
  expect(
    await page
      .locator(".workspace-tab-bar")
      .evaluate((element) => getComputedStyle(element).paddingRight),
  ).toBe("0px");
  await page.evaluate(() => {
    const overlay = (
      navigator as Navigator & {
        windowControlsOverlay: EventTarget & { visible?: boolean };
      }
    ).windowControlsOverlay;
    delete overlay.visible;
    overlay.dispatchEvent(new Event("geometrychange"));
  });
  await expect(page.locator(".desktop-app")).toHaveAttribute(
    "data-window-controls-overlay",
    "true",
  );
  expect(
    await page
      .locator(".workspace-tab-bar")
      .evaluate((element) =>
        Number.parseFloat(getComputedStyle(element).paddingRight),
      ),
  ).toBeGreaterThan(100);
});

test("narrow zoom keeps caption controls above content and clear of panel actions", async () => {
  for (const level of [-3, 3, 0]) {
    await app.evaluate(
      ({ BrowserWindow }, level) =>
        BrowserWindow.getAllWindows()[0].webContents.setZoomLevel(level),
      level,
    );
    await expect
      .poll(async () =>
        page.evaluate(() => {
          const overlay = (
            navigator as Navigator & {
              windowControlsOverlay: { getTitlebarAreaRect(): DOMRect };
            }
          ).windowControlsOverlay.getTitlebarAreaRect();
          const bar = document
            .querySelector(".workspace-tab-bar")!
            .getBoundingClientRect();
          const tools = document
            .querySelector(".workspace-tab-tools")!
            .getBoundingClientRect();
          return {
            tallEnough: bar.bottom >= overlay.bottom - 1,
            clear: tools.right <= overlay.right + 1,
          };
        }),
      )
      .toEqual({ tallEnough: true, clear: true });
  }
});

test("native zoom shortcuts still work when a log-event menu owns keyboard focus", async () => {
  const event = page.locator(".virtual-event").first();
  await event.locator(".inspect-cell").first().click({ button: "right" });
  await page.getByRole("menuitem", { name: /^Copy selected records/ }).focus();
  await page.keyboard.press("Control+=");
  await expect
    .poll(() =>
      app.evaluate(({ BrowserWindow }) =>
        BrowserWindow.getAllWindows()[0].webContents.getZoomLevel(),
      ),
    )
    .toBe(1);
  await page.keyboard.press("Control+0");
  await expect
    .poll(() =>
      app.evaluate(({ BrowserWindow }) =>
        BrowserWindow.getAllWindows()[0].webContents.getZoomLevel(),
      ),
    )
    .toBe(0);
});
