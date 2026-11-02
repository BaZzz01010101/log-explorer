import { openSettingsWindow } from "./settings-panel";
import { createWorkspace } from "../../src/renderer/workspace";
import { desktopExecutablePath } from "./desktop-app";
import {
  _electron as electron,
  expect,
  test,
  type ElectronApplication,
  type Locator,
  type Page,
} from "@playwright/test";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { join, resolve, sep } from "node:path";

test.setTimeout(120000);
const root = resolve(".tmp/desktop-highlight-row-actions");
let directory: string, app: ElectronApplication, page: Page, errors: string[];
let child: ReturnType<ElectronApplication["process"]>;

test.beforeEach(async ({}, info) => {
  await mkdir(root, { recursive: true });
  directory = await mkdtemp(join(root, "case-"));
  errors = [];
  const workspace = createWorkspace();
  workspace.preferences.theme = info.title.includes("light") ? "light" : "dark";
  workspace.tabs[0].filterPattern = "";
  const rule = (id: string, pattern: string) => ({
    id,
    enabled: true,
    scope: "structured" as const,
    path: "/level",
    pattern,
    ignoreCase: true,
    target: "text" as const,
    colors: { foreground: "#111827", background: "#fef08a" },
    separateThemeColors: true,
    lightColors: { foreground: "#224466", background: "#ffddaa" },
    darkColors: { foreground: "#ddeeff", background: "#663300" },
  });
  workspace.preferences.highlightProfiles = [
    {
      id: "default",
      name: "Default",
      enabled: true,
      groupPattern: "orders-api$",
      groupIgnoreCase: true,
      rules: [
        rule("first", "ERROR"),
        rule("second", "WARN"),
        rule("third", "INFO"),
      ],
    },
    {
      id: "other",
      name: "Other",
      enabled: false,
      groupPattern: "payments-worker$",
      groupIgnoreCase: false,
      rules: [rule("other-first", "OTHER")],
    },
  ];
  if (info.title.includes("tree scrolling")) {
    workspace.preferences.highlightProfiles[0].rules = Array.from(
      { length: 20 },
      (_, index) => rule(`many-${index}`, `RULE_${index}`),
    );
  }
  await writeFile(join(directory, "workspace.json"), JSON.stringify(workspace));
  const env: Record<string, string> = {};
  for (const key of ["PATH", "SystemRoot", "WINDIR", "TEMP", "TMP", "COMSPEC"])
    if (process.env[key]) env[key] = process.env[key]!;
  Object.assign(env, {
    EXPLORER_TEST_USER_DATA: directory,
    USERPROFILE: directory,
    APPDATA: directory,
    LOCALAPPDATA: directory,
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
  page.setDefaultTimeout(8000);
  page.on("pageerror", (error) => errors.push(error.message));
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Emulation.setFocusEmulationEnabled", { enabled: true });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await app.evaluate(({ BrowserWindow, dialog }) => {
    const win = BrowserWindow.getAllWindows()[0];
    win.setContentSize(1800, 1500);
    win.webContents.setBackgroundThrottling(false);
    dialog.showMessageBox = async () => {
      throw new Error(
        "Unexpected native dialog in hidden highlight row checks",
      );
    };
  });
  expect(
    (await page.evaluate(() => window.explorer.environment())).canEnableAws,
  ).toBe(false);
  await expect(page.locator('[data-node-kind="group"]')).toHaveCount(9);
  await openSettingsWindow(page);
  await settings()
    .getByRole("tab", { name: "Highlights", exact: true })
    .click();
  await wake();
});

test.afterEach(async ({}, info) => {
  if (child?.exitCode === null) {
    expect(
      await app.evaluate(({ BrowserWindow }) =>
        BrowserWindow.getAllWindows().every((win) => !win.isVisible()),
      ),
    ).toBe(true);
    if (info.status !== info.expectedStatus) await capture("failure.png");
    const closed = app.waitForEvent("close");
    await app.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()[0].close(),
    );
    await closed;
    expect(child.exitCode).toBe(0);
  }
  expect(errors).toEqual([]);
  if (!directory.startsWith(root + sep + "case-"))
    throw new Error("Unsafe highlight-row cleanup");
  await rm(directory, {
    recursive: true,
    force: true,
    maxRetries: 10,
    retryDelay: 100,
  });
});

const settings = () =>
  page.getByRole("dialog", { name: "Settings", exact: true });
const table = (kind: "profile" | "rule", owner = settings()) =>
  owner.getByRole("table", { name: `Highlight ${kind}s`, exact: true });
const item = (kind: "profile" | "rule", id: string, owner = settings()) =>
  table(kind, owner)
    .locator("tbody")
    .filter({ has: page.locator(`tr[data-${kind}-id="${id}"]`) });
const detail = (kind: "profile" | "rule", id: string, owner = settings()) =>
  item(kind, id, owner).locator(".highlight-item-detail");
const summary = (kind: "profile" | "rule", id: string) =>
  item(kind, id).locator(".highlight-summary-row");
const action = (label: string, owner = settings()) =>
  owner.getByRole("button", { name: label, exact: true });
async function savedProfiles() {
  const { workspace } = await page.evaluate(() =>
    window.explorer.loadWorkspace(),
  );
  return (
    (workspace as ReturnType<typeof createWorkspace>).preferences
      .highlightProfiles ?? []
  );
}
async function wake() {
  await app.evaluate(async ({ BrowserWindow }) => {
    const win = BrowserWindow.getAllWindows()[0];
    if (win.isVisible())
      throw new Error("Hidden highlight-row verification became visible");
    await win.webContents.capturePage(undefined, {
      stayHidden: true,
      stayAwake: true,
    });
  });
}
async function capture(filename: string) {
  await wake();
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
  await mkdir(test.info().outputDir, { recursive: true });
  await writeFile(test.info().outputPath(filename), Buffer.from(png, "base64"));
}
async function geometry(owner: Locator) {
  return owner
    .locator("input,textarea,.mantine-Switch-root")
    .evaluateAll((elements) =>
      elements.map((element) => {
        const rect = element.getBoundingClientRect();
        return {
          label: element.getAttribute("aria-label") || element.id,
          x: rect.x,
          y: rect.y,
          width: rect.width,
          height: rect.height,
        };
      }),
    );
}
async function assertTint(
  kind: "profile" | "rule",
  id: string,
  channel: "red" | "green" | "blue",
  hasDetail = true,
) {
  const row = summary(kind, id).locator("td").first();
  for (const surface of hasDetail ? [row, detail(kind, id)] : [row]) {
    const { components, baseline } = await surface.evaluate((element) => {
      const canvas = document.createElement("canvas"),
        context = canvas.getContext("2d")!,
        probe = document.createElement("span");
      probe.style.backgroundColor = "var(--mantine-color-body)";
      probe.style.position = "fixed";
      element.appendChild(probe);
      const baselineColor = getComputedStyle(probe).backgroundColor;
      probe.remove();
      const normalize = (color: string) => {
        context.clearRect(0, 0, 1, 1);
        context.fillStyle = color;
        context.fillRect(0, 0, 1, 1);
        return [...context.getImageData(0, 0, 1, 1).data];
      };
      return {
        components: normalize(getComputedStyle(element).backgroundColor),
        baseline: normalize(baselineColor),
      };
    });
    const dominant = { red: 0, green: 1, blue: 2 }[channel];
    expect(components).not.toEqual(baseline);
    expect(components[dominant]).toBeGreaterThan(
      components[(dominant + 1) % 3],
    );
    expect(components[dominant]).toBeGreaterThan(
      components[(dominant + 2) % 3],
    );
    expect(components[3]).toBeGreaterThan(0);
  }
}
async function assertStrip(
  kind: "profile" | "rule",
  id: string,
  mode: "edit" | "delete",
  iconPoint: { x: number; y: number },
) {
  const row = summary(kind, id),
    strip = item(kind, id).locator(
      `.highlight-action-strip[data-action="${mode}"]`,
    );
  await expect(strip).toBeVisible();
  await expect(strip).toHaveAttribute(
    "role",
    mode === "delete" ? "alertdialog" : "group",
  );
  await expect(strip.getByRole("button")).toHaveText(
    mode === "delete" ? ["Delete", "Cancel"] : ["Save", "Cancel"],
  );
  const rowBox = (await row.boundingBox())!,
    box = (await strip.boundingBox())!,
    cancel = (await strip.getByRole("button").last().boundingBox())!;
  expect(Math.abs(box.y - rowBox.y)).toBeLessThanOrEqual(1);
  expect(Math.abs(box.height - rowBox.height)).toBeLessThanOrEqual(1);
  expect(
    Math.abs(box.x + box.width - rowBox.x - rowBox.width),
  ).toBeLessThanOrEqual(1);
  expect(box.width).toBeLessThan(rowBox.width);
  expect(iconPoint.x).toBeGreaterThanOrEqual(cancel.x);
  expect(iconPoint.x).toBeLessThanOrEqual(cancel.x + cancel.width);
  expect(iconPoint.y).toBeGreaterThanOrEqual(cancel.y);
  expect(iconPoint.y).toBeLessThanOrEqual(cancel.y + cancel.height);
}
async function point(locator: Locator) {
  const box = (await locator.boundingBox())!;
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

async function openTree() {
  await settings()
    .getByRole("tab", { name: "Highlights", exact: true })
    .click();
  return settings().getByRole("tree", { name: "Highlight profiles and rules" });
}

for (const theme of ["light", "dark"]) {
  test(`${theme} compact tree preview uses freed space and code fields disable writing assistance`, async () => {
    await expect(page.locator(".virtual-event").first()).toBeVisible();
    await openTree();
    await treeRow("profile", "Default").click();
    const panel = settings().getByRole("tabpanel", {
      name: "Highlights",
      exact: true,
    });
    await expect(
      panel.getByLabel("Log group regex", { exact: true }),
    ).toHaveJSProperty("spellcheck", false);
    await treeRow("rule", "ERROR").click();
    for (const label of ["Match regex", "JSON Pointer path"])
      await expect(panel.getByLabel(label, { exact: true })).toHaveJSProperty(
        "spellcheck",
        false,
      );
    const preview = panel.locator(".highlight-preview-section");
    const toggle = preview.getByRole("button", {
      name: "Preview",
      exact: true,
    });
    await toggle.click();
    await expect(preview.locator(".virtual-event").first()).toBeVisible();
    expect(
      await preview.locator(".highlight-events-preview-caption").count(),
    ).toBe(0);
    const geometry = await preview
      .locator(".highlight-events-preview")
      .evaluate((element) => {
        const outer = element.getBoundingClientRect(),
          grid = element
            .querySelector(".highlight-events-preview-grid")!
            .getBoundingClientRect();
        return {
          top: grid.top - outer.top,
          bottom: outer.bottom - grid.bottom,
        };
      });
    expect(Math.abs(geometry.top)).toBeLessThanOrEqual(1);
    expect(Math.abs(geometry.bottom)).toBeLessThanOrEqual(1);
    await expect(panel.locator(".highlight-editor-note")).toHaveCount(0);
    await toggle.click();
    await expect(preview.locator(".highlight-preview-body")).toHaveCount(0);
    await toggle.click();
    await expect(preview.locator(".virtual-event").first()).toBeVisible();
    await capture(`${theme}-tree-compact-preview.png`);
  });
}
for (const theme of ["light", "dark"]) {
  test(`${theme} compact highlight tree shares Explorer row typography, selection and highlight icon`, async () => {
    await openTree();
    const row = treeRow("rule", "ERROR");
    await row.click();
    const explorer = page.locator(".resource-row .resource-label").first();
    const fontSize = await explorer.evaluate(
      (element) => getComputedStyle(element).fontSize,
    );
    await expect(row.locator(".highlight-tree-label")).toHaveCSS(
      "font-size",
      fontSize,
    );
    expect((await row.boundingBox())!.height).toBe(32);
    await expect(row.locator("svg.tabler-icon-highlight")).toBeVisible();
    await expect(row.locator("svg.tabler-icon-regex")).toHaveCount(0);
    await expect(row).toHaveClass(/resource-row/);
    await expect(treeRow("profile", "Other")).toHaveAttribute(
      "data-disabled",
      "true",
    );
    await capture(`compact-highlight-tree-${theme}.png`);
  });

  test(`${theme} whole-row tree drags reorder sibling rules and expanded profile blocks without changing the editor`, async () => {
    await openTree();
    await treeRow("rule", "ERROR").click();
    const editor = settings().getByLabel("Match regex", { exact: true });
    await editor.fill("[");
    const input = await editor.elementHandle();
    let start = await point(treeRow("rule", "ERROR")),
      end = await point(treeRow("rule", "INFO"));
    await page.mouse.move(start.x, start.y);
    await page.mouse.down();
    await page.mouse.move(start.x, start.y + 7, { steps: 2 });
    await page.mouse.move(end.x, end.y, { steps: 8 });
    await expect(
      settings().locator('.highlight-tree-drag-item[data-dragging="true"]'),
    ).toHaveCount(1);
    await expect
      .poll(async () => (await savedProfiles())[0].rules.map((rule) => rule.id))
      .toEqual(["first", "second", "third"]);
    await page.mouse.up();
    await expect
      .poll(async () => (await savedProfiles())[0].rules.map((rule) => rule.id))
      .toEqual(["second", "third", "first"]);
    await expect(editor).toHaveValue("[");
    expect(await input!.evaluate((element) => element.isConnected)).toBe(true);
    start = await point(treeRow("profile", "Default"));
    end = await point(treeRow("profile", "Other"));
    await page.mouse.move(start.x, start.y);
    await page.mouse.down();
    await page.mouse.move(start.x, start.y + 8, { steps: 2 });
    await page.mouse.move(end.x, end.y, { steps: 10 });
    await page.mouse.up();
    await expect
      .poll(async () => (await savedProfiles()).map((profile) => profile.id))
      .toEqual(["other", "default"]);
    await expect
      .poll(async () => (await savedProfiles())[1].rules.map((rule) => rule.id))
      .toEqual(["second", "third", "first"]);
    await expect(editor).toHaveValue("[");
    expect(await input!.evaluate((element) => element.isConnected)).toBe(true);
    await capture(`tree-drag-reorder-${theme}.png`);
  });
}

test("tree keyboard drags and pointer cancellation preserve selection, order and Settings", async () => {
  await openTree();
  const row = treeRow("rule", "ERROR");
  await row.click();
  await row.focus();
  await page.keyboard.press("Space");
  await expect(
    settings().locator('.highlight-tree-drag-item[data-dragging="true"]'),
  ).toHaveCount(1);
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
        (await row.boundingBox())!.y >
        (await treeRow("rule", "WARN").boundingBox())!.y,
    )
    .toBe(true);
  await page.keyboard.press("Space");
  await expect
    .poll(async () => (await savedProfiles())[0].rules.map((rule) => rule.id))
    .toEqual(["second", "first", "third"]);
  const start = await point(row),
    end = await point(treeRow("rule", "INFO"));
  await action("Expand profile Other").click();
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(start.x, start.y + 8, { steps: 2 });
  await page.mouse.move(end.x, end.y, { steps: 5 });
  await page.keyboard.press("Escape");
  await page.mouse.up();
  await expect(settings()).toBeVisible();
  await expect
    .poll(async () => (await savedProfiles())[0].rules.map((rule) => rule.id))
    .toEqual(["second", "first", "third"]);
  await expect(
    settings().getByLabel("Match regex", { exact: true }),
  ).toHaveValue("ERROR");
  const source = await point(row),
    outside = await point(
      settings().locator(".highlight-tree-detail .highlight-panel-heading"),
    );
  await page.mouse.move(source.x, source.y);
  await page.mouse.down();
  await page.mouse.move(source.x, source.y + 8, { steps: 2 });
  await page.mouse.move(outside.x, outside.y, { steps: 8 });
  await page.mouse.up();
  await expect
    .poll(async () => (await savedProfiles())[0].rules.map((rule) => rule.id))
    .toEqual(["second", "first", "third"]);
  for (const target of [
    treeRow("profile", "Other"),
    treeRow("rule", "OTHER"),
  ]) {
    const origin = await point(row),
      destination = await point(target);
    await page.mouse.move(origin.x, origin.y);
    await page.mouse.down();
    await page.mouse.move(origin.x, origin.y + 8, { steps: 2 });
    await page.mouse.move(destination.x, destination.y, { steps: 8 });
    await page.mouse.up();
    const applied = await savedProfiles();
    expect(applied[0].rules.map((rule) => rule.id)).toEqual([
      "second",
      "first",
      "third",
    ]);
    expect(applied[1].rules.map((rule) => rule.id)).toEqual(["other-first"]);
  }
});
test("tree scrolling keeps a tall expanded profile draggable past the visible viewport", async () => {
  await openTree();
  const profile = treeRow("profile", "Default");
  await profile.click();
  await profile.focus();
  await page.keyboard.press("Space");
  await expect(
    settings().locator('.highlight-tree-drag-item[data-dragging="true"]'),
  ).toHaveCount(1);
  await page.evaluate(
    () =>
      new Promise<void>((done) =>
        requestAnimationFrame(() => requestAnimationFrame(() => done())),
      ),
  );
  await page.keyboard.press("ArrowDown");
  await expect
    .poll(() =>
      settings()
        .locator(".highlight-tree-scroll")
        .evaluate((element) => element.scrollTop),
    )
    .toBeGreaterThan(0);
  await page.keyboard.press("Space");
  await expect
    .poll(async () => (await savedProfiles()).map((profile) => profile.id))
    .toEqual(["other", "default"]);
  await expect
    .poll(async () => (await savedProfiles())[1].rules)
    .toHaveLength(20);
  await expect(
    settings().getByLabel("Profile name", { exact: true }),
  ).toHaveValue("Default");
});
const treeRow = (kind: "profile" | "rule", name: string) =>
  settings().getByRole("treeitem", {
    name: `Select ${kind} ${name}`,
    exact: true,
  });

for (const theme of ["light", "dark"]) {
  test(`${theme} tree highlights applies edits immediately and preserves docking state`, async () => {
    const tree = await openTree();
    await expect(tree.getByRole("checkbox")).toHaveCount(0);
    await expect(treeRow("profile", "Other")).toHaveAttribute(
      "data-disabled",
      "true",
    );
    await treeRow("rule", "ERROR").click();
    const right = settings().locator(".highlight-tree-detail");
    await right.getByLabel("Match regex", { exact: true }).fill("WARN|ERROR");
    await expect
      .poll(async () => (await savedProfiles())[0].rules[0].pattern)
      .toBe("WARN|ERROR");
    await right.getByLabel("Match regex", { exact: true }).fill("[");
    await expect(right.getByLabel("Match regex", { exact: true })).toHaveValue(
      "[",
    );
    await expect
      .poll(async () => (await savedProfiles())[0].rules[0].pattern)
      .toBe("WARN|ERROR");
    await right.getByLabel("Match regex", { exact: true }).fill("TREE_ERROR");
    await expect
      .poll(async () => (await savedProfiles())[0].rules[0].pattern)
      .toBe("TREE_ERROR");
    await expect(
      right.getByRole("button", { name: /^Save|^Delete/ }),
    ).toHaveCount(0);
    await expect(right.getByLabel("Match regex", { exact: true })).toHaveValue(
      "TREE_ERROR",
    );
    await action("Return settings to pane").click();
    const pane = page.getByRole("region", { name: "Settings", exact: true });
    await expect(pane.getByLabel("Match regex", { exact: true })).toHaveValue(
      "TREE_ERROR",
    );
    await action("Open settings in window", pane).click();
    await expect(
      settings().getByLabel("Match regex", { exact: true }),
    ).toHaveValue("TREE_ERROR");
    const toggle = settings().locator(
      ".highlight-tree-editor .highlight-preview-toggle",
    );
    await toggle.click();
    await expect(settings().locator(".highlight-events-theme")).toHaveCount(2);
    const divider = settings().getByRole("separator", {
      name: "Resize highlight tree and editor",
      exact: true,
    });
    await divider.focus();
    const before = await divider.getAttribute("aria-valuenow");
    await page.keyboard.press("ArrowRight");
    await expect(divider).not.toHaveAttribute("aria-valuenow", before!);
    await capture(`tree-highlights-${theme}.png`);
  });

  test(`${theme} tree context menus are exclusive, reorder siblings and confirm exact deletion inline`, async () => {
    await openTree();
    await treeRow("profile", "Default").click({ button: "right" });
    await expect(
      page.getByRole("menuitem", {
        name: "Add profile after default",
        exact: true,
      }),
    ).toBeVisible();
    await page
      .getByRole("menuitem", { name: "Move profile Default down", exact: true })
      .click();
    await expect
      .poll(async () => (await savedProfiles()).map((profile) => profile.id))
      .toEqual(["other", "default"]);
    await treeRow("rule", "ERROR").click({ button: "right" });
    await expect(
      page.getByRole("menuitem", { name: /^Add profile/ }),
    ).toHaveCount(0);
    await page
      .getByRole("menuitem", { name: "Move rule ERROR down", exact: true })
      .click();
    await expect
      .poll(async () =>
        (await savedProfiles())
          .find((profile) => profile.id === "default")!
          .rules.map((rule) => rule.id),
      )
      .toEqual(["second", "first", "third"]);
    await treeRow("rule", "ERROR").click({ button: "right" });
    await treeRow("profile", "Default").click({ button: "right" });
    await expect(page.getByRole("menu")).toHaveCount(1);
    await page
      .getByRole("menuitem", { name: "Delete profile Default", exact: true })
      .click();
    const confirm = treeRow("profile", "Default").getByRole("group", {
      name: "Delete highlight profile Default",
      exact: true,
    });
    await expect(confirm).toBeVisible();
    await expect(confirm.getByRole("button")).toHaveText(["Delete", "Cancel"]);
    await expect(page.getByRole("dialog")).toHaveCount(1);
    await expect.poll(async () => await savedProfiles()).toHaveLength(2);
    await confirm.getByRole("button", { name: "Cancel", exact: true }).click();
    await expect(confirm).toHaveCount(0);
    await expect(settings()).toBeVisible();
    await expect.poll(async () => await savedProfiles()).toHaveLength(2);
    await treeRow("profile", "Default").click({ button: "right" });
    await page
      .getByRole("menuitem", { name: "Delete profile Default", exact: true })
      .click();
    await confirm.getByRole("button", { name: "Delete", exact: true }).click();
    await expect
      .poll(async () => (await savedProfiles()).map((profile) => profile.id))
      .toEqual(["other"]);
    await expect(
      settings().getByLabel("Profile name", { exact: true }),
    ).toHaveValue("Other");
    await capture(`tree-menu-delete-${theme}.png`);
  });
}

test("tree additions focus an immediate editor and all panels remain usable in a narrow pane", async () => {
  await openTree();
  await action("Add highlight profile").click();
  const name = settings().getByLabel("Profile name", { exact: true });
  await expect(name).toBeFocused();
  await name.fill("Tree addition");
  await expect
    .poll(async () => (await savedProfiles()).at(-1)!.name)
    .toBe("Tree addition");
  const added = (await savedProfiles()).at(-1)!;
  await treeRow("profile", "Tree addition").click({ button: "right" });
  await page
    .getByRole("menuitem", { name: `Add rule to ${added.id}`, exact: true })
    .click();
  const pattern = settings().getByLabel("Match regex", { exact: true });
  await expect(pattern).toBeFocused();
  await pattern.fill("NEW_TREE_RULE");
  await expect
    .poll(async () => (await savedProfiles()).at(-1)!.rules.at(-1)!.pattern)
    .toBe("NEW_TREE_RULE");
  await action("Return settings to pane").click();
  const pane = page.getByRole("region", { name: "Settings", exact: true });
  await page.evaluate(() => {
    const host =
      document.querySelector<HTMLElement>(".app-explorer") ??
      document.querySelector<HTMLElement>(".settings-pane")?.parentElement;
    if (host) host.style.width = "300px";
  });
  await expect(
    pane.getByRole("tree", { name: "Highlight profiles and rules" }),
  ).toBeVisible();
  const divider = pane.getByRole("separator", {
    name: "Resize highlight tree and editor",
    exact: true,
  });
  await expect(divider).toHaveAttribute("aria-orientation", "horizontal");
  await expect(pane.getByLabel("Match regex", { exact: true })).toHaveValue(
    "NEW_TREE_RULE",
  );
  await expect(pane.locator(".highlight-events-theme")).toHaveCount(0);
});

for (const theme of ["light", "dark"]) {
  test(`${theme} inline highlight deletion preserves editors, dragging and confirmation across docking`, async () => {
    await openTree();
    const row = treeRow("rule", "ERROR");
    await row.click();
    await settings().getByLabel("Match regex", { exact: true }).fill("[");
    const trigger = row.getByRole("button", {
      name: "Delete highlight rule ERROR",
      exact: true,
    });
    const box = (await row.boundingBox())!;
    await row.hover();
    await expect(trigger).toHaveCSS("opacity", "1");
    await trigger.click();
    const confirmation = row.getByRole("group", {
      name: "Delete highlight rule ERROR",
      exact: true,
    });
    await expect(confirmation.getByRole("button")).toHaveText([
      "Delete",
      "Cancel",
    ]);
    await expect(row).toHaveAttribute("data-confirming-delete", "true");
    expect((await row.boundingBox())!.height).toBe(box.height);
    const bg = await row.evaluate(
      (element) => getComputedStyle(element).backgroundColor,
    );
    await treeRow("rule", "WARN").click();
    await expect(confirmation).toBeVisible();
    expect(
      await row.evaluate(
        (element) => getComputedStyle(element).backgroundColor,
      ),
    ).toBe(bg);
    expect((await savedProfiles())[0].rules).toHaveLength(3);
    await confirmation
      .getByRole("button", { name: "Cancel", exact: true })
      .click();
    await row.click();
    await expect(
      settings().getByLabel("Match regex", { exact: true }),
    ).toHaveValue("ERROR");
    await row.focus();
    await page.keyboard.press("Delete");
    await expect(confirmation).toBeVisible();
    await action("Return settings to pane").click();
    const pane = page.getByRole("region", { name: "Settings", exact: true });
    const pendingRow = pane.locator('[data-tree-rule="first"]');
    const pending = pendingRow.getByRole("group", {
      name: "Delete highlight rule ERROR",
      exact: true,
    });
    await expect(pending).toBeVisible();
    await expect(pane.getByLabel("Match regex", { exact: true })).toHaveValue(
      "ERROR",
    );
    // Constrain the tree to its narrow stacked layout. The confirmation must
    // remain inside its row, including real button hit targets.
    const sidebar = page.locator(".sidebar-shell");
    const sidebarBox = (await sidebar.boundingBox())!;
    const divider = (await page.locator(".sidebar-resizer").boundingBox())!;
    await page.mouse.move(divider.x + divider.width / 2, 200);
    await page.mouse.down();
    await page.mouse.move(
      divider.x + divider.width / 2 + 280 - sidebarBox.width,
      200,
      { steps: 8 },
    );
    await page.mouse.up();
    const rowBox = (await pendingRow.boundingBox())!;
    for (const button of await pending.getByRole("button").all()) {
      const bounds = (await button.boundingBox())!;
      expect(bounds.x).toBeGreaterThanOrEqual(rowBox.x);
      expect(bounds.x + bounds.width).toBeLessThanOrEqual(
        rowBox.x + rowBox.width + 1,
      );
      expect(
        await button.evaluate((element) =>
          parseFloat(getComputedStyle(element).borderTopWidth),
        ),
      ).toBeGreaterThan(0);
      await expect(button).toHaveCSS("border-top-style", "solid");
    }
    await capture(`${theme}-highlight-inline-confirmation.png`);
    await pending.getByRole("button", { name: "Delete", exact: true }).click();
    await expect(pendingRow).toHaveCount(0);
    await expect(pane.getByLabel("Match regex", { exact: true })).toHaveValue(
      "WARN",
    );
    await expect
      .poll(async () => (await savedProfiles())[0].rules.map((rule) => rule.id))
      .toEqual(["second", "third"]);
    await pane.locator('[data-tree-profile="default"][aria-level="1"]').hover();
    await pane
      .getByRole("button", {
        name: "Delete highlight profile Default",
        exact: true,
      })
      .click();
    const profileConfirm = pane.getByRole("group", {
      name: "Delete highlight profile Default",
      exact: true,
    });
    await profileConfirm
      .getByRole("button", { name: "Cancel", exact: true })
      .focus();
    await page.keyboard.press("Enter");
    await expect(profileConfirm).toHaveCount(0);
    await expect
      .poll(async () => (await savedProfiles()).map((profile) => profile.id))
      .toEqual(["default", "other"]);
  });
}
