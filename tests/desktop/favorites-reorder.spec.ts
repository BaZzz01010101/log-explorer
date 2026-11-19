import {
  _electron as electron,
  expect,
  test,
  type ElectronApplication,
  type Page,
} from "@playwright/test";
import { execFileSync } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join, resolve, sep } from "node:path";
import { createWorkspace } from "../../src/shared/workspace";
import {
  behaviorThemes,
  closeAppNaturally,
  desktopExecutablePath,
} from "./desktop-app";

// Hidden window, private storage and offline-only data, as in the other specs.
const temporaryRoot = resolve(".tmp/desktop-favorites-reorder");
let app: ElectronApplication, page: Page, directory: string, errors: string[];

test.beforeEach(async ({}, info) => {
  errors = [];
  await mkdir(temporaryRoot, { recursive: true });
  directory = await mkdtemp(join(temporaryRoot, "case-"));
  const workspace = createWorkspace();
  workspace.preferences.theme = info.title.includes("dark") ? "dark" : "light";
  workspace.favorites = ["Alpha", "Beta", "Gamma"].map((title) => {
    const tab = structuredClone(workspace.tabs[0]);
    tab.sources = [{ logGroup: `/saved/${title.toLowerCase()}` }];
    return {
      id: `favorite-${title.toLowerCase()}`,
      title,
      tabs: [tab],
      connections: structuredClone(workspace.connections),
      timezone: "utc" as const,
    };
  });
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
  await page.emulateMedia({ reducedMotion: "reduce" });
  await app.evaluate(({ BrowserWindow }) => {
    const window = BrowserWindow.getAllWindows()[0];
    window.setContentSize(1400, 900);
    window.webContents.setBackgroundThrottling(false);
  });
});

test.afterEach(async () => {
  const child = app?.process();
  let closeFailure: unknown;
  if (child && child.exitCode === null && child.signalCode === null) {
    try {
      expect(await closeAppNaturally(app)).toBe(0);
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
    throw new Error("Unsafe favorites reorder cleanup");
  await rm(directory, {
    recursive: true,
    force: true,
    maxRetries: 10,
    retryDelay: 100,
  });
});

for (const theme of behaviorThemes)
  test(`${theme}: favorites reorder by drag and drop and by the context menu`, async () => {
    const favorites = page
      .getByRole("complementary", { name: "AWS resources" })
      .getByLabel("Favorite views");
    const items = favorites.locator(".saved-view-favorite");
    await expect(items).toHaveText(["Alpha", "Beta", "Gamma"]);
    const tabCount = await page
      .locator(".workspace-tab-list [data-tab-id]")
      .count();

    // Drag Gamma above Alpha.
    const gamma = await items.nth(2).boundingBox();
    const alpha = await items.nth(0).boundingBox();
    await page.mouse.move(gamma!.x + 20, gamma!.y + gamma!.height / 2);
    await page.mouse.down();
    await page.mouse.move(alpha!.x + 20, alpha!.y + 3, { steps: 6 });
    await expect(
      favorites.locator(".saved-view-favorite-row.is-drop-before"),
    ).toHaveAttribute("data-favorite-id", "favorite-alpha");
    await page.mouse.up();
    await expect(items).toHaveText(["Gamma", "Alpha", "Beta"]);
    await expect(
      favorites.locator(".is-drop-before, .is-reordering"),
    ).toHaveCount(0);
    // The drop does not open the dragged favorite.
    await expect(page.locator(".workspace-tab-list [data-tab-id]")).toHaveCount(
      tabCount,
    );

    // Drag Gamma below the last favorite.
    const first = await items.nth(0).boundingBox();
    const last = await items.nth(2).boundingBox();
    await page.mouse.move(first!.x + 20, first!.y + first!.height / 2);
    await page.mouse.down();
    await page.mouse.move(last!.x + 20, last!.y + last!.height - 2, {
      steps: 6,
    });
    await expect(favorites.locator(".favorite-views-list")).toHaveClass(
      /is-drop-end/,
    );
    await page.mouse.up();
    await expect(items).toHaveText(["Alpha", "Beta", "Gamma"]);

    // Escape cancels a drag.
    await page.mouse.move(first!.x + 20, first!.y + first!.height / 2);
    await page.mouse.down();
    await page.mouse.move(last!.x + 20, last!.y + last!.height - 2, {
      steps: 6,
    });
    await page.keyboard.press("Escape");
    await page.mouse.up();
    await expect(items).toHaveText(["Alpha", "Beta", "Gamma"]);

    // Context menu moves.
    await items.nth(1).click({ button: "right" });
    await page.getByRole("menuitem", { name: "Move up" }).click();
    await expect(items).toHaveText(["Beta", "Alpha", "Gamma"]);
    await items.nth(1).click({ button: "right" });
    await page.getByRole("menuitem", { name: "Move down" }).click();
    await expect(items).toHaveText(["Beta", "Gamma", "Alpha"]);
    await items.nth(2).click({ button: "right" });
    await expect(
      page.getByRole("menuitem", { name: "Move down" }),
    ).toBeDisabled();
    await page.keyboard.press("Escape");

    // The order is saved.
    await expect
      .poll(async () => {
        const saved = JSON.parse(
          await readFile(join(directory, "workspace.json"), "utf8"),
        );
        return saved.favorites.map(
          (favorite: { title: string }) => favorite.title,
        );
      })
      .toEqual(["Beta", "Gamma", "Alpha"]);
  });
