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
const temporaryRoot = resolve(".tmp/desktop-source-badges");
let app: ElectronApplication, page: Page, directory: string, errors: string[];

test.beforeEach(async ({}, info) => {
  errors = [];
  await mkdir(temporaryRoot, { recursive: true });
  directory = await mkdtemp(join(temporaryRoot, "case-"));
  const workspace = createWorkspace();
  workspace.preferences.theme = info.title.includes("dark") ? "dark" : "light";
  workspace.connections.push({
    ...workspace.connections[0]!,
    id: "offline-east",
    name: "Offline fixtures east",
    region: "us-east-1",
  });
  workspace.tabs[0]!.sources = [
    { logGroup: "/aws/lambda/orders-api" },
    { logGroup: "/aws/lambda/payments-worker" },
  ];
  workspace.tabs[0]!.timePreset = "1h";
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
    throw new Error("Unsafe source badge cleanup");
  await rm(directory, {
    recursive: true,
    force: true,
    maxRetries: 10,
    retryDelay: 100,
  });
});

for (const theme of behaviorThemes)
  test(`${theme}: source badges hide events locally and edit sources with validation`, async () => {
    const strip = page.getByRole("group", { name: "Log sources" });
    const orders = strip.locator(
      '.source-badge[data-source-group="/aws/lambda/orders-api"]',
    );
    const payments = strip.locator(
      '.source-badge[data-source-group="/aws/lambda/payments-worker"]',
    );
    await expect(page.locator(".query-status")).toHaveAttribute(
      "data-query-state",
      "complete",
    );
    const rows = page.locator(".virtual-event");
    await expect(rows.filter({ hasText: "orders-api" }).first()).toBeVisible();

    // Hide: the badge is marked, its events leave the view, nothing is queried.
    await strip
      .getByRole("button", { name: "Hide source /aws/lambda/orders-api" })
      .click();
    await expect(orders).toHaveClass(/source-badge-hidden/);
    const label = strip.locator(".source-strip-label");
    await expect(label).toHaveText("1/2 Sources");
    await expect(label).toHaveAttribute("data-hidden-count", "1");
    await expect(rows.filter({ hasText: "orders-api" })).toHaveCount(0);
    await expect(
      rows.filter({ hasText: "payments-worker" }).first(),
    ).toBeVisible();
    await expect(page.locator(".query-status")).toHaveAttribute(
      "data-query-state",
      "complete",
    );
    await expect
      .poll(async () => {
        const saved = JSON.parse(
          await readFile(join(directory, "workspace.json"), "utf8"),
        );
        return saved.tabs[0].view.hiddenSources?.length ?? 0;
      })
      .toBe(1);
    await strip
      .getByRole("button", { name: "Show source /aws/lambda/orders-api" })
      .click();
    await expect(orders).not.toHaveClass(/source-badge-hidden/);
    await expect(rows.filter({ hasText: "orders-api" }).first()).toBeVisible();
    await expect(label).not.toHaveAttribute("data-hidden-count");
    await expect(label).toHaveText("2 Sources");

    // The label keeps its width, so hiding a source never moves the badges.
    const firstBadgeX = async () =>
      (await strip.locator(".source-badge").first().boundingBox())!.x;
    const shownX = await firstBadgeX();

    // Clicking a badge shows only it; clicking the only visible one shows all.
    await payments.locator(".source-badge-drag-label").click();
    await expect(orders).toHaveClass(/source-badge-hidden/);
    await expect(payments).not.toHaveClass(/source-badge-hidden/);
    await expect(label).toHaveText("1/2 Sources");
    expect(Math.abs((await firstBadgeX()) - shownX)).toBeLessThan(0.5);
    await expect(rows.filter({ hasText: "orders-api" })).toHaveCount(0);
    await orders.locator(".source-badge-drag-label").click();
    await expect(payments).toHaveClass(/source-badge-hidden/);
    await expect(orders).not.toHaveClass(/source-badge-hidden/);
    await payments.locator(".source-badge-drag-label").click();
    await expect(orders).toHaveClass(/source-badge-hidden/);
    await expect(payments).not.toHaveClass(/source-badge-hidden/);
    await payments.locator(".source-badge-drag-label").click();
    await expect(strip.locator(".source-badge-hidden")).toHaveCount(0);
    await expect(label).toHaveText("2 Sources");
    await expect(rows.filter({ hasText: "orders-api" }).first()).toBeVisible();

    // Hide again from the context menu; editing keeps it hidden.
    await orders.click({ button: "right" });
    await page.getByRole("menuitem", { name: "Hide source" }).click();
    await expect(orders).toHaveClass(/source-badge-hidden/);

    // Edit: an unknown group is rejected, an existing one in another region saves.
    await payments.locator(".source-badge-drag-label").dblclick();
    const dialog = page.getByRole("dialog", { name: "Edit source" });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByLabel("Log group")).toHaveValue(
      "/aws/lambda/payments-worker",
    );
    await dialog.getByLabel("Log group").fill("/aws/lambda/missing");
    await dialog.getByRole("button", { name: "Save" }).click();
    await expect(dialog.getByRole("alert")).toContainText(
      'Log group "/aws/lambda/missing" was not found in eu-west-1.',
    );
    await dialog.getByLabel("Log group").fill("/ecs/checkout");
    await dialog.getByLabel("Region", { exact: true }).click();
    await page.getByRole("option", { name: "us-east-1" }).click();
    await dialog.getByRole("button", { name: "Save" }).click();
    await expect(dialog).toHaveCount(0);
    const checkout = strip.locator(
      '.source-badge[data-source-group="/ecs/checkout"]',
    );
    await expect(checkout).toHaveAttribute(
      "data-source-connection",
      "offline-east",
    );
    await expect(payments).toHaveCount(0);
    await expect(orders).toHaveClass(/source-badge-hidden/);
    await expect(rows.filter({ hasText: "checkout" }).first()).toBeVisible();

    // Editing a hidden source keeps it hidden under its new name.
    await orders.click({ button: "right" });
    await page.getByRole("menuitem", { name: "Edit source…" }).click();
    await dialog.getByLabel("Log group").fill("/ecs/inventory");
    await dialog.getByRole("button", { name: "Save" }).click();
    await expect(dialog).toHaveCount(0);
    const inventory = strip.locator(
      '.source-badge[data-source-group="/ecs/inventory"]',
    );
    await expect(inventory).toHaveClass(/source-badge-hidden/);
    await expect(label).toHaveText("1/2 Sources");

    // Removing the hidden source drops its hidden state.
    await inventory.click({ button: "right" });
    await page.getByRole("menuitem", { name: "Remove source" }).click();
    await expect(strip.locator(".source-badge")).toHaveCount(1);
    await expect(label).not.toHaveAttribute("data-hidden-count");
    await expect(label).toHaveText("1 Source");
  });
