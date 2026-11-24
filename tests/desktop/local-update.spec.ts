import {
  _electron as electron,
  expect,
  test,
  type ElectronApplication,
  type Page,
} from "@playwright/test";
import {
  mkdir,
  mkdtemp,
  readFile,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { join, resolve } from "node:path";
import {
  createTab,
  createWorkspace,
  workspaceReducer,
} from "../../src/shared/workspace";
import { closeAppNaturally, desktopExecutablePath } from "./desktop-app";

test.setTimeout(90000);
test.describe.configure({ mode: "parallel" });
let app: ElectronApplication;
let child: ReturnType<ElectronApplication["process"]>;
let page: Page;
let directory: string;
const temporaryRoot = resolve(".tmp", "desktop-local-update");
const pending = () => join(directory, "local-update.json");
const restart = () => join(directory, "local-update-restart.json");
const exists = (path: string) =>
  stat(path).then(
    () => true,
    () => false,
  );
const announce = (version: string) =>
  writeFile(pending(), JSON.stringify({ version, token: version }));

test.beforeEach(async () => {
  await mkdir(temporaryRoot, { recursive: true });
  directory = await mkdtemp(join(temporaryRoot, "case-"));
  await writeFile(restart(), "{}");
  const state = workspaceReducer(createWorkspace(), {
    type: "tab/open",
    tab: createTab("offline", [{ logGroup: "/ecs/checkout" }]),
  });
  await writeFile(join(directory, "workspace.json"), JSON.stringify(state));
  const env: Record<string, string> = {};
  for (const name of ["PATH", "SystemRoot", "WINDIR", "TEMP", "TMP", "COMSPEC"])
    if (process.env[name]) env[name] = process.env[name]!;
  Object.assign(env, {
    EXPLORER_TEST_USER_DATA: directory,
    EXPLORER_TEST_UPDATE_DIRECTORY: directory,
    USERPROFILE: directory,
    LOCALAPPDATA: directory,
    APPDATA: directory,
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
  await expect(page.locator(".virtual-event").first()).toBeVisible();
});
test.afterEach(async () => {
  if (child.exitCode === null) await closeAppNaturally(app);
  await rm(directory, { recursive: true, force: true });
});

const button = () => page.getByRole("button", { name: "Update", exact: true });

test("Update appears left of New view while a build waits", async () => {
  await expect(button()).toHaveCount(0);
  expect(await exists(restart())).toBe(false);
  await announce("99.0.1");
  await expect(button()).toBeVisible();
  const update = (await button().boundingBox())!;
  const newView = (await page
    .getByRole("button", { name: "New log view", exact: true })
    .boundingBox())!;
  expect(update.x + update.width).toBeLessThanOrEqual(newView.x);
  expect(newView.x - update.x - update.width).toBeLessThan(12);
  expect(
    Math.abs(update.y + update.height / 2 - newView.y - newView.height / 2),
  ).toBeLessThan(2);
  // The caption buttons and the drag areas must not cover it.
  expect(
    await button().evaluate((node) =>
      getComputedStyle(node).getPropertyValue("-webkit-app-region"),
    ),
  ).not.toBe("drag");
  await button().hover();
  await expect(page.getByText("Restart to update to 99.0.1")).toBeVisible();
  const image = await app.evaluate(async ({ BrowserWindow }) =>
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
    test.info().outputPath("update.png"),
    Buffer.from(image, "base64"),
  );
  await rm(pending());
  await expect(button()).toHaveCount(0);
});

test("Update saves the workspace, closes the app and asks for a restart", async () => {
  await announce("99.0.1");
  await expect(button()).toBeVisible();
  await page.getByRole("button", { name: "New log view", exact: true }).click();
  expect(await closeAppNaturally(app, { close: () => button().click() })).toBe(
    0,
  );
  const request = JSON.parse(await readFile(restart(), "utf8"));
  expect(request.version).toBe("99.0.1");
  expect(request.args).toContain("--background-verification");
  const saved = JSON.parse(
    await readFile(join(directory, "workspace.json"), "utf8"),
  );
  expect(saved.tabs.some((tab: any) => tab.sources.length === 0)).toBe(true);
});

test("a cancelled close takes the restart request back", async () => {
  await app.evaluate(({ dialog }) => {
    dialog.showMessageBox = (async () => {
      (globalThis as any).__dialogs = ((globalThis as any).__dialogs ?? 0) + 1;
      return { response: 0 };
    }) as never;
  });
  await announce("99.0.1");
  await expect(button()).toBeVisible();
  await app.evaluate(({ ipcMain }) => {
    ipcMain.removeHandler("explorer:save");
    ipcMain.handle("explorer:save", () => {
      throw new Error("Disk full");
    });
  });
  await page.getByRole("button", { name: "New log view", exact: true }).click();
  await button().click();
  await expect
    .poll(() => app.evaluate(() => (globalThis as any).__dialogs))
    .toBe(1);
  await expect.poll(() => exists(restart())).toBe(false);
  await expect(button()).toBeEnabled();
  // Closing without Update later must not restart the app.
  await app.evaluate(({ dialog }) => {
    dialog.showMessageBox = (async () => ({ response: 1 })) as never;
  });
  expect(await closeAppNaturally(app)).toBe(0);
  expect(await exists(restart())).toBe(false);
});
