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
const root = resolve(".tmp/desktop-settings-window");
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

const settingsDialog = () =>
  page.getByRole("dialog", { name: "Settings", exact: true });
async function openWindow() {
  await openSettingsWindow(page);
  await expect
    .poll(async () => {
      await app.evaluate(async ({ BrowserWindow }) => {
        await BrowserWindow.getAllWindows()[0].webContents.capturePage(
          undefined,
          { stayHidden: true, stayAwake: true },
        );
      });
      return settingsDialog().evaluate((el) => getComputedStyle(el).opacity);
    })
    .toBe("1");
}
const box = async () => {
  const rect = (await settingsDialog().boundingBox())!;
  return Object.fromEntries(
    Object.entries(rect).map(([key, value]) => [key, Math.round(value)]),
  );
};
async function drag(x: number, y: number, dx: number, dy: number) {
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + dx, y + dy, { steps: 8 });
  await page.mouse.up();
}
async function contained() {
  const rect = await box();
  const viewport = await page.evaluate(() => ({
    width: innerWidth,
    height: innerHeight,
  }));
  expect(rect.x).toBeGreaterThanOrEqual(0);
  expect(rect.y).toBeGreaterThanOrEqual(0);
  expect(rect.x + rect.width).toBeLessThanOrEqual(viewport.width + 1);
  expect(rect.y + rect.height).toBeLessThanOrEqual(viewport.height + 1);
  await expect(
    settingsDialog().getByRole("button", {
      name: "Close Settings",
      exact: true,
    }),
  ).toBeVisible();
}

for (const theme of ["light", "dark"]) {
  test(`${theme} Settings keeps its geometry across every category`, async () => {
    await openWindow();
    const initial = await box();
    for (const name of [
      "Workspace",
      "Highlights",
      "Preferences",
      "Shortcuts",
      "Connections",
      "Time ranges",
    ]) {
      await settingsDialog().getByRole("tab", { name, exact: true }).click();
      await expect.poll(box).toEqual(initial);
    }
    await expect(settingsDialog()).toHaveAccessibleName("Settings");
    await page
      .getByRole("button", { name: "Resize Settings window", exact: true })
      .focus();
    for (let step = 0; step < 7; step++)
      await page.keyboard.press("Shift+ArrowUp");
    await expect
      .poll(async () => (await box()).height)
      .toBe(initial.height - 280);
    const scroll = settingsDialog().getByRole("tabpanel", {
      name: "Preferences",
      exact: true,
    });
    await settingsDialog()
      .getByRole("tab", { name: "Preferences", exact: true })
      .click();
    expect(
      await scroll.evaluate((el) => el.scrollHeight > el.clientHeight),
    ).toBe(true);
    await scroll.evaluate((el) => {
      el.scrollTop = el.scrollHeight;
    });
    expect(await scroll.evaluate((el) => el.scrollTop)).toBeGreaterThan(0);
    await expect(settingsDialog().getByRole("tablist")).toBeVisible();
    await contained();
    const image = await app.evaluate(async ({ BrowserWindow }) => {
      const contents = BrowserWindow.getAllWindows()[0].webContents;
      contents.setBackgroundThrottling(false);
      // Wake the hidden compositor before collecting the final displayed page.
      await contents.capturePage(undefined, {
        stayHidden: true,
        stayAwake: true,
      });
      return (
        await contents.capturePage(undefined, {
          stayHidden: true,
          stayAwake: true,
        })
      )
        .toPNG()
        .toString("base64");
    });
    await writeFile(
      test.info().outputPath("settings-window.png"),
      Buffer.from(image, "base64"),
    );
  });

  test(`${theme} Settings moves, resizes and retains its frame on reopen and docking`, async () => {
    await openWindow();
    const initial = await box();
    const header = (await page
      .locator(".settings-window-header")
      .boundingBox())!;
    await drag(header.x + 100, header.y + 20, -70, -20);
    await expect
      .poll(box)
      .toEqual({ ...initial, x: initial.x - 70, y: initial.y - 20 });
    const corner = (await page
      .getByRole("button", { name: "Resize Settings window", exact: true })
      .boundingBox())!;
    await drag(
      corner.x + corner.width / 2,
      corner.y + corner.height / 2,
      100,
      20,
    );
    const resized = {
      ...initial,
      x: initial.x - 70,
      y: initial.y - 20,
      width: initial.width + 100,
      height: initial.height + 20,
    };
    await expect.poll(box).toEqual(resized);
    await settingsDialog()
      .getByRole("tab", { name: "Highlights", exact: true })
      .click();
    await expect.poll(box).toEqual(resized);
    const current = (await page
      .locator(".settings-window-header")
      .boundingBox())!;
    await page.mouse.move(current.x + 100, current.y + 20);
    await page.mouse.down();
    await page.mouse.move(current.x + 130, current.y + 35, { steps: 5 });
    await page.keyboard.press("Escape");
    await page.mouse.up();
    await expect.poll(box).toEqual(resized);
    await expect(settingsDialog()).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(settingsDialog()).toHaveCount(0);
    await openWindow();
    await expect.poll(box).toEqual(resized);
    await settingsDialog()
      .getByRole("button", { name: "Return settings to pane", exact: true })
      .click();
    await expect(settingsDialog()).toHaveCount(0);
    await expect(
      page.getByRole("region", { name: "Settings", exact: true }),
    ).toBeVisible();
    await page
      .getByRole("button", { name: "Open settings in window", exact: true })
      .click();
    await expect.poll(box).toEqual(resized);
    await contained();
  });
}

test("narrow Settings remains reachable after resize, zoom and keyboard adjustments", async () => {
  await openWindow();
  await contained();
  const corner = page.getByRole("button", {
    name: "Resize Settings window",
    exact: true,
  });
  const before = await box();
  await corner.focus();
  await page.keyboard.press("ArrowLeft");
  await expect.poll(async () => (await box()).width).toBe(before.width - 10);
  await app.evaluate(({ BrowserWindow }) => {
    const win = BrowserWindow.getAllWindows()[0];
    win.setContentSize(860, 650);
    win.webContents.setZoomFactor(1.25);
  });
  await expect
    .poll(async () => {
      const rect = await box();
      const viewport = await page.evaluate(() => ({
        width: innerWidth,
        height: innerHeight,
      }));
      return (
        rect.x + rect.width <= viewport.width + 1 &&
        rect.y + rect.height <= viewport.height + 1
      );
    })
    .toBe(true);
  await contained();
  await settingsDialog()
    .getByRole("tab", { name: "Workspace", exact: true })
    .click();
  const field = settingsDialog().getByLabel("Import workspace JSON", {
    exact: true,
  });
  await field.fill('{"draft":');
  await expect(field).toHaveValue('{"draft":');
  await page.keyboard.press("Control+a");
  await expect(settingsDialog()).toBeVisible();
});

test("light Settings releases pointer capture and restores the frame after cancellation or closing", async () => {
  await openWindow();
  const initial = await box();
  const original = await page.evaluate(() => ({
    cursor: document.documentElement.style.cursor,
    selection: document.documentElement.style.userSelect,
  }));
  for (const cancel of ["pointercancel", "capture", "blur", "close"]) {
    const header = page.locator(".settings-window-header");
    await header.evaluate((el) =>
      el.addEventListener(
        "pointerdown",
        (event) =>
          el.setAttribute(
            "data-test-pointer",
            String((event as PointerEvent).pointerId),
          ),
        { once: true },
      ),
    );
    const rect = (await header.boundingBox())!;
    await page.mouse.move(rect.x + 100, rect.y + 20);
    await page.mouse.down();
    await page.mouse.move(rect.x + 150, rect.y + 30, { steps: 3 });
    await expect.poll(async () => (await box()).x).toBe(initial.x + 50);
    const pointerId = Number(await header.getAttribute("data-test-pointer"));
    if (cancel === "pointercancel")
      await header.dispatchEvent("pointercancel", { pointerId });
    else if (cancel === "capture")
      await header.evaluate(
        (el, id) => el.releasePointerCapture(id),
        pointerId,
      );
    else if (cancel === "blur")
      await page.evaluate(() => window.dispatchEvent(new Event("blur")));
    else
      await settingsDialog()
        .getByRole("button", { name: "Close Settings", exact: true })
        .evaluate((el) => (el as HTMLElement).click());
    await page.mouse.up();
    if (cancel === "close") {
      await expect(settingsDialog()).toHaveCount(0);
      await openWindow();
    }
    await expect.poll(box).toEqual(initial);
    expect(
      await page.evaluate(() => ({
        cursor: document.documentElement.style.cursor,
        selection: document.documentElement.style.userSelect,
      })),
    ).toEqual(original);
  }
});
