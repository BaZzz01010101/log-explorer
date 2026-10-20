import { desktopExecutablePath } from "./desktop-app";
import type { Workspace } from "../../src/shared/contracts";
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

test.setTimeout(90000);
let app: ElectronApplication | undefined;
let child: ReturnType<ElectronApplication["process"]> | undefined;
let page: Page;
let directory: string;
let errors: string[];
const temporaryRoot = resolve(".tmp", "desktop-level-filter");

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
        "Unexpected native dialog during hidden level-filter verification",
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
          throw new Error("Level-filter verification became visible");
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
    throw new Error("Unsafe level-filter-test cleanup path");
  await rm(directory, {
    recursive: true,
    force: true,
    maxRetries: 10,
    retryDelay: 100,
  });
});

const filter = () =>
  page.getByRole("button", { name: "Local level filter", exact: true });
const checkbox = (level: string) =>
  page.getByRole("checkbox", { name: `Include ${level}`, exact: true });
const select = (level: string) =>
  page.getByRole("button", { name: `Select only ${level}`, exact: true });
const rows = () => page.locator(".virtual-event");

test("level filter label and chevron share a centered horizontal row", async ({}, testInfo) => {
  const geometry = await filter().evaluate((button) => {
    const label = button.querySelector(".mantine-Button-label")!;
    const inner = button.querySelector(".mantine-Button-inner")!;
    const icon = button.querySelector("svg")!;
    const textRange = document.createRange();
    textRange.selectNodeContents(label);
    const textBounds = textRange.getBoundingClientRect();
    const rect = (element: Element) => {
      const bounds = element.getBoundingClientRect();
      const style = getComputedStyle(element);
      return {
        x: bounds.x,
        y: bounds.y,
        width: bounds.width,
        height: bounds.height,
        display: style.display,
        flexDirection: style.flexDirection,
        lineHeight: style.lineHeight,
        alignItems: style.alignItems,
      };
    };
    return {
      button: rect(button),
      inner: rect(inner),
      label: rect(label),
      icon: rect(icon),
      text: {
        x: textBounds.x,
        y: textBounds.y,
        width: textBounds.width,
        height: textBounds.height,
      },
    };
  });
  await testInfo.attach("level-filter-geometry", {
    body: JSON.stringify(geometry, null, 2),
    contentType: "application/json",
  });
  expect(
    Math.abs(
      geometry.text.y +
        geometry.text.height / 2 -
        geometry.icon.y -
        geometry.icon.height / 2,
    ),
  ).toBeLessThanOrEqual(2);
  expect(
    Math.abs(
      geometry.text.y +
        geometry.text.height / 2 -
        geometry.button.y -
        geometry.button.height / 2,
    ),
  ).toBeLessThanOrEqual(2);
  expect(geometry.icon.x).toBeGreaterThan(
    geometry.label.x + geometry.label.width,
  );
  await filter().click();
  await select("ERROR").click();
  await filter().click();
  await select("INFO").click({ modifiers: ["Control"] });
  await select("WARN").click({ modifiers: ["Control"] });
  await page.keyboard.press("Escape");
  await expect(filter()).toHaveAttribute("title", "ERROR, INFO, WARN");
  const overflow = await filter().evaluate((button) => {
    const text = button.querySelector(
      ".mantine-Button-label > span",
    ) as HTMLElement;
    const icon = button.querySelector("svg")!;
    return {
      width: text.clientWidth,
      contentWidth: text.scrollWidth,
      textOverflow: getComputedStyle(text).textOverflow,
      textRight: text.getBoundingClientRect().right,
      iconLeft: icon.getBoundingClientRect().left,
    };
  });
  expect(overflow.contentWidth).toBeGreaterThan(overflow.width);
  expect(overflow.textOverflow).toBe("ellipsis");
  expect(overflow.textRight).toBeLessThan(overflow.iconLeft);
});

test("level text isolates one level while checkbox and Ctrl text clicks preserve multiple selections", async () => {
  await filter().click();
  await expect(checkbox("INFO")).toBeChecked();
  await expect(checkbox("UNKNOWN")).toBeChecked();
  await select("ERROR").click();
  await expect(checkbox("ERROR")).not.toBeVisible();
  await expect(rows().first()).toBeVisible();
  await expect(page.locator(".virtual-event:not(.level-error)")).toHaveCount(0);
  await filter().click();
  await checkbox("WARN").click();
  await expect(checkbox("ERROR")).toBeChecked();
  await expect(checkbox("WARN")).toBeChecked();
  await expect(
    page.locator(".virtual-event:not(.level-error):not(.level-warn)"),
  ).toHaveCount(0);
  await select("INFO").click({ modifiers: ["Control"] });
  await expect(checkbox("INFO")).toBeChecked();
  await select("ERROR").click({ modifiers: ["Control"] });
  await expect(checkbox("ERROR")).not.toBeChecked();
  await expect(checkbox("WARN")).toBeChecked();
  await expect(
    page.locator(".virtual-event:not(.level-info):not(.level-warn)"),
  ).toHaveCount(0);
  await page.keyboard.press("Escape");
  await expect(checkbox("INFO")).not.toBeVisible();
  await expect(filter()).toBeFocused();
});

test("empty level selection survives persistence and reset restores every level", async () => {
  await filter().click();
  await checkbox("all levels").click();
  await expect(rows()).toHaveCount(0);
  await expect(filter()).toHaveText("No levels");
  await expect
    .poll(async () => {
      const stored = await page.evaluate(() => window.explorer.loadWorkspace());
      return (stored.workspace as Workspace | null)?.tabs[0].view.levels;
    })
    .toEqual([]);
  await page.reload();
  await expect(filter()).toHaveText("No levels");
  await expect(rows()).toHaveCount(0);
  await page
    .getByRole("button", { name: "Clear local filters", exact: true })
    .click();
  await expect(filter()).toHaveText("All levels");
  await expect(rows().first()).toBeVisible();
  await filter().click();
  await expect(checkbox("INFO")).toBeChecked();
  await expect(checkbox("UNKNOWN")).toBeChecked();
});
