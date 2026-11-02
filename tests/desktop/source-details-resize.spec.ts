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
import {
  createWorkspace,
  restoreWorkspace,
} from "../../src/renderer/workspace";
import { desktopExecutablePath } from "./desktop-app";

// The native process, profile, credentials and results stay within this checkout.
// Both verification flags are mandatory: no visible window or real AWS access.
const temporaryRoot = resolve(".tmp/desktop-source-details-resize");
const groupName = "/aws/lambda/orders-api";
let app: ElectronApplication, page: Page, directory: string, errors: string[];

test.beforeEach(async ({}, info) => {
  errors = [];
  await mkdir(temporaryRoot, { recursive: true });
  directory = await mkdtemp(join(temporaryRoot, "case-"));
  const workspace = createWorkspace();
  workspace.preferences.theme = info.title.startsWith("dark")
    ? "dark"
    : "light";
  workspace.preferences.highlightProfiles = [];
  workspace.tabs[0].filterPattern = "";
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
  const session = await page.context().newCDPSession(page);
  await session.send("Emulation.setFocusEmulationEnabled", { enabled: true });
  await page.emulateMedia({ reducedMotion: "reduce" });
  expect(
    (await page.evaluate(() => window.explorer.environment())).canEnableAws,
  ).toBe(false);
  await app.evaluate(({ BrowserWindow, clipboard, dialog }) => {
    const window = BrowserWindow.getAllWindows()[0];
    if (window.isVisible())
      throw new Error("Source-details verification became visible");
    window.setContentSize(1700, 1150);
    window.webContents.setBackgroundThrottling(false);
    dialog.showMessageBox = async () => {
      throw new Error("Unexpected source-details verification dialog");
    };
    const fixture = { copies: [] as string[] };
    (globalThis as any).__sourceDetailsResize = fixture;
    clipboard.writeText = async (text) => {
      fixture.copies.push(text);
    };
  });
  await expect(page.locator('[data-node-kind="group"]')).toHaveCount(9);
  await expect(page.locator(".query-status:visible")).toHaveAttribute(
    "data-query-state",
    "complete",
  );
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
    throw new Error("Unsafe source-details verification cleanup");
  await rm(directory, {
    recursive: true,
    force: true,
    maxRetries: 10,
    retryDelay: 100,
  });
});

const details = () =>
  page.getByRole("region", { name: "Current source details", exact: true });
const separator = () =>
  details().getByRole("separator", {
    name: "Resize source details",
    exact: true,
  });
const disclosure = () =>
  details().getByRole("button", { name: "Toggle source details", exact: true });
const height = async () => (await details().boundingBox())!.height;
const savedHeight = async () =>
  restoreWorkspace(
    (await page.evaluate(() => window.explorer.loadWorkspace())).workspace,
  ).preferences.sourceDetailsHeight;
async function sized(expected: number) {
  await expect.poll(async () => Math.round(await height())).toBe(expected);
}
async function hiddenSize(width: number, height: number) {
  await app.evaluate(
    ({ BrowserWindow }, size) => {
      const window = BrowserWindow.getAllWindows()[0];
      if (window.isVisible())
        throw new Error("Source-details verification became visible");
      window.setContentSize(size.width, size.height);
      if (window.isVisible())
        throw new Error("Source-details resizing exposed its native window");
    },
    { width, height },
  );
}
async function capture(name: string) {
  let png = "";
  for (let frame = 0; frame < 3; frame++)
    png = await app.evaluate(async ({ BrowserWindow }) => {
      const window = BrowserWindow.getAllWindows()[0];
      if (window.isVisible())
        throw new Error("Source-details verification became visible");
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

for (const theme of ["light", "dark"]) {
  test(`${theme} source details keep selection geometry and persist resizing across short hidden windows`, async () => {
    await sized(220);
    await expect(details().locator(".source-details-heading")).toHaveText(
      "Source details",
    );
    await expect(details()).toContainText("Choose a log group or stream");
    await expect(details().locator(".source-details-kind")).toHaveCount(0);
    await expect(page.getByText(/Arrow keys navigate/)).toHaveCount(0);
    await expect(page.locator(".app-footer")).toHaveCount(0);
    await capture(`${theme}-empty-details-220.png`);

    await page.getByRole("button", { name: groupName, exact: true }).click();
    await expect(details().locator(".source-details-heading")).toHaveText(
      "Group details",
    );
    await expect(details().locator(".source-details-name")).toHaveText(
      groupName,
    );
    await sized(220);
    await page
      .getByRole("button", { name: `Expand ${groupName}`, exact: true })
      .click();
    const stream = page
      .locator('[data-node-kind="stream"] .resource-label')
      .first();
    await expect(stream).toBeVisible();
    const streamName = (await stream.innerText()).trim();
    await stream.click();
    await expect(details().locator(".source-details-heading")).toHaveText(
      "Stream details",
    );
    await expect(details().locator(".source-details-name")).toHaveText(
      streamName,
    );
    await expect(details().locator(".source-details-kind")).toHaveCount(0);
    await sized(220);
    await expect(page.locator(".query-status:visible")).toHaveAttribute(
      "data-query-state",
      "complete",
    );
    const body = details().locator(".source-details-body");
    expect(
      await body.evaluate((node) => getComputedStyle(node).userSelect),
    ).toBe("text");
    expect(
      await body.evaluate((node) => node.scrollHeight > node.clientHeight),
    ).toBe(true);
    await details()
      .getByRole("button", { name: "Copy source name", exact: true })
      .click();
    expect(
      await app.evaluate(() =>
        (globalThis as any).__sourceDetailsResize.copies.at(-1),
      ),
    ).toBe(streamName);
    await expect(
      page.locator(".resource-sidebar").getByRole("status"),
    ).toHaveText("Resource copied");
    await capture(`${theme}-stream-details-220.png`);

    const handle = (await separator().boundingBox())!;
    const panel = (await details().boundingBox())!;
    const center = handle.x + handle.width / 2;
    expect(Math.abs(center - (panel.x + panel.width / 2))).toBeLessThanOrEqual(
      1,
    );
    await page.mouse.move(center, handle.y + handle.height / 2);
    await page.mouse.down();
    await page.mouse.move(center, handle.y + handle.height / 2 - 100, {
      steps: 5,
    });
    await sized(320);
    await expect(separator()).toHaveAttribute("data-resizing", "true");
    await expect.poll(savedHeight).toBe(220);
    await page.mouse.move(center, handle.y + handle.height / 2 - 180, {
      steps: 5,
    });
    await sized(400);
    await capture(`${theme}-details-live-resize-400.png`);
    await page.mouse.up();
    await expect(separator()).toHaveAttribute("data-resizing", "false");
    await expect.poll(savedHeight).toBe(400);

    await separator().focus();
    await separator().press("ArrowUp");
    await sized(420);
    await expect.poll(savedHeight).toBe(420);
    await disclosure().click();
    await sized(31);
    await expect(disclosure()).toHaveAttribute("aria-expanded", "false");
    await expect(details().locator(".source-details-body")).toHaveCount(0);
    await expect(separator()).toHaveCount(0);
    await disclosure().click();
    await sized(420);
    await expect(disclosure()).toHaveAttribute("aria-expanded", "true");
    await expect(details().locator(".source-details-name")).toHaveText(
      streamName,
    );

    await hiddenSize(1300, 620);
    await expect.poll(height).toBeLessThan(420);
    expect(await height()).toBeGreaterThanOrEqual(80);
    expect(
      (await page.locator(".resource-tree").boundingBox())!.height,
    ).toBeGreaterThanOrEqual(79);
    await expect.poll(savedHeight).toBe(420);
    expect(
      await body.evaluate((node) => node.scrollHeight > node.clientHeight),
    ).toBe(true);
    await expect(
      page.locator(".resource-sidebar").getByRole("status"),
    ).toHaveText("Resource copied");
    await capture(`${theme}-details-short-window.png`);
    await hiddenSize(1700, 1150);
    await sized(420);
    await expect.poll(savedHeight).toBe(420);
    expect(
      await body.evaluate((node) => getComputedStyle(node).userSelect),
    ).toBe("text");
    await capture(`${theme}-details-height-restored-420.png`);

    await page.reload();
    await expect(details()).toContainText("Choose a log group or stream");
    await sized(420);
    await expect.poll(savedHeight).toBe(420);
    await expect(page.getByText(/Arrow keys navigate/)).toHaveCount(0);
    await expect(page.locator(".app-footer")).toHaveCount(0);
  });
}
