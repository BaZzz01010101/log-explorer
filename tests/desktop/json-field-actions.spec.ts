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
const temporaryRoot = resolve(".tmp/desktop-json-field-actions");
let app: ElectronApplication, page: Page, directory: string, errors: string[];
test.beforeEach(async () => {
  errors = [];
  await mkdir(temporaryRoot, { recursive: true });
  directory = await mkdtemp(join(temporaryRoot, "case-"));
  const workspace = createWorkspace();
  workspace.tabs[0].filterPattern = "";
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

test("field menus deserialize nested values temporarily, preserve raw records and make decoded columns and filters work", async () => {
  test.setTimeout(180000);
  await app.evaluate(({ ipcMain, clipboard }) => {
    (globalThis as any).__fieldCopies = [];
    (globalThis as any).__fieldExports = [];
    ipcMain.removeHandler("explorer:export");
    ipcMain.handle("explorer:export", (_event, content, extension) => {
      (globalThis as any).__fieldExports.push({ content, extension });
      return true;
    });
    clipboard.writeText = async (text) => {
      (globalThis as any).__fieldCopies.push(text);
    };
    ipcMain.removeHandler("explorer:query");
    ipcMain.handle("explorer:query", (event, request) => {
      const events = [1, 2].map((index) => ({
        id: "encoded-" + index,
        timestamp: Date.now() - index * 1000,
        logGroup: "/aws/lambda/orders-api",
        logStream: "encoded-stream",
        message: JSON.stringify({
          level: "INFO",
          id: "event-" + index,
          payload: JSON.stringify({
            "a/b": { value: 7, inner: JSON.stringify([1, { ok: true }]) },
            list: [10, 20],
          }),
          invalid: "{bad",
          actual: { already: true },
          plain: "text",
        }),
      }));
      (globalThis as any).__fieldEvents = events;
      setImmediate(() =>
        event.sender.send("explorer:update", {
          requestId: request.requestId,
          state: "complete",
          events,
          replace: true,
        }),
      );
    });
  });
  await page.getByTestId("run-query").click();
  await page
    .locator("label")
    .filter({ hasText: /^Table$/ })
    .click();
  const event = page.locator('.virtual-event[data-event-id="encoded-1"]');
  await expect(event).toBeVisible();
  await event.locator(".inspect-cell").first().dblclick();
  const inspector = page.getByRole("region", {
    name: "Event inspector",
    exact: true,
  });
  const line = (path: string) =>
    inspector.locator(`[data-json-path="${path}"]`);
  const actions = async (path: string) =>
    inspector
      .getByRole("button", { name: "Field actions for " + path, exact: true })
      .click();
  const menuAction = (name: string) =>
    page.getByRole("menuitem", { name, exact: true });
  for (const path of ["/invalid", "/actual", "/plain"]) {
    await actions(path);
    await expect(menuAction("Deserialize " + path)).toBeDisabled();
    await page.keyboard.press("Escape");
    await expect(inspector).toBeVisible();
  }
  const geometry = await line("/payload").evaluate((element) => ({
    action: element
      .querySelector(".json-field-actions")!
      .getBoundingClientRect().right,
    key: element.querySelector(".json-key")!.getBoundingClientRect().left,
  }));
  expect(geometry.action).toBeLessThanOrEqual(geometry.key);
  expect(
    await inspector.locator(".json-add-column, .json-add-filter").count(),
  ).toBe(0);
  await actions("/payload");
  await menuAction("Deserialize /payload").click();
  await expect(line("/payload")).toHaveAttribute("data-deserialized", "true");
  await expect(
    inspector.getByRole("button", { name: "Collapse /payload", exact: true }),
  ).toBeVisible();
  await inspector
    .getByRole("button", { name: "Collapse /payload", exact: true })
    .click();
  await expect(line("/payload/a~1b")).toHaveCount(0);
  await inspector
    .getByRole("button", { name: "Expand /payload", exact: true })
    .click();
  await inspector
    .getByRole("button", { name: "Expand /payload/a~1b", exact: true })
    .click();
  await actions("/payload/a~1b/inner");
  await menuAction("Deserialize /payload/a~1b/inner").click();
  await expect(line("/payload/a~1b/inner/0")).toContainText("1");
  await actions("/payload/a~1b/value");
  await menuAction("Add /payload/a~1b/value column").click();
  await expect(event.getByRole("cell").last()).toHaveText("7");
  await expect(
    page
      .locator('.virtual-event[data-event-id="encoded-2"]')
      .getByRole("cell")
      .last(),
  ).toHaveText("—");
  const colors = await inspector.evaluate((element) => ({
    decoded: getComputedStyle(
      element.querySelector(
        '[data-json-path="/payload/a~1b/value"] .json-key',
      )!,
    ).color,
    regular: getComputedStyle(
      element.querySelector('[data-json-path="/plain"] .json-key')!,
    ).color,
  }));
  expect(colors.decoded).not.toBe(colors.regular);
  await actions("/payload/a~1b/value");
  await menuAction("Add /payload/a~1b/value to filter").click();
  await expect(
    page.getByRole("textbox", {
      name: "Local filter loaded events",
      exact: true,
    }),
  ).toHaveValue('@"/payload/a~1b/value"=7');
  await expect(page.locator(".virtual-event")).toHaveCount(1);
  await page
    .getByRole("textbox", { name: "Local filter loaded events", exact: true })
    .fill("");
  await expect(page.locator(".virtual-event")).toHaveCount(2);
  await page
    .locator('.virtual-event[data-event-id="encoded-2"]')
    .locator(".inspect-cell")
    .first()
    .click();
  await expect(
    inspector.locator('[data-json-path="/payload"]'),
  ).not.toHaveAttribute("data-deserialized", "true");
  await event.locator(".inspect-cell").first().click();
  await expect(
    inspector.locator('[data-json-path="/payload"]'),
  ).toHaveAttribute("data-deserialized", "true");
  const original = await app.evaluate(
    () => (globalThis as any).__fieldEvents[0].message,
  );
  await page
    .getByRole("button", { name: "Copy selected messages", exact: true })
    .click();
  expect(
    (await app.evaluate(() => (globalThis as any).__fieldCopies)).at(-1),
  ).toBe(original);
  await page
    .getByRole("button", { name: "Copy selected events as", exact: true })
    .click();
  await page.getByRole("menuitem", { name: /^Copy selected records/ }).click();
  const records = JSON.parse(
    (await app.evaluate(() => (globalThis as any).__fieldCopies)).at(-1),
  );
  expect(records["/payload/a~1b/value"]).toBe(7);
  expect(records["@message"]).toBe(original);
  await page
    .getByRole("button", { name: "Export loaded filtered events", exact: true })
    .click();
  await page.getByRole("menuitem", { name: /^CSV/ }).click();
  const exported = (
    await app.evaluate(() => (globalThis as any).__fieldExports)
  ).at(-1);
  expect(exported.extension).toBe("csv");
  const csvRows = exported.content.split(/\r?\n/).slice(1);
  expect(csvRows.find((record: string) => record.includes("event-1"))).toMatch(
    /,"7"$/,
  );
  expect(csvRows.find((record: string) => record.includes("event-2"))).toMatch(
    /,""$/,
  );
  for (const theme of ["light", "dark"] as const) {
    await page
      .getByRole("button", { name: "Workspace settings", exact: true })
      .click();
    await page.getByRole("tab", { name: "Preferences", exact: true }).click();
    await page.getByRole("combobox", { name: "Theme", exact: true }).click();
    await page.getByRole("option", { name: theme, exact: true }).click();
    await expect(page.locator("html")).toHaveAttribute(
      "data-mantine-color-scheme",
      theme,
    );
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toBeHidden();
    await expect(line("/payload")).toHaveAttribute("data-deserialized", "true");
    await inspector
      .getByRole("button", { name: "Unfold structured object", exact: true })
      .click();
    await expect(line("/payload/a~1b/value")).toBeVisible();
    await page.waitForTimeout(150);
    const image = await app.evaluate(async ({ BrowserWindow }) => {
      const window = BrowserWindow.getAllWindows()[0];
      if (window.isVisible())
        throw new Error("Verification window became visible");
      return (
        await window.webContents.capturePage(undefined, {
          stayHidden: true,
          stayAwake: true,
        })
      )
        .toPNG()
        .toString("base64");
    });
    await test.info().attach("deserialized-" + theme + ".png", {
      body: Buffer.from(image, "base64"),
      contentType: "image/png",
    });
  }
  await page
    .getByRole("button", { name: "Close orders-api", exact: true })
    .click();
  await page
    .getByRole("treeitem", { name: "/aws/lambda/orders-api", exact: true })
    .click();
  await expect(
    page.locator('.virtual-event[data-event-id="encoded-1"]'),
  ).toBeVisible();
  await expect(page.locator('[data-deserialized="true"]')).toHaveCount(0);
});
