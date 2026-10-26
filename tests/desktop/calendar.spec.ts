import { openSettingsWindow } from "./settings-panel";
import { desktopExecutablePath } from "./desktop-app";
import {
  _electron as electron,
  expect,
  test,
  type ElectronApplication,
  type Locator,
  type Page,
} from "@playwright/test";
import { execFileSync } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join, resolve, sep } from "node:path";
import type { QueryUpdate, Workspace } from "../../src/shared/contracts";

test.setTimeout(45000);
let app: ElectronApplication | undefined;
let child: ReturnType<ElectronApplication["process"]> | undefined;
let page: Page;
let directory: string;
let errors: string[];
let processOutput: string[];
let closeCount = 0;
const temporaryRoot = resolve(".tmp", "desktop-calendar");
type ProbeWindow = Window & { calendarUpdates: QueryUpdate[] };

async function launch() {
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
  child = app.process();
  processOutput = [];
  child.stdout?.on("data", (data) => processOutput.push(String(data)));
  child.stderr?.on("data", (data) => processOutput.push(String(data)));
  child.on("exit", (code) =>
    processOutput.push(`child-exit ${Date.now()} ${code}`),
  );
  child.on("close", (code) =>
    processOutput.push(`child-close ${Date.now()} ${code}`),
  );
  await app.evaluate(({ app, BrowserWindow, ipcMain }) => {
    const mark = (stage: string) =>
      console.log("Calendar close probe", Date.now(), stage);
    BrowserWindow.getAllWindows()[0].on("close", () => mark("window-close"));
    BrowserWindow.getAllWindows()[0].on("closed", () => mark("window-closed"));
    ipcMain.on("explorer:close-ready", (_event, _token, success) =>
      mark(`renderer-saved:${success}`),
    );
    app.on("before-quit", () => mark("before-quit"));
    app.on("will-quit", () => mark("will-quit"));
  });
  page = await app.firstWindow();
  page.setDefaultTimeout(6000);
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Emulation.setFocusEmulationEnabled", { enabled: true });
  await cdp.send("Emulation.setTimezoneOverride", {
    timezoneId: "Europe/Madrid",
  });
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
        "Unexpected native dialog during hidden calendar verification",
      );
    };
  });
  await expect(
    page.locator('.query-status[data-query-state="complete"]'),
  ).toBeAttached();
  // Observe requests; all changes use trusted Chromium input below.
  await page.evaluate(() => {
    const probe = window as unknown as ProbeWindow;
    probe.calendarUpdates = [];
    window.explorer.onUpdate((update) => probe.calendarUpdates.push(update));
  });
}

async function closeNaturally() {
  if (!app || !child || child.exitCode !== null) return;
  const started = Date.now();
  // Match the normal Playwright event budget. Shutdown includes the renderer
  // acknowledgement, disk flush and cleanup; record those stages on failure.
  const exit = app.waitForEvent("close", { timeout: 30000 });
  const processExit = new Promise<number | null>((resolveExit) =>
    child!.once("exit", resolveExit),
  );
  try {
    await app.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()[0].close(),
    );
    await exit;
    expect(await processExit).toBe(0);
  } finally {
    await mkdir(test.info().outputDir, { recursive: true });
    await writeFile(
      test.info().outputPath(`close-${closeCount++}.json`),
      JSON.stringify(
        {
          elapsedMs: Date.now() - started,
          exitCode: child.exitCode,
          processOutput,
        },
        null,
        2,
      ),
    );
  }
}

test.beforeEach(async () => {
  await mkdir(temporaryRoot, { recursive: true });
  directory = await mkdtemp(join(temporaryRoot, "case-"));
  errors = [];
  closeCount = 0;
  await launch();
});

test.afterEach(async () => {
  try {
    await closeNaturally();
  } finally {
    if (child && child.exitCode === null) {
      if (process.platform === "win32") {
        try {
          execFileSync("taskkill", ["/PID", String(child.pid), "/T", "/F"], {
            stdio: "ignore",
          });
        } catch (error) {
          // A concurrent natural exit must not mask the original close error.
          try {
            process.kill(child.pid!, 0);
            throw error;
          } catch (probeError) {
            if ((probeError as NodeJS.ErrnoException).code !== "ESRCH")
              throw probeError;
          }
        }
      } else child.kill();
    }
  }
  expect(errors).toEqual([]);
  if (!resolve(directory).startsWith(temporaryRoot + sep + "case-"))
    throw new Error("Unsafe calendar-test cleanup path");
  await rm(directory, {
    recursive: true,
    force: true,
    maxRetries: 10,
    retryDelay: 100,
  });
});

const field = (name: string) =>
  page.getByRole("textbox", { name, exact: true });
const picker = () =>
  page.getByRole("button", { name: "Time range", exact: true });
const popover = () => page.locator(".time-range-popover");

async function openAbsolute() {
  await picker().click();
  await page.getByRole("tab", { name: "Absolute", exact: true }).click();
}

async function timezone(name: "UTC" | "Local time") {
  await page.getByRole("combobox", { name: "Timezone", exact: true }).click();
  await page.getByRole("option", { name, exact: true }).click();
}

async function requestIds() {
  return page.evaluate(() => [
    ...new Set(
      (window as unknown as ProbeWindow).calendarUpdates.map(
        (update) => update.requestId,
      ),
    ),
  ]);
}

async function expectNoRequests() {
  await page.waitForTimeout(450);
  expect(await requestIds()).toEqual([]);
}

async function savedWorkspace() {
  return JSON.parse(
    await readFile(join(directory, "workspace.json"), "utf8"),
  ) as Workspace;
}

async function visibleDays() {
  return popover()
    .getByRole("button", { name: /^\d{4}-\d{2}-\d{2}$/ })
    .evaluateAll((buttons) =>
      buttons.map((button) => button.getAttribute("aria-label")!),
    );
}

async function chooseDay(day: string) {
  await popover().getByRole("button", { name: day, exact: true }).click();
}

async function fillAbsolute(
  startDate: string,
  startTime: string,
  endDate: string,
  endTime: string,
) {
  await field("Start date").fill(startDate);
  await field("Start time").fill(startTime);
  await field("End date").fill(endDate);
  await field("End time").fill(endTime);
}

async function apply() {
  await page.getByRole("button", { name: "Apply", exact: true }).click();
  await expect(popover()).toHaveCount(0);
}

async function selectSegment(input: Locator, start: number, length: number) {
  await input.click();
  await input.press("Home");
  for (let index = 0; index < start; index++) await input.press("ArrowRight");
  for (let index = 0; index < length; index++)
    await input.press("Shift+ArrowRight");
  expect(
    await input.evaluate((element: HTMLInputElement) => [
      element.selectionStart,
      element.selectionEnd,
    ]),
  ).toEqual([start, start + length]);
}

async function pointTo(input: Locator) {
  const box = await input.boundingBox();
  expect(box).not.toBeNull();
  await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2);
}

async function captureHiddenPage(
  filename: string,
  evidenceDirectory = resolve(".tmp", "calendar-fit-final"),
) {
  const snapshot = await app!.evaluate(async ({ BrowserWindow }) => {
    const window = BrowserWindow.getAllWindows()[0];
    if (window.isVisible())
      throw new Error("Calendar capture requires a hidden window");
    const image = await window.webContents.capturePage(undefined, {
      stayHidden: true,
      stayAwake: true,
    });
    return {
      png: image.toPNG().toString("base64"),
      size: image.getSize(),
      visible: window.isVisible(),
    };
  });
  expect(snapshot.visible).toBe(false);
  expect(snapshot.size.width).toBeGreaterThan(0);
  expect(snapshot.size.height).toBeGreaterThan(0);
  const png = Buffer.from(snapshot.png, "base64");
  expect(png.length).toBeGreaterThan(8);
  await mkdir(evidenceDirectory, { recursive: true });
  await writeFile(join(evidenceDirectory, filename), png);
}

async function selectToolbarRelative(duration: string, unit: "Hours" | "Days") {
  await page
    .getByRole("button", { name: "Time range", exact: true })
    .last()
    .click();
  await page.getByRole("tab", { name: "Relative", exact: true }).click();
  await field("Duration").fill(duration);
  await page
    .getByRole("combobox", { name: "Unit of time", exact: true })
    .click();
  await page.getByRole("option", { name: unit, exact: true }).click();
  await apply();
}

async function toolbarGlyphMetrics(trigger: Locator) {
  return trigger.evaluate((button) => {
    const label = button.querySelector(".mantine-Button-label")!;
    const style = getComputedStyle(label);
    const range = document.createRange();
    range.selectNodeContents(label);
    const text = range.getBoundingClientRect();
    const clip = label.getBoundingClientRect();
    const canvas = document.createElement("canvas");
    const context = canvas.getContext("2d")!;
    context.font = `${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
    const ink = context.measureText(label.textContent!);
    const baseline = text.top + ink.fontBoundingBoxAscent;
    return {
      text: label.textContent,
      clipTop: clip.top,
      clipBottom: clip.bottom,
      clipHeight: clip.height,
      rangeTop: text.top,
      rangeBottom: text.bottom,
      rangeHeight: text.height,
      inkTop: baseline - ink.actualBoundingBoxAscent,
      inkBottom: baseline + ink.actualBoundingBoxDescent,
      fontBoundingBoxAscent: ink.fontBoundingBoxAscent,
      fontBoundingBoxDescent: ink.fontBoundingBoxDescent,
      actualBoundingBoxAscent: ink.actualBoundingBoxAscent,
      actualBoundingBoxDescent: ink.actualBoundingBoxDescent,
      font: context.font,
      lineHeight: style.lineHeight,
      textBoxTrim: style.getPropertyValue("text-box-trim"),
      overflowY: style.overflowY,
    };
  });
}

async function wheelSegment(
  name: string,
  start: number,
  length: number,
  before: string,
  after: string,
) {
  const input = field(name);
  await input.fill(before);
  await selectSegment(input, start, length);
  await pointTo(input);
  await page.mouse.wheel(0, -100);
  await expect(input).toHaveValue(after);
  expect(
    await input.evaluate((element: HTMLInputElement) => [
      element.selectionStart,
      element.selectionEnd,
    ]),
  ).toEqual([start, start + length]);
  await input.press("ArrowDown");
  await expect(input).toHaveValue(before);
  expect(
    await input.evaluate((element: HTMLInputElement) => [
      element.selectionStart,
      element.selectionEnd,
    ]),
  ).toEqual([start, start + length]);
}

test("two calendar clicks draft an inclusive range in four separate fields", async () => {
  await timezone("UTC");
  await openAbsolute();
  await expect(field("Start date")).toBeVisible();
  await expect(field("Start time")).toHaveValue("00:00:00");
  await expect(field("End date")).toBeVisible();
  await expect(field("End time")).toHaveValue("23:59:59");
  const days = popover().getByRole("button", { name: /^\d{4}-\d{2}-\d{2}$/ });
  expect(await days.count()).toBeGreaterThanOrEqual(56);
  const dates = await visibleDays();
  const start = dates[9];
  const end = dates[35];
  await chooseDay(start);
  await chooseDay(end);
  await expect(field("Start date")).toHaveValue(start.replaceAll("-", "/"));
  await expect(field("End date")).toHaveValue(end.replaceAll("-", "/"));
  await expect(field("Start time")).toHaveValue("00:00:00");
  await expect(field("End time")).toHaveValue("23:59:59");
  await expectNoRequests();
  await apply();
  await expect.poll(requestIds).toHaveLength(1);
  await expect(
    page.locator('.query-status[data-query-state="complete"]'),
  ).toBeAttached();
  await closeNaturally();
  const saved = (await savedWorkspace()).tabs.find(
    (tab) => tab.timePreset === "custom",
  )!;
  expect(saved.customStart).toBe(`${start}T00:00:00.000Z`);
  expect(saved.customEnd).toBe(`${end}T23:59:59.999Z`);
});

test("same-day and reversed calendar clicks normalize the range and month navigation works", async () => {
  await openAbsolute();
  const initial = await visibleDays();
  const day = initial[14];
  await chooseDay(day);
  await chooseDay(day);
  await expect(field("Start date")).toHaveValue(day.replaceAll("-", "/"));
  await expect(field("End date")).toHaveValue(day.replaceAll("-", "/"));
  const earlier = initial[8];
  const later = initial[20];
  await chooseDay(later);
  await chooseDay(earlier);
  await expect(field("Start date")).toHaveValue(earlier.replaceAll("-", "/"));
  await expect(field("End date")).toHaveValue(later.replaceAll("-", "/"));
  await page.getByRole("button", { name: "Next month", exact: true }).click();
  const next = await visibleDays();
  expect(next[0]).not.toBe(initial[0]);
  expect(next).toContain(initial[35]);
  await page
    .getByRole("button", { name: "Previous month", exact: true })
    .click();
  expect(await visibleDays()).toEqual(initial);
  await expectNoRequests();
});

test("focused wheel and arrow edits retain year month day hour minute and second selections", async () => {
  test.setTimeout(90000);
  await openAbsolute();
  await wheelSegment("Start date", 0, 4, "2026/05/15", "2027/05/15");
  await wheelSegment("Start date", 5, 2, "2026/05/15", "2026/06/15");
  await wheelSegment("Start date", 8, 2, "2026/05/15", "2026/05/16");
  await wheelSegment("Start time", 0, 2, "10:20:30", "11:20:30");
  await wheelSegment("Start time", 3, 2, "10:20:30", "10:21:30");
  await wheelSegment("Start time", 6, 2, "10:20:30", "10:20:31");
  const date = field("End date");
  await date.fill("2026/06/20");
  await field("Start time").click();
  await pointTo(date);
  await page.mouse.wheel(0, -100);
  await expect(date).toHaveValue("2026/06/20");
  await expectNoRequests();
});

test("Cancel Escape and outside clicks discard drafts without querying", async () => {
  const label = await picker().innerText();
  for (const dismiss of ["cancel", "escape", "outside"] as const) {
    await openAbsolute();
    await fillAbsolute("2026/05/15", "10:20:30", "2026/05/16", "11:21:31");
    await expectNoRequests();
    if (dismiss === "cancel")
      await page.getByRole("button", { name: "Cancel", exact: true }).click();
    if (dismiss === "escape") await page.keyboard.press("Escape");
    if (dismiss === "outside") {
      const box = (await popover().boundingBox())!;
      expect(box.x > 4 || box.y > 4).toBe(true);
      await page.mouse.click(4, 4);
    }
    await expect(popover()).toHaveCount(0);
    expect(await picker().innerText()).toBe(label);
    await expectNoRequests();
  }
  await openAbsolute();
  await expect(field("Start date")).not.toHaveValue("2026/05/15");
});

test("relative grid duration wheel and units apply once and restore after natural close", async () => {
  await picker().click();
  await page.getByRole("tab", { name: "Relative", exact: true }).click();
  for (const [unit, values] of [
    ["minutes", [5, 10, 15, 30, 45]],
    ["hours", [1, 2, 3, 6, 8, 12]],
    ["days", [1, 2, 3, 4, 5, 6]],
    ["weeks", [1, 2, 3, 4]],
  ] as const) {
    for (const value of values)
      await expect(
        page.getByRole("button", {
          name: `Last ${value} ${value === 1 ? unit.slice(0, -1) : unit}`,
          exact: true,
        }),
      ).toBeVisible();
  }
  await page.getByRole("button", { name: "Last 3 weeks", exact: true }).click();
  const duration = field("Duration");
  await expect(duration).toHaveValue("3");
  const unit = page.getByRole("combobox", {
    name: "Unit of time",
    exact: true,
  });
  await expect(unit).toHaveValue("Weeks");
  await duration.click();
  await pointTo(duration);
  await page.mouse.wheel(0, -100);
  await expect(duration).toHaveValue("4");
  await duration.press("ArrowDown");
  await expect(duration).toHaveValue("3");
  await unit.click();
  await page.getByRole("option", { name: "Hours", exact: true }).click();
  await pointTo(duration);
  await page.mouse.wheel(0, -100);
  await expect(duration).toHaveValue("3");
  await expectNoRequests();
  await apply();
  await expect.poll(requestIds).toHaveLength(1);
  await closeNaturally();
  expect(
    (await savedWorkspace()).tabs.some((tab) => tab.timePreset === "3h"),
  ).toBe(true);
  await launch();
  await picker().click();
  await expect(field("Duration")).toHaveValue("3");
  await expect(
    page.getByRole("combobox", { name: "Unit of time", exact: true }),
  ).toHaveValue("Hours");
});

test("UTC and local DST display changes preserve canonical instants and milliseconds", async () => {
  await timezone("UTC");
  await openAbsolute();
  await fillAbsolute("2026/10/25", "00:30:00", "2026/10/25", "03:30:00");
  await apply();
  await expect.poll(requestIds).toHaveLength(1);
  await closeNaturally();
  const seed = await savedWorkspace();
  const seededTab = seed.tabs.find((tab) => tab.timePreset === "custom")!;
  seededTab.customStart = "2026-10-25T00:30:00.123Z";
  seededTab.customEnd = "2026-10-25T03:30:00.987Z";
  await writeFile(
    join(directory, "workspace.json"),
    JSON.stringify(seed),
    "utf8",
  );
  await launch();
  await timezone("Local time");
  await openAbsolute();
  await expect(field("Start date")).toHaveValue("2026/10/25");
  await expect(field("Start time")).toHaveValue("02:30:00");
  await expect(field("End time")).toHaveValue("04:30:00");
  await apply();
  await closeNaturally();
  const saved = (await savedWorkspace()).tabs.find(
    (tab) => tab.timePreset === "custom",
  )!;
  expect(saved.customStart).toBe("2026-10-25T00:30:00.123Z");
  expect(saved.customEnd).toBe("2026-10-25T03:30:00.987Z");
});

test("relative duration enforces integer bounds with focused wheel and arrow steps", async () => {
  await picker().click();
  await page.getByRole("tab", { name: "Relative", exact: true }).click();
  const duration = field("Duration");
  await duration.fill("1");
  await duration.press("ArrowDown");
  await expect(duration).toHaveValue("1");
  await pointTo(duration);
  await page.mouse.wheel(0, 100);
  await expect(duration).toHaveValue("1");
  await duration.fill("9999");
  await duration.press("ArrowUp");
  await expect(duration).toHaveValue("9999");
  await page.mouse.wheel(0, -100);
  await expect(duration).toHaveValue("9999");
  await duration.fill("10000");
  await expect(duration).toHaveValue("1000");
  for (const invalid of ["0", "1.5", ""]) {
    await duration.fill(invalid);
    await expect(
      page.getByRole("button", { name: "Apply", exact: true }),
    ).toBeDisabled();
  }
  await duration.fill("2");
  await expect(
    page.getByRole("button", { name: "Apply", exact: true }),
  ).toBeEnabled();
  await expectNoRequests();
});

test("quick presets stay outside Custom and immediately refresh without Run", async () => {
  for (const name of [
    "Set last 1 minute",
    "Set last 5 minutes",
    "Set last 30 minutes",
    "Set last 1 hour",
    "Set last 12 hours",
    "Set last 1 day",
  ]) {
    await expect(page.getByRole("button", { name, exact: true })).toBeVisible();
  }
  await page
    .getByRole("button", { name: "Set last 5 minutes", exact: true })
    .click();
  await expect.poll(requestIds).toHaveLength(1);
  await expect(
    page.locator('.query-status[data-query-state="complete"]'),
  ).toBeAttached();
  await expect(popover()).toHaveCount(0);
  const fiveMinutes = page.getByRole("button", {
    name: "Set last 5 minutes",
    exact: true,
  });
  await expect(fiveMinutes).toHaveAttribute("aria-pressed", "true");
  await expect(fiveMinutes).toHaveAttribute("data-variant", "light");
  await expect(picker()).toHaveAttribute("aria-pressed", "false");
  await expect(picker()).toHaveText("Custom");
  const oneDay = page.getByRole("button", {
    name: "Set last 1 day",
    exact: true,
  });
  await oneDay.click();
  await expect.poll(requestIds).toHaveLength(2);
  await expect(
    page.locator('.query-status[data-query-state="complete"]'),
  ).toBeAttached();
  await expect(oneDay).toHaveAttribute("aria-pressed", "true");
  await expect(oneDay).toHaveAttribute("data-variant", "light");
  await expect(fiveMinutes).toHaveAttribute("aria-pressed", "false");
  await page
    .getByRole("button", { name: "Clear time filter", exact: true })
    .click();
  await expect.poll(requestIds).toHaveLength(3);
  await expect(
    page.locator('.query-status[data-query-state="complete"]'),
  ).toBeAttached();
});

for (const theme of ["dark", "light"] as const) {
  test(`selected relative toolbar glyphs remain visible in ${theme} theme`, async () => {
    test.setTimeout(180000);
    await openSettingsWindow(page);
    await page.getByRole("tab", { name: "Preferences", exact: true }).click();
    await page.getByRole("combobox", { name: "Theme", exact: true }).click();
    await page.getByRole("option", { name: theme, exact: true }).click();
    await page.keyboard.press("Escape");
    const selectedTemplateBackground = await page
      .getByRole("button", { name: "Clear time filter", exact: true })
      .evaluate((button) => getComputedStyle(button).backgroundColor);
    const checkGlyphs = async (state: string, unit: "Hours" | "Days") => {
      await selectToolbarRelative("2", unit);
      const trigger = page
        .getByRole("button", { name: "Time range", exact: true })
        .last();
      const metrics = await toolbarGlyphMetrics(trigger);
      await mkdir(test.info().outputDir, { recursive: true });
      await writeFile(
        test.info().outputPath(`${state}.json`),
        JSON.stringify(metrics, null, 2),
        "utf8",
      );
      await captureHiddenPage(`${state}.png`, test.info().outputDir);
      expect(
        metrics.inkTop,
        `${state} glyph ascenders above label clip: ${JSON.stringify(metrics)}`,
      ).toBeGreaterThanOrEqual(metrics.clipTop - 0.1);
      expect(
        metrics.inkBottom,
        `${state} glyph descenders below label clip: ${JSON.stringify(metrics)}`,
      ).toBeLessThanOrEqual(metrics.clipBottom + 0.1);
      await expect(trigger).toHaveAttribute("aria-pressed", "true");
      await expect(trigger).toHaveAttribute("data-variant", "light");
      expect(
        await trigger.evaluate(
          (button) => getComputedStyle(button).backgroundColor,
        ),
      ).toBe(selectedTemplateBackground);
    };
    await checkGlyphs("normal-hours", "Hours");
    await checkGlyphs("normal-days", "Days");
    await page
      .getByRole("treeitem", {
        name: "/aws/lambda/payments-worker",
        exact: true,
      })
      .locator(".resource-label")
      .dblclick();
    await page.setViewportSize({ width: 940, height: 760 });
    await page.getByLabel("Split pane", { exact: true }).click();
    await expect(page.locator(".workspace-pane")).toHaveCount(2);
    await checkGlyphs("narrow-hours", "Hours");
    await checkGlyphs("narrow-days", "Days");
  });
}

test("absolute ranges keep Clear visible on the left and clearing refreshes immediately", async () => {
  await page.setViewportSize({ width: 940, height: 760 });
  await openAbsolute();
  const dates = await visibleDays();
  await chooseDay(dates[9]);
  await chooseDay(dates[14]);
  await apply();
  await expect.poll(requestIds).toHaveLength(1);
  const clear = page.getByRole("button", {
    name: "Clear time filter",
    exact: true,
  });
  await expect(clear).toBeInViewport();
  await expect(picker()).toHaveAttribute("aria-pressed", "true");
  await expect(picker()).toHaveAttribute("data-variant", "light");
  const clearBox = (await clear.boundingBox())!;
  const triggerBox = (await picker().boundingBox())!;
  expect(clearBox.x + clearBox.width).toBeLessThanOrEqual(triggerBox.x + 1);
  await clear.click();
  await expect.poll(requestIds).toHaveLength(2);
  await expect(
    page.locator('.query-status[data-query-state="complete"]'),
  ).toBeAttached();
  await expect(clear).toHaveAttribute("aria-pressed", "true");
  await expect(picker()).toHaveAttribute("aria-pressed", "false");
  await expect(picker()).toHaveText("Custom");
});

test("Custom popover fits normal and narrow panes in both themes", async () => {
  test.setTimeout(120000);
  const assertTriggerCentered = async (trigger: Locator, state: string) => {
    const metrics = await trigger.evaluate((button) => {
      const label = button.querySelector(".mantine-Button-label")!;
      const range = document.createRange();
      range.selectNodeContents(label);
      const text = range.getBoundingClientRect();
      const box = button.getBoundingClientRect();
      const labelBox = label.getBoundingClientRect();
      const style = getComputedStyle(label);
      return {
        buttonHeight: box.height,
        labelHeight: labelBox.height,
        textHeight: text.height,
        buttonCenter: box.y + box.height / 2,
        textCenter: text.y + text.height / 2,
        offset: text.y + text.height / 2 - (box.y + box.height / 2),
        display: style.display,
        height: style.height,
        lineHeight: style.lineHeight,
        alignItems: style.alignItems,
      };
    });
    const evidenceDirectory = test.info().outputDir;
    await mkdir(evidenceDirectory, { recursive: true });
    await writeFile(
      join(evidenceDirectory, `trigger-${state}.json`),
      JSON.stringify(metrics, null, 2),
      "utf8",
    );
    expect(
      Math.abs(metrics.offset),
      `Trigger text vertical offset: ${JSON.stringify(metrics)}`,
    ).toBeLessThanOrEqual(3);
  };
  await assertTriggerCentered(picker(), "initial");
  const chooseTheme = async (theme: "dark" | "light") => {
    await openSettingsWindow(page);
    await page.getByRole("tab", { name: "Preferences", exact: true }).click();
    await page.getByRole("combobox", { name: "Theme", exact: true }).click();
    await page.getByRole("option", { name: theme, exact: true }).click();
    await page.keyboard.press("Escape");
    await expect(
      page.getByRole("dialog", { name: "Workspace settings", exact: true }),
    ).toHaveCount(0);
  };
  const assertFit = async () => {
    const box = await popover().boundingBox();
    const viewport = await page.evaluate(() => ({
      width: innerWidth,
      height: innerHeight,
    }));
    expect(box).not.toBeNull();
    expect(box!.x).toBeGreaterThanOrEqual(0);
    expect(box!.y).toBeGreaterThanOrEqual(0);
    expect(box!.x + box!.width).toBeLessThanOrEqual(viewport.width + 1);
    expect(box!.y + box!.height).toBeLessThanOrEqual(viewport.height + 1);
    expect(
      await popover().evaluate(
        (element) => element.scrollWidth <= element.clientWidth + 1,
      ),
    ).toBe(true);
    await expect(field("Start date")).toBeInViewport();
    await expect(field("End time")).toBeInViewport();
    await expect(
      page.getByRole("button", { name: "Apply", exact: true }),
    ).toBeInViewport();
  };
  for (const theme of ["dark", "light"] as const) {
    await chooseTheme(theme);
    await assertTriggerCentered(picker(), `normal-${theme}`);
    await openAbsolute();
    await assertFit();
    if (theme === "dark") {
      await captureHiddenPage("absolute-dark.png");
      await page.getByRole("tab", { name: "Relative", exact: true }).click();
      await captureHiddenPage("relative-dark.png");
    }
    await page.keyboard.press("Escape");
  }
  await page
    .getByRole("treeitem", { name: "/aws/lambda/payments-worker", exact: true })
    .locator(".resource-label")
    .dblclick();
  await page.setViewportSize({ width: 940, height: 760 });
  await page.getByLabel("Split pane", { exact: true }).click();
  await expect(page.locator(".workspace-pane")).toHaveCount(2);
  for (const theme of ["dark", "light"] as const) {
    await chooseTheme(theme);
    const trigger = page
      .getByRole("button", { name: "Time range", exact: true })
      .last();
    await assertTriggerCentered(trigger, `narrow-${theme}`);
    await trigger.click();
    await page.getByRole("tab", { name: "Absolute", exact: true }).click();
    await assertFit();
    await page.keyboard.press("Escape");
  }
});
