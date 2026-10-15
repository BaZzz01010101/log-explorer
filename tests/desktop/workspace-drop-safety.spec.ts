import {
  _electron as electron,
  expect,
  test,
  type ElectronApplication,
  type Locator,
  type Page,
} from "@playwright/test";
import { execFileSync } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve, sep } from "node:path";

let app: ElectronApplication;
let child: ReturnType<ElectronApplication["process"]>;
let page: Page;
let directory: string;
let errors: string[];
const packaged = process.env.EXPLORER_DESKTOP_PACKAGED === "1";
test.setTimeout(90000);

test.beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), "aws-log-explorer-drop-safety-"));
  const env: Record<string, string> = {};
  for (const name of [
    "PATH",
    "SystemRoot",
    "WINDIR",
    "TEMP",
    "TMP",
    "USERPROFILE",
    "LOCALAPPDATA",
    "APPDATA",
    "COMSPEC",
  ])
    if (process.env[name]) env[name] = process.env[name]!;
  Object.assign(env, {
    EXPLORER_TEST_USER_DATA: directory,
    AWS_CONFIG_FILE: join(directory, "absent-config"),
    AWS_SHARED_CREDENTIALS_FILE: join(directory, "absent-credentials"),
    AWS_EC2_METADATA_DISABLED: "true",
  });
  errors = [];
  app = await electron.launch({
    executablePath: packaged
      ? join(process.cwd(), "release/win-unpacked/AWS Log Explorer.exe")
      : undefined,
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
  const session = await page.context().newCDPSession(page);
  await session.send("Emulation.setFocusEmulationEnabled", { enabled: true });
  page.on("pageerror", (error) => errors.push(error.message));
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
      throw new Error(
        "Unexpected native dialog during hidden drop verification",
      );
    };
  });
  await expect(page.locator(".query-status")).toContainText("complete");
});

async function closeNaturally() {
  const closed = app.waitForEvent("close", { timeout: 10000 });
  const exited = new Promise<number | null>((resolveExit) =>
    child.once("exit", resolveExit),
  );
  await app.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows()[0].close(),
  );
  await closed;
  expect(await exited).toBe(0);
}

test.afterEach(async () => {
  if (child?.exitCode === null) {
    await Promise.race([
      app.close().catch(() => {}),
      new Promise((resolveDelay) => setTimeout(resolveDelay, 4000)),
    ]);
    if (child.exitCode === null) {
      if (process.platform === "win32") {
        try {
          execFileSync("taskkill", ["/PID", String(child.pid), "/T", "/F"], {
            stdio: "ignore",
          });
        } catch {}
      } else child.kill();
    }
  }
  if (
    !resolve(directory).startsWith(
      resolve(tmpdir()) + sep + "aws-log-explorer-drop-safety-",
    )
  )
    throw new Error("Unsafe drop verification cleanup path");
  await rm(directory, {
    recursive: true,
    force: true,
    maxRetries: 10,
    retryDelay: 100,
  });
  expect(errors).toEqual([]);
});

async function startDrag(tab: Locator, target: { x: number; y: number }) {
  const from = (await tab.boundingBox())!;
  await page.mouse.move(from.x + 30, from.y + from.height / 2);
  await page.mouse.down();
  await page.mouse.move(from.x + 40, from.y + from.height / 2, { steps: 2 });
  await page.mouse.move(target.x, target.y, { steps: 5 });
}

async function snapshot() {
  return page.evaluate(() => ({
    tabs: [...document.querySelectorAll<HTMLElement>("[data-tab-id]")].map(
      (element) => element.dataset.tabId,
    ),
    panes: [
      ...document.querySelectorAll<HTMLElement>("[data-pane-drop-target]"),
    ].map((element) => element.dataset.paneDropTarget),
    labels: [...document.querySelectorAll(".pane-heading")].map(
      (element) => element.textContent,
    ),
  }));
}

test("top-edge self-drop clones independent permanent tabs and invalid or cancelled drops preserve the workspace", async () => {
  await expect(page.locator(".workspace-tab")).toHaveCount(1);
  const panel = (await page.locator("[data-pane-drop-target]").boundingBox())!;
  await startDrag(page.getByRole("tab", { name: "orders-api", exact: true }), {
    x: panel.x + panel.width / 2,
    y: panel.y + 45,
  });
  const overlay = page.locator('[data-split-preview="top"]');
  await expect(overlay).toBeVisible();
  await expect(page.locator(".workspace-drag-preview")).toBeVisible();
  const shown = (await overlay.boundingBox())!;
  expect(Math.abs(shown.height - (panel.height - 6) / 2)).toBeLessThan(2);
  await page.mouse.up();
  await expect(
    page.locator(".workspace-drag-preview,.pane-drop-overlay"),
  ).toHaveCount(0);
  await expect(page.locator(".workspace-pane")).toHaveCount(2);
  await expect(page.locator(".workspace-tab")).toHaveCount(1);
  await expect(
    page.locator('.workspace-tab[data-entry-kind="split"]'),
  ).toHaveCount(1);
  await expect(page.locator(".workspace-tab.is-preview")).toHaveCount(0);
  const panes = page.locator(".workspace-pane");
  const first = (await panes.nth(0).boundingBox())!;
  const second = (await panes.nth(1).boundingBox())!;
  expect(first.y).toBeLessThan(second.y);
  expect(Math.abs(first.x - second.x)).toBeLessThan(2);
  expect(Math.abs(first.width - second.width)).toBeLessThan(2);
  await expect(
    page.getByLabel("Add split pane", { exact: true }),
  ).toHaveAttribute("data-split-axis", "horizontal");
  await panes.nth(0).getByLabel("Local filter loaded events").fill("Payment");
  await expect(
    panes.nth(0).getByLabel("Local filter loaded events"),
  ).toHaveValue("Payment");
  await expect(
    panes.nth(1).getByLabel("Local filter loaded events"),
  ).toHaveValue("");

  await page
    .getByRole("treeitem", { name: "/aws/lambda/media-pipeline", exact: true })
    .locator(".resource-label")
    .dblclick();
  await expect(page.locator(".workspace-pane")).toHaveCount(1);
  const combinedTab = page
    .locator('.workspace-tab[data-entry-kind="split"]')
    .getByRole("tab");
  const before = await snapshot();
  await startDrag(combinedTab, { x: -35, y: -35 });
  await expect(page.locator(".pane-drop-overlay")).toHaveCount(0);
  await page.mouse.up();
  await expect(
    page.locator(
      ".workspace-drag-preview,.pane-drop-overlay,.workspace-tab.is-dragging",
    ),
  ).toHaveCount(0);
  expect(await snapshot()).toEqual(before);

  const target = (await page
    .locator("[data-pane-drop-target]")
    .first()
    .boundingBox())!;
  await startDrag(combinedTab, {
    x: target.x + target.width / 2,
    y: target.y + 45,
  });
  await expect(page.locator(".workspace-drag-preview")).toBeVisible();
  await expect(page.locator(".pane-drop-overlay")).toBeVisible();
  await page.keyboard.press("Escape");
  await page.mouse.up();
  await expect(
    page.locator(
      ".workspace-drag-preview,.pane-drop-overlay,.workspace-tab.is-dragging",
    ),
  ).toHaveCount(0);
  expect(await snapshot()).toEqual(before);
  await closeNaturally();
  const saved = JSON.parse(
    await readFile(join(directory, "workspace.json"), "utf8"),
  );
  expect(saved.tabs).toHaveLength(3);
  expect(new Set(saved.tabs.map((tab: { id: string }) => tab.id)).size).toBe(3);
  expect(saved.tabs.every((tab: { preview?: boolean }) => !tab.preview)).toBe(
    true,
  );
  expect(
    saved.tabs
      .filter((tab: { id: string }) =>
        saved.splitTabs[0].panes.some(
          (pane: { tabId: string }) => pane.tabId === tab.id,
        ),
      )
      .map((tab: { view: { localSearch: string } }) => tab.view.localSearch)
      .sort(),
  ).toEqual(["", "Payment"]);
});

test("a full four-pane workspace refuses a fifth split without adding tabs", async () => {
  const add = page.getByLabel("Add split pane", { exact: true });
  await add.click();
  await add.click();
  await add.click();
  await expect(page.locator(".workspace-pane")).toHaveCount(4);
  await expect(page.locator(".workspace-tab")).toHaveCount(1);
  await expect(add).toBeDisabled();
  const before = await snapshot();
  const target = (await page
    .locator("[data-pane-drop-target]")
    .first()
    .boundingBox())!;
  await startDrag(
    page.locator('.workspace-tab[data-entry-kind="split"]').getByRole("tab"),
    { x: target.x + 20, y: target.y + target.height / 2 },
  );
  await expect(page.locator(".pane-drop-overlay")).toHaveCount(0);
  await expect(page.locator('[data-split-preview="left"]')).toHaveCount(0);
  await page.mouse.up();
  await expect(page.locator(".workspace-pane")).toHaveCount(4);
  await expect(page.locator(".workspace-tab")).toHaveCount(1);
  expect(await snapshot()).toEqual(before);
  await closeNaturally();
});
