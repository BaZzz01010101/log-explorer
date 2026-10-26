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
const root = resolve(".tmp/desktop-settings-strokes");
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

for (const theme of ["light", "dark"]) {
  test(`${theme} settings tab strokes align at fractional zoom`, async () => {
    await openSettingsWindow(page);
    const dialog = page.getByRole("dialog", {
      name: "Workspace settings",
      exact: true,
    });
    await expect
      .poll(async () => {
        await app.evaluate(async ({ BrowserWindow }) => {
          await BrowserWindow.getAllWindows()[0].webContents.capturePage(
            undefined,
            { stayHidden: true, stayAwake: true },
          );
        });
        return dialog.evaluate((el) => getComputedStyle(el).opacity);
      })
      .toBe("1");
    const results: unknown[] = [];
    for (const zoom of [1, 1.25, 0.8]) {
      await app.evaluate(
        ({ BrowserWindow }, zoom) =>
          BrowserWindow.getAllWindows()[0].webContents.setZoomFactor(zoom),
        zoom,
      );
      await page.mouse.move(20, await page.evaluate(() => innerHeight - 15));
      const geometry = await dialog.evaluate((el) => {
        const list = el.querySelector('[role="tablist"]')!;
        const active = list.querySelector('[aria-selected="true"]')!;
        const next = active.nextElementSibling!;
        const rect = (element: Element) =>
          element.getBoundingClientRect().toJSON();
        const rgb = (color: string) => {
          const canvas = document.createElement("canvas");
          canvas.width = canvas.height = 1;
          const ctx = canvas.getContext("2d")!;
          ctx.fillStyle = color;
          ctx.fillRect(0, 0, 1, 1);
          return [...ctx.getImageData(0, 0, 1, 1).data].slice(0, 3);
        };
        return {
          viewport: { width: innerWidth, height: innerHeight },
          list: rect(list),
          active: rect(active),
          next: rect(next),
          background: rgb(getComputedStyle(active).backgroundColor),
          inactive: rgb(getComputedStyle(next).backgroundColor),
          border: rgb(getComputedStyle(next).borderLeftColor),
          accent: rgb(getComputedStyle(active).borderTopColor),
        };
      });
      const shot = await app.evaluate(
        async ({ BrowserWindow, nativeImage }, g) => {
          const current = BrowserWindow.getAllWindows()[0];
          if (current.isVisible())
            throw new Error("Stroke verification must stay hidden");
          await current.webContents.capturePage(undefined, {
            stayHidden: true,
            stayAwake: true,
          });
          const capture = await current.webContents.capturePage(undefined, {
            stayHidden: true,
            stayAwake: true,
          });
          const png = capture.toPNG();
          const image = nativeImage.createFromBuffer(png);
          const size = image.getSize(),
            data = image.toBitmap();
          const sx = size.width / g.viewport.width,
            sy = size.height / g.viewport.height;
          const pixel = (x: number, y: number) => {
            const i = (y * size.width + x) * 4;
            return [data[i + 2], data[i + 1], data[i]];
          };
          const distance = (a: number[], b: number[]) =>
            a.reduce((sum, value, i) => sum + (value - b[i]) ** 2, 0);
          const rows = (x: number, y: number, color: number[]) => {
            const out: number[] = [];
            for (
              let py = Math.floor((y - 3) * sy);
              py <= Math.ceil((y + 3) * sy);
              py++
            ) {
              const value = pixel(Math.round(x * sx), py);
              if (
                distance(value, color) <
                Math.min(
                  distance(value, g.background),
                  distance(value, g.inactive),
                )
              )
                out.push(py);
            }
            return out;
          };
          const left = rows(g.active.left - 4, g.list.bottom, g.border);
          const inactive = rows(
            g.next.left + g.next.width / 2,
            g.list.bottom,
            g.border,
          );
          const gapX = (g.active.right + g.next.left) / 2;
          const gap = rows(gapX, g.list.bottom, g.border);
          const right = rows(g.list.right - 4, g.list.bottom, g.border);
          const accent = rows(
            g.active.left + g.active.width / 2,
            g.active.top,
            g.accent,
          );
          const crop = image.crop({
            x: Math.max(0, Math.floor((g.active.left - 10) * sx)),
            y: Math.max(0, Math.floor((g.active.top - 4) * sy)),
            width: Math.ceil((g.next.right - g.active.left + 20) * sx),
            height: Math.ceil((g.list.bottom - g.active.top + 10) * sy),
          });
          return {
            sx,
            sy,
            left,
            inactive,
            gap,
            right,
            accent,
            leftColors: left.map((y) =>
              pixel(Math.round((g.active.left - 4) * sx), y),
            ),
            inactiveColors: inactive.map((y) =>
              pixel(Math.round((g.next.left + g.next.width / 2) * sx), y),
            ),
            gapColors: gap.map((y) => pixel(Math.round(gapX * sx), y)),
            rightColors: right.map((y) =>
              pixel(Math.round((g.list.right - 4) * sx), y),
            ),
            crop: crop.toPNG().toString("base64"),
          };
        },
        geometry,
      );
      const { crop, ...measurements } = shot;
      results.push({ zoom, ...measurements, geometry });
      await mkdir(test.info().outputDir, { recursive: true });
      await writeFile(
        test.info().outputPath(`tabs-${zoom}.png`),
        Buffer.from(crop, "base64"),
      );
      await test.info().attach(`measurements-${zoom}.json`, {
        body: JSON.stringify({ zoom, ...measurements, geometry }),
        contentType: "application/json",
      });
      expect(shot.left.length).toBeGreaterThan(0);
      expect(shot.inactive).toEqual(shot.left);
      expect(shot.gap).toEqual(shot.left);
      expect(shot.right).toEqual(shot.left);
      expect(shot.leftColors.length).toBe(shot.inactiveColors.length);
      expect(
        shot.leftColors.every((color, index) =>
          color.every(
            (value, channel) =>
              Math.abs(value - shot.inactiveColors[index][channel]) <= 1,
          ),
        ),
      ).toBe(true);
      for (const colors of [shot.gapColors, shot.rightColors])
        expect(
          colors.every((color, index) =>
            color.every(
              (value, channel) =>
                Math.abs(value - shot.leftColors[index][channel]) <= 1,
            ),
          ),
        ).toBe(true);
      expect(shot.accent.length).toBeGreaterThan(0);
    }
  });
}
