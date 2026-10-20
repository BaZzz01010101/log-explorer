import {
  createWorkspace,
  restoreWorkspace,
} from "../../src/renderer/workspace";
import { desktopExecutablePath } from "./desktop-app";
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

test.setTimeout(90000);
let app: ElectronApplication | undefined;
let child: ReturnType<ElectronApplication["process"]> | undefined;
let page: Page;
let directory: string;
let errors: string[];
const temporaryRoot = resolve(".tmp", "desktop-column-context");

test.beforeEach(async () => {
  await mkdir(temporaryRoot, { recursive: true });
  directory = await mkdtemp(join(temporaryRoot, "case-"));
  errors = [];
  const state = createWorkspace();
  state.tabs[0].filterPattern = "";
  state.tabs[0].view.columns = [
    { path: "@timestamp", width: 210, pinned: true },
    { path: "@level", width: 80 },
    { path: "@logGroup", width: 115, hidden: true, format: "json" },
    { path: "/service/name", width: 190, format: "json" },
    { path: "@message", width: 330 },
    { path: "/request/id", width: 170 },
  ];
  await writeFile(join(directory, "workspace.json"), JSON.stringify(state));
  const env: Record<string, string> = {};
  for (const name of ["PATH", "SystemRoot", "WINDIR", "TEMP", "TMP", "COMSPEC"])
    if (process.env[name]) env[name] = process.env[name]!;
  Object.assign(env, {
    EXPLORER_TEST_USER_DATA: directory,
    TEMP: directory,
    TMP: directory,
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
  page.setDefaultTimeout(6000);
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Emulation.setFocusEmulationEnabled", { enabled: true });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.addStyleTag({
    content:
      "*, *::before, *::after { transition-duration: 0s !important; animation-duration: 0s !important; animation-delay: 0s !important; }",
  });
  page.on("pageerror", (error) => errors.push(error.message));
  const environment = await page.evaluate(() => window.explorer.environment());
  expect(environment.canEnableAws).toBe(false);
  expect(environment.awsEnabled).toBe(false);
  expect(
    await app.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()[0].isVisible(),
    ),
  ).toBe(false);
  await app.evaluate(({ dialog }) => {
    dialog.showMessageBox = async () => {
      throw new Error(
        "Unexpected native dialog during hidden column-context verification",
      );
    };
  });
  await page
    .locator("label")
    .filter({ hasText: /^Table$/ })
    .click();
  // A row is sufficient for the old-build regression baseline; completion
  // assertions elsewhere use the explicit state rather than status decoration.
  await expect(page.locator(".log-table-row").nth(1)).toBeVisible();
});

test.afterEach(async ({}, testInfo) => {
  if (
    testInfo.status !== testInfo.expectedStatus &&
    app &&
    child?.exitCode === null
  ) {
    try {
      const png = await app.evaluate(async ({ BrowserWindow }) => {
        const window = BrowserWindow.getAllWindows()[0];
        if (window.isVisible())
          throw new Error("Multi-selection verification became visible");
        const image = await window.webContents.capturePage(undefined, {
          stayHidden: true,
          stayAwake: true,
        });
        return image.toPNG().toString("base64");
      });
      await mkdir(testInfo.outputDir, { recursive: true });
      await writeFile(
        testInfo.outputPath("failure.png"),
        Buffer.from(png, "base64"),
      );
    } catch {}
  }
  try {
    if (app && child && child.exitCode === null) {
      const closed = app.waitForEvent("close", { timeout: 7000 });
      const exited = new Promise<number | null>((done) =>
        child!.once("exit", done),
      );
      await app.evaluate(({ BrowserWindow }) =>
        BrowserWindow.getAllWindows()[0].close(),
      );
      await closed;
      expect(await exited).toBe(0);
    }
  } finally {
    if (child && child.exitCode === null) {
      if (process.platform === "win32")
        execFileSync("taskkill", ["/PID", String(child.pid), "/T", "/F"], {
          stdio: "ignore",
        });
      else child.kill();
    }
  }
  expect(errors).toEqual([]);
  if (!resolve(directory).startsWith(temporaryRoot + sep + "case-"))
    throw new Error("Unsafe column-context-test cleanup path");
  await rm(directory, {
    recursive: true,
    force: true,
    maxRetries: 10,
    retryDelay: 100,
  });
});

const header = (path: string) =>
  page.locator(".log-header-cell").filter({
    has: page.locator(
      `.column-sort[title="Sort by ${path === "@timestamp" ? "Timestamp" : path === "@level" ? "Level" : path === "@message" ? "Message" : path}"]`,
    ),
  });
const sequence = () =>
  page
    .locator(".log-header-cell")
    .evaluateAll((elements) =>
      elements.map((element) => [
        element.getAttribute("data-column-path"),
        element.classList.contains("pinned"),
      ]),
    );
test("keyboard column menu returns focus to its header after Escape", async () => {
  const origin = header("@timestamp").locator(".column-sort");
  await origin.focus();
  await page.keyboard.press("Shift+F10");
  await expect(
    page.getByRole("menuitem", { name: "Move left", exact: true }),
  ).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(origin).toBeFocused();
  await expect(
    page.getByRole("region", { name: "Event inspector", exact: true }),
  ).toBeVisible();
  await page.keyboard.press("Shift+F10");
  await expect(
    page.getByRole("menuitem", { name: "Pin left", exact: true }),
  ).toBeVisible();
  const search = page.getByRole("textbox", {
    name: "Local filter loaded events",
    exact: true,
  });
  await search.click();
  await page.evaluate(
    () =>
      new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      ),
  );
  await expect(search).toBeFocused();
});
async function menu(path: string) {
  const target = header(path);
  await target.scrollIntoViewIfNeeded();
  const rect = (await target.boundingBox())!;
  await target.click({
    button: "right",
    position: { x: Math.min(25, rect.width / 2), y: 14 },
  });
  await expect(page.getByRole("menu")).toHaveCount(1);
  await expect(
    page.getByRole("menuitem", { name: "Pin left", exact: true }),
  ).toBeVisible();
}
async function action(path: string, name: string) {
  await menu(path);
  await page.getByRole("menuitem", { name, exact: true }).click();
  await expect(page.getByRole("menu")).toHaveCount(0);
}
for (const mode of ["Table", "Hybrid"])
  test(`${mode} column context actions preserve displayed order, pin pools and persisted configuration`, async () => {
    await page
      .locator("label")
      .filter({ hasText: new RegExp(`^${mode}$`) })
      .click();
    await action("/service/name", "Pin");
    await expect.poll(sequence).toEqual([
      ["@timestamp", true],
      ["/service/name", true],
      ["@level", false],
      ["@message", false],
      ["/request/id", false],
    ]);
    await action("@timestamp", "Unpin");
    await expect.poll(sequence).toEqual([
      ["/service/name", true],
      ["@timestamp", false],
      ["@level", false],
      ["@message", false],
      ["/request/id", false],
    ]);
    await action("@message", "Pin left");
    await expect.poll(sequence).toEqual([
      ["/service/name", true],
      ["@timestamp", true],
      ["@level", true],
      ["@message", true],
      ["/request/id", false],
    ]);
    await action("@level", "Unpin right");
    await expect.poll(sequence).toEqual([
      ["/service/name", true],
      ["@timestamp", true],
      ["@level", false],
      ["@message", false],
      ["/request/id", false],
    ]);
    await action("@message", "Move left");
    await expect.poll(sequence).toEqual([
      ["/service/name", true],
      ["@timestamp", true],
      ["@message", false],
      ["@level", false],
      ["/request/id", false],
    ]);
    await action("@message", "Move right");
    await expect.poll(sequence).toEqual([
      ["/service/name", true],
      ["@timestamp", true],
      ["@level", false],
      ["@message", false],
      ["/request/id", false],
    ]);
    await action("/service/name", "Unpin");
    await expect.poll(sequence).toEqual([
      ["@timestamp", true],
      ["/service/name", false],
      ["@level", false],
      ["@message", false],
      ["/request/id", false],
    ]);
    await header("@timestamp").locator(".column-sort").focus();
    await page.keyboard.press("Shift+F10");
    await expect(
      page.getByRole("menuitem", { name: "Move left", exact: true }),
    ).toBeDisabled();
    await expect(
      page.getByRole("menuitem", { name: "Pin", exact: true }),
    ).toBeDisabled();
    await page.keyboard.press("Escape");
    await expect(header("@timestamp").locator(".column-sort")).toBeFocused();
    await expect
      .poll(async () =>
        restoreWorkspace(
          (await page.evaluate(() => window.explorer.loadWorkspace()))
            .workspace,
        ).tabs[0].view.columns.map((column) => [column.path, !!column.pinned]),
      )
      .toEqual([
        ["@timestamp", true],
        ["/service/name", false],
        ["@logGroup", false],
        ["@level", false],
        ["@message", false],
        ["/request/id", false],
      ]);
    const stored = restoreWorkspace(
      (await page.evaluate(() => window.explorer.loadWorkspace())).workspace,
    ).tabs[0].view.columns;
    expect(stored[2]).toEqual({
      path: "@logGroup",
      width: 115,
      hidden: true,
      format: "json",
    });
    expect(
      stored.find((column) => column.path === "/service/name")?.format,
    ).toBe("json");
    expect(stored.find((column) => column.path === "@timestamp")?.width).toBe(
      210,
    );
  });
