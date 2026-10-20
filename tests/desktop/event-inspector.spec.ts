import { desktopExecutablePath } from "./desktop-app";
import {
  _electron as electron,
  expect,
  test,
  type ElectronApplication,
  type Page,
} from "@playwright/test";
import { execFileSync } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { join, resolve, sep } from "node:path";
import type { QueryUpdate } from "../../src/shared/contracts";

test.setTimeout(90000);
let app: ElectronApplication | undefined;
let child: ReturnType<ElectronApplication["process"]> | undefined;
let page: Page;
let directory: string;
let errors: string[];
const temporaryRoot = resolve(".tmp", "desktop-event-inspector");
type ProbeWindow = Window & { inspectorUpdates: QueryUpdate[] };

test.beforeEach(async () => {
  await mkdir(temporaryRoot, { recursive: true });
  directory = await mkdtemp(join(temporaryRoot, "case-"));
  errors = [];
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
        "Unexpected native dialog during hidden inspector verification",
      );
    };
  });
  await page
    .locator("label")
    .filter({ hasText: /^Table$/ })
    .click();
  // A row is sufficient for the old-build regression baseline; completion
  // assertions elsewhere use the explicit state rather than status decoration.
  await expect(page.locator(".log-table-row").nth(1)).toBeVisible();
});

test.afterEach(async ({}, testInfo) => {
  if (
    testInfo.status !== testInfo.expectedStatus &&
    app &&
    child?.exitCode === null
  ) {
    try {
      const png = await app.evaluate(async ({ BrowserWindow }) => {
        const window = BrowserWindow.getAllWindows()[0];
        if (window.isVisible())
          throw new Error("Inspector verification became visible");
        const image = await window.webContents.capturePage(undefined, {
          stayHidden: true,
          stayAwake: true,
        });
        return image.toPNG().toString("base64");
      });
      await mkdir(testInfo.outputDir, { recursive: true });
      await writeFile(
        testInfo.outputPath("failure.png"),
        Buffer.from(png, "base64"),
      );
    } catch {}
  }
  try {
    if (app && child && child.exitCode === null) {
      const closed = app.waitForEvent("close", { timeout: 7000 });
      const exited = new Promise<number | null>((done) =>
        child!.once("exit", done),
      );
      await app.evaluate(({ BrowserWindow }) =>
        BrowserWindow.getAllWindows()[0].close(),
      );
      await closed;
      expect(await exited).toBe(0);
    }
  } finally {
    if (child && child.exitCode === null) {
      if (process.platform === "win32")
        execFileSync("taskkill", ["/PID", String(child.pid), "/T", "/F"], {
          stdio: "ignore",
        });
      else child.kill();
    }
  }
  expect(errors).toEqual([]);
  if (!resolve(directory).startsWith(temporaryRoot + sep + "case-"))
    throw new Error("Unsafe inspector-test cleanup path");
  await rm(directory, {
    recursive: true,
    force: true,
    maxRetries: 10,
    retryDelay: 100,
  });
});

const inspector = () =>
  page.getByRole("region", { name: "Event inspector", exact: true });
const rows = () => page.locator(".virtual-event");
const viewer = () => page.locator(".viewer-scroll");

async function captureInspectorEvidence(filename: string) {
  await page.evaluate(
    () =>
      new Promise<void>((done) => {
        requestAnimationFrame(() => requestAnimationFrame(() => done()));
      }),
  );
  const png = await app!.evaluate(async ({ BrowserWindow }) => {
    const window = BrowserWindow.getAllWindows()[0];
    if (window.isVisible())
      throw new Error("Inspector verification became visible");
    const image = await window.webContents.capturePage(undefined, {
      stayHidden: true,
      stayAwake: true,
    });
    if (window.isVisible())
      throw new Error("Inspector capture changed window visibility");
    return image.toPNG().toString("base64");
  });
  await mkdir(test.info().outputDir, { recursive: true });
  await writeFile(test.info().outputPath(filename), Buffer.from(png, "base64"));
}

async function openInspector(index = 1) {
  const row = rows().nth(index);
  await row.locator(".inspect-cell").first().dblclick();
  await expect(inspector()).toBeVisible();
  return (await row.getAttribute("data-event-id"))!;
}

test("single click selects a row while double click docks an inspector that follows navigation", async () => {
  await expect(inspector()).toBeVisible();
  await page
    .getByRole("button", { name: "Hide event inspector", exact: true })
    .click();
  const row = rows().nth(1);
  const cell = row.locator(".inspect-cell").first();
  await cell.click();
  await expect(row).toHaveAttribute("data-selected", "true");
  await expect(row).toHaveAttribute("aria-selected", "true");
  // Selection settles the click's render before checking that no inspector opened.
  await expect(
    page.getByRole("dialog", { name: "Event inspector", exact: true }),
  ).toHaveCount(0);
  await expect(inspector()).toHaveCount(0);
  const firstId = (await row.getAttribute("data-event-id"))!;
  const homeId = (await rows().first().getAttribute("data-event-id"))!;
  const secondRow = rows().nth(2);
  const secondCell = secondRow.locator(".inspect-cell").first();
  const secondId = (await secondRow.getAttribute("data-event-id"))!;
  for (let index = 0; index < 80; index++) {
    if (await secondCell.evaluate((cell) => document.activeElement === cell))
      break;
    await page.keyboard.press("Tab");
  }
  await expect(secondCell).toBeFocused();
  await expect(secondRow).toHaveAttribute("data-selected", "true");
  await page.keyboard.press("Enter");
  await expect(inspector()).toHaveAttribute("data-event-id", secondId);
  await inspector()
    .getByRole("button", { name: "Hide inspector", exact: true })
    .click();
  await expect(inspector()).toHaveCount(0);
  await expect(viewer()).toBeFocused();
  await cell.dblclick();
  await expect(inspector()).toHaveAttribute("data-event-id", firstId);
  await captureInspectorEvidence("inspector-docked.png");
  const thirdId = (await rows().nth(3).getAttribute("data-event-id"))!;
  await rows().nth(3).locator(".inspect-cell").first().click();
  await expect(inspector()).toHaveAttribute("data-event-id", thirdId);
  const fourthId = (await rows().nth(4).getAttribute("data-event-id"))!;
  await viewer().press("ArrowDown");
  await expect(inspector()).toHaveAttribute("data-event-id", fourthId);
  await viewer().press("ArrowUp");
  await expect(inspector()).toHaveAttribute("data-event-id", thirdId);
  await viewer().press("End");
  const last = page.locator('.virtual-event[data-selected="true"]');
  await expect.poll(() => last.getAttribute("data-event-id")).not.toBe(thirdId);
  await expect(last).toBeInViewport();
  await expect(inspector()).toHaveAttribute(
    "data-event-id",
    (await last.getAttribute("data-event-id"))!,
  );
  await viewer().press("Home");
  await expect(inspector()).toHaveAttribute("data-event-id", homeId);
  const next = inspector().getByRole("button", {
    name: "Next event",
    exact: true,
  });
  await next.click();
  await expect(inspector()).toHaveAttribute("data-event-id", firstId);
  await next.press("Escape");
  await expect(inspector()).toHaveCount(0);
  await expect(viewer()).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(inspector()).toHaveAttribute("data-event-id", firstId);
  await inspector()
    .getByRole("button", { name: "Previous event", exact: true })
    .click();
  await expect(inspector()).toHaveAttribute("data-event-id", homeId);
  await viewer().press("Escape");
  await expect(inspector()).toHaveCount(0);
  await viewer().press("Enter");
  await expect(inspector()).toHaveAttribute("data-event-id", homeId);
  await inspector()
    .getByRole("button", { name: "Hide inspector", exact: true })
    .click();
  await expect(inspector()).toHaveCount(0);
  await expect(viewer()).toBeFocused();
});

test("structured inspector folds nested objects and adds columns and local filters without querying", async () => {
  await expect(
    page.locator('.query-status[data-query-state="complete"]'),
  ).toBeAttached();
  await page.evaluate(() => {
    const probe = window as unknown as ProbeWindow;
    probe.inspectorUpdates = [];
    window.explorer.onUpdate((update) => probe.inspectorUpdates.push(update));
  });
  await openInspector();
  const expandRequest = inspector().getByRole("button", {
    name: "Expand /request",
    exact: true,
  });
  if (await expandRequest.count()) await expandRequest.click();
  const requestId = inspector().getByRole("button", {
    name: "Add /request/id column",
    exact: true,
  });
  await expect(requestId).toBeVisible();
  await inspector()
    .getByRole("button", { name: "Collapse /request", exact: true })
    .click();
  await expect(requestId).toHaveCount(0);
  await expandRequest.click();
  await expect(requestId).toBeVisible();
  await inspector()
    .getByRole("button", { name: "Fold structured object", exact: true })
    .click();
  await expect(
    inspector().getByRole("button", { name: "Expand root", exact: true }),
  ).toBeVisible();
  await expect(requestId).toHaveCount(0);
  await inspector()
    .getByRole("button", { name: "Unfold structured object", exact: true })
    .click();
  await expect(requestId).toBeVisible();
  await inspector()
    .getByRole("button", { name: "Add /service/version column", exact: true })
    .click();
  await expect(
    page.getByRole("columnheader").filter({ hasText: "/service/version" }),
  ).toBeAttached();
  await inspector()
    .getByRole("button", { name: "Add /level to filter", exact: true })
    .click();
  await expect(
    page.getByRole("textbox", {
      name: "Local filter loaded events",
      exact: true,
    }),
  ).toHaveValue('@"/level"="INFO"');
  await expect
    .poll(() =>
      rows().evaluateAll(
        (elements) =>
          elements.length > 0 &&
          elements.every((element) => element.classList.contains("level-info")),
      ),
    )
    .toBe(true);
  await expect(
    page.getByRole("textbox", {
      name: "Local filter loaded events",
      exact: true,
    }),
  ).toHaveValue('@"/level"="INFO"');
  await page.waitForTimeout(450);
  expect(
    await page.evaluate(
      () => (window as unknown as ProbeWindow).inspectorUpdates,
    ),
  ).toEqual([]);
  await expect(inspector()).toBeVisible();
});

test("docked inspector supports pointer and keyboard resizing without covering the viewer", async () => {
  await openInspector();
  const divider = page.getByRole("separator", {
    name: "Resize event inspector",
    exact: true,
  });
  await expect(divider).toHaveAttribute("aria-orientation", "vertical");
  const before = (await inspector().boundingBox())!;
  const handle = (await divider.boundingBox())!;
  await page.mouse.move(
    handle.x + handle.width / 2,
    handle.y + handle.height / 2,
  );
  await page.mouse.down();
  await page.mouse.move(
    handle.x + handle.width / 2 - 80,
    handle.y + handle.height / 2,
    { steps: 8 },
  );
  await page.mouse.up();
  await expect
    .poll(async () =>
      Math.round((await inspector().boundingBox())!.width - before.width),
    )
    .toBe(80);
  const pointerWidth = (await inspector().boundingBox())!.width;
  await divider.press("ArrowLeft");
  await expect
    .poll(async () =>
      Math.round((await inspector().boundingBox())!.width - pointerWidth),
    )
    .toBe(20);
  await divider.press("ArrowRight");
  await expect
    .poll(async () => Math.round((await inspector().boundingBox())!.width))
    .toBe(Math.round(pointerWidth));
  await divider.press("Home");
  const minimum = Number(await divider.getAttribute("aria-valuemin"));
  await expect
    .poll(async () => Number(await divider.getAttribute("aria-valuenow")))
    .toBe(minimum);
  await divider.press("End");
  const maximum = Number(await divider.getAttribute("aria-valuemax"));
  await expect
    .poll(async () => Number(await divider.getAttribute("aria-valuenow")))
    .toBe(maximum);
  const panelBox = (await inspector().boundingBox())!;
  const viewerBox = (await viewer().boundingBox())!;
  expect(viewerBox.x + viewerBox.width).toBeLessThanOrEqual(panelBox.x + 1);
  await expect(inspector()).toBeInViewport();
  await captureInspectorEvidence("inspector-resized.png");
  await inspector()
    .getByRole("button", { name: "Hide inspector", exact: true })
    .click();
  await expect(divider).toHaveCount(0);
  await expect(viewer()).toBeFocused();
});
