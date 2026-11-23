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

test("source name formats, badge hints and Set as message rules", async () => {
  const strip = page.getByRole("group", { name: "Log sources" });
  const orders = strip.locator(
    '.source-badge[data-source-group="/aws/lambda/orders-api"]',
  );
  const rows = page.locator(".virtual-event");
  const tooltip = page.getByRole("tooltip");
  await expect(page.locator(".query-status")).toHaveAttribute(
    "data-query-state",
    "complete",
  );

  // Badges use the pointer cursor and hidden ones are not struck through.
  const name = orders.locator(".source-badge-drag-label");
  await expect(name).toHaveCSS("cursor", "pointer");
  await strip
    .getByRole("button", { name: "Hide source /aws/lambda/orders-api" })
    .click();
  await expect(name).toHaveCSS("text-decoration-line", "none");
  await strip
    .getByRole("button", { name: "Show source /aws/lambda/orders-api" })
    .click();

  // The remove button has its own hint; the badge hint lists full details.
  await orders.getByRole("button", { name: /^Remove source/ }).hover();
  await expect(tooltip).toHaveText("Remove source");
  await name.hover();
  await expect(tooltip).toContainText("Log group: /aws/lambda/orders-api");
  await expect(tooltip).toContainText("Region: eu-west-1");

  // Filter fields explain their syntax and shortcuts.
  await page
    .getByRole("textbox", { name: "Local filter loaded events" })
    .hover();
  await expect(tooltip).toContainText("@/level=ERROR");
  await expect(tooltip).toContainText("Ctrl+F: focus this field");
  await page
    .getByRole("textbox", { name: "Highlight text in loaded events" })
    .hover();
  await expect(tooltip).toContainText("Ctrl+H: focus this field");
  await page.getByRole("button", { name: /^Filter mode:/ }).hover();
  await expect(tooltip).toContainText("UNIFIED SYNTAX");
  await expect(tooltip).toContainText("$.status >= 500");
  await page.getByRole("button", { name: "Configure columns" }).hover();
  await expect(tooltip).toHaveText("Configure columns");

  // Set as message adds a rule for the event's source and opens it.
  const pathCells = rows
    .locator(".log-cell")
    .filter({ hasText: /^\/api\/orders\/\d+$/ });
  await expect(pathCells).toHaveCount(0);
  const json = rows.filter({ hasText: "Request processed" }).first();
  await json.locator(".inspect-cell").first().dblclick();
  const inspector = page.getByRole("region", {
    name: "Event inspector",
    exact: true,
  });
  await expect(inspector).toBeVisible();
  const expand = inspector.getByRole("button", {
    name: "Expand /request",
    exact: true,
  });
  if (await expand.count()) await expand.click();
  await inspector
    .getByRole("button", {
      name: "Field actions for /request/path",
      exact: true,
    })
    .click();
  await page
    .getByRole("menuitem", { name: "Set /request/path as message" })
    .click();
  await expect(page.getByRole("tab", { name: "Display" })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  const rulePath = page.getByRole("textbox", { name: "Rule 1 path" });
  await expect(rulePath).toHaveValue("$.request.path");
  await expect(rulePath).toBeFocused();
  await expect(
    page.getByRole("textbox", { name: "Rule 1 source" }),
  ).toHaveValue(/^\/aws\/lambda\/(orders-api|payments-worker)$/);
  // The source filter supports regex and case like the local filter.
  const ruleSource = page.getByRole("textbox", { name: "Rule 1 source" });
  await ruleSource.fill("(orders|payments)-");
  await expect(pathCells).toHaveCount(0);
  await page
    .getByRole("button", { name: "Use rule 1 source regular expression" })
    .click();
  await expect(pathCells.first()).toBeVisible();
  await ruleSource.fill("(ORDERS|PAYMENTS)-");
  await expect(pathCells.first()).toBeVisible();
  await page.getByRole("button", { name: "Match rule 1 source case" }).click();
  await expect(pathCells).toHaveCount(0);
  await ruleSource.fill("(");
  await expect(page.locator("[data-message-rule]").first()).toContainText(
    /Invalid regular expression/i,
  );
  await ruleSource.fill("");
  await expect(pathCells.first()).toBeVisible();

  // An AWS format renames badges and the Source column.
  await page
    .getByRole("button", { name: "Help for Source names", exact: true })
    .click();
  await expect(tooltip).toContainText("Examples");
  await expect(tooltip).toContainText(
    "checkout · dev · payments / europe-west1",
  );
  await page.keyboard.press("Escape");
  await page
    .getByRole("button", { name: "Help for AWS source name", exact: true })
    .click();
  await expect(tooltip).toContainText("{FULL_NAME}");
  await expect(tooltip).not.toContainText("Examples");
  await expect(tooltip).not.toContainText("{CLUSTER}");
  await page.keyboard.press("Escape");
  await page
    .getByRole("textbox", { name: "AWS source name", exact: true })
    .fill("{FULL_NAME} : {REGION}");
  await expect(name).toHaveText("/aws/lambda/orders-api : eu-west-1");
  await expect(rows.locator(".event-source-label").first()).toHaveText(
    /^\/aws\/lambda\/(orders-api|payments-worker) : eu-west-1$/,
  );
  await page.getByRole("button", { name: "Delete rule 1" }).click();
  await expect(pathCells).toHaveCount(0);
  await expect
    .poll(async () => {
      const saved = JSON.parse(
        await readFile(join(directory, "workspace.json"), "utf8"),
      );
      return [
        saved.preferences.sourceNameFormats?.aws,
        saved.preferences.messageRules?.length,
      ];
    })
    .toEqual(["{FULL_NAME} : {REGION}", 0]);
});
