import {
  _electron as electron,
  expect,
  test,
  type ElectronApplication,
  type Page,
} from "@playwright/test";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { join, resolve, sep } from "node:path";
import {
  createWorkspace,
  restoreWorkspace,
} from "../../src/renderer/workspace";
import { desktopExecutablePath } from "./desktop-app";

// Every process, fixture and result stays within the checkout. Background mode
// prevents native windows and the offline flag prevents AWS credential access.
const temporaryRoot = resolve(".tmp/desktop-explorer-batch-search");
let app: ElectronApplication, page: Page, directory: string, errors: string[];
test.beforeEach(async () => {
  errors = [];
  await mkdir(temporaryRoot, { recursive: true });
  directory = await mkdtemp(join(temporaryRoot, "case-"));
  const workspace = createWorkspace();
  workspace.tabs[0].filterPattern = "";
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
    const closed = app.waitForEvent("close");
    await app.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()[0].close(),
    );
    await closed;
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

test("selectors are read-only, regex searches all pages and a hostile pattern remains cancellable", async () => {
  await expect(
    page.getByRole("combobox", { name: "Explorer profile", exact: true }),
  ).toHaveAttribute("readonly", "");
  await expect(
    page.getByRole("combobox", { name: "Explorer region", exact: true }),
  ).toHaveAttribute("readonly", "");
  // Replace only this isolated process's offline resource IPC with two pages.
  await app.evaluate(({ ipcMain }) => {
    ipcMain.removeHandler("explorer:groups");
    ipcMain.handle("explorer:groups", (_event, _connection, search, cursor) => {
      if (search) throw new Error("Regex must enumerate unfiltered pages");
      return cursor
        ? { items: [{ name: "/late/orders-api" }] }
        : { items: [{ name: "a".repeat(90) + "b" }], cursor: "late-page" };
    });
  });
  const search = page.getByRole("textbox", {
    name: "Search log groups",
    exact: true,
  });
  const toggle = page.getByRole("button", {
    name: "Use regular expression",
    exact: true,
  });
  await search.fill("orders-(api|worker)$");
  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-pressed", "true");
  await expect(row("/late/orders-api")).toBeVisible();
  await expect(page.locator('[data-node-kind="group"]')).toHaveCount(1);
  const inputBounds = (await search.boundingBox())!,
    toggleBounds = (await toggle.boundingBox())!;
  expect(toggleBounds.x).toBeGreaterThan(inputBounds.x);
  expect(toggleBounds.x + toggleBounds.width).toBeLessThanOrEqual(
    inputBounds.x + inputBounds.width,
  );
  await search.fill("[");
  await expect(search).toHaveAttribute("aria-invalid", "true");
  await expect(page.locator(".sidebar-search")).toContainText(
    /Invalid regular expression/i,
  );
  await search.fill("^(a+)+$");
  await expect(page.locator(".sidebar-search")).toContainText(
    "exceeded 500 ms",
    { timeout: 10000 },
  );
  await search.fill("orders-api$");
  await expect(row("/late/orders-api")).toBeVisible();
  await expect(search).not.toHaveAttribute("aria-invalid", "true");
  await page
    .getByRole("button", { name: "Clear log group search", exact: true })
    .click();
  await expect(search).toHaveValue("");
  await expect(toggle).toHaveAttribute("aria-pressed", "true");
});

test("mixed ranges retain their batch on right click and all four context actions use normalized sources", async () => {
  const orders = "/aws/lambda/orders-api",
    payments = "/aws/lambda/payments-worker";
  await page
    .getByRole("button", { name: `Expand ${orders}`, exact: true })
    .click();
  const streams = page.locator('[data-node-kind="stream"]');
  await expect(streams).toHaveCount(4);
  const streamNames = await streams.evaluateAll((elements) =>
    elements.map((element) => element.getAttribute("aria-label")!),
  );
  await streams
    .nth(0)
    .locator(".resource-label")
    .click({ modifiers: ["ControlOrMeta"] });
  await streams
    .nth(1)
    .locator(".resource-label")
    .click({ modifiers: ["Shift"] });
  await row(payments)
    .locator(".resource-label")
    .click({ modifiers: ["ControlOrMeta"] });
  await expect(selected()).toHaveCount(3);
  await expect(page.locator(".workspace-tab")).toHaveCount(1);
  await streams.nth(0).click({ button: "right", position: { x: 70, y: 16 } });
  await streams.nth(1).click({ button: "right", position: { x: 40, y: 16 } });
  await expect(page.getByRole("menu")).toHaveCount(1);
  await expect(selected()).toHaveCount(3);
  const menu = page.getByRole("menu");
  const menuBounds = (await menu.boundingBox())!,
    resourceBounds = (await streams.nth(1).boundingBox())!;
  expect(Math.abs(menuBounds.x - (resourceBounds.x + 40))).toBeLessThan(30);
  await action("Open in new multi-source tab").click();
  await expect
    .poll(
      async () =>
        (await stored()).tabs.find((tab) => tab.sources.length === 2)?.sources,
    )
    .toEqual([
      { logGroup: orders, logStreams: streamNames.slice(0, 2) },
      { logGroup: payments },
    ]);
  await streams.nth(1).click({ button: "right", position: { x: 70, y: 16 } });
  await action("Open in new split tab").click();
  await expect(page.locator(".workspace-pane")).toHaveCount(3);
  // A whole group subsumes its selected streams, and a right-click outside the
  // batch replaces that batch before adding to the active view.
  await row(orders).click({ button: "right", position: { x: 70, y: 16 } });
  await expect(selected()).toHaveCount(1);
  await action("Add sources to current tab").click();
  await expect
    .poll(async () => {
      const workspace = await stored();
      return workspace.tabs.find(
        (tab) =>
          tab.id ===
          workspace.panes.find((pane) => pane.id === workspace.activePaneId)
            ?.tabId,
      )?.sources;
    })
    .toContainEqual({ logGroup: orders });
  await row(payments).click({ button: "right", position: { x: 70, y: 16 } });
  await action("Add splits to current tab").click();
  await expect(page.locator(".workspace-pane")).toHaveCount(4);
  await expect(page.getByRole("menu")).toHaveCount(0);
  // Keyboard menu is anchored to a visible point inside the clipped tree row.
  const tree = page.getByRole("tree", {
    name: "Log groups and streams",
    exact: true,
  });
  await tree.focus();
  await page.keyboard.press("Home");
  await page.keyboard.press("Shift+F10");
  await expect(action("Open in new split tab")).toBeVisible();
  await expect
    .poll(() =>
      page.evaluate(() =>
        Boolean(document.activeElement?.closest('[role="menu"]')),
      ),
    )
    .toBe(true);
  const activeBefore = await tree.getAttribute("aria-activedescendant");
  await page.keyboard.press("ArrowDown");
  expect(await tree.getAttribute("aria-activedescendant")).toBe(activeBefore);
  const treeBounds = (await tree.boundingBox())!,
    keyboardMenu = (await page.getByRole("menu").boundingBox())!;
  expect(keyboardMenu.y).toBeGreaterThanOrEqual(treeBounds.y);
  expect(keyboardMenu.x).toBeGreaterThanOrEqual(treeBounds.x);
  await page.keyboard.press("Escape");
});
