import { openSettingsWindow } from "./settings-panel";
import {
  _electron as electron,
  expect,
  test,
  type ElectronApplication,
  type Page,
} from "@playwright/test";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { join, resolve, sep } from "node:path";
import type {
  LogEvent,
  QueryRequest,
  QueryUpdate,
} from "../../src/shared/contracts";
import { createWorkspace } from "../../src/renderer/workspace";
import { desktopExecutablePath } from "./desktop-app";

test.setTimeout(45000);
const temporaryRoot = resolve(".tmp", "desktop-event-feedback");
let directory: string;
let app: ElectronApplication | undefined;
let page: Page;
let errors: string[];
type MainProbe = typeof globalThis & {
  feedbackRequests: QueryRequest[];
  feedbackPending: Map<string, () => void>;
};

test.beforeEach(async ({}, info) => {
  await mkdir(temporaryRoot, { recursive: true });
  directory = await mkdtemp(join(temporaryRoot, "case-"));
  errors = [];
  app = undefined;
  const workspace = createWorkspace();
  workspace.preferences.theme = info.title.includes("dark") ? "dark" : "light";
  workspace.sidebarVisible = false;
  workspace.preferences.timezone = "utc";
  workspace.tabs[0].timePreset = info.title.includes("loads continuation at the bottom") ? "1h" : "clear";
  workspace.tabs[0].filterPattern = "";
  workspace.tabs[0].view.mode = "table";
  workspace.tabs[0].view.wrap = false;
  workspace.tabs[0].view.localSearch = "";
  await writeFile(join(directory, "workspace.json"), JSON.stringify(workspace));
  const env: Record<string, string> = {};
  for (const name of ["PATH", "SystemRoot", "WINDIR", "TEMP", "TMP", "COMSPEC"])
    if (process.env[name]) env[name] = process.env[name]!;
  Object.assign(env, {
    EXPLORER_TEST_USER_DATA: directory,
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
  page = await app.firstWindow();
  page.setDefaultTimeout(6000);
  page.on("pageerror", (error) => errors.push(error.message));
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Emulation.setFocusEmulationEnabled", { enabled: true });
  await cdp.send("Emulation.setTimezoneOverride", {
    timezoneId: "Europe/Madrid",
  });
  await page.setViewportSize({ width: 1150, height: 820 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  const environment = await page.evaluate(() => window.explorer.environment());
  expect(environment.awsEnabled).toBe(false);
  expect(environment.canEnableAws).toBe(false);
  expect(
    await app.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows().every((window) => !window.isVisible()),
    ),
  ).toBe(true);
  await app.evaluate(({ dialog }) => {
    dialog.showMessageBox = async () => {
      throw new Error(
        "Unexpected native dialog during hidden event-feedback verification",
      );
    };
  });
  await expect(page.locator(".query-status")).toHaveAttribute(
    "data-query-state",
    "complete",
  );
  // Replace only this isolated application's query transport. Rendering, query
  // generations, update subscription and continuation remain production code.
  await app.evaluate(({ ipcMain, BrowserWindow }) => {
    const probe = globalThis as MainProbe;
    probe.feedbackRequests = [];
    probe.feedbackPending = new Map();
    const contents = BrowserWindow.getAllWindows()[0].webContents;
    ipcMain.removeHandler("explorer:query");
    ipcMain.handle("explorer:query", (event, request: QueryRequest) => {
      if (
        event.sender !== contents ||
        event.senderFrame !== contents.mainFrame ||
        request.connection.mode !== "offline"
      )
        throw new Error(
          "Feedback test accepts only its trusted offline renderer",
        );
      probe.feedbackRequests.push(request);
      return new Promise<void>((done) =>
        probe.feedbackPending.set(request.requestId, done),
      );
    });
  });
});

test.afterEach(async () => {
  if (app && app.process().exitCode === null) {
    const closed = app.waitForEvent("close", { timeout: 7000 });
    const exited = new Promise<number | null>((done) =>
      app!.process().once("exit", done),
    );
    await app.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()[0].close(),
    );
    await closed;
    expect(await exited).toBe(0);
  }
  expect(errors).toEqual([]);
  if (!resolve(directory).startsWith(temporaryRoot + sep + "case-"))
    throw new Error("Unsafe event-feedback cleanup path");
  await rm(directory, {
    recursive: true,
    force: true,
    maxRetries: 10,
    retryDelay: 100,
  });
});

const viewer = () => page.locator(".viewer-scroll");
const status = () => page.locator(".query-status");
async function requests() {
  return app!.evaluate(() => (globalThis as MainProbe).feedbackRequests);
}
async function send(
  index: number,
  update: Omit<QueryUpdate, "requestId">,
  finish = false,
) {
  await app!.evaluate(
    ({ BrowserWindow }, payload) => {
      const probe = globalThis as MainProbe;
      const requestId = probe.feedbackRequests[payload.index].requestId;
      BrowserWindow.getAllWindows()[0].webContents.send("explorer:update", {
        ...payload.update,
        requestId,
      });
      if (payload.finish) {
        probe.feedbackPending.get(requestId)?.();
        probe.feedbackPending.delete(requestId);
      }
    },
    { index, update, finish },
  );
}
async function capture(filename: string) {
  // Hidden windows can retain the last compositor surface. A native capture
  // requests a frame without showing the window; discard the warm-up captures.
  let png = "";
  for (let frame = 0; frame < 3; frame++) {
    await page.evaluate(
      () =>
        new Promise<void>((resolve) => {
          requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
        }),
    );
    png = await app!.evaluate(async ({ BrowserWindow }) => {
      const window = BrowserWindow.getAllWindows()[0];
      if (window.isVisible())
        throw new Error("Feedback verification became visible");
      const image = await window.webContents.capturePage(undefined, {
        stayHidden: true,
        stayAwake: true,
      });
      if (window.isVisible())
        throw new Error("Feedback capture changed visibility");
      return image.toPNG().toString("base64");
    });
  }
  const output = resolve(test.info().outputPath(filename));
  if (!output.startsWith(resolve(".tmp") + sep))
    throw new Error("Feedback evidence must remain under .tmp");
  await mkdir(test.info().outputDir, { recursive: true });
  await writeFile(output, Buffer.from(png, "base64"));
}
async function assertBottomStatus() {
  await expect(status()).toHaveCount(1);
  const positions = await page.locator(".log-viewer").evaluate((element) => {
    const scroll = element
      .querySelector(".viewer-scroll")!
      .getBoundingClientRect();
    const status = element
      .querySelector(".query-status")!
      .getBoundingClientRect();
    return {
      viewerBottom: scroll.bottom,
      statusTop: status.top,
      statusBottom: status.bottom,
      panelBottom: element.getBoundingClientRect().bottom,
    };
  });
  expect(positions.statusTop).toBeGreaterThanOrEqual(
    positions.viewerBottom - 1,
  );
  expect(positions.statusBottom).toBeLessThanOrEqual(positions.panelBottom + 1);
}

for (const theme of ["light", "dark"])
  test(`${theme} AWS filter modes compile Enter queries, complete keywords and keep a stable badge`, async () => {
    const input = page.getByRole("combobox", {
      name: "CloudWatch filter pattern",
      exact: true,
    });
    const mode = page.getByRole("button", { name: /^Filter mode:/ });
    const initialWidth = (await mode.boundingBox())!.width;
    const selectMode = async (name: string) => {
      await mode.click();
      await page.getByRole("menuitem", { name, exact: true }).click();
    };
    await selectMode("Text");
    await input.fill('"mediaId"');
    await input.press("Enter");
    await expect.poll(async () => (await requests()).length).toBe(1);
    expect((await requests())[0].filterPattern).toBe(
      JSON.stringify('"mediaId"'),
    );
    await expect(input).toHaveValue('"mediaId"');
    await send(0, { state: "complete", events: [] }, true);
    await selectMode("Pattern");
    await input.fill("{ $.missing N");
    await expect(
      page.getByRole("listbox", { name: "AWS pattern suggestions" }),
    ).toBeVisible();
    await input.press("Tab");
    await expect(input).toHaveValue("{ $.missing NOT EXISTS ");
    await input.press("End");
    await page.keyboard.insertText("}");
    await expect(page.locator(".aws-token-keyword")).toHaveText("NOT EXISTS");
    await input.press("Enter");
    await expect.poll(async () => (await requests()).length).toBe(2);
    expect((await requests())[1].filterPattern).toBe(
      "{ $.missing NOT EXISTS }",
    );
    await send(1, { state: "complete", events: [] }, true);
    await selectMode("Auto");
    await input.fill("ordinary text");
    await expect(mode).toContainText("A:TXT");
    await input.fill("{ $.message = %error|failed% && $.nil IS NULL }");
    await expect(mode).toContainText("A:PAT");
    expect((await mode.boundingBox())!.width).toBe(initialWidth);
    await expect(page.locator(".server-filter-paint")).toHaveText(
      await input.inputValue(),
    );
    const paint = await page
      .locator(".server-filter-control")
      .evaluate((element) => ({
        input: getComputedStyle(element.querySelector("input")!).color,
        colors: [...element.querySelectorAll(".server-filter-paint span")].map(
          (token) => getComputedStyle(token).color,
        ),
      }));
    await test.info().attach("filter-colors", {
      body: JSON.stringify(paint),
      contentType: "application/json",
    });
    expect(new Set(paint.colors).size).toBeGreaterThan(2);
    expect(paint.input).toBe("rgba(0, 0, 0, 0)");
    await capture(`aws-filter-${theme}.png`);
    await input.fill("%error|failed%");
    await input.press("Enter");
    await expect.poll(async () => (await requests()).length).toBe(3);
    expect((await requests())[2].filterPattern).toBe("%error|failed%");
    await send(2, { state: "complete", events: [] }, true);
    await assertBottomStatus();
  });

test("event viewer centers initial loading, loads continuation at the bottom and reports one count with accurate numeric timestamps", async () => {
  await page.getByTestId("run-query").click();
  await expect.poll(async () => (await requests()).length).toBe(1);
  await expect(status()).toHaveAttribute("data-query-state", "queued");
  const initial = page.locator('.event-loading[data-loading-position="empty"]');
  await expect(initial).toBeVisible();
  await expect(page.locator(".event-loading")).toHaveCount(1);
  await expect(page.locator(".virtual-event")).toHaveCount(0);
  await expect(
    page.getByText("Ready to investigate", { exact: true }),
  ).toHaveCount(0);
  const area = (await viewer().boundingBox())!;
  const spinner = (await initial
    .locator(".event-loading-spinner")
    .boundingBox())!;
  expect(
    Math.abs(spinner.x + spinner.width / 2 - area.x - area.width / 2),
  ).toBeLessThanOrEqual(2);
  expect(
    Math.abs(spinner.y + spinner.height / 2 - area.y - area.height / 2),
  ).toBeLessThanOrEqual(2);
  await assertBottomStatus();
  await capture("initial-loading.png");

  const summer = Date.parse("2026-07-15T10:20:30.123Z");
  const events: LogEvent[] = Array.from({ length: 120 }, (_, index) => ({
    id: `feedback-${index}`,
    timestamp: summer - index * 1000,
    logGroup: "/aws/lambda/orders-api",
    logStream: "feedback-stream",
    message: index === 0 ? "anchor summer" : `Payload event ${index}`,
  }));
  await send(
    0,
    { state: "complete", events, replace: true, cursor: "feedback-next-page" },
    true,
  );
  await expect(status()).toHaveAttribute("data-query-state", "complete");
  await expect(status()).toHaveText("120 loaded");
  await expect(page.locator(".event-loading")).toHaveCount(0);
  expect((await requests()).length).toBe(1);
  expect(
    await viewer().evaluate(
      (element) => element.scrollHeight > element.clientHeight + 500,
    ),
  ).toBe(true);
  await viewer().hover();
  await page.mouse.wheel(0, 20000);
  await expect.poll(async () => (await requests()).length).toBe(2);
  expect((await requests())[1].cursor).toBe("feedback-next-page");
  const more = page.locator('.event-loading[data-loading-position="more"]');
  await expect(more).toBeVisible();
  await expect(more).toBeInViewport();
  await expect(initial).toHaveCount(0);
  await expect(page.locator(".event-loading")).toHaveCount(1);
  await expect(status()).toContainText("120 loaded");
  const bottom = await more.evaluate((element) => ({
    top: element.getBoundingClientRect().top,
    precedingBottom:
      element.previousElementSibling!.getBoundingClientRect().bottom,
  }));
  expect(bottom.top).toBeGreaterThanOrEqual(bottom.precedingBottom - 1);
  await assertBottomStatus();
  await capture("continuation-loading.png");

  await send(
    1,
    {
      state: "complete",
      events: [
        {
          id: "feedback-winter",
          timestamp: Date.parse("2026-01-15T10:20:30.123Z"),
          message: "anchor winter",
          logGroup: "/aws/lambda/orders-api",
          logStream: "feedback-stream",
        },
      ],
    },
    true,
  );
  await expect(status()).toHaveText("121 loaded");
  await expect(page.locator(".event-loading")).toHaveCount(0);
  await page
    .getByRole("textbox", { name: "Local filter loaded events", exact: true })
    .fill("anchor");
  await expect(status()).toHaveText("2 shown / 121 loaded");
  await expect(page.locator(".virtual-event")).toHaveCount(2);
  const summerTime = page.locator(
    '[data-event-id="feedback-0"] .event-timestamp',
  );
  const winterTime = page.locator(
    '[data-event-id="feedback-winter"] .event-timestamp',
  );
  await expect(summerTime).toHaveText("2026-07-15 10:20:30.123 UTC");
  await expect(winterTime).toHaveText("2026-01-15 10:20:30.123 UTC");
  await openSettingsWindow(page);
  await page.getByRole("tab", { name: "Preferences", exact: true }).click();
  await page
    .getByRole("combobox", { name: "Timestamp display", exact: true })
    .click();
  await page.getByRole("option", { name: "Local time", exact: true }).click();
  await page.keyboard.press("Escape");
  await expect(summerTime).toHaveText("2026-07-15 12:20:30.123 UTC+02:00");
  await expect(winterTime).toHaveText("2026-01-15 11:20:30.123 UTC+01:00");
  await expect(
    page.locator(".viewer-footer,.viewer-meta,.local-indicator"),
  ).toHaveCount(0);
  await expect(
    page.locator(".log-viewer").getByText("LOCAL", { exact: true }),
  ).toHaveCount(0);
  await expect(status()).not.toContainText(/complete|queued|running/i);
  expect(
    (await page.locator(".log-viewer").innerText()).match(/121 loaded/g),
  ).toHaveLength(1);
  expect((await requests()).length).toBe(2);
  await assertBottomStatus();
});

test("Recent shows the older-page spinner below the header and keeps the existing rows in view", async () => {
  await page.getByTestId("run-query").click();
  await expect.poll(async () => (await requests()).length).toBe(1);
  const events: LogEvent[] = Array.from({ length: 120 }, (_, index) => ({
    id: `recent-${index}`, timestamp: 2_000_000 + index * 1000,
    logGroup: "/aws/lambda/orders-api", logStream: "feedback-stream", message: `Event ${index}`,
  }));
  await send(0, { state: "complete", events, replace: true, cursor: "older" }, true);
  await expect(status()).toHaveAttribute("data-query-state", "complete");
  await viewer().hover();
  await page.mouse.wheel(0, -20000);
  await expect.poll(async () => (await requests()).length).toBe(2);
  const indicator = page.locator('.event-loading[data-loading-position="older"]');
  await expect(indicator).toBeVisible();
  const header = page.locator(".log-table-header");
  const headerBox = await header.boundingBox();
  const indicatorBox = await indicator.boundingBox();
  expect(headerBox).not.toBeNull();
  expect(indicatorBox!.y).toBeGreaterThanOrEqual(headerBox!.y + headerBox!.height - 1);
  const oldFirst = page.locator('.virtual-event[data-event-id="recent-0"]');
  await expect(oldFirst).toBeVisible();
  const older = Array.from({ length: 20 }, (_, index) => ({ ...events[0], id: `older-${index}`, timestamp: 1_000_000 + index * 1000 }));
  await send(1, { state: "running", events: older.slice(10) });
  await expect(oldFirst).toBeVisible();
  await send(1, { state: "complete", events: older.slice(0, 10), cursor: "older-2" }, true);
  await expect(indicator).toHaveCount(0);
  await expect(oldFirst).toBeVisible();
});
