import { openSettingsWindow } from "./settings-panel";
import { createWorkspace } from "../../src/renderer/workspace";
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

test.setTimeout(150000);
test.describe.configure({ mode: "parallel" });
let app: ElectronApplication | undefined;
let child: ReturnType<ElectronApplication["process"]> | undefined;
let page: Page;
let directory: string;
let errors: string[];
const temporaryRoot = resolve(".tmp", "desktop-highlights-editor");

test.beforeEach(async ({}, testInfo) => {
  await mkdir(temporaryRoot, { recursive: true });
  directory = await mkdtemp(join(temporaryRoot, "case-"));
  errors = [];
  const state = createWorkspace();
  state.preferences.theme = testInfo.title.includes("light") ? "light" : "dark";
  state.preferences.timezone = "utc";
  state.tabs[0].filterPattern = "";
  state.tabs[0].view.columns = [
    { path: "@timestamp", width: 210, pinned: true },
    { path: "@message", width: 520 },
  ];
  state.tabs[0].view.highlightText = "processed";
  state.preferences.highlightProfiles = [
    {
      id: "default",
      name: "Default",
      enabled: true,
      groupPattern: "orders-api$",
      groupIgnoreCase: false,
      rules: [
        {
          id: "first",
          enabled: true,
          scope: "text",
          path: "",
          pattern: "ERROR",
          ignoreCase: false,
          target: "row",
          colors: { foreground: "#111827", background: "#fef08a" },
          separateThemeColors: false,
        },
        {
          id: "second",
          enabled: true,
          scope: "text",
          path: "",
          pattern: "ERROR",
          ignoreCase: false,
          target: "row",
          colors: { foreground: "#111827", background: "#fecaca" },
          separateThemeColors: false,
        },
        {
          id: "third",
          enabled: false,
          scope: "structured",
          path: "/level",
          pattern: "WARN",
          ignoreCase: true,
          target: "text",
          colors: { background: "#ff8800" },
          separateThemeColors: true,
          lightColors: { background: "#ffddaa" },
          darkColors: { background: "#663300" },
        },
      ],
    },
    {
      id: "other",
      name: "Other",
      enabled: false,
      groupPattern: "",
      groupIgnoreCase: true,
      rules: [],
    },
  ];
  if (testInfo.title.includes("expanding settings"))
    state.preferences.highlightProfiles[1].rules =
      state.preferences.highlightProfiles[0].rules.map((rule) => ({
        ...rule,
        id: "other-" + rule.id,
      }));
  await writeFile(join(directory, "workspace.json"), JSON.stringify(state));

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
        "Unexpected native dialog during hidden highlights editor verification",
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

async function capture(filename: string) {
  let png = "";
  for (let index = 0; index < 3; index++) {
    await page.evaluate(
      () =>
        new Promise<void>((done) =>
          requestAnimationFrame(() => requestAnimationFrame(() => done())),
        ),
    );
    png = await app!.evaluate(async ({ BrowserWindow }) => {
      const window = BrowserWindow.getAllWindows()[0];
      if (window.isVisible()) throw new Error("Verification became visible");
      return (
        await window.webContents.capturePage(undefined, {
          stayHidden: true,
          stayAwake: true,
        })
      )
        .toPNG()
        .toString("base64");
    });
  }
  await mkdir(test.info().outputDir, { recursive: true });
  await writeFile(test.info().outputPath(filename), Buffer.from(png, "base64"));
}

for (const theme of ["light", "dark"])
  for (const mode of ["Table", "Hybrid"])
    test(`${theme} ${mode} selects text directly under the cursor and preserves row and inspector navigation`, async () => {
      await page
        .locator("label")
        .filter({ hasText: new RegExp(`^${mode}$`) })
        .click();
      const row = page.locator(".virtual-event").nth(1),
        cell = row.locator(".inspect-cell").nth(1);
      const points = await cell.evaluate((element) => {
        const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
        const nodes: Text[] = [];
        while (walker.nextNode()) nodes.push(walker.currentNode as Text);
        const pointAt = (index: number) => {
          for (const node of nodes) {
            if (index <= node.length) {
              const range = document.createRange();
              range.setStart(node, index);
              range.collapse(true);
              const rect = range.getBoundingClientRect();
              return { x: rect.x, y: rect.y + rect.height / 2 };
            }
            index -= node.length;
          }
          throw new Error("Missing message text");
        };
        return { start: pointAt(2), end: pointAt(13) };
      });
      await page.mouse.move(points.start.x, points.start.y);
      // Starts on a glyph, including text split by highlight spans, without
      // programmatically creating the selection or hunting for empty padding.
      await page.mouse.down();
      await page.mouse.move(points.end.x, points.end.y, { steps: 12 });
      await page.mouse.up();
      await expect
        .poll(() => page.evaluate(() => window.getSelection()?.toString()))
        .toBe("quest proce");
      await expect(cell).toHaveCSS("cursor", "text");
      expect(
        await cell.evaluate((element) => {
          const event = new KeyboardEvent("keydown", {
            key: "c",
            ctrlKey: true,
            bubbles: true,
            cancelable: true,
          });
          element.dispatchEvent(event);
          return event.defaultPrevented;
        }),
      ).toBe(false);
      await page.mouse.click(points.end.x, points.end.y);
      await expect(row).toHaveAttribute("aria-selected", "true");
      await cell.dblclick();
      await expect(
        page.getByRole("region", { name: "Event inspector", exact: true }),
      ).toHaveAttribute(
        "data-event-id",
        (await row.getAttribute("data-event-id"))!,
      );
      await page.evaluate(() => window.getSelection()?.removeAllRanges());
      await page.locator(".viewer-scroll").press("ArrowDown");
      await expect(page.locator(".virtual-event").nth(2)).toHaveAttribute(
        "data-current",
        "true",
      );
      await capture(`selection-${theme}-${mode.toLowerCase()}.png`);
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
          throw new Error("Highlights editor verification became visible");
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
    throw new Error("Unsafe highlights-editor-test cleanup path");
  await rm(directory, {
    recursive: true,
    force: true,
    maxRetries: 10,
    retryDelay: 100,
  });
});
