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

test.setTimeout(150000);
const root = resolve(".tmp/desktop-highlight-tables");
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
    scope: "text" as const,
    path: "",
    pattern,
    ignoreCase: false,
    target: "row" as const,
    colors: { foreground: "#111827", background: "#fef08a" },
    separateThemeColors: false,
  });
  workspace.preferences.highlightProfiles = [
    {
      id: "default",
      name: "Default",
      enabled: true,
      groupPattern: "orders-api$",
      groupIgnoreCase: false,
      rules: [
        rule("first", "ERROR"),
        rule("second", "WARN"),
        {
          ...rule("third", "INFO"),
          enabled: false,
          scope: "structured",
          path: "/level",
          target: "text",
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
      groupPattern: "payments-worker$",
      groupIgnoreCase: true,
      rules: [rule("other-first", "OTHER")],
    },
    {
      id: "empty",
      name: "Empty",
      enabled: true,
      groupPattern: "",
      groupIgnoreCase: false,
      rules: [],
    },
  ];
  if (info.title.includes("near-bottom")) {
    const first = workspace.preferences.highlightProfiles[0];
    first.rules = Array.from({ length: 20 }, (_, i) =>
      rule(`many-${i}`, `RULE_${i}`),
    );
    first.rules[19] = {
      ...first.rules[19],
      scope: "structured",
      path: "/level",
      separateThemeColors: true,
      lightColors: { foreground: "#112233", background: "#ffddaa" },
      darkColors: { foreground: "#ddeeff", background: "#663300" },
    };
    workspace.preferences.highlightProfiles.push(
      ...Array.from({ length: 17 }, (_, i) => ({
        ...first,
        id: `profile-${i}`,
        name: `Profile ${i}`,
        rules: [rule(`profile-${i}-rule`, `PROFILE_${i}`)],
      })),
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
    win.setContentSize(1800, 1400);
    win.webContents.setBackgroundThrottling(false);
    dialog.showMessageBox = async () => {
      throw new Error(
        "Unexpected native dialog in hidden highlight table checks",
      );
    };
  });
  expect(
    (await page.evaluate(() => window.explorer.environment())).canEnableAws,
  ).toBe(false);
  await expect(page.locator('[data-node-kind="group"]')).toHaveCount(9);
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
    throw new Error("Unsafe highlight-table cleanup");
  await rm(directory, {
    recursive: true,
    force: true,
    maxRetries: 10,
    retryDelay: 100,
  });
});

const dialog = () =>
  page.getByRole("dialog", { name: "Settings", exact: true });

for (const theme of ["light", "dark"]) {
  test(`${theme} Highlights pane dividers resize live, cancel cleanly and retain edits`, async () => {
    await openHighlights();
    await resize(1100, 1000);
    await expand("rule", "1");
    await edit("rule");
    await detail("rules")
      .getByLabel("Match regex", { exact: true })
      .fill("pending resize");
    const lists = dialog().getByRole("separator", {
      name: "Resize profile and rule lists",
      exact: true,
    });
    await expect(lists).toHaveAttribute("aria-orientation", "vertical");
    const profiles = dialog()
      .getByRole("tabpanel", { name: "Highlights", exact: true })
      .locator(".highlight-profile-list");
    const rules = dialog()
      .getByRole("tabpanel", { name: "Highlights", exact: true })
      .locator(".highlight-rule-list");
    const before = (await profiles.boundingBox())!.width;
    let grip = (await lists.boundingBox())!;
    await page.mouse.move(grip.x + grip.width / 2, grip.y + grip.height / 2);
    await page.mouse.down();
    await page.mouse.move(grip.x + 100, grip.y + grip.height / 2, { steps: 5 });
    await expect
      .poll(async () => (await profiles.boundingBox())!.width)
      .toBeGreaterThan(before + 70);
    await page.mouse.up();
    const committed = (await profiles.boundingBox())!.width;
    grip = (await lists.boundingBox())!;
    await page.mouse.move(grip.x + grip.width / 2, grip.y + grip.height / 2);
    await page.mouse.down();
    await page.mouse.move(grip.x - 80, grip.y + grip.height / 2, { steps: 4 });
    await page.keyboard.press("Escape");
    await page.mouse.up();
    await expect(dialog()).toBeVisible();
    await expect
      .poll(async () => Math.round((await profiles.boundingBox())!.width))
      .toBe(Math.round(committed));
    await lists.focus();
    await page.keyboard.press("End");
    await expect(lists).toHaveAttribute(
      "aria-valuenow",
      (await lists.getAttribute("aria-valuemax"))!,
    );
    expect((await rules.boundingBox())!.width).toBeGreaterThanOrEqual(299);
    const clippedColors = await rules
      .locator(".mantine-ColorInput-input")
      .evaluateAll(
        (inputs) =>
          inputs.filter((input) => {
            const field = input as HTMLInputElement,
              style = getComputedStyle(field),
              context = document.createElement("canvas").getContext("2d")!;
            context.font = style.font;
            return (
              context.measureText(field.value).width >
              field.clientWidth -
                parseFloat(style.paddingLeft) -
                parseFloat(style.paddingRight) +
                1
            );
          }).length,
      );
    expect(clippedColors).toBe(0);
    await page.keyboard.press("Home");
    await expect(lists).toHaveAttribute("aria-valuenow", "50");
    await dialog()
      .getByRole("button", { name: "Preview", exact: true })
      .click();
    const preview = dialog()
      .getByRole("tabpanel", { name: "Highlights", exact: true })
      .locator(".highlight-preview-section");
    const divider = dialog().getByRole("separator", {
      name: "Resize highlight preview",
      exact: true,
    });
    await expect(divider).toHaveAttribute("aria-orientation", "horizontal");
    const oldHeight = (await preview.boundingBox())!.height;
    grip = (await divider.boundingBox())!;
    await page.mouse.move(grip.x + grip.width / 2, grip.y + grip.height / 2);
    await page.mouse.down();
    await page.mouse.move(grip.x + grip.width / 2, grip.y - 70, { steps: 5 });
    await expect
      .poll(async () => (await preview.boundingBox())!.height)
      .toBeGreaterThan(oldHeight + 45);
    await page.mouse.up();
    const ratio = await divider.getAttribute("aria-valuenow");
    await expect(
      dialog()
        .getByRole("tabpanel", { name: "Highlights", exact: true })
        .locator(".highlight-pane-divider"),
    ).toHaveCount(2);
    await expect(preview.locator(".highlight-pane-divider")).toHaveCount(0);
    await expect(
      detail("rules").getByLabel("Match regex", { exact: true }),
    ).toHaveValue("pending resize");
    await dialog()
      .getByRole("button", { name: "Preview", exact: true })
      .click();
    await expect(divider).toHaveCount(0);
    await dialog()
      .getByRole("button", { name: "Preview", exact: true })
      .click();
    await expect(divider).toHaveAttribute("aria-valuenow", ratio!);
    expect((await rules.boundingBox())!.width).toBeGreaterThan(250);
  });
}

test("Highlights pane dividers follow stacked and short layouts without hiding row controls", async () => {
  await openHighlights();
  await resize(740, 420);
  const lists = dialog().getByRole("separator", {
    name: "Resize profile and rule lists",
    exact: true,
  });
  await expect(lists).toHaveAttribute("aria-orientation", "horizontal");
  await lists.focus();
  const oldRatio = Number(await lists.getAttribute("aria-valuenow"));
  await page.keyboard.press("ArrowDown");
  await expect
    .poll(async () => Number(await lists.getAttribute("aria-valuenow")))
    .toBeGreaterThan(oldRatio);
  await expand("rule", "1");
  await edit("rule");
  await expect(
    detail("rules").getByLabel("Match regex", { exact: true }),
  ).toBeEditable();
  await dialog().getByRole("button", { name: "Preview", exact: true }).click();
  const preview = dialog().getByRole("separator", {
    name: "Resize highlight preview",
    exact: true,
  });
  await preview.scrollIntoViewIfNeeded();
  await preview.focus();
  await page.keyboard.press("ArrowUp");
  await expect(
    dialog()
      .getByRole("tabpanel", { name: "Highlights", exact: true })
      .locator(".highlight-preview-section"),
  ).toBeVisible();
  const before = await preview.getAttribute("aria-valuenow");
  await page.keyboard.press("ArrowDown");
  expect(Number(await preview.getAttribute("aria-valuenow"))).toBeGreaterThan(
    Number(before),
  );
  await expect(
    dialog()
      .getByRole("tabpanel", { name: "Highlights", exact: true })
      .locator(".highlight-events-preview-grid .highlight-pane-divider"),
  ).toHaveCount(0);
});

test("Highlights divider sizes survive docking and canceled gestures release capture after focus or category changes", async () => {
  await openHighlights();
  await resize(1100, 1000);
  const divider = dialog().getByRole("separator", {
    name: "Resize profile and rule lists",
    exact: true,
  });
  await divider.focus();
  await page.keyboard.press("ArrowRight");
  const ratio = await divider.getAttribute("aria-valuenow");
  await dialog()
    .getByRole("button", { name: "Return settings to pane", exact: true })
    .click();
  const pane = page.locator(".settings-pane");
  await expect(
    pane.getByRole("separator", {
      name: "Resize profile and rule lists",
      exact: true,
    }),
  ).toHaveAttribute("aria-orientation", "horizontal");
  await expect(
    pane.getByRole("separator", {
      name: "Resize highlight preview",
      exact: true,
    }),
  ).toHaveCount(0);
  await pane
    .getByRole("button", { name: "Open settings in window", exact: true })
    .click();
  await expect(divider).toHaveAttribute("aria-valuenow", ratio!);
  const profiles = dialog()
    .getByRole("tabpanel", { name: "Highlights", exact: true })
    .locator(".highlight-profile-list");
  const original = (await profiles.boundingBox())!.width;
  let grip = (await divider.boundingBox())!;
  await page.mouse.move(grip.x + grip.width / 2, grip.y + grip.height / 2);
  await page.mouse.down();
  await page.mouse.move(grip.x + 80, grip.y + grip.height / 2, { steps: 4 });
  await dialog().getByRole("tab", { name: "Preferences", exact: true }).focus();
  await page.keyboard.press("Escape");
  await expect
    .poll(async () => Math.round((await profiles.boundingBox())!.width))
    .toBe(Math.round(original));
  await page.mouse.up();
  await expect(dialog()).toBeVisible();
  grip = (await divider.boundingBox())!;
  await page.mouse.move(grip.x + grip.width / 2, grip.y + grip.height / 2);
  await page.mouse.down();
  await page.mouse.move(grip.x + 60, grip.y + grip.height / 2, { steps: 3 });
  await dialog()
    .getByRole("tab", { name: "Preferences", exact: true })
    .evaluate((node) => (node as HTMLElement).click());
  await expect
    .poll(() => page.evaluate(() => document.documentElement.style.userSelect))
    .not.toBe("none");
  await page.mouse.up();
  await dialog().getByRole("tab", { name: "Highlights", exact: true }).click();
  await expect(divider).toHaveAttribute("aria-valuenow", ratio!);
});
const table = (kind: "profiles" | "rules", owner = dialog()) =>
  owner.getByRole("table", { name: `Highlight ${kind}`, exact: true });
const rows = (kind: "profile" | "rule", owner = dialog()) =>
  table(kind === "profile" ? "profiles" : "rules", owner).locator(
    `tbody > tr[data-${kind}-id]`,
  );
const detail = (kind: "profiles" | "rules", owner = dialog()) =>
  table(kind, owner).locator(".highlight-item-detail");
async function wake() {
  await app.evaluate(async ({ BrowserWindow }) => {
    const win = BrowserWindow.getAllWindows()[0];
    if (win.isVisible()) throw new Error("Hidden verification became visible");
    await win.webContents.capturePage(undefined, {
      stayHidden: true,
      stayAwake: true,
    });
  });
}
async function capture(name: string) {
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
  await writeFile(test.info().outputPath(name), Buffer.from(png, "base64"));
}
async function openHighlights() {
  await openSettingsWindow(page);
  await dialog().getByRole("tab", { name: "Highlights", exact: true }).click();
  await wake();
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
async function expand(kind: "profile" | "rule", name: string) {
  await dialog()
    .getByRole("button", { name: `Expand ${kind} ${name}`, exact: true })
    .click();
}
async function edit(kind: "profile" | "rule") {
  await table(kind === "profile" ? "profiles" : "rules")
    .locator("tbody")
    .filter({
      has: page.locator(".highlight-item-detail"),
    })
    .getByRole("button", { name: new RegExp(`^Edit ${kind} `) })
    .click();
}
async function ids(kind: "profile" | "rule") {
  return rows(kind).evaluateAll(
    (elements, kind) =>
      elements.map((el) => el.getAttribute(`data-${kind}-id`)),
    kind,
  );
}
async function resize(width: number, height: number) {
  const initial = (await dialog().boundingBox())!;
  const viewportHeight = await page.evaluate(() => innerHeight);
  if (initial.y + height > viewportHeight - 16) {
    const header = (await page
      .locator(".settings-window-header")
      .boundingBox())!;
    await page.mouse.move(header.x + 90, header.y + 20);
    await page.mouse.down();
    await page.mouse.move(header.x + 90, 40, { steps: 5 });
    await page.mouse.up();
  }
  const current = (await dialog().boundingBox())!;
  const grip = (await dialog()
    .getByRole("button", { name: "Resize Settings window", exact: true })
    .boundingBox())!;
  await page.mouse.move(grip.x + grip.width / 2, grip.y + grip.height / 2);
  await page.mouse.down();
  await page.mouse.move(
    grip.x + grip.width / 2 + width - current.width,
    grip.y + grip.height / 2 + height - current.height,
    { steps: 6 },
  );
  await page.mouse.up();
  await expect
    .poll(async () => {
      await wake();
      const box = (await dialog().boundingBox())!;
      return [Math.round(box.width), Math.round(box.height)];
    })
    .toEqual([width, height]);
}

for (const theme of ["light", "dark"]) {
  test(`${theme} two hybrid tables keep profile and rule details in their rows with modal preview below`, async () => {
    await openHighlights();
    const profiles = table("profiles"),
      rules = table("rules");
    await expect(profiles).toBeVisible();
    await expect(rules).toBeVisible();
    const left = (await profiles.boundingBox())!,
      right = (await rules.boundingBox())!;
    expect(left.x + left.width).toBeLessThanOrEqual(right.x);
    expect(Math.abs(left.y - right.y)).toBeLessThanOrEqual(40);
    await expect(
      dialog().getByRole("combobox", {
        name: "Highlight profile",
        exact: true,
      }),
    ).toHaveCount(0);
    await expect(profiles.getByRole("checkbox")).toHaveCount(0);
    await expect(rules.getByRole("checkbox")).toHaveCount(0);
    for (const kind of ["profile", "rule"] as const)
      await expect(
        dialog().getByRole("button", { name: `Add ${kind}`, exact: true }),
      ).toHaveText("");
    await expand("profile", "Default");
    await expand("rule", "1");
    await expect(
      detail("profiles").getByLabel("Log group regex", { exact: true }),
    ).toHaveValue("orders-api$");
    await expect(
      detail("rules").getByLabel("Match regex", { exact: true }),
    ).toHaveValue("ERROR");
    for (const [kind, label] of [
      ["profiles", "Profile name"],
      ["rules", "Match regex"],
    ] as const)
      await expect(
        detail(kind).getByLabel(label, { exact: true }),
      ).toHaveJSProperty("readOnly", true);
    await expect(
      dialog().getByRole("button", {
        name: "Edit profile Default",
        exact: true,
      }),
    ).toBeVisible();
    await expect(
      dialog().getByRole("button", { name: "Edit rule 1", exact: true }),
    ).toBeVisible();
    await dialog()
      .getByRole("button", { name: "Preview", exact: true })
      .click();
    const preview = dialog()
      .getByRole("tabpanel", { name: "Highlights", exact: true })
      .locator(".highlight-preview-section");
    const previewBox = (await preview.boundingBox())!;
    const profileSection = (await dialog()
      .getByRole("tabpanel", { name: "Highlights", exact: true })
      .locator(".highlight-profile-list")
      .boundingBox())!;
    const ruleSection = (await dialog()
      .getByRole("tabpanel", { name: "Highlights", exact: true })
      .locator(".highlight-rule-list")
      .boundingBox())!;
    expect(previewBox.y).toBeGreaterThanOrEqual(
      Math.max(
        profileSection.y + profileSection.height,
        ruleSection.y + ruleSection.height,
      ),
    );
    await expect(page.locator("html")).toHaveAttribute(
      "data-mantine-color-scheme",
      theme,
    );
    await capture(`highlight-tables-${theme}.png`);
  });
}

test("profile and rule edits remain drafts until Save and reject invalid regex and JSON pointers", async () => {
  await openHighlights();
  await expand("profile", "Default");
  await edit("profile");
  const profile = detail("profiles");
  await profile
    .getByLabel("Profile name", { exact: true })
    .fill("Draft profile");
  await profile.getByLabel("Log group regex", { exact: true }).fill("[");
  await expect(
    dialog().getByRole("button", { name: "Save profile", exact: true }),
  ).toBeDisabled();
  expect((await savedProfiles())[0].name).toBe("Default");
  await dialog()
    .getByRole("button", { name: "Cancel profile edit", exact: true })
    .click();
  await expect(rows("profile").first()).toContainText("Default");
  await edit("profile");
  await profile
    .getByLabel("Profile name", { exact: true })
    .fill("Saved profile");
  await profile
    .getByLabel("Log group regex", { exact: true })
    .fill("orders|payments");
  await dialog()
    .getByRole("button", { name: "Save profile", exact: true })
    .click();
  await expect
    .poll(async () => (await savedProfiles())[0].name)
    .toBe("Saved profile");
  await expect(
    profile.getByLabel("Profile name", { exact: true }),
  ).toHaveJSProperty("readOnly", true);

  await expand("rule", "3");
  await edit("rule");
  const rule = detail("rules"),
    save = dialog().getByRole("button", { name: "Save rule", exact: true });
  await rule.getByLabel("Match regex", { exact: true }).fill("[");
  await expect(save).toBeDisabled();
  await rule.getByLabel("Match regex", { exact: true }).fill("FATAL");
  await rule.getByLabel("JSON Pointer path", { exact: true }).fill("level");
  await expect(save).toBeDisabled();
  await rule
    .getByLabel("JSON Pointer path", { exact: true })
    .fill("/bad~escape");
  await expect(save).toBeDisabled();
  await rule.getByLabel("JSON Pointer path", { exact: true }).fill("/level");
  await rule.getByLabel("Dark background", { exact: true }).fill("#775533");
  await expect(save).toBeEnabled();
  expect((await savedProfiles())[0].rules[2].pattern).toBe("INFO");
  await dialog()
    .getByRole("button", { name: "Cancel rule edit", exact: true })
    .click();
  await edit("rule");
  await expect(rule.getByLabel("Match regex", { exact: true })).toHaveValue(
    "INFO",
  );
  await expect(rule.getByLabel("Dark background", { exact: true })).toHaveValue(
    "#663300",
  );
  await rule.getByLabel("Match regex", { exact: true }).fill("FATAL");
  await save.click();
  await expect
    .poll(async () => (await savedProfiles())[0].rules[2].pattern)
    .toBe("FATAL");
  await expect(
    rule.getByLabel("Match regex", { exact: true }),
  ).toHaveJSProperty("readOnly", true);
});

test("row switches, additions and confirmed deletion change only the intended profile or rule", async () => {
  await openHighlights();
  for (const control of [
    table("profiles").getByRole("switch", {
      name: "Profile Default enabled",
      exact: true,
    }),
    table("rules").getByRole("switch", {
      name: "Rule 1 enabled",
      exact: true,
    }),
  ]) {
    await control.locator("..").click();
    await expect(control).not.toBeChecked();
  }
  await expect(detail("profiles")).toHaveCount(0);
  await expect(detail("rules")).toHaveCount(0);
  await expect
    .poll(async () => [
      (await savedProfiles())[0].enabled,
      (await savedProfiles())[0].rules[0].enabled,
    ])
    .toEqual([false, false]);
  await dialog()
    .getByRole("button", { name: "Delete rule 2", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Cancel deletion", exact: true })
    .click();
  await expect(rows("rule")).toHaveCount(3);
  await dialog()
    .getByRole("button", { name: "Delete rule 2", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Confirm delete rule", exact: true })
    .click();
  await expect.poll(() => ids("rule")).toEqual(["first", "third"]);
  await dialog()
    .getByRole("button", { name: "Delete profile Other", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Cancel deletion", exact: true })
    .click();
  await expect(rows("profile")).toHaveCount(3);
  await dialog()
    .getByRole("button", { name: "Delete profile Other", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Confirm delete profile", exact: true })
    .click();
  await expect.poll(() => ids("profile")).toEqual(["default", "empty"]);
  await rows("profile")
    .filter({ has: page.getByText("Empty", { exact: true }) })
    .click();
  await expect(rows("rule")).toHaveCount(0);
  await dialog().getByRole("button", { name: "Add rule", exact: true }).click();
  await expect(rows("rule")).toHaveCount(1);
  const rule = detail("rules");
  await rule.getByLabel("Match regex", { exact: true }).fill("NEW_RULE");
  await dialog()
    .getByRole("button", { name: "Save rule", exact: true })
    .click();
  await expect(rows("rule").first()).toContainText("NEW_RULE");
  await dialog()
    .getByRole("button", { name: "Add profile", exact: true })
    .click();
  await expect(rows("profile")).toHaveCount(3);
  const profile = detail("profiles");
  await profile
    .getByLabel("Profile name", { exact: true })
    .fill("Added profile");
  await dialog()
    .getByRole("button", { name: "Save profile", exact: true })
    .click();
  await expect(rows("profile").last()).toContainText("Added profile");
  await expect
    .poll(
      async () =>
        (await savedProfiles()).find(
          (item: { id: string }) => item.id === "empty",
        )?.rules[0].pattern,
    )
    .toBe("NEW_RULE");
  for (const name of ["Added profile", "Empty", "Default"]) {
    await dialog()
      .getByRole("button", { name: `Delete profile ${name}`, exact: true })
      .click();
    await page
      .getByRole("button", { name: "Confirm delete profile", exact: true })
      .click();
  }
  await expect(rows("profile")).toHaveCount(0);
  await expect(rows("rule")).toHaveCount(0);
  await expect(
    dialog().getByRole("button", { name: "Add rule", exact: true }),
  ).toBeDisabled();
  await dialog()
    .getByRole("button", { name: "Add profile", exact: true })
    .click();
  await expect(rows("profile")).toHaveCount(1);
  await expect(rows("rule")).toHaveCount(1);
});

test("selecting a profile chooses its own rules and a pending rule draft survives docking and reopening Settings", async () => {
  await openHighlights();
  await rows("profile")
    .filter({ has: page.getByText("Other", { exact: true }) })
    .click();
  await expect.poll(() => ids("rule")).toEqual(["other-first"]);
  await rows("profile")
    .filter({ has: page.getByText("Default", { exact: true }) })
    .click();
  await expect.poll(() => ids("rule")).toEqual(["first", "second", "third"]);
  await expand("rule", "2");
  await edit("rule");
  await detail("rules")
    .getByLabel("Match regex", { exact: true })
    .fill("UNSAVED_DOCKING");
  await dialog()
    .getByRole("button", { name: "Return settings to pane", exact: true })
    .click();
  const pane = page.getByRole("region", { name: "Settings", exact: true });
  await expect(pane).toBeVisible();
  await expect(
    detail("rules", pane).getByLabel("Match regex", { exact: true }),
  ).toHaveValue("UNSAVED_DOCKING");
  await expect(
    pane.getByRole("button", { name: "Preview", exact: true }),
  ).toHaveCount(0);
  expect((await savedProfiles())[0].rules[1].pattern).toBe("WARN");
  await pane
    .getByRole("button", { name: "Open settings in window", exact: true })
    .click();
  await expect(
    detail("rules").getByLabel("Match regex", { exact: true }),
  ).toHaveValue("UNSAVED_DOCKING");
  await dialog()
    .getByRole("button", { name: "Save rule", exact: true })
    .click();
  await expect
    .poll(async () => (await savedProfiles())[0].rules[1].pattern)
    .toBe("UNSAVED_DOCKING");
});

test("profile and rule priority controls and keyboard drag preserve the expanded item identity", async () => {
  await openHighlights();
  await expand("rule", "2");
  await dialog()
    .getByRole("button", { name: "Move rule 2 up", exact: true })
    .click();
  await expect.poll(() => ids("rule")).toEqual(["second", "first", "third"]);
  await expect(
    detail("rules").getByLabel("Match regex", { exact: true }),
  ).toHaveValue("WARN");
  const handle = dialog().getByRole("button", {
    name: "Reorder rule 1",
    exact: true,
  });
  await handle.focus();
  await page.keyboard.press("Space");
  const activeRule = rows("rule").first().locator("..");
  await expect(activeRule).toHaveAttribute("data-dragging", "true");
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
        (await activeRule.boundingBox())!.y >
        (await rows("rule").nth(1).locator("..").boundingBox())!.y,
    )
    .toBe(true);
  await page.keyboard.press("Space");
  await expect.poll(() => ids("rule")).toEqual(["first", "second", "third"]);
  await expect(
    detail("rules").getByLabel("Match regex", { exact: true }),
  ).toHaveValue("WARN");
  await rows("profile")
    .filter({ has: page.getByText("Other", { exact: true }) })
    .click();
  await dialog()
    .getByRole("button", { name: "Move profile 2 up", exact: true })
    .click();
  await expect
    .poll(() => ids("profile"))
    .toEqual(["other", "default", "empty"]);
  await expect.poll(() => ids("rule")).toEqual(["other-first"]);
  await expect
    .poll(async () =>
      (await savedProfiles()).map((item: { id: string }) => item.id),
    )
    .toEqual(["other", "default", "empty"]);
  await expand("profile", "Default");
  await expect(
    detail("profiles").getByLabel("Priority", { exact: true }),
  ).toHaveCount(0);
  await dialog()
    .getByRole("button", { name: "Move profile 2 up", exact: true })
    .click();
  await expect
    .poll(() => ids("profile"))
    .toEqual(["default", "other", "empty"]);
  const profileHandle = dialog().getByRole("button", {
    name: "Reorder profile 1",
    exact: true,
  });
  await profileHandle.focus();
  await page.keyboard.press("Space");
  const activeProfile = rows("profile").first().locator("..");
  await expect(activeProfile).toHaveAttribute("data-dragging", "true");
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
        (await activeProfile.boundingBox())!.y >
        (await rows("profile").nth(1).locator("..").boundingBox())!.y,
    )
    .toBe(true);
  await page.keyboard.press("Space");
  await expect
    .poll(() => ids("profile"))
    .toEqual(["other", "default", "empty"]);
  await expect(
    detail("profiles").getByLabel("Log group regex", { exact: true }),
  ).toHaveValue("orders-api$");
  await expect.poll(() => ids("rule")).toEqual(["first", "second", "third"]);
});

async function assertExpansionVisible(target: Locator) {
  await expect
    .poll(async () => {
      await wake();
      return target.evaluate((el) => {
        let host = el.parentElement;
        while (host && !/(auto|scroll)/.test(getComputedStyle(host).overflowY))
          host = host.parentElement;
        if (!host) throw new Error("Expanded detail has no scroll host");
        const outer = host.getBoundingClientRect(),
          inner = el.closest("tbody")!.getBoundingClientRect();
        const header = host.querySelector("thead"),
          firstHeading = header?.querySelector("th"),
          inset =
            firstHeading && getComputedStyle(firstHeading).position === "sticky"
              ? header!.getBoundingClientRect().height
              : 0,
          visibleTop = outer.top + inset;
        return inner.height <= host.clientHeight - inset
          ? inner.top >= visibleTop - 2 && inner.bottom <= outer.bottom + 2
          : Math.abs(inner.top - visibleTop) <= 3;
      });
    })
    .toBe(true);
}
for (const height of [500, 1100])
  test(`near-bottom expansion scrolls full details into view or aligns tall details at the top in ${height}px Settings`, async () => {
    await openHighlights();
    await resize(1100, height);
    await expand("rule", "20");
    await assertExpansionVisible(detail("rules"));
    if (height === 500) {
      await edit("rule");
      const viewport = dialog()
        .getByRole("tabpanel", { name: "Highlights", exact: true })
        .locator(".highlight-rule-list .highlight-items-scroll");
      expect((await detail("rules").boundingBox())!.height).toBeGreaterThan(
        (await viewport.boundingBox())!.height,
      );
      await assertExpansionVisible(detail("rules"));
      await dialog()
        .getByRole("button", { name: "Cancel rule edit", exact: true })
        .click();
    }
    await dialog()
      .getByRole("button", { name: "Collapse rule 20", exact: true })
      .click();
    await expand("profile", "Profile 16");
    await assertExpansionVisible(detail("profiles"));
    await capture(`near-bottom-${height}.png`);
  });

test("near-bottom expanded rule keyboard movement crosses the table viewport without losing its details", async () => {
  await openHighlights();
  await resize(1100, 500);
  await expand("rule", "19");
  const viewport = dialog()
    .getByRole("tabpanel", { name: "Highlights", exact: true })
    .locator(".highlight-rule-list .highlight-items-scroll");
  const next = rows("rule").last(),
    nextBox = (await next.boundingBox())!,
    viewportBox = (await viewport.boundingBox())!;
  expect(nextBox.y + nextBox.height / 2).toBeGreaterThanOrEqual(
    viewportBox.y + viewportBox.height,
  );
  await dialog()
    .getByRole("button", { name: "Reorder rule 19", exact: true })
    .focus();
  await page.keyboard.press("Space");
  await expect(rows("rule").nth(18).locator("..")).toHaveAttribute(
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
  await expect(
    page.getByRole("status").filter({ hasText: "many-19" }),
  ).toContainText("droppable area many-19");
  await page.keyboard.press("Space");
  const expected = Array.from({ length: 20 }, (_, index) => `many-${index}`);
  [expected[18], expected[19]] = [expected[19], expected[18]];
  await expect.poll(() => ids("rule")).toEqual(expected);
  const moved = table("rules").locator('[data-rule-id="many-18"]');
  await expect(moved).toHaveAttribute("aria-selected", "true");
  await expect(
    moved
      .locator("..")
      .locator(".highlight-item-detail")
      .getByLabel("Match regex", { exact: true }),
  ).toHaveValue("RULE_18");
  await expect(
    dialog().getByRole("button", { name: "Collapse rule 20", exact: true }),
  ).toBeInViewport();
  await capture("near-bottom-keyboard-reorder.png");
});

for (const theme of ["light", "dark"])
  test(`${theme} narrow hybrid tables and expanded drafts fit without horizontal overflow`, async () => {
    await openHighlights();
    await resize(560, 700);
    await expand("profile", "Default");
    await edit("profile");
    await expand("rule", "3");
    await edit("rule");
    const panel = dialog().getByRole("tabpanel", {
      name: "Highlights",
      exact: true,
    });
    const escaped = await panel.evaluate((el) => {
      const outer = el.getBoundingClientRect();
      return [
        ...el.querySelectorAll<HTMLElement>(
          "input,textarea,button,[role=combobox]",
        ),
      ]
        .filter((control) => {
          const rect = control.getBoundingClientRect();
          return (
            rect.width > 0 &&
            rect.height > 0 &&
            (rect.left < outer.left - 1 || rect.right > outer.right + 1)
          );
        })
        .map(
          (control) =>
            control.getAttribute("aria-label") || control.textContent,
        );
    });
    expect(
      await panel.evaluate((el) => el.scrollWidth - el.clientWidth),
    ).toBeLessThanOrEqual(1);
    expect(escaped).toEqual([]);
    await capture(`narrow-highlight-tables-${theme}.png`);
  });
