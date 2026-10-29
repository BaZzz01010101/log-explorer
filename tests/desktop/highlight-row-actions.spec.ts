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
  await expect(page.getByText("Saved locally", { exact: true })).toBeVisible();
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

for (const theme of ["light", "dark"]) {
  test(`${theme} read-only details retain the exact editor fields and geometry when Edit is enabled`, async () => {
    await action("Expand profile Default").click();
    await action("Expand rule 1").click();
    await action("Expand rule 2").click({ modifiers: ["Shift"] });
    await expect(detail("rule", "first")).toBeVisible();
    await expect(detail("rule", "second")).toBeVisible();
    for (const [kind, id, name, labels] of [
      ["profile", "default", "Default", ["Profile name", "Log group regex"]],
      [
        "rule",
        "first",
        "1",
        [
          "JSON Pointer path",
          "Match regex",
          "Light foreground",
          "Light background",
          "Dark foreground",
          "Dark background",
        ],
      ],
    ] as const) {
      const editor = detail(kind, id);
      await expect(editor.getByLabel("Priority", { exact: true })).toHaveCount(
        0,
      );
      for (const label of labels)
        await expect(
          editor.getByLabel(label, { exact: true }),
        ).toHaveJSProperty("readOnly", true);
      const switches = await editor.getByRole("switch").all();
      for (const control of switches) {
        await expect(control).toHaveJSProperty("readOnly", true);
        const checked = await control.isChecked();
        await control.locator("..").click();
        expect(await control.isChecked()).toBe(checked);
      }
      if (kind === "rule") {
        await expect(summary("rule", "first")).toHaveAttribute(
          "aria-selected",
          "false",
        );
        await editor
          .getByRole("combobox", { name: "Search in", exact: true })
          .click();
        await expect(page.getByRole("option")).toHaveCount(0);
        await editor.getByLabel("Light background", { exact: true }).click();
        await expect(page.locator(".mantine-ColorPicker-root")).toHaveCount(0);
        await expect(
          editor.getByRole("switch", { name: "Ignore case", exact: true }),
        ).toBeChecked();
        await expect(
          editor.getByRole("switch", {
            name: "Separate light and dark colors",
            exact: true,
          }),
        ).toBeChecked();
      }
      const expectedScroll = await item(kind, id).evaluate(
        (element, scrollTop) => {
          const viewport = element.closest(".highlight-items-scroll")!;
          viewport.scrollTop = scrollTop;
          return viewport.scrollTop;
        },
        kind === "rule" ? 5 : 0,
      );
      await wake();
      const before = await geometry(editor),
        controls = await editor
          .locator("input,textarea,.mantine-Switch-root")
          .elementHandles();
      const editButton = action(`Edit ${kind} ${name}`),
        deletePoint = await point(action(`Delete ${kind} ${name}`));
      const editBox = (await editButton.boundingBox())!,
        deleteBox = (await action(`Delete ${kind} ${name}`).boundingBox())!;
      expect(editBox.x + editBox.width).toBeLessThanOrEqual(deleteBox.x);
      await editButton.click();
      await expect(item(kind, id)).toHaveAttribute("data-row-state", "editing");
      await assertStrip(kind, id, "edit", deletePoint);
      await assertTint(kind, id, "green");
      expect(await geometry(editor)).toEqual(before);
      expect(
        await item(kind, id).evaluate(
          (element) => element.closest(".highlight-items-scroll")!.scrollTop,
        ),
      ).toBe(expectedScroll);
      for (const control of controls)
        expect(await control.evaluate((element) => element.isConnected)).toBe(
          true,
        );
      for (const label of labels)
        await expect(
          editor.getByLabel(label, { exact: true }),
        ).toHaveJSProperty("readOnly", false);
      for (const control of switches)
        await expect(control).toHaveJSProperty("readOnly", false);
      await action(`Cancel ${kind} edit`).click();
      expect(await geometry(editor)).toEqual(before);
      for (const control of controls)
        expect(await control.evaluate((element) => element.isConnected)).toBe(
          true,
        );
    }
    await capture(`highlight-detail-geometry-${theme}.png`);
  });

  test(`${theme} Add opens blue draft rows immediately and Cancel removes only newly added items`, async () => {
    await action("Add rule").click();
    const newRule = table("rule").locator('tbody[data-row-state="new"]');
    await expect(newRule).toHaveCount(1);
    const ruleId = (await newRule
      .locator("tr[data-rule-id]")
      .getAttribute("data-rule-id"))!;
    await expect(
      detail("rule", ruleId).getByLabel("Match regex", { exact: true }),
    ).toBeEditable();
    await assertTint("rule", ruleId, "blue");
    await detail("rule", ruleId)
      .getByLabel("Match regex", { exact: true })
      .fill("UNSAVED_NEW");
    expect((await savedProfiles())[0].rules).toHaveLength(3);
    await action("Cancel rule edit").click();
    await expect(item("rule", ruleId)).toHaveCount(0);
    expect((await savedProfiles())[0].rules).toHaveLength(3);

    await action("Add profile").click();
    const newProfile = table("profile").locator('tbody[data-row-state="new"]');
    const profileId = (await newProfile
      .locator("tr[data-profile-id]")
      .getAttribute("data-profile-id"))!;
    await expect(
      detail("profile", profileId).getByLabel("Profile name", { exact: true }),
    ).toBeEditable();
    await expect(table("rule").locator("tr[data-rule-id]")).toHaveCount(1);
    await assertTint("profile", profileId, "blue");
    expect(await savedProfiles()).toHaveLength(2);
    await action("Cancel profile edit").click();
    await expect(item("profile", profileId)).toHaveCount(0);
    expect(await savedProfiles()).toHaveLength(2);

    await action("Add profile").click();
    const added = table("profile").locator('tbody[data-row-state="new"]');
    await added
      .getByLabel("Profile name", { exact: true })
      .fill("Saved addition");
    await action("Save profile").click();
    await expect
      .poll(async () =>
        (await savedProfiles()).map(
          (profile: { name: string }) => profile.name,
        ),
      )
      .toEqual(["Default", "Other", "Saved addition"]);
    await expect(added).toHaveCount(0);
    await expect(table("rule").locator("tr[data-rule-id]")).toHaveCount(1);
  });

  test(`${theme} deletion stays in the summary row and double-clicking the original icon cancels safely`, async () => {
    for (const [kind, id, name] of [
      ["rule", "second", "2"],
      ["profile", "other", "Other"],
    ] as const) {
      const original = await point(action(`Delete ${kind} ${name}`)),
        before = await summary(kind, id).boundingBox();
      await action(`Delete ${kind} ${name}`).click();
      await expect(item(kind, id)).toHaveAttribute(
        "data-row-state",
        "deleting",
      );
      await expect(
        item(kind, id).getByRole("alertdialog", {
          name: `Delete ${kind}?`,
          exact: true,
        }),
      ).toBeVisible();
      await expect(detail(kind, id)).toHaveCount(0);
      await assertStrip(kind, id, "delete", original);
      await assertTint(kind, id, "red", false);
      expect(await summary(kind, id).boundingBox()).toEqual(before);
      await action("Cancel deletion").click();
      await page.mouse.dblclick(original.x, original.y);
      await expect(item(kind, id)).not.toHaveAttribute(
        "data-row-state",
        "deleting",
      );
      await expect(item(kind, id)).toHaveCount(1);
      await expect(detail(kind, id)).toHaveCount(0);
    }
    expect(
      (await savedProfiles()).map((profile: { id: string }) => profile.id),
    ).toEqual(["default", "other"]);
    expect(
      (await savedProfiles())[0].rules.map((rule: { id: string }) => rule.id),
    ).toEqual(["first", "second", "third"]);
  });
}

test("new-profile rule saves stay local, rule Cancel discards additions, and parent Cancel discards saved local rules", async () => {
  const original = await savedProfiles();
  await action("Add profile").click();
  const canceledProfile = table("profile").locator(
    'tbody[data-row-state="new"]',
  );
  const canceledProfileId = (await canceledProfile
    .locator("tr[data-profile-id]")
    .getAttribute("data-profile-id"))!;
  await canceledProfile
    .getByLabel("Profile name", { exact: true })
    .fill("Discard parent");
  await action("Add rule").click();
  const localRule = table("rule").locator('tbody[data-row-state="new"]');
  const localRuleId = (await localRule
    .locator("tr[data-rule-id]")
    .getAttribute("data-rule-id"))!;
  await localRule
    .getByLabel("Match regex", { exact: true })
    .fill("SAVED_LOCALLY_ONLY");
  await action("Save rule", localRule).click();
  await expect(
    item("rule", localRuleId).getByLabel("Match regex", { exact: true }),
  ).toHaveValue("SAVED_LOCALLY_ONLY");
  expect(await savedProfiles()).toEqual(original);
  await action("Cancel profile edit", canceledProfile).click();
  await expect(item("profile", canceledProfileId)).toHaveCount(0);
  expect(await savedProfiles()).toEqual(original);

  await action("Add profile").click();
  const savedProfile = table("profile").locator('tbody[data-row-state="new"]');
  const profileId = (await savedProfile
    .locator("tr[data-profile-id]")
    .getAttribute("data-profile-id"))!;
  await savedProfile
    .getByLabel("Profile name", { exact: true })
    .fill("Nested saved profile");
  const seedId = (await table("rule")
    .locator("tr[data-rule-id]")
    .getAttribute("data-rule-id"))!;
  await action("Add rule").click();
  const discardedRule = table("rule").locator('tbody[data-row-state="new"]');
  const discardedRuleId = (await discardedRule
    .locator("tr[data-rule-id]")
    .getAttribute("data-rule-id"))!;
  await discardedRule
    .getByLabel("Match regex", { exact: true })
    .fill("DISCARD_CHILD");
  await action("Cancel rule edit", discardedRule).click();
  await expect(item("rule", discardedRuleId)).toHaveCount(0);
  expect(await savedProfiles()).toEqual(original);

  await action("Add rule").click();
  const keptRule = table("rule").locator('tbody[data-row-state="new"]');
  const keptRuleId = (await keptRule
    .locator("tr[data-rule-id]")
    .getAttribute("data-rule-id"))!;
  await keptRule.getByLabel("Match regex", { exact: true }).fill("KEEP_CHILD");
  await action("Save rule", keptRule).click();
  expect(await savedProfiles()).toEqual(original);
  await action("Save profile", savedProfile).click();
  const applied = await savedProfiles();
  expect(applied.slice(0, 2)).toEqual(original);
  expect(applied[2].id).toBe(profileId);
  expect(applied[2].name).toBe("Nested saved profile");
  expect(applied[2].rules.map((rule) => rule.id)).toEqual([seedId, keptRuleId]);
  expect(applied[2].rules[1].pattern).toBe("KEEP_CHILD");
});

for (const newProfile of [false, true])
  test(`saving ${newProfile ? "a new" : "an existing"} profile keeps pending new rules local until their own Save`, async () => {
    const original = await savedProfiles();
    if (newProfile) await action("Add profile").click();
    else await action("Edit profile Default").click();
    const profile = newProfile
      ? table("profile").locator('tbody[data-row-state="new"]')
      : item("profile", "default");
    const profileId = (await profile
      .locator("tr[data-profile-id]")
      .getAttribute("data-profile-id"))!;
    const originalRuleIds = await table("rule")
      .locator("tr[data-rule-id]")
      .evaluateAll((rows) =>
        rows.map((row) => row.getAttribute("data-rule-id")),
      );
    await profile
      .getByLabel("Profile name", { exact: true })
      .fill("Profile config saved");
    await action("Add rule").click();
    const pendingRule = table("rule").locator('tbody[data-row-state="new"]');
    const ruleId = (await pendingRule
      .locator("tr[data-rule-id]")
      .getAttribute("data-rule-id"))!;
    await pendingRule
      .getByLabel("Match regex", { exact: true })
      .fill("WAIT_FOR_RULE_SAVE");
    expect(await savedProfiles()).toEqual(original);
    await action("Save profile", profile).click();
    const afterProfileSave = (await savedProfiles()).find(
      (candidate) => candidate.id === profileId,
    )!;
    expect(afterProfileSave.name).toBe("Profile config saved");
    expect(afterProfileSave.rules.map((rule) => rule.id)).toEqual(
      originalRuleIds,
    );
    await expect(item("rule", ruleId)).toHaveAttribute("data-row-state", "new");
    await expect(
      item("rule", ruleId).getByLabel("Match regex", { exact: true }),
    ).toHaveValue("WAIT_FOR_RULE_SAVE");
    await action("Save rule", item("rule", ruleId)).click();
    const afterRuleSave = (await savedProfiles()).find(
      (candidate) => candidate.id === profileId,
    )!;
    expect(afterRuleSave.rules.map((rule) => rule.id)).toEqual([
      ...originalRuleIds,
      ruleId,
    ]);
    expect(afterRuleSave.rules.at(-1)!.pattern).toBe("WAIT_FOR_RULE_SAVE");
  });

test("ordinary unfolding replaces only its own list while Shift keeps other details and drafts survive folding and docking", async () => {
  await action("Expand profile Default").click();
  await action("Expand profile Other").click();
  await expect(detail("profile", "default")).toHaveCount(0);
  await action("Expand profile Default").click({ modifiers: ["Shift"] });
  await expect(detail("profile", "other")).toBeVisible();
  await action("Collapse profile Default").click();
  await expect(detail("profile", "other")).toBeVisible();
  await action("Expand rule 1").click();
  await action("Expand rule 2").click();
  await expect(detail("rule", "first")).toHaveCount(0);
  await action("Expand rule 1").click({ modifiers: ["Shift"] });
  await expect(detail("rule", "second")).toBeVisible();
  await expect(detail("profile", "other")).toBeVisible();
  await action("Collapse rule 1").click();
  await expect(detail("rule", "second")).toBeVisible();
  await action("Edit rule 1").click();
  await expect(detail("rule", "first")).toBeVisible();
  await expect(item("rule", "first")).toHaveAttribute(
    "data-row-state",
    "editing",
  );
  await detail("rule", "first")
    .getByLabel("Match regex", { exact: true })
    .fill("FOLDED_DRAFT");
  await action("Collapse rule 1").click();
  await action("Expand rule 1").click();
  await expect(
    detail("rule", "first").getByLabel("Match regex", { exact: true }),
  ).toHaveValue("FOLDED_DRAFT");
  await action("Return settings to pane").click();
  const pane = page.getByRole("region", { name: "Settings", exact: true });
  await expect(
    detail("rule", "first", pane).getByLabel("Match regex", { exact: true }),
  ).toHaveValue("FOLDED_DRAFT");
  await action("Open settings in window", pane).click();
  await expect(
    detail("rule", "first").getByLabel("Match regex", { exact: true }),
  ).toHaveValue("FOLDED_DRAFT");
  expect((await savedProfiles())[0].rules[0].pattern).toBe("ERROR");
  await action("Save rule").click();
  await expect
    .poll(async () => (await savedProfiles())[0].rules[0].pattern)
    .toBe("FOLDED_DRAFT");
});

test("row action strips reveal from right to left without shifting the summary contents", async () => {
  await page.emulateMedia({ reducedMotion: "no-preference" });
  const row = summary("rule", "first"),
    contents = row.locator("td");
  const before = await contents.evaluateAll((elements) =>
    elements.map((element) => {
      const rect = element.getBoundingClientRect();
      return [rect.x, rect.y, rect.width, rect.height];
    }),
  );
  for (const mode of ["delete", "edit"] as const) {
    await action(mode === "delete" ? "Delete rule 1" : "Edit rule 1").evaluate(
      (button) => (button as HTMLButtonElement).click(),
    );
    const strip = item("rule", "first").locator(
      `.highlight-action-strip[data-action="${mode}"]`,
    );
    const reveal = await strip.evaluate((element) => {
      const animation = element
        .getAnimations()
        .find(
          (candidate) =>
            candidate.effect instanceof KeyframeEffect &&
            candidate.effect.getKeyframes().some((frame) => frame.clipPath),
        );
      if (!(animation?.effect instanceof KeyframeEffect)) return null;
      animation.pause();
      const duration = Number(animation.effect.getTiming().duration);
      const sample = (at: number) => {
        animation.currentTime = at;
        return getComputedStyle(element).clipPath;
      };
      const result = {
        duration,
        start: sample(0),
        middle: sample(duration / 2),
        end: sample(duration),
      };
      animation.finish();
      return result;
    });
    expect(reveal).not.toBeNull();
    expect(reveal!.duration).toBeGreaterThan(0);
    expect(reveal!.start).toMatch(
      /inset\(0(?:px|%)? 0(?:px|%)? 0(?:px|%)? 100%\)/,
    );
    expect(reveal!.middle).not.toEqual(reveal!.start);
    expect(reveal!.middle).not.toEqual(reveal!.end);
    expect(reveal!.end).toMatch(/inset\(0(?:px|%)?(?: 0(?:px|%)?){0,3}\)/);
    expect(
      await contents.evaluateAll((elements) =>
        elements.map((element) => {
          const rect = element.getBoundingClientRect();
          return [rect.x, rect.y, rect.width, rect.height];
        }),
      ),
    ).toEqual(before);
    await capture(`highlight-${mode}-strip.png`);
    await action(
      mode === "delete" ? "Cancel deletion" : "Cancel rule edit",
    ).click();
  }
});

test("Escape dismisses a nested selector before it can discard a row edit", async () => {
  await action("Edit rule 1").click();
  const editor = detail("rule", "first");
  await editor.getByLabel("Match regex", { exact: true }).fill("KEEP_DRAFT");
  const scope = editor.getByRole("combobox", {
    name: "Search in",
    exact: true,
  });
  await scope.click();
  await expect(page.getByRole("option").first()).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("option")).toHaveCount(0);
  await expect(editor.getByLabel("Match regex", { exact: true })).toHaveValue(
    "KEEP_DRAFT",
  );
  await expect(action("Save rule")).toBeVisible();
  await editor.getByLabel("Light background", { exact: true }).click();
  await expect(page.locator(".mantine-ColorInput-dropdown")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.locator(".mantine-ColorInput-dropdown")).toHaveCount(0);
  await expect(editor.getByLabel("Match regex", { exact: true })).toHaveValue(
    "KEEP_DRAFT",
  );
  await expect(action("Save rule")).toBeVisible();
});

async function openTree() {
  await settings()
    .getByRole("tab", { name: "Highlights tree", exact: true })
    .click();
  return settings().getByRole("tree", { name: "Highlight profiles and rules" });
}

for (const theme of ["light", "dark"]) {
  for (const design of ["Highlights", "Highlights tree"]) {
    test(`${theme} ${design} compact preview uses all freed space and code fields disable writing assistance`, async () => {
      await expect(page.locator(".virtual-event").first()).toBeVisible();
      const panel = settings().getByRole("tabpanel", {
        name: design,
        exact: true,
      });
      if (design === "Highlights tree") {
        await openTree();
        await treeRow("profile", "Default").click();
      } else {
        await action("Expand profile Default").click();
      }
      await expect(
        panel.getByLabel("Log group regex", { exact: true }),
      ).toHaveJSProperty("spellcheck", false);
      if (design === "Highlights tree") await treeRow("rule", "ERROR").click();
      else await action("Expand rule 1").click();
      for (const label of ["Match regex", "JSON Pointer path"]) {
        await expect(panel.getByLabel(label, { exact: true })).toHaveJSProperty(
          "spellcheck",
          false,
        );
      }
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
        .evaluate((el) => {
          const outer = el.getBoundingClientRect();
          const grid = el
            .querySelector(".highlight-events-preview-grid")!
            .getBoundingClientRect();
          return {
            top: grid.top - outer.top,
            bottom: outer.bottom - grid.bottom,
          };
        });
      expect(Math.abs(geometry.top)).toBeLessThanOrEqual(1);
      expect(Math.abs(geometry.bottom)).toBeLessThanOrEqual(1);
      await expect(
        panel.getByText(
          "Earlier rules take priority for overlapping colors and text.",
          { exact: true },
        ),
      ).toHaveCount(0);
      if (design === "Highlights tree") {
        await expect(
          panel.getByText("Default / ERROR", { exact: true }),
        ).toHaveCount(0);
        await expect(panel.locator(".highlight-editor-note")).toHaveCount(0);
        const gap = await panel
          .locator(".highlight-editor")
          .evaluate(
            (el) =>
              el.getBoundingClientRect().bottom -
              el
                .querySelector(".highlight-preview-section")!
                .getBoundingClientRect().bottom,
          );
        expect(Math.abs(gap)).toBeLessThanOrEqual(1);
      }
      await toggle.click();
      await expect(preview.locator(".highlight-preview-body")).toHaveCount(0);
      await toggle.click();
      await expect(preview.locator(".virtual-event").first()).toBeVisible();
      await capture(
        `${theme}-${design.replaceAll(" ", "-")}-compact-preview.png`,
      );
    });
  }
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
    expect((await savedProfiles())[0].rules.map((rule) => rule.id)).toEqual([
      "first",
      "second",
      "third",
    ]);
    await page.mouse.up();
    expect((await savedProfiles())[0].rules.map((rule) => rule.id)).toEqual([
      "second",
      "third",
      "first",
    ]);
    await expect(editor).toHaveValue("[");
    expect(await input!.evaluate((element) => element.isConnected)).toBe(true);
    start = await point(treeRow("profile", "Default"));
    end = await point(treeRow("profile", "Other"));
    await page.mouse.move(start.x, start.y);
    await page.mouse.down();
    await page.mouse.move(start.x, start.y + 8, { steps: 2 });
    await page.mouse.move(end.x, end.y, { steps: 10 });
    await page.mouse.up();
    expect((await savedProfiles()).map((profile) => profile.id)).toEqual([
      "other",
      "default",
    ]);
    expect((await savedProfiles())[1].rules.map((rule) => rule.id)).toEqual([
      "second",
      "third",
      "first",
    ]);
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
  expect((await savedProfiles())[0].rules.map((rule) => rule.id)).toEqual([
    "second",
    "first",
    "third",
  ]);
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
  expect((await savedProfiles())[0].rules.map((rule) => rule.id)).toEqual([
    "second",
    "first",
    "third",
  ]);
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
  expect((await savedProfiles())[0].rules.map((rule) => rule.id)).toEqual([
    "second",
    "first",
    "third",
  ]);
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
  expect((await savedProfiles()).map((profile) => profile.id)).toEqual([
    "other",
    "default",
  ]);
  expect((await savedProfiles())[1].rules).toHaveLength(20);
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
  test(`${theme} tree highlights applies edits immediately, shares the original editor and preserves docking state`, async () => {
    const tree = await openTree();
    await expect(tree.getByRole("checkbox")).toHaveCount(0);
    await expect(treeRow("profile", "Other")).toHaveAttribute(
      "data-disabled",
      "true",
    );
    await treeRow("rule", "ERROR").click();
    const right = settings().locator(".highlight-tree-detail");
    await right.getByLabel("Match regex", { exact: true }).fill("WARN|ERROR");
    expect((await savedProfiles())[0].rules[0].pattern).toBe("WARN|ERROR");
    await right.getByLabel("Match regex", { exact: true }).fill("[");
    await expect(right.getByLabel("Match regex", { exact: true })).toHaveValue(
      "[",
    );
    expect((await savedProfiles())[0].rules[0].pattern).toBe("WARN|ERROR");
    await right.getByLabel("Match regex", { exact: true }).fill("TREE_ERROR");
    expect((await savedProfiles())[0].rules[0].pattern).toBe("TREE_ERROR");
    await expect(
      right.getByRole("button", { name: /^Save|^Delete/ }),
    ).toHaveCount(0);
    await settings()
      .getByRole("tab", { name: "Highlights", exact: true })
      .click();
    await expect(summary("rule", "first")).toContainText("TREE_ERROR");
    await openTree();
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

  test(`${theme} tree context menus are exclusive, reorder siblings and confirm exact deletion in a modal`, async () => {
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
    expect((await savedProfiles()).map((profile) => profile.id)).toEqual([
      "other",
      "default",
    ]);
    await treeRow("rule", "ERROR").click({ button: "right" });
    await expect(
      page.getByRole("menuitem", { name: /^Add profile/ }),
    ).toHaveCount(0);
    await page
      .getByRole("menuitem", { name: "Move rule ERROR down", exact: true })
      .click();
    expect(
      (await savedProfiles())
        .find((profile) => profile.id === "default")!
        .rules.map((rule) => rule.id),
    ).toEqual(["second", "first", "third"]);
    await treeRow("rule", "ERROR").click({ button: "right" });
    await treeRow("profile", "Default").click({ button: "right" });
    await expect(page.getByRole("menu")).toHaveCount(1);
    await page
      .getByRole("menuitem", { name: "Delete profile Default", exact: true })
      .click();
    const confirm = page.getByRole("dialog", {
      name: "Delete highlight profile?",
      exact: true,
    });
    await expect(confirm).toBeVisible();
    await expect(confirm).toContainText("Default");
    await expect(confirm).toContainText("3 rules");
    expect(await savedProfiles()).toHaveLength(2);
    await page.keyboard.press("Escape");
    await expect(confirm).toHaveCount(0);
    await expect(settings()).toBeVisible();
    expect(await savedProfiles()).toHaveLength(2);
    await treeRow("profile", "Default").click({ button: "right" });
    await page
      .getByRole("menuitem", { name: "Delete profile Default", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Delete highlight item", exact: true })
      .click();
    expect((await savedProfiles()).map((profile) => profile.id)).toEqual([
      "other",
    ]);
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
  expect((await savedProfiles()).at(-1)!.name).toBe("Tree addition");
  const added = (await savedProfiles()).at(-1)!;
  await treeRow("profile", "Tree addition").click({ button: "right" });
  await page
    .getByRole("menuitem", { name: `Add rule to ${added.id}`, exact: true })
    .click();
  const pattern = settings().getByLabel("Match regex", { exact: true });
  await expect(pattern).toBeFocused();
  await pattern.fill("NEW_TREE_RULE");
  expect((await savedProfiles()).at(-1)!.rules.at(-1)!.pattern).toBe(
    "NEW_TREE_RULE",
  );
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
