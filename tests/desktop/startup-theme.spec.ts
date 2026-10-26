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
const root = resolve(".tmp/desktop-startup-theme");
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
  if (info.title.includes("backup")) {
    await writeFile(join(directory, "workspace.json"), "invalid workspace");
    await writeFile(
      join(directory, "workspace.backup.json"),
      JSON.stringify(workspace),
    );
  } else if (!info.title.includes("default")) {
    await writeFile(
      join(directory, "workspace.json"),
      JSON.stringify(workspace),
    );
  }
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
    await app.evaluate(() =>
      (
        globalThis as typeof globalThis & { releaseStartupLoad?: () => void }
      ).releaseStartupLoad?.(),
    );
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

type StartupProbe = typeof globalThis & {
  startupPending?: boolean;
  releaseStartupLoad?: () => void;
};

async function assertNativeBackground(theme: "light" | "dark") {
  const color = await app.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows()[0].getBackgroundColor(),
  );
  const rgb = color
    .replace("#", "")
    .slice(-6)
    .match(/../g)!
    .map((value) => parseInt(value, 16));
  expect(
    rgb.every((value) => (theme === "light" ? value >= 200 : value < 64)),
    `Native startup color ${color} should be ${theme}`,
  ).toBe(true);
}

for (const mode of [
  "light primary",
  "light backup",
  "dark primary",
  "dark default",
]) {
  test(`${mode} cold start uses the configured native background and theme`, async () => {
    const theme = mode.startsWith("light") ? "light" : "dark";
    await assertNativeBackground(theme);
    await expect(page.locator(".desktop-app")).toHaveAttribute(
      "data-theme",
      theme,
    );
    await expect(page.locator("html")).toHaveAttribute(
      "data-mantine-color-scheme",
      theme,
    );
    if (mode.includes("backup"))
      await expect(
        page.getByText("Workspace recovery", { exact: true }),
      ).toBeVisible();
    const line = page.locator(".activity-menu-separator");
    await expect(line).toBeVisible();
    const divider = (await line.boundingBox())!;
    const menu = (await page
      .getByRole("button", { name: "Application menu", exact: true })
      .boundingBox())!;
    const explorer = (await page
      .getByRole("button", { name: "AWS logs explorer", exact: true })
      .boundingBox())!;
    expect(divider.height).toBeGreaterThan(0);
    expect(divider.height).toBeLessThanOrEqual(1);
    expect(divider.y).toBeGreaterThanOrEqual(menu.y + menu.height);
    expect(divider.y + divider.height).toBeLessThanOrEqual(explorer.y);
  });
}

for (const theme of ["light", "dark"] as const) {
  test(`${theme} delayed restoration never paints the opposite theme`, async () => {
    const loaded = await page.evaluate(() => window.explorer.loadWorkspace());
    await page.context().addInitScript(() => {
      const probe = window as typeof window & { themeSamples?: string[] };
      probe.themeSamples = [];
      const sample = () => {
        const theme = document
          .querySelector(".desktop-app")
          ?.getAttribute("data-theme");
        if (theme) probe.themeSamples!.push(theme);
      };
      new MutationObserver(sample).observe(document, {
        subtree: true,
        childList: true,
        attributes: true,
        attributeFilter: ["data-theme"],
      });
    });
    await app.evaluate(({ ipcMain }, loaded) => {
      const probe = globalThis as StartupProbe;
      ipcMain.removeHandler("explorer:load");
      ipcMain.handle(
        "explorer:load",
        () =>
          new Promise((resolve) => {
            probe.startupPending = true;
            probe.releaseStartupLoad = () => {
              probe.startupPending = false;
              resolve(loaded);
            };
          }),
      );
    }, loaded);
    await page.reload({ waitUntil: "domcontentloaded" });
    await expect
      .poll(() =>
        app.evaluate(() => (globalThis as StartupProbe).startupPending),
      )
      .toBe(true);
    const before = await page.evaluate(
      () =>
        (window as typeof window & { themeSamples?: string[] }).themeSamples ??
        [],
    );
    expect(before).not.toContain(theme === "light" ? "dark" : "light");
    await assertNativeBackground(theme);
    const pixels = await app.evaluate(async ({ BrowserWindow }) => {
      const current = BrowserWindow.getAllWindows()[0];
      const shot = await current.webContents.capturePage(undefined, {
        stayHidden: true,
        stayAwake: true,
      });
      const { width, height } = shot.getSize();
      const data = shot.toBitmap();
      const index =
        (Math.floor(height / 2) * width + Math.floor(width / 2)) * 4;
      return [...data.subarray(index, index + 3)];
    });
    expect(
      pixels.every((value) => (theme === "light" ? value >= 200 : value < 64)),
      `Initial frame pixel ${pixels} should be ${theme}`,
    ).toBe(true);
    await app.evaluate(() =>
      (globalThis as StartupProbe).releaseStartupLoad?.(),
    );
    await expect(page.locator(".desktop-app")).toHaveAttribute(
      "data-theme",
      theme,
    );
    await expect(page.locator('[data-node-kind="group"]')).toHaveCount(9);
    const after = await page.evaluate(
      () =>
        (window as typeof window & { themeSamples?: string[] }).themeSamples ??
        [],
    );
    expect(after.length).toBeGreaterThan(0);
    expect(after.every((value) => value === theme)).toBe(true);
    const shot = await app.evaluate(async ({ BrowserWindow }) =>
      (
        await BrowserWindow.getAllWindows()[0].webContents.capturePage(
          undefined,
          { stayHidden: true, stayAwake: true },
        )
      )
        .toPNG()
        .toString("base64"),
    );
    await mkdir(test.info().outputDir, { recursive: true });
    await writeFile(
      test.info().outputPath("restored-theme.png"),
      Buffer.from(shot, "base64"),
    );
  });
}
