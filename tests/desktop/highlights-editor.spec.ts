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

const settingsDialog = () => page.getByRole("dialog", { name: "Settings" });
const ruleRows = () => settingsDialog().locator("tbody > tr[data-rule-id]");
async function openHighlights() {
  await openSettingsWindow(page);
  await settingsDialog()
    .getByRole("tab", { name: "Highlights", exact: true })
    .click();
}
async function savedProfiles() {
  await expect(page.getByText("Saved locally", { exact: true })).toBeVisible();
  const { workspace } = await page.evaluate(() =>
    window.explorer.loadWorkspace(),
  );
  return (
    (workspace as ReturnType<typeof createWorkspace>).preferences
      .highlightProfiles ?? []
  );
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

const profileRows = () =>
  settingsDialog().locator("tbody > tr[data-profile-id]");
const ruleDetail = () =>
  settingsDialog()
    .getByRole("table", { name: "Highlight rules", exact: true })
    .locator(".highlight-item-detail");
async function expandRule(number: number) {
  await settingsDialog()
    .getByRole("button", { name: `Expand rule ${number}`, exact: true })
    .click();
}
async function editRule() {
  await settingsDialog()
    .getByRole("table", { name: "Highlight rules", exact: true })
    .locator("tbody")
    .filter({
      has: page.locator(".highlight-item-detail"),
    })
    .getByRole("button", { name: /^Edit rule / })
    .click();
}

test("expanding settings preserves the selected profile and pending rule draft while enabling modal-only preview", async () => {
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  const pane = page.getByRole("region", { name: "Settings", exact: true });
  await pane.getByRole("tab", { name: "Highlights", exact: true }).click();
  await pane.locator('[data-profile-id="other"]').click();
  await pane
    .getByRole("button", { name: "Expand rule 2", exact: true })
    .click();
  await pane.getByRole("button", { name: "Edit rule 2", exact: true }).click();
  await pane.getByLabel("Match regex", { exact: true }).fill("DOCKING_DRAFT");
  await expect(
    pane.getByRole("button", { name: "Preview", exact: true }),
  ).toHaveCount(0);
  await pane
    .getByRole("button", { name: "Open settings in window", exact: true })
    .click();
  await expect(
    settingsDialog().locator('[data-profile-id="other"]'),
  ).toHaveAttribute("aria-selected", "true");
  await expect(
    ruleDetail().getByLabel("Match regex", { exact: true }),
  ).toHaveValue("DOCKING_DRAFT");
  const toggle = settingsDialog().getByRole("button", {
    name: "Preview",
    exact: true,
  });
  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-expanded", "true");
  await expect(
    settingsDialog().getByLabel("Preview event", { exact: true }),
  ).toHaveCount(0);
  await settingsDialog()
    .getByRole("button", { name: "Cancel rule edit", exact: true })
    .click();
  expect((await savedProfiles())[1].rules[1].pattern).toBe("ERROR");
});

for (const theme of ["light", "dark"])
  test(`${theme} saved rule edits and drag order change applied highlight priority`, async () => {
    await openHighlights();
    const table = settingsDialog().getByRole("table", {
      name: "Highlight rules",
      exact: true,
    });
    await expect(
      settingsDialog().getByLabel("Match regex", { exact: true }),
    ).toHaveCount(0);
    await expandRule(2);
    await editRule();
    const detail = ruleDetail();
    await detail.getByLabel("Match regex", { exact: true }).fill("FAIL|ERROR");
    await expect(ruleRows().nth(1)).toContainText("ERROR");
    expect((await savedProfiles())[0].rules[1].pattern).toBe("ERROR");
    await settingsDialog()
      .getByRole("button", { name: "Save rule", exact: true })
      .click();
    await expect(ruleRows().nth(1)).toContainText("FAIL|ERROR");
    const enabled = table.getByRole("switch", {
      name: "Rule 1 enabled",
      exact: true,
    });
    await enabled.locator("..").click();
    await expect(enabled).not.toBeChecked();
    await enabled.locator("..").click();
    await expect(enabled).toBeChecked();
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
    await capture(`hybrid-tables-priority-${theme}.png`);
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

test("keyboard reorder cancellation retains the expanded rule and its draft without committing priority", async () => {
  await openHighlights();
  await expandRule(3);
  await editRule();
  await ruleDetail()
    .getByLabel("Match regex", { exact: true })
    .fill("DRAFT_WARN");
  await settingsDialog()
    .getByRole("button", { name: "Move rule 3 up", exact: true })
    .click();
  await expect(ruleRows().nth(1)).toHaveAttribute("data-rule-id", "third");
  await expect(
    ruleDetail().getByLabel("Match regex", { exact: true }),
  ).toHaveValue("DRAFT_WARN");
  const handle = settingsDialog().getByRole("button", {
    name: "Reorder rule 2",
    exact: true,
  });
  await handle.focus();
  await page.keyboard.press("Space");
  await expect(ruleRows().nth(1).locator("..")).toHaveAttribute(
    "data-dragging",
    "true",
  );
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
        (await ruleRows().nth(1).locator("..").boundingBox())!.y >
        (await ruleRows().nth(2).locator("..").boundingBox())!.y,
    )
    .toBe(true);
  await page.keyboard.press("Escape");
  await expect(settingsDialog()).toBeVisible();
  await expect
    .poll(() =>
      ruleRows().evaluateAll((rows) =>
        rows.map((row) => row.getAttribute("data-rule-id")),
      ),
    )
    .toEqual(["first", "third", "second"]);
  await expect(
    ruleDetail().getByLabel("Match regex", { exact: true }),
  ).toHaveValue("DRAFT_WARN");
  await settingsDialog()
    .getByRole("button", { name: "Cancel rule edit", exact: true })
    .click();
  await expect(
    ruleDetail().getByLabel("Match regex", { exact: true }),
  ).toHaveValue("WARN");
  await expect
    .poll(async () => (await savedProfiles())[0].rules[1].pattern)
    .toBe("WARN");
});

test("compact tables preserve each profile's pending rule colors while switching profiles", async () => {
  await app!.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows()[0].setSize(1120, 850, false),
  );
  await openHighlights();
  await expandRule(3);
  await editRule();
  await ruleDetail()
    .getByLabel("Dark background", { exact: true })
    .fill("#775533");
  await profileRows().filter({ hasText: "Other" }).click();
  await expect(ruleRows()).toHaveCount(0);
  await profileRows().filter({ hasText: "Default" }).click();
  await expect(
    ruleDetail().getByLabel("Dark background", { exact: true }),
  ).toHaveValue("#775533");
  expect((await savedProfiles())[0].rules[2].darkColors?.background).toBe(
    "#663300",
  );
  await settingsDialog()
    .getByRole("button", { name: "Save rule", exact: true })
    .click();
  await expect
    .poll(
      async () => (await savedProfiles())[0].rules[2].darkColors?.background,
    )
    .toBe("#775533");
  const metrics = await settingsDialog().evaluate((element) => ({
    overflow: element.scrollWidth - element.clientWidth,
    previewInWindow:
      element
        .querySelector(".highlight-preview-toggle")!
        .getBoundingClientRect().bottom <= window.innerHeight,
  }));
  expect(metrics).toEqual({ overflow: 0, previewInWindow: true });
  await capture("hybrid-tables-small-window.png");
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
