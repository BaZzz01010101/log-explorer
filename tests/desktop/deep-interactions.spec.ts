import {
  _electron as electron,
  expect,
  test,
  type CDPSession,
  type ElectronApplication,
  type Locator,
  type Page,
} from "@playwright/test";
import { existsSync } from "node:fs";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join, resolve, sep } from "node:path";

// All interaction goes through Chromium's trusted pointer/keyboard input.
// Evaluation below only reads diagnostics or operates the native window lifecycle.
test.setTimeout(60000);

let app: ElectronApplication | undefined;
let child: ReturnType<ElectronApplication["process"]> | undefined;
let page: Page;
let directory: string;
let environment: Record<string, string>;
let rendererErrors: string[];
const packaged = process.env.EXPLORER_DESKTOP_PACKAGED === "1";
const executable = join(
  process.cwd(),
  "release/win-unpacked/AWS Log Explorer.exe",
);

function delay(milliseconds: number) {
  return new Promise<void>((resolveDelay) =>
    setTimeout(resolveDelay, milliseconds),
  );
}

async function launch() {
  app = await electron.launch({
    executablePath: packaged ? executable : undefined,
    args: [
      ...(packaged ? ["--offline-verification"] : [process.cwd()]),
      "--background-verification",
      "--disable-background-networking",
      "--disable-component-update",
    ],
    env: environment,
  });
  child = app.process();
  page = await app.firstWindow();
  page.setDefaultTimeout(10000);
  const inputSession = await page.context().newCDPSession(page);
  await inputSession.send("Emulation.setFocusEmulationEnabled", {
    enabled: true,
  });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.addStyleTag({
    content:
      "*, *::before, *::after { transition-duration: 0s !important; animation-duration: 0s !important; animation-delay: 0s !important; }",
  });
  page.on("pageerror", (error) => rendererErrors.push(error.message));
  const info = await page.evaluate(() => window.explorer.environment());
  expect(info.awsEnabled).toBe(false);
  expect(info.canEnableAws).toBe(false);
  expect(info.packaged).toBe(packaged);
  expect(
    await app.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()[0].isVisible(),
    ),
  ).toBe(false);
  await app.evaluate(({ dialog }) => {
    // A failing close must never put a native dialog onto the user's desktop.
    // Natural-close assertions will fail if a dialog would have been needed.
    dialog.showMessageBox = async () => {
      throw new Error(
        "Unexpected native dialog during background verification",
      );
    };
  });
  await expect(page.locator(".query-status")).toContainText("complete");
}

async function closeNaturally() {
  if (!app || !child || child.exitCode !== null) return;
  const exited = app.waitForEvent("close", { timeout: 10000 });
  const processExit = new Promise<number | null>((resolveExit) =>
    child!.once("exit", resolveExit),
  );
  await app.evaluate(({ BrowserWindow }) => {
    BrowserWindow.getAllWindows()[0].close();
  });
  await exited;
  expect(await processExit).toBe(0);
}

async function cleanupProcess() {
  if (!app || !child || child.exitCode !== null) return;
  await Promise.race([app.close().catch(() => {}), delay(3000)]);
  if (child.exitCode !== null) return;
  if (process.platform === "win32") {
    try {
      execFileSync("taskkill", ["/PID", String(child.pid), "/T", "/F"], {
        stdio: "ignore",
      });
    } catch {
      // The child may have exited between the check and taskkill.
    }
  } else child.kill();
}

async function typeText(locator: Locator, value: string) {
  await locator.click({ timeout: 5000 });
  await page.keyboard.press("ControlOrMeta+A");
  if (value) await locator.pressSequentially(value, { timeout: 3000 });
  else await page.keyboard.press("Backspace");
}

async function metrics(session: CDPSession) {
  const result = await session.send("Performance.getMetrics");
  return Object.fromEntries(
    result.metrics.map((metric: { name: string; value: number }) => [
      metric.name,
      metric.value,
    ]),
  ) as Record<string, number>;
}

async function expectIdle(session: CDPSession, label: string) {
  // Allow the one legitimate table/measurement update to settle first.
  await delay(500);
  const before = await metrics(session);
  const start = performance.now();
  await delay(1800);
  const after = await metrics(session);
  const seconds = (performance.now() - start) / 1000;
  const taskSeconds = after.TaskDuration - before.TaskDuration;
  const report = {
    label,
    wallSeconds: seconds,
    taskSeconds,
    scriptSeconds: after.ScriptDuration - before.ScriptDuration,
    layouts: after.LayoutCount - before.LayoutCount,
  };
  console.info("Idle renderer:", JSON.stringify(report));
  await test.info().attach(`idle-${label}`, {
    body: JSON.stringify(report, null, 2),
    contentType: "application/json",
  });
  // The original loop consumed essentially the entire idle interval.
  // This leaves ample headroom for slow hosts while rejecting sustained work.
  expect(taskSeconds, JSON.stringify(report)).toBeLessThan(seconds * 0.3 + 0.1);
  await expect
    .poll(() => page.evaluate(() => document.readyState), { timeout: 2000 })
    .toBe("complete");
}

async function paneRectangles() {
  return page.locator(".workspace-pane").evaluateAll((elements) =>
    elements.map((element) => {
      const rect = element.getBoundingClientRect();
      return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
    }),
  );
}

async function drag(source: Locator, target: Locator) {
  const start = await source.boundingBox();
  const end = await target.boundingBox();
  expect(start).not.toBeNull();
  expect(end).not.toBeNull();
  const x = start!.x + start!.width / 2;
  const y = start!.y + start!.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  try {
    await page.mouse.move(x + 10, y + 2, { steps: 3 });
    await page.mouse.move(end!.x + end!.width / 2, end!.y + end!.height / 2, {
      steps: 15,
    });
    await expect(page.locator(".pane-drop-overlay")).toBeVisible();
  } finally {
    await page.mouse.up();
  }
}

test.beforeEach(async () => {
  test.skip(
    packaged && (process.platform !== "win32" || !existsSync(executable)),
    "Build the Windows package before packaged interaction verification",
  );
  directory = await mkdtemp(join(tmpdir(), "aws-log-explorer-deep-"));
  rendererErrors = [];
  environment = {};
  for (const key of [
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
    if (process.env[key]) environment[key] = process.env[key]!;
  Object.assign(environment, {
    EXPLORER_TEST_USER_DATA: directory,
    AWS_CONFIG_FILE: join(directory, "absent-config"),
    AWS_SHARED_CREDENTIALS_FILE: join(directory, "absent-credentials"),
    AWS_EC2_METADATA_DISABLED: "true",
  });
  await launch();
});

test.afterEach(async () => {
  await cleanupProcess();
  if (!directory) return;
  if (
    !resolve(directory).startsWith(
      resolve(tmpdir()) + sep + "aws-log-explorer-deep-",
    )
  )
    throw new Error("Unsafe deep-interaction cleanup path");
  await rm(directory, {
    recursive: true,
    force: true,
    maxRetries: 10,
    retryDelay: 100,
  });
});

test("unsorted and sorted tables settle at idle and remain responsive to trusted typing", async () => {
  const session = await page.context().newCDPSession(page);
  await session.send("Performance.enable");
  try {
    await expectIdle(session, "unsorted");
    const timestamp = page.locator('.column-sort[title="Sort by Timestamp"]');
    const header = page.locator(".log-header-cell").filter({ has: timestamp });
    await expect(header).toHaveAttribute("aria-sort", "none");
    await timestamp.click({ timeout: 3000 });
    await expect(header).not.toHaveAttribute("aria-sort", "none");
    await expectIdle(session, "sorted");
    const firstDirection = await header.getAttribute("aria-sort");
    await timestamp.click({ timeout: 3000 });
    await expect(header).toHaveAttribute(
      "aria-sort",
      firstDirection === "ascending" ? "descending" : "ascending",
    );
    await timestamp.click({ timeout: 3000 });
    await expect(header).toHaveAttribute("aria-sort", "none");
    await expectIdle(session, "sort-cleared");

    const search = page.getByLabel("Local filter loaded events");
    await typeText(search, "Payment");
    await expect(search).toHaveValue("Payment");
    await expect(page.locator(".viewer-meta")).not.toContainText("540 / 540");
    await expect(page.locator(".log-table-row").first()).toContainText(
      "Payment provider timed out",
    );
    await typeText(search, "this-event-does-not-exist-7842");
    await expect(
      page.getByText("No loaded events match this filter", { exact: true }),
    ).toBeVisible();
    await typeText(search, "");
    await expect(page.locator(".log-table-row").first()).toBeVisible();
    await typeText(page.getByLabel("CloudWatch filter pattern"), '"Payment"');
    await page.getByTestId("run-query").click({ timeout: 3000 });
    await expect(page.locator(".query-status")).toContainText("complete");
    await expect(page.locator(".log-table-row").first()).toContainText(
      "Payment provider timed out",
    );
    await closeNaturally();
    expect(rendererErrors).toEqual([]);
  } finally {
    await session.detach().catch(() => {});
  }
});

test("three and four panes have valid geometry and accept a real tab drag", async () => {
  for (const name of [
    "/aws/lambda/payments-worker",
    "/aws/lambda/media-pipeline",
  ]) {
    await page
      .getByRole("treeitem", { name, exact: true })
      .locator(".resource-label")
      .click();
    await expect(page.locator(".query-status")).toContainText("complete");
  }
  await expect(page.locator(".workspace-tab")).toHaveCount(3);
  await page.getByLabel("Add split pane", { exact: true }).click();
  await page.getByLabel("Add split pane", { exact: true }).click();
  await expect(page.locator(".workspace-pane")).toHaveCount(3);
  const three = await paneRectangles();
  expect(three.every((rect) => rect.width > 100 && rect.height > 100)).toBe(
    true,
  );
  expect(three[0].x).toBeLessThan(three[1].x);
  expect(Math.abs(three[0].y - three[1].y)).toBeLessThan(2);
  expect(three[1].y).toBeLessThan(three[2].y);
  expect(Math.abs(three[1].x - three[2].x)).toBeLessThan(2);
  expect(
    Math.abs(three[0].height - three[1].height - three[2].height - 1),
  ).toBeLessThan(3);

  await page.getByLabel("Add split pane", { exact: true }).click();
  await expect(page.locator(".workspace-pane")).toHaveCount(4);
  await expect(
    page.getByLabel("Add split pane", { exact: true }),
  ).toBeDisabled();
  const four = await paneRectangles();
  expect(four.every((rect) => rect.width > 100 && rect.height > 100)).toBe(
    true,
  );
  expect(Math.abs(four[0].y - four[1].y)).toBeLessThan(2);
  expect(Math.abs(four[2].y - four[3].y)).toBeLessThan(2);
  expect(Math.abs(four[0].x - four[2].x)).toBeLessThan(2);
  expect(four[0].x + four[0].width).toBeLessThanOrEqual(four[1].x + 1);
  expect(four[0].y + four[0].height).toBeLessThanOrEqual(four[2].y + 1);

  const panes = page.locator(".workspace-pane");
  await expect(panes.nth(3).locator(".pane-heading")).toContainText(
    "Empty pane",
  );
  const oldPane = await panes
    .filter({ has: page.locator(".pane-heading", { hasText: "orders-api" }) })
    .getAttribute("aria-label");
  await drag(
    page.getByRole("button", {
      name: "Drag orders-api to reorder or move to a pane",
      exact: true,
    }),
    page.locator("[data-pane-drop-target]").nth(3),
  );
  await expect(panes.nth(3).locator(".pane-heading")).toContainText(
    "orders-api",
  );
  await expect(
    page.locator(`.workspace-pane[aria-label="${oldPane}"]`),
  ).toContainText("Empty pane");
  await expect(page.locator(".pane-drop-overlay")).toHaveCount(0);

  const horizontal = page.getByRole("separator", {
    name: "Resize panes horizontally",
    exact: true,
  });
  const vertical = page.getByRole("separator", {
    name: "Resize panes vertically",
    exact: true,
  });
  // Avoid the intersection where the other divider is correctly on top.
  await horizontal.click({ position: { x: 3, y: 20 } });
  await page.keyboard.press("ArrowRight");
  await expect(horizontal).toHaveAttribute("aria-valuenow", "52");
  await vertical.click({ position: { x: 20, y: 3 } });
  await page.keyboard.press("ArrowDown");
  await expect(vertical).toHaveAttribute("aria-valuenow", "52");
  expect(rendererErrors).toEqual([]);
  await closeNaturally();
});

test("trusted settings edits and final workspace changes survive a natural restart", async () => {
  await page.getByLabel("Add split pane", { exact: true }).click();
  const divider = page.getByRole("separator", {
    name: "Resize panes horizontally",
  });
  const grid = await page.locator(".pane-grid").boundingBox();
  const handle = await divider.boundingBox();
  expect(grid).not.toBeNull();
  expect(handle).not.toBeNull();
  await page.mouse.move(handle!.x + handle!.width / 2, handle!.y + 20);
  await page.mouse.down();
  await page.mouse.move(grid!.x + grid!.width * 0.6, grid!.y + 20, {
    steps: 8,
  });
  await page.mouse.up();
  await expect(
    page.getByRole("separator", { name: "Resize panes horizontally" }),
  ).toHaveAttribute("aria-valuenow", "60");
  await page
    .getByRole("button", { name: "Workspace settings", exact: true })
    .click();
  await page
    .getByRole("tab", { name: "Preferences", exact: true })
    .click({ timeout: 10000 });
  await typeText(page.getByLabel("Log font size", { exact: true }), "14");
  await expect(page.getByLabel("Log font size", { exact: true })).toHaveValue(
    "14",
  );
  await page.keyboard.press("Enter");
  const maxEvents = page.getByLabel("Maximum events per view", { exact: true });
  const loadedBeforeLimitEdit =
    (await page.locator(".viewer-meta").textContent()) ?? "";
  await typeText(maxEvents, "25000");
  await expect(maxEvents).toHaveValue("25000");
  await page.keyboard.press("Tab");
  await expect(page.locator(".viewer-meta")).toHaveText(loadedBeforeLimitEdit);
  const refresh = page.getByLabel("Automatic refresh (seconds)", {
    exact: true,
  });
  await typeText(refresh, "120");
  await expect(refresh).toHaveValue("120");
  await typeText(refresh, "0");
  await expect(refresh).toHaveValue("0");
  await page
    .getByRole("combobox", { name: "Timestamp display", exact: true })
    .click();
  await page.getByRole("option", { name: "UTC", exact: true }).click();
  await page.getByRole("combobox", { name: "Density", exact: true }).click();
  await page.getByRole("option", { name: "comfortable", exact: true }).click();
  await page.getByRole("tab", { name: "Workspace", exact: true }).click();
  await typeText(page.getByLabel("Workspace name"), "Trusted input restored");
  // The final edit closes before the save debounce is allowed to elapse.
  await closeNaturally();
  const saved = JSON.parse(
    await readFile(join(directory, "workspace.json"), "utf8"),
  );
  expect(saved.name).toBe("Trusted input restored");
  expect(saved.preferences).toMatchObject({
    fontSize: 14,
    maxEvents: 25000,
    refreshSeconds: 0,
    timezone: "utc",
    density: "comfortable",
  });
  expect(saved.splitSizes.horizontal).toBeCloseTo(0.6);
  expect(saved.panes).toHaveLength(2);
  expect(saved).not.toHaveProperty("events");
  await launch();
  await expect(
    page.getByText("Trusted input restored", { exact: true }),
  ).toBeVisible();
  await expect(page.locator(".workspace-pane")).toHaveCount(2);
  await expect(
    page.getByRole("separator", { name: "Resize panes horizontally" }),
  ).toHaveAttribute("aria-valuenow", "60");
  expect(rendererErrors).toEqual([]);
  await page
    .getByRole("button", { name: "Workspace settings", exact: true })
    .click();
  await page
    .getByRole("tab", { name: "Preferences", exact: true })
    .click({ timeout: 10000 });
  await typeText(page.getByLabel("Log font size", { exact: true }), "15");
  await expect(page.getByLabel("Log font size", { exact: true })).toHaveValue(
    "15",
  );
  // Closing the native window must also finish an editor that still has focus.
  await closeNaturally();
  expect(
    JSON.parse(await readFile(join(directory, "workspace.json"), "utf8"))
      .preferences.fontSize,
  ).toBe(15);
});
