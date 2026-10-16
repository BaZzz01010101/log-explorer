import { desktopExecutablePath } from "./desktop-app";
import {
  _electron as electron,
  expect,
  test,
  type ElectronApplication,
  type Page,
} from "@playwright/test";
import { execFileSync } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve, sep } from "node:path";

let app: ElectronApplication;
let child: ReturnType<ElectronApplication["process"]>;
let page: Page;
let directory: string;
let errors: string[];
const packaged = process.env.EXPLORER_DESKTOP_PACKAGED === "1";

test.beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), "aws-log-explorer-projected-drop-"));
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
        "Unexpected native dialog during hidden projected-drop verification",
      );
    };
  });
  await expect(
    page.locator('.query-status[data-query-state="complete"]'),
  ).toBeAttached();
});

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
      resolve(tmpdir()) + sep + "aws-log-explorer-projected-drop-",
    )
  )
    throw new Error("Unsafe projected-drop cleanup path");
  await rm(directory, {
    recursive: true,
    force: true,
    maxRetries: 10,
    retryDelay: 100,
  });
  expect(errors).toEqual([]);
});

test("dropping a normal tab into a combined tab previews its final nested pane rectangle", async () => {
  await page
    .getByRole("treeitem", { name: "/aws/lambda/payments-worker", exact: true })
    .locator(".resource-label")
    .dblclick();
  await page
    .getByRole("treeitem", { name: "/aws/lambda/media-pipeline", exact: true })
    .locator(".resource-label")
    .dblclick();
  await page.getByRole("tab", { name: "payments-worker", exact: true }).click();
  await page.getByLabel("Add split pane", { exact: true }).click();
  await expect(page.locator(".workspace-pane")).toHaveCount(2);
  const paneFor = (name: string) =>
    page
      .locator(".workspace-pane")
      .filter({ has: page.locator(".pane-heading").filter({ hasText: name }) });
  const payments = paneFor("payments-worker");
  const orders = paneFor("orders-api");
  const left = (await payments.boundingBox())!;
  const right = (await orders.boundingBox())!;
  expect(left.x).toBeLessThan(right.x);
  const tab = page.getByRole("tab", { name: "media-pipeline", exact: true });
  const from = (await tab.boundingBox())!;
  await page.mouse.move(from.x + 30, from.y + from.height / 2);
  await page.mouse.down();
  await page.mouse.move(from.x + 40, from.y + from.height / 2, { steps: 2 });
  await page.mouse.move(left.x + left.width - 20, left.y + left.height / 2, {
    steps: 5,
  });
  const overlay = page.locator('[data-split-preview="right"]');
  await expect(overlay).toBeVisible();
  await expect(page.locator(".workspace-drag-preview")).toBeVisible();
  const projected = (await overlay.boundingBox())!;
  await page.mouse.up();
  await expect(
    page.locator(".pane-drop-overlay,.workspace-drag-preview"),
  ).toHaveCount(0);
  await expect(page.locator(".workspace-pane")).toHaveCount(3);
  await expect(page.locator(".workspace-tab")).toHaveCount(1);
  const actual = (await paneFor("media-pipeline").boundingBox())!;
  for (const key of ["x", "y", "width", "height"] as const)
    expect(
      Math.abs(actual[key] - projected[key]),
      JSON.stringify({ projected, actual, key }),
    ).toBeLessThanOrEqual(2);
  const closed = app.waitForEvent("close", { timeout: 10000 });
  const exited = new Promise<number | null>((resolveExit) =>
    child.once("exit", resolveExit),
  );
  await app.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows()[0].close(),
  );
  await closed;
  expect(await exited).toBe(0);
});
