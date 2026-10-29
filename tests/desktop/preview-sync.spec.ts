import {
  _electron as electron,
  expect,
  test,
  type ElectronApplication,
  type Page,
  type Locator,
} from "@playwright/test";
import { execFileSync } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { join, resolve, sep } from "node:path";
import { createWorkspace } from "../../src/renderer/workspace";
import { desktopExecutablePath } from "./desktop-app";
import { openSettingsWindow } from "./settings-panel";

test.setTimeout(120000);
let app: ElectronApplication | undefined;
let child: ReturnType<ElectronApplication["process"]> | undefined;
let page: Page;
let directory: string;
let errors: string[];
const temporaryRoot = resolve(".tmp", "desktop-preview-sync");

test.beforeEach(async ({}, testInfo) => {
  await mkdir(temporaryRoot, { recursive: true });
  directory = await mkdtemp(join(temporaryRoot, "case-"));
  errors = [];
  const workspace = createWorkspace();
  workspace.preferences.theme = "dark";
  workspace.tabs[0].filterPattern = "";
  workspace.tabs[0].view.mode = "hybrid";
  if (testInfo.title.startsWith("expanded content"))
    workspace.tabs[0].view.localSearch = "A long structured payload";
  workspace.tabs[0].view.columns = [
    { path: "@timestamp", width: 210 },
    { path: "@message", width: 900 },
  ];
  workspace.preferences.highlightProfiles = [
    {
      id: "preview",
      name: "Preview",
      enabled: true,
      groupPattern: "",
      groupIgnoreCase: false,
      rules: [
        {
          id: "rule",
          enabled: true,
          scope: "text",
          path: "",
          pattern: "ERROR",
          ignoreCase: false,
          target: "row",
          colors: { background: "#fef08a" },
          separateThemeColors: false,
        },
      ],
    },
  ];
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
  child = app.process();
  page = await app.firstWindow();
  page.setDefaultTimeout(6000);
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Emulation.setFocusEmulationEnabled", { enabled: true });
  await page.emulateMedia({ reducedMotion: "reduce" });
  page.on("pageerror", (error) => errors.push(error.message));
  expect(
    await app.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()[0].isVisible(),
    ),
  ).toBe(false);
  await expect(page.locator(".virtual-event").nth(1)).toBeVisible();
  await openSettingsWindow(page);
  await page
    .getByRole("dialog", { name: "Settings", exact: true })
    .getByRole("tab", { name: "Highlights", exact: true })
    .click();
  await page.getByRole("button", { name: "Preview", exact: true }).click();
});

const theme = (name: "Light" | "Dark") =>
  page.getByRole("region", { name: `${name} preview`, exact: true });
const selected = (region: Locator) =>
  region
    .locator('.virtual-event[aria-selected="true"]')
    .evaluateAll((rows) =>
      rows.map((row) => row.getAttribute("data-event-id")),
    );
const scroll = (region: Locator) =>
  region.locator(".viewer-scroll").evaluate((element) => ({
    top: element.scrollTop,
    left: element.scrollLeft,
  }));

test("hybrid preview synchronizes scrolling, modifier selection and structured folds while retaining edits", async () => {
  const light = theme("Light"),
    dark = theme("Dark");
  await expect(light.locator(".virtual-event").nth(1)).toBeVisible();
  await light
    .locator(".viewer-scroll")
    .evaluate((element) => element.scrollTo({ top: 450, left: 180 }));
  await expect.poll(() => scroll(light)).toEqual({ top: 450, left: 180 });
  await expect.poll(() => scroll(dark)).toEqual({ top: 450, left: 180 });
  await dark
    .locator(".viewer-scroll")
    .evaluate((element) => element.scrollTo({ top: 170, left: 250 }));
  await expect.poll(() => scroll(light)).toEqual({ top: 170, left: 250 });
  await light
    .locator(".viewer-scroll")
    .evaluate((element) => element.scrollTo({ top: 0, left: 0 }));
  await expect.poll(() => scroll(dark)).toEqual({ top: 0, left: 0 });
  const rows = light.locator(".virtual-event");
  const ids = await rows.evaluateAll((elements) =>
    elements
      .slice(1, 5)
      .map((element) => element.getAttribute("data-event-id")!),
  );
  const row = (region: Locator, id: string) =>
    region.locator(".virtual-event").filter({
      has: page.locator(`.inspect-cell[aria-label="Select event ${id}"]`),
    });
  await row(light, ids[0]).locator(".log-cell").first().click();
  await expect.poll(() => selected(dark)).toEqual([ids[0]]);
  const selectedColor = await row(light, ids[0]).evaluate(
    (element) => getComputedStyle(element).backgroundColor,
  );
  const plainColor = await row(light, ids[1]).evaluate(
    (element) => getComputedStyle(element).backgroundColor,
  );
  expect(selectedColor).not.toBe(plainColor);
  await row(dark, ids[1])
    .locator(".log-cell")
    .first()
    .click({ modifiers: ["Control"] });
  await expect.poll(() => selected(light)).toEqual([ids[0], ids[1]]);
  await row(light, ids[3])
    .locator(".log-cell")
    .first()
    .click({ modifiers: ["Shift"] });
  await expect.poll(() => selected(dark)).toEqual([ids[1], ids[2], ids[3]]);
  const structured = light
    .locator(".virtual-event")
    .filter({ hasText: "Request processed" })
    .first();
  const id = await structured.getAttribute("data-event-id");
  const counterpart = row(dark, id!);
  await structured
    .getByRole("button", { name: "Expand event details", exact: true })
    .click();
  await expect(
    counterpart.getByRole("button", {
      name: "Collapse event details",
      exact: true,
    }),
  ).toBeVisible();
  await structured
    .getByRole("button", { name: "Expand /service", exact: true })
    .click();
  await expect(
    counterpart.locator('[data-json-path="/service/name"]'),
  ).toBeVisible();
  await counterpart
    .getByRole("button", { name: "Collapse /service", exact: true })
    .click();
  await expect(
    structured.locator('[data-json-path="/service/name"]'),
  ).toHaveCount(0);
  const before = await selected(light);
  const ruleList = page
    .getByRole("tabpanel", { name: "Highlights", exact: true })
    .locator(".highlight-rule-list");
  const expandRule = ruleList.getByRole("button", {
    name: "Expand rule 1",
    exact: true,
  });
  if (await expandRule.isVisible()) await expandRule.click();
  await ruleList
    .getByRole("button", { name: "Edit rule 1", exact: true })
    .first()
    .click();
  await page.getByLabel("Match regex", { exact: true }).fill("WARN|ERROR");
  await page.getByRole("button", { name: "Save rule", exact: true }).click();
  await expect.poll(() => selected(dark)).toEqual(before);
  await expect(
    structured.getByRole("button", {
      name: "Collapse event details",
      exact: true,
    }),
  ).toBeVisible();
  await counterpart
    .getByRole("button", { name: "Expand /service", exact: true })
    .click();
  await expect(
    structured.locator('[data-json-path="/service/name"]'),
  ).toBeVisible();
  await counterpart
    .getByRole("button", { name: "Collapse event details", exact: true })
    .click();
  await expect(
    structured.getByRole("button", {
      name: "Expand event details",
      exact: true,
    }),
  ).toBeVisible();
  await structured
    .getByRole("button", { name: "Expand event details", exact: true })
    .click();
  await expect(
    counterpart.locator('[data-json-path="/service/name"]'),
  ).toBeVisible();
  expect(
    await page.locator("html").getAttribute("data-mantine-color-scheme"),
  ).toBe("dark");
});

test("expanded content mirrors inner scrolling and chosen heights while profile edits retain positions", async () => {
  const light = theme("Light"),
    dark = theme("Dark");
  const lightRow = light.locator(".virtual-event").first();
  const id = await lightRow.getAttribute("data-event-id");
  const darkRow = dark.locator(".virtual-event").filter({
    has: page.locator(`.inspect-cell[aria-label="Select event ${id}"]`),
  });
  await lightRow
    .getByRole("button", { name: "Expand event details", exact: true })
    .click();
  const lightContent = lightRow.getByRole("region", {
    name: "Expanded event content",
    exact: true,
  });
  const darkContent = darkRow.getByRole("region", {
    name: "Expanded event content",
    exact: true,
  });
  const position = (content: Locator) =>
    content.evaluate((element) => ({
      top: element.scrollTop,
      left: element.scrollLeft,
    }));
  await expect(darkContent).toBeVisible();
  await lightRow
    .getByRole("button", { name: "Expand /service", exact: true })
    .click();
  await lightRow
    .getByRole("button", { name: "Expand /request", exact: true })
    .click();
  await lightContent.evaluate((element) =>
    element.scrollTo({ top: 60, left: 180 }),
  );
  await expect
    .poll(() => position(lightContent))
    .toEqual({ top: 60, left: 180 });
  await expect
    .poll(() => position(darkContent))
    .toEqual({ top: 60, left: 180 });
  await darkContent.evaluate((element) =>
    element.scrollTo({ top: 20, left: 250 }),
  );
  await expect
    .poll(() => position(lightContent))
    .toEqual({ top: 20, left: 250 });
  const lightResize = lightRow.getByRole("separator", {
    name: "Resize expanded event",
    exact: true,
  });
  const darkResize = darkRow.getByRole("separator", {
    name: "Resize expanded event",
    exact: true,
  });
  await lightResize.press("ArrowDown");
  await expect(lightContent).toHaveCSS("height", "265px");
  await expect(darkContent).toHaveCSS("height", "265px");
  await darkResize.press("ArrowUp");
  await expect(lightContent).toHaveCSS("height", "245px");
  await expect(darkContent).toHaveCSS("height", "245px");
  await lightContent.evaluate((element) =>
    element.scrollTo({ top: 60, left: 180 }),
  );
  await expect
    .poll(() => position(darkContent))
    .toEqual({ top: 60, left: 180 });
  const ruleList = page
    .getByRole("tabpanel", { name: "Highlights", exact: true })
    .locator(".highlight-rule-list");
  const expandRule = ruleList.getByRole("button", {
    name: "Expand rule 1",
    exact: true,
  });
  if (await expandRule.isVisible()) await expandRule.click();
  await ruleList
    .getByRole("button", { name: "Edit rule 1", exact: true })
    .first()
    .click();
  await page.getByLabel("Match regex", { exact: true }).fill("WARN|ERROR");
  await page.getByRole("button", { name: "Save rule", exact: true }).click();
  await expect
    .poll(() => position(lightContent))
    .toEqual({ top: 60, left: 180 });
  await expect
    .poll(() => position(darkContent))
    .toEqual({ top: 60, left: 180 });
  await darkResize.press("Home");
  await expect(lightContent).toHaveCSS("height", "245px");
  await expect(darkContent).toHaveCSS("height", "245px");
});

test("narrow stacked previews settle at both scroll limits and reverse without feedback", async () => {
  await app!.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows()[0].setSize(1240, 1100, false),
  );
  await expect
    .poll(() =>
      page.evaluate(() => ({
        width: window.innerWidth,
        height: window.innerHeight,
      })),
    )
    .toEqual({ width: 1240, height: 1100 });
  await page.evaluate(
    () =>
      new Promise<void>((done) =>
        requestAnimationFrame(() => requestAnimationFrame(() => done())),
      ),
  );
  const dialog = page.getByRole("dialog", { name: "Settings", exact: true });
  const frame = (await dialog.boundingBox())!;
  const grip = (await page
    .getByRole("button", { name: "Resize Settings window", exact: true })
    .boundingBox())!;
  await page.mouse.move(grip.x + grip.width / 2, grip.y + grip.height / 2);
  await page.mouse.down();
  await page.mouse.move(
    grip.x + grip.width / 2 + 740 - frame.width,
    grip.y + grip.height / 2 + 940 - frame.height,
    { steps: 8 },
  );
  await page.mouse.up();
  await expect
    .poll(async () => Math.round((await dialog.boundingBox())!.width))
    .toBe(740);
  const light = theme("Light"),
    dark = theme("Dark");
  const lightBox = (await light.boundingBox())!,
    darkBox = (await dark.boundingBox())!;
  expect(darkBox.y).toBeGreaterThanOrEqual(lightBox.y + lightBox.height - 1);
  const count = Number(
    await light.locator(".viewer-scroll").getAttribute("aria-rowcount"),
  );
  await light.locator(".viewer-scroll").evaluate((element) =>
    element.scrollTo({
      top: element.scrollHeight,
      left: element.scrollWidth,
    }),
  );
  const state = () =>
    page
      .getByRole("tabpanel", { name: "Highlights", exact: true })
      .locator(".highlight-events-theme .viewer-scroll")
      .evaluateAll((elements) =>
        elements.map((element) => ({
          top: element.scrollTop,
          left: element.scrollLeft,
          bottom: element.scrollHeight - element.clientHeight,
          right: element.scrollWidth - element.clientWidth,
        })),
      );
  await expect
    .poll(async () => {
      const [a, b] = await state();
      return (
        Math.abs(a.top - b.top) <= 1 &&
        Math.abs(a.left - b.left) <= 1 &&
        [a, b].every(
          (position) =>
            Math.abs(position.top - position.bottom) <= 1 &&
            Math.abs(position.left - position.right) <= 1,
        )
      );
    })
    .toBe(true);
  for (const region of [light, dark])
    await expect(
      region.locator(`.virtual-event[data-index="${count - 1}"]`),
    ).toBeVisible();
  const samples = await page.evaluate(async () => {
    const positions: { top: number; left: number }[][] = [];
    for (let index = 0; index < 12; index++) {
      await new Promise<void>((done) => requestAnimationFrame(() => done()));
      positions.push(
        Array.from(
          document.querySelectorAll(".highlight-events-theme .viewer-scroll"),
          (element) => ({ top: element.scrollTop, left: element.scrollLeft }),
        ),
      );
    }
    return positions;
  });
  for (const sample of samples) expect(sample).toEqual(samples[0]);
  await dark
    .locator(".viewer-scroll")
    .evaluate((element) => element.scrollTo({ top: 17, left: 29 }));
  await expect
    .poll(async () => {
      const [a, b] = await state();
      return [a, b].every(
        (position) =>
          Math.abs(position.top - 17) <= 1 && Math.abs(position.left - 29) <= 1,
      );
    })
    .toBe(true);
  for (const region of [light, dark])
    await expect(
      region.locator('.virtual-event[data-index="0"]'),
    ).toBeVisible();
});

test.afterEach(async ({}, testInfo) => {
  if (
    testInfo.status !== testInfo.expectedStatus &&
    app &&
    child?.exitCode === null
  ) {
    try {
      const png = await app.evaluate(async ({ BrowserWindow }) =>
        (
          await BrowserWindow.getAllWindows()[0].webContents.capturePage(
            undefined,
            { stayHidden: true, stayAwake: true },
          )
        )
          .toPNG()
          .toString("base64"),
      );
      await mkdir(testInfo.outputDir, { recursive: true });
      await writeFile(
        testInfo.outputPath("failure.png"),
        Buffer.from(png, "base64"),
      );
    } catch {}
  }
  try {
    if (app && child?.exitCode === null) {
      const closed = app.waitForEvent("close", { timeout: 7000 });
      await app.evaluate(({ BrowserWindow }) =>
        BrowserWindow.getAllWindows()[0].close(),
      );
      await closed;
    }
  } finally {
    if (child && child.exitCode === null)
      execFileSync("taskkill", ["/PID", String(child.pid), "/T", "/F"], {
        stdio: "ignore",
      });
  }
  expect(errors).toEqual([]);
  if (!resolve(directory).startsWith(temporaryRoot + sep + "case-"))
    throw new Error("Unsafe preview-sync cleanup path");
  await rm(directory, {
    recursive: true,
    force: true,
    maxRetries: 10,
    retryDelay: 100,
  });
});
