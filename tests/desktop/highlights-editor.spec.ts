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
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
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

const settingsDialog = () =>
  page.getByRole("dialog", { name: "Workspace settings" });
const ruleRows = () => settingsDialog().locator("tbody > tr[data-rule-id]");
async function openHighlights() {
  await openSettingsWindow(page);
  await settingsDialog()
    .getByRole("tab", { name: "Highlights", exact: true })
    .click();
}
async function savedProfiles() {
  return JSON.parse(await readFile(join(directory, "workspace.json"), "utf8"))
    .preferences.highlightProfiles;
}
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

test("expanding settings preserves the selected profile, rule and preview drafts", async () => {
  await page
    .getByRole("button", { name: "Workspace settings", exact: true })
    .click();
  const pane = page.getByRole("region", {
    name: "Workspace settings",
    exact: true,
  });
  await pane.getByRole("tab", { name: "Highlights", exact: true }).click();
  await pane
    .getByRole("combobox", { name: "Highlight profile", exact: true })
    .click();
  await page
    .getByRole("option", { name: "Other (disabled)", exact: true })
    .click();
  await pane.locator('[data-rule-id="other-second"]').click();
  await pane
    .getByRole("button", { name: "Test and preview", exact: true })
    .click();
  await pane
    .getByLabel("Preview log group", { exact: true })
    .fill("/custom/preview");
  await pane
    .getByLabel("Preview event", { exact: true })
    .fill("my draft ERROR");
  await pane
    .getByRole("button", { name: "Open settings in window", exact: true })
    .click();
  await expect(
    settingsDialog().getByRole("combobox", {
      name: "Highlight profile",
      exact: true,
    }),
  ).toHaveValue("Other (disabled)");
  await expect(
    settingsDialog().locator('[data-rule-id="other-second"]'),
  ).toHaveAttribute("aria-selected", "true");
  await expect(
    settingsDialog().getByLabel("Preview log group", { exact: true }),
  ).toHaveValue("/custom/preview");
  await expect(
    settingsDialog().getByLabel("Preview event", { exact: true }),
  ).toHaveValue("my draft ERROR");
});

for (const theme of ["light", "dark"])
  test(`${theme} master-detail edits one rule and drag order changes real profile priority`, async () => {
    await openHighlights();
    await expect(
      settingsDialog().getByLabel("Match regex", { exact: true }),
    ).toHaveCount(1);
    const table = settingsDialog().getByRole("table", {
      name: "Highlight rules",
      exact: true,
    });
    const detail = settingsDialog().getByRole("region", {
      name: "Edit rule",
      exact: true,
    });
    const a = (await table.boundingBox())!,
      b = (await detail.boundingBox())!;
    expect(a.x + a.width).toBeLessThanOrEqual(b.x);
    expect(Math.abs(a.y - b.y)).toBeLessThan(80);
    expect(
      await settingsDialog()
        .getByRole("button", { name: "Test and preview", exact: true })
        .evaluate(
          (element) =>
            element.getBoundingClientRect().bottom <= window.innerHeight,
        ),
    ).toBe(true);
    await expect(table.getByRole("columnheader")).toHaveText([
      "",
      "#",
      "Enabled",
      "Search in",
      "Highlight",
      "Regex",
      "Colors",
    ]);
    await ruleRows().nth(1).click();
    await detail.getByLabel("Match regex", { exact: true }).fill("FAIL|ERROR");
    await expect(ruleRows().nth(1)).toContainText("FAIL|ERROR");
    await table.getByLabel("Rule 1 enabled", { exact: true }).uncheck();
    await expect(
      detail.getByLabel("Rule enabled", { exact: true }),
    ).toBeChecked();
    await table.getByLabel("Rule 1 enabled", { exact: true }).check();
    const source = table.getByRole("button", {
      name: "Reorder rule 2",
      exact: true,
    });
    const from = (await source.boundingBox())!,
      to = (await ruleRows().first().boundingBox())!;
    await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
    await page.mouse.down();
    await page.mouse.move(from.x + from.width / 2, to.y + to.height / 2, {
      steps: 12,
    });

    await page.mouse.up();
    await expect
      .poll(() =>
        ruleRows().evaluateAll((rows) =>
          rows.map((row) => row.getAttribute("data-rule-id")),
        ),
      )
      .toEqual(["second", "first", "third"]);
    await expect(detail.getByLabel("Match regex", { exact: true })).toHaveValue(
      "FAIL|ERROR",
    );
    await settingsDialog()
      .getByRole("button", { name: "Test and preview", exact: true })
      .click();
    await expect(
      settingsDialog().getByLabel("Highlight preview", { exact: true }),
    ).toHaveCSS("background-color", "rgb(254, 202, 202)");
    await settingsDialog()
      .getByLabel("Preview event", { exact: true })
      .fill("WARN careful");
    await expect(
      settingsDialog().getByLabel("Highlight preview", { exact: true }),
    ).not.toHaveCSS("background-color", "rgb(254, 202, 202)");
    await settingsDialog()
      .getByLabel("Preview event", { exact: true })
      .fill("ERROR payment failed");
    await expect(
      settingsDialog().getByLabel("Highlight preview", { exact: true }),
    ).toHaveCSS("background-color", "rgb(254, 202, 202)");
    await capture(`master-detail-${theme}.png`);
    await settingsDialog()
      .getByRole("button", { name: "Test and preview", exact: true })
      .click();
    await expect(
      settingsDialog().getByLabel("Preview event", { exact: true }),
    ).toBeHidden();
    await capture(`master-detail-collapsed-${theme}.png`);
    await settingsDialog().locator(".mantine-Modal-close").click();
    await expect(
      page
        .locator(".virtual-event.level-error")
        .first()
        .locator(".log-cell")
        .first(),
    ).toHaveCSS("background-color", "rgb(254, 202, 202)");
    await expect
      .poll(async () =>
        (await savedProfiles())[0].rules.map((rule: { id: string }) => rule.id),
      )
      .toEqual(["second", "first", "third"]);
  });

test("rule selection survives priority edits, keyboard reordering and cancellation; add/delete and profiles stay independent", async () => {
  await openHighlights();
  await ruleRows().nth(2).click();
  const detail = settingsDialog().getByRole("region", {
    name: "Edit rule",
    exact: true,
  });
  await expect(
    detail.getByLabel("JSON Pointer path", { exact: true }),
  ).toHaveValue("/level");
  await expect(
    detail.getByLabel("Light background", { exact: true }),
  ).toHaveValue("#ffddaa");
  await detail.getByLabel("Priority", { exact: true }).fill("1");
  await expect(ruleRows().first()).toHaveAttribute("data-rule-id", "third");
  const handle = settingsDialog().getByRole("button", {
    name: "Reorder rule 1",
    exact: true,
  });
  await handle.focus();
  await page.keyboard.press("Space");
  await expect(ruleRows().first()).toHaveAttribute("data-dragging", "true");
  await page.evaluate(
    () =>
      new Promise<void>((done) =>
        requestAnimationFrame(() => requestAnimationFrame(() => done())),
      ),
  );
  await page.keyboard.press("ArrowDown");
  await expect
    .poll(
      async () =>
        (await ruleRows().first().boundingBox())!.y >
        (await ruleRows().nth(1).boundingBox())!.y,
    )
    .toBe(true);
  await page.keyboard.press("Space");
  await expect
    .poll(() =>
      ruleRows().evaluateAll((rows) =>
        rows.map((row) => row.getAttribute("data-rule-id")),
      ),
    )
    .toEqual(["first", "third", "second"]);
  await settingsDialog()
    .getByRole("button", { name: "Reorder rule 2", exact: true })
    .focus();
  await page.keyboard.press("Space");
  await expect(ruleRows().nth(1)).toHaveAttribute("data-dragging", "true");
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Escape");
  await expect(settingsDialog()).toBeVisible();
  await expect
    .poll(() =>
      ruleRows().evaluateAll((rows) =>
        rows.map((row) => row.getAttribute("data-rule-id")),
      ),
    )
    .toEqual(["first", "third", "second"]);
  await settingsDialog()
    .getByRole("button", { name: "Add rule", exact: true })
    .click();
  await expect(ruleRows()).toHaveCount(4);
  await detail.getByLabel("Match regex", { exact: true }).fill("NEW");
  await expect(ruleRows().last()).toContainText("NEW");
  await detail
    .getByRole("button", { name: "Delete selected rule", exact: true })
    .click();
  await expect(ruleRows()).toHaveCount(3);
  await expect(detail.getByLabel("Match regex", { exact: true })).toHaveValue(
    "ERROR",
  );
  await settingsDialog()
    .getByRole("combobox", { name: "Highlight profile", exact: true })
    .click();
  await page
    .getByRole("option", { name: "Other (disabled)", exact: true })
    .click();
  await expect(ruleRows()).toHaveCount(0);
  await expect(
    settingsDialog().getByText("No rules in this profile.", { exact: true }),
  ).toBeVisible();
  await settingsDialog()
    .getByRole("button", { name: "Add rule", exact: true })
    .click();
  await expect(ruleRows()).toHaveCount(1);
  await detail.getByLabel("Match regex", { exact: true }).fill("OTHER");
  await settingsDialog()
    .getByRole("button", { name: "Delete profile", exact: true })
    .click();
  await expect(ruleRows()).toHaveCount(3);
  await expect(
    settingsDialog().getByLabel("Profile name", { exact: true }),
  ).toHaveValue("Default");
  await settingsDialog()
    .getByRole("button", { name: "Delete profile", exact: true })
    .click();
  await expect(ruleRows()).toHaveCount(0);
  await settingsDialog()
    .getByRole("button", { name: "Add profile", exact: true })
    .click();
  await expect(ruleRows()).toHaveCount(1);
  await expect(detail.getByLabel("Match regex", { exact: true })).toHaveValue(
    "",
  );
});

test("compact editor keeps both panels and the collapsed preview reachable in a smaller window", async () => {
  await app!.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows()[0].setSize(1120, 850, false),
  );
  await openHighlights();
  const metrics = await settingsDialog().evaluate((element) => {
    const master = element
      .querySelector(".highlight-rule-list")!
      .getBoundingClientRect();
    const detail = element
      .querySelector(".highlight-rule-detail")!
      .getBoundingClientRect();
    const preview = element
      .querySelector(".highlight-preview-toggle")!
      .getBoundingClientRect();
    return {
      sideBySide: master.right <= detail.left,
      previewInWindow: preview.bottom <= window.innerHeight,
      overflow: element.scrollWidth - element.clientWidth,
    };
  });
  expect(metrics).toEqual({
    sideBySide: true,
    previewInWindow: true,
    overflow: 0,
  });
  await ruleRows().nth(2).click();
  await expect(
    settingsDialog().getByLabel("Dark background", { exact: true }),
  ).toHaveValue("#663300");
  await settingsDialog()
    .getByLabel("Dark background", { exact: true })
    .fill("#775533");
  await settingsDialog()
    .getByLabel("Dark background", { exact: true })
    .press("Tab");
  await ruleRows().first().click();
  await expect(
    settingsDialog().getByLabel("Shared background", { exact: true }),
  ).toHaveValue("#fef08a");
  await ruleRows().nth(2).click();
  await expect(
    settingsDialog().getByLabel("Dark background", { exact: true }),
  ).toHaveValue("#775533");
  await capture("master-detail-small-window.png");
});

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
