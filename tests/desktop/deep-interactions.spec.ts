import { desktopExecutablePath } from "./desktop-app";
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
const executable = desktopExecutablePath();

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
  await expect(
    page.locator('.query-status[data-query-state="complete"]').first(),
  ).toBeAttached();
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
    const timestamp = page.locator(
      '.column-sort[data-tooltip="Sort by Timestamp"]',
    );
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
    await expect(page.locator(".query-status")).toContainText("shown /");
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
    await expect(
      page.locator('.query-status[data-query-state="complete"]'),
    ).toBeAttached();
    await expect(page.locator(".log-table-row").first()).toContainText(
      "Payment provider timed out",
    );
    await closeNaturally();
    expect(rendererErrors).toEqual([]);
  } finally {
    await session.detach().catch(() => {});
  }
});

test("preview tabs replace one slot and become permanent on double click", async () => {
  const resource = (name: string) =>
    page
      .getByRole("treeitem", { name: `/aws/lambda/${name}`, exact: true })
      .locator(".resource-label");
  await resource("payments-worker").click();
  await expect(page.locator(".workspace-tab")).toHaveCount(2);
  await expect(page.locator(".workspace-tab.is-preview")).toContainText(
    "payments-worker",
  );
  await expect(
    page
      .getByRole("tab", { name: "payments-worker", exact: true })
      .locator("span")
      .first(),
  ).toHaveCSS("font-style", "italic");
  await resource("media-pipeline").click();
  await expect(page.locator(".workspace-tab")).toHaveCount(2);
  await expect(page.locator(".workspace-tab.is-preview")).toContainText(
    "media-pipeline",
  );
  await page
    .getByRole("tab", { name: "media-pipeline", exact: true })
    .dblclick();
  await expect(page.locator(".workspace-tab.is-preview")).toHaveCount(0);
  await resource("payments-worker").dblclick();
  await expect(page.locator(".workspace-tab")).toHaveCount(3);
  await expect(page.locator(".workspace-tab.is-preview")).toHaveCount(0);
  await closeNaturally();
  const saved = JSON.parse(
    await readFile(join(directory, "workspace.json"), "utf8"),
  );
  expect(saved.tabs).toHaveLength(3);
  expect(saved.tabs.every((tab: { preview?: boolean }) => !tab.preview)).toBe(
    true,
  );
  expect(rendererErrors).toEqual([]);
});

test("whole tabs reorder near the strip and create highlighted nested splits away from it", async () => {
  test.setTimeout(150000);
  for (const name of ["payments-worker", "media-pipeline", "notifications"]) {
    await page
      .getByRole("treeitem", { name: `/aws/lambda/${name}`, exact: true })
      .locator(".resource-label")
      .dblclick();
  }
  await expect(page.locator(".workspace-tab")).toHaveCount(4);
  await expect(page.locator(".tab-grip,.tab-menu-button")).toHaveCount(0);
  const tab = page.getByRole("tab", { name: "orders-api", exact: true });
  let start = (await tab.boundingBox())!;
  const lastTab = (await page
    .getByRole("tab", { name: "notifications", exact: true })
    .boundingBox())!;
  await page.mouse.move(start.x + 30, start.y + start.height / 2);
  await page.mouse.down();
  await page.mouse.move(
    lastTab.x + lastTab.width / 2,
    start.y + start.height / 2,
    { steps: 5 },
  );
  await expect(page.locator(".workspace-tab.is-dragging")).toHaveCount(1);
  await expect(page.locator(".workspace-drag-preview")).toHaveCount(0);
  expect(await page.evaluate(() => window.getSelection()?.toString())).toBe("");
  await page.mouse.up();
  await expect(page.locator(".workspace-tab-label").last()).toContainText(
    "orders-api",
  );

  const splitByDrag = async (
    sourceName: string,
    paneIndex: number,
    edge: "left" | "right" | "top" | "bottom",
  ) => {
    const source = page.getByRole("tab", { name: sourceName, exact: true });
    const from = (await source.boundingBox())!;
    const panel = page.locator("[data-pane-drop-target]").nth(paneIndex);
    const to = (await panel.boundingBox())!;
    const x =
      edge === "left"
        ? to.x + 20
        : edge === "right"
          ? to.x + to.width - 20
          : to.x + to.width / 2;
    const y =
      edge === "top"
        ? to.y + 45
        : edge === "bottom"
          ? to.y + to.height - 25
          : to.y + to.height / 2;
    await page.mouse.move(from.x + 30, from.y + from.height / 2);
    await page.mouse.down();
    await page.mouse.move(from.x + 40, from.y + from.height / 2, { steps: 3 });
    await page.mouse.move(x, y, { steps: 5 });
    await expect(page.locator(".workspace-drag-preview")).toBeVisible();
    const preview = page.locator(`[data-split-preview="${edge}"]`);
    await expect(preview).toBeVisible();
    const shown = (await preview.boundingBox())!;
    if (edge === "left" || edge === "right")
      expect(shown.width).toBeCloseTo((to.width - 6) / 2, 0);
    else expect(shown.height).toBeCloseTo((to.height - 6) / 2, 0);
    await page.mouse.up();
    await expect(
      page.locator(".workspace-drag-preview,.pane-drop-overlay"),
    ).toHaveCount(0);
    const actual = (await page
      .locator(".workspace-pane.active-pane")
      .boundingBox())!;
    for (const dimension of ["x", "y", "width", "height"] as const)
      expect(Math.abs(actual[dimension] - shown[dimension])).toBeLessThan(2);
  };
  await expect(
    page.getByLabel("Add split pane", { exact: true }),
  ).toHaveAttribute("data-split-axis", "horizontal");
  await splitByDrag("orders-api", 0, "right");
  await expect(page.locator(".workspace-pane")).toHaveCount(2);
  await expect(
    page.getByLabel("Add split pane", { exact: true }),
  ).toHaveAttribute("data-split-axis", "vertical");
  await splitByDrag("payments-worker", 1, "bottom");
  await expect(page.locator(".workspace-pane")).toHaveCount(3);
  const three = await paneRectangles();
  expect(three[0].x).toBeLessThan(three[1].x);
  expect(three[1].y).toBeLessThan(three[2].y);
  expect(
    Math.abs(three[0].height - three[1].height - three[2].height - 6),
  ).toBeLessThan(3);
  await splitByDrag("media-pipeline", 2, "left");
  await expect(page.locator(".workspace-pane")).toHaveCount(4);
  await expect(
    page.locator('.workspace-tab[data-entry-kind="split"]'),
  ).toHaveCount(1);
  await expect(page.locator(".workspace-tab")).toHaveCount(1);
  await expect(
    page.getByLabel("Add split pane", { exact: true }),
  ).toBeEnabled();
  const four = await paneRectangles();
  expect(four.every((rect) => rect.width > 100 && rect.height > 100)).toBe(
    true,
  );
  expect(four[2].x).toBeLessThan(four[3].x);
  expect(Math.abs(four[2].y - four[3].y)).toBeLessThan(2);
  const horizontal = page
    .getByRole("separator", { name: "Resize panes horizontally", exact: true })
    .first();
  await horizontal.click({ position: { x: 3, y: 20 } });
  await page.keyboard.press("ArrowRight");
  await expect(horizontal).toHaveAttribute("aria-valuenow", "52");
  expect(rendererErrors).toEqual([]);
  await closeNaturally();
  const saved = JSON.parse(
    await readFile(join(directory, "workspace.json"), "utf8"),
  );
  expect(saved.panes).toHaveLength(4);
  expect(saved.layout.second.second.axis).toBe("horizontal");
});

test("right clicking a selection shows those tabs in split mode", async () => {
  for (const name of ["payments-worker", "media-pipeline"]) {
    await page
      .getByRole("treeitem", { name: `/aws/lambda/${name}`, exact: true })
      .locator(".resource-label")
      .dblclick();
  }
  await page.getByRole("tab", { name: "orders-api", exact: true }).click();
  await page
    .getByRole("tab", { name: "payments-worker", exact: true })
    .click({ modifiers: ["Control"] });
  await expect(page.locator(".workspace-tab.is-selected")).toHaveCount(2);
  await page
    .getByRole("tab", { name: "orders-api", exact: true })
    .click({ button: "right" });
  await page
    .getByRole("menuitem", { name: "Show in split mode", exact: true })
    .click();
  await expect(page.locator(".workspace-pane")).toHaveCount(2);
  await expect(
    page.locator(".workspace-pane").nth(0).locator(".pane-heading"),
  ).toContainText("orders-api");
  await expect(
    page.locator(".workspace-pane").nth(1).locator(".pane-heading"),
  ).toContainText("payments-worker");
  await expect(page.locator(".workspace-tab.is-selected")).toHaveCount(0);
  expect(rendererErrors).toEqual([]);
  await closeNaturally();
});

test("trusted settings edits and final workspace changes survive a natural restart", async () => {
  await page.getByLabel("Add split pane", { exact: true }).click();
  const divider = page.getByRole("separator", {
    name: "Resize panes horizontally",
  });
  const grid = await page.locator(".pane-layout-root").boundingBox();
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
    (await page.locator(".query-status").first().textContent()) ?? "";
  await typeText(maxEvents, "25000");
  await expect(maxEvents).toHaveValue("25000");
  await page.keyboard.press("Tab");
  await expect(page.locator(".query-status").first()).toHaveText(
    loadedBeforeLimitEdit,
  );
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
  expect(saved.layout.axis).toBe("horizontal");
  expect(saved.layout.ratio).toBeCloseTo(0.6, 1);
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
