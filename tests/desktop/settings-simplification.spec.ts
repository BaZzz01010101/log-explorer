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
import { createWorkspace } from "../../src/renderer/workspace";
import type { Workspace } from "../../src/shared/contracts";
import { desktopExecutablePath } from "./desktop-app";

// All files and processes belong to this fixture. Never read the user's AWS
// configuration or allow this regression suite to display a native window.
const temporaryRoot = resolve(".tmp/desktop-settings-simplification");
const categories = [
  "Connections",
  "Preferences",
  "Time ranges",
  "Highlights",
  "Shortcuts",
];
type Presentation = "pane" | "modal";
let app: ElectronApplication | undefined;
let page: Page;
let directory: string;
let errors: string[];
let logs: string[];
let initialTabIds: string[];

test.setTimeout(120000);

test.beforeEach(async ({}, info) => {
  app = undefined;
  directory = "";
  errors = [];
  logs = [];
  await mkdir(temporaryRoot, { recursive: true });
  directory = await mkdtemp(join(temporaryRoot, "case-"));
  const workspace = createWorkspace();
  workspace.preferences.theme = info.title.startsWith("dark")
    ? "dark"
    : "light";
  workspace.preferences.settingsDetached = false;
  workspace.preferences.profileVisibility = { alpha: false, beta: false };
  workspace.preferences.highlightProfiles = [
    {
      id: "fixture-highlights",
      name: "Fixture highlights",
      enabled: true,
      groupPattern: "orders",
      groupIgnoreCase: true,
      rules: [
        {
          id: "fixture-warning-rule",
          enabled: true,
          scope: "text",
          path: "",
          pattern: "WARN",
          ignoreCase: true,
          target: "row",
          colors: { foreground: "#111827", background: "#fef08a" },
          separateThemeColors: false,
        },
      ],
    },
  ];
  workspace.sidebarVisible = true;
  workspace.sidebarWidth = 560;
  workspace.tabs[0].filterPattern = "";
  initialTabIds = workspace.tabs.map((tab) => tab.id);
  workspace.connections = [
    ...workspace.connections.filter(
      (connection) => connection.mode === "offline",
    ),
    {
      id: "saved-alpha-ireland",
      name: "Saved alpha Ireland",
      mode: "aws",
      profile: "alpha",
      region: "eu-west-1",
      enabled: false,
    },
    {
      id: "saved-beta-virginia",
      name: "Saved beta Virginia",
      mode: "aws",
      profile: "beta",
      region: "us-east-1",
      enabled: false,
    },
  ];
  await writeFile(join(directory, "workspace.json"), JSON.stringify(workspace));
  const env: Record<string, string> = {};
  for (const name of ["PATH", "SystemRoot", "WINDIR", "TEMP", "TMP", "COMSPEC"])
    if (process.env[name]) env[name] = process.env[name]!;
  Object.assign(env, {
    EXPLORER_TEST_USER_DATA: directory,
    USERPROFILE: directory,
    APPDATA: directory,
    LOCALAPPDATA: directory,
    TEMP: directory,
    TMP: directory,
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
  app.process().stdout?.on("data", (chunk) => logs.push(String(chunk)));
  app.process().stderr?.on("data", (chunk) => logs.push(String(chunk)));
  page = await app.firstWindow();
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) =>
    logs.push(`[${message.type()}] ${message.text()}`),
  );
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Emulation.setFocusEmulationEnabled", { enabled: true });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await app.evaluate(({ BrowserWindow, dialog }) => {
    const window = BrowserWindow.getAllWindows()[0];
    if (window.isVisible())
      throw new Error("Settings verification became visible");
    window.setContentSize(1600, 1000);
    window.webContents.setBackgroundThrottling(false);
    dialog.showMessageBox = async () => {
      throw new Error("Unexpected settings simplification verification dialog");
    };
  });
  await expect.poll(() => page.evaluate(() => innerWidth)).toBe(1600);
  const environment = await page.evaluate(() => window.explorer.environment());
  expect(environment.canEnableAws).toBe(false);
  expect(environment.awsEnabled).toBe(false);
  await expect(page.locator('[data-node-kind="group"]')).toHaveCount(9);
  await expect(page.locator(".query-status:visible")).toHaveAttribute(
    "data-query-state",
    "complete",
  );
});

test.afterEach(async ({}, info) => {
  const child = app?.process();
  let closeFailure: unknown;
  if (child && child.exitCode === null && child.signalCode === null) {
    try {
      await capture("final-settings.png");
    } catch (error) {
      logs.push(`Final capture failed: ${String(error)}`);
    }
    const closed = app!.waitForEvent("close", { timeout: 8000 });
    const exited = new Promise<number | null>((done) =>
      child.once("exit", done),
    );
    try {
      await app!.evaluate(({ BrowserWindow }) => {
        if (BrowserWindow.getAllWindows().some((window) => window.isVisible()))
          throw new Error(
            "Settings verification became visible during teardown",
          );
        BrowserWindow.getAllWindows()[0].close();
      });
      await closed;
      expect(await exited).toBe(0);
    } catch (error) {
      closeFailure = error;
    } finally {
      if (child.exitCode === null && child.signalCode === null) {
        try {
          execFileSync("taskkill", ["/PID", String(child.pid), "/T", "/F"], {
            stdio: "ignore",
            windowsHide: true,
          });
        } catch (error) {
          closeFailure ??= error;
        }
      }
    }
  }
  await mkdir(info.outputDir, { recursive: true });
  await writeFile(
    info.outputPath("native.log"),
    [...logs, ...errors.map((error) => `[pageerror] ${error}`)].join("\n"),
  );
  if (directory) {
    try {
      await writeFile(
        info.outputPath("saved-workspace.json"),
        await readFile(join(directory, "workspace.json")),
      );
    } catch (error) {
      logs.push(`Saved workspace capture failed: ${String(error)}`);
    }
    if (!resolve(directory).startsWith(temporaryRoot + sep + "case-"))
      throw new Error("Unsafe settings simplification verification cleanup");
    await rm(directory, {
      recursive: true,
      force: true,
      maxRetries: 10,
      retryDelay: 100,
    });
  }
  if (closeFailure) throw closeFailure;
  expect(errors).toEqual([]);
});

async function capture(name: string) {
  let png = "";
  for (let frame = 0; frame < 3; frame++)
    png = await app!.evaluate(async ({ BrowserWindow }) => {
      const window = BrowserWindow.getAllWindows()[0];
      if (window.isVisible())
        throw new Error("Settings verification became visible");
      return (
        await window.webContents.capturePage(undefined, {
          stayHidden: true,
          stayAwake: true,
        })
      )
        .toPNG()
        .toString("base64");
    });
  await mkdir(test.info().outputDir, { recursive: true });
  await writeFile(test.info().outputPath(name), Buffer.from(png, "base64"));
}

async function savedWorkspace() {
  return JSON.parse(
    await readFile(join(directory, "workspace.json"), "utf8"),
  ) as Workspace;
}

function settings(presentation: Presentation) {
  return presentation === "pane"
    ? page.locator(".settings-pane:visible")
    : page.getByRole("dialog", { name: "Settings", exact: true });
}

async function openSettings(presentation: Presentation) {
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  if (presentation === "modal")
    await page
      .getByRole("button", { name: "Open settings in window", exact: true })
      .click();
  await expect(settings(presentation)).toBeVisible();
}

async function choose(presentation: Presentation, name: string) {
  const root = settings(presentation);
  await root.getByRole("tab", { name, exact: true }).click();
  return root.getByRole("tabpanel", { name, exact: true });
}

async function resizeSettings(
  presentation: Presentation,
  width: number,
  height: number,
) {
  if (presentation === "pane") {
    await app!.evaluate(
      ({ BrowserWindow }, height) =>
        BrowserWindow.getAllWindows()[0].setContentSize(1600, height),
      height,
    );
    const current = (await page.locator(".sidebar-shell").boundingBox())!;
    const grip = (await page.locator(".sidebar-resizer").boundingBox())!;
    await page.mouse.move(grip.x + grip.width / 2, 200);
    await page.mouse.down();
    await page.mouse.move(
      grip.x + grip.width / 2 + width - current.width,
      200,
      { steps: 6 },
    );
    await page.mouse.up();
    await expect
      .poll(async () =>
        Math.round((await page.locator(".sidebar-shell").boundingBox())!.width),
      )
      .toBe(width);
  } else {
    const current = (await settings(presentation).boundingBox())!;
    const grip = (await page
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
      .poll(async () =>
        Math.round((await settings(presentation).boundingBox())!.width),
      )
      .toBe(width);
  }
}

async function expectContained(panel: Locator, context: string) {
  const metrics = await panel.evaluate((element) => {
    const bounds = element.getBoundingClientRect();
    return {
      width: element.clientWidth,
      scrollWidth: element.scrollWidth,
      escaped: Array.from(
        element.querySelectorAll<HTMLElement>(
          "input,textarea,button,[role=combobox]",
        ),
      )
        .filter((control) => {
          const box = control.getBoundingClientRect();
          return (
            box.width > 0 &&
            box.height > 0 &&
            (box.left < bounds.left - 1 || box.right > bounds.right + 1)
          );
        })
        .map(
          (control) =>
            control.getAttribute("aria-label") || control.textContent,
        ),
    };
  });
  expect(
    metrics.scrollWidth,
    `${context} horizontal overflow`,
  ).toBeLessThanOrEqual(metrics.width + 1);
  expect(metrics.escaped, `${context} controls outside panel`).toEqual([]);
}

async function expectDropdownContained() {
  const bounds = await page
    .locator(".connection-add-picker")
    .evaluate((element) => {
      const box = element.getBoundingClientRect();
      return {
        left: box.left,
        right: box.right,
        top: box.top,
        bottom: box.bottom,
        viewportWidth: innerWidth,
        viewportHeight: innerHeight,
        fits: element.scrollWidth <= element.clientWidth + 1,
      };
    });
  expect(bounds.left).toBeGreaterThanOrEqual(0);
  expect(bounds.top).toBeGreaterThanOrEqual(0);
  expect(bounds.right).toBeLessThanOrEqual(bounds.viewportWidth);
  expect(bounds.bottom).toBeLessThanOrEqual(bounds.viewportHeight);
  expect(bounds.fits).toBe(true);
}

async function verifyMemoryHelp(presentation: Presentation) {
  const panel = await choose(presentation, "Preferences");
  const neutral = settings(presentation).locator(
    presentation === "modal"
      ? ".settings-window-header"
      : ".settings-pane-header",
  );
  const help = panel.getByRole("button", {
    name: "Help for Maximum events per view",
    exact: true,
  });
  await help.scrollIntoViewIfNeeded();
  await help.hover();
  const hint = page.getByRole("tooltip");
  await expect(hint).toContainText("oldest events");
  await neutral.hover();
  await expect(hint).toHaveCount(0);
  await help.click();
  await hint.hover();
  await expect(hint).toContainText("oldest events");
  expect(
    await hint.evaluate((element) => getComputedStyle(element).userSelect),
  ).toBe("text");
  const rectangles = await hint.evaluate((element) => {
    const range = document.createRange();
    range.selectNodeContents(element);
    return Array.from(range.getClientRects()).map((box) => ({
      x: box.x,
      y: box.y,
      width: box.width,
      height: box.height,
    }));
  });
  const first = rectangles[0],
    last = rectangles.at(-1)!;
  await page.mouse.move(first.x + 1, first.y + first.height / 2);
  await page.mouse.down();
  await page.mouse.move(last.x + last.width - 1, last.y + last.height / 2, {
    steps: 8,
  });
  await page.mouse.up();
  expect(await page.evaluate(() => getSelection()?.toString())).toContain(
    "oldest events",
  );
  await expect(hint).toBeVisible();
  await neutral.click();
  await expect(hint).toHaveCount(0);
  await help.click();
  await expect(hint).toBeVisible();
  await help.press("Escape");
  await expect(hint).toHaveCount(0);
  await expect(settings(presentation)).toBeVisible();
}

async function verifyTimeBrackets(presentation: Presentation) {
  const panel = await choose(presentation, "Time ranges");
  const measurements = await panel
    .locator(".time-template-quick-caption")
    .evaluateAll((captions) =>
      captions.map((element) => {
        const style = getComputedStyle(element),
          before = getComputedStyle(element, "::before");
        const background = getComputedStyle(
          element.closest(".mantine-Tabs-panel")!,
        ).backgroundColor;
        const rgba = (color: string) => {
          const canvas = document.createElement("canvas");
          canvas.width = canvas.height = 1;
          const context = canvas.getContext("2d")!;
          context.fillStyle = color;
          context.fillRect(0, 0, 1, 1);
          return Array.from(context.getImageData(0, 0, 1, 1).data);
        };
        const luminance = (color: number[]) =>
          color
            .slice(0, 3)
            .map((value) => {
              const channel = value / 255;
              return channel <= 0.04045
                ? channel / 12.92
                : ((channel + 0.055) / 1.055) ** 2.4;
            })
            .reduce(
              (sum, value, index) =>
                sum + value * [0.2126, 0.7152, 0.0722][index],
              0,
            );
        const foreground = luminance(rgba(style.borderTopColor)),
          back = luminance(rgba(background));
        const caption = element.getBoundingClientRect();
        const slots = element.previousElementSibling!.getBoundingClientRect();
        return {
          topWidth: parseFloat(style.borderTopWidth),
          sideWidth: parseFloat(before.borderLeftWidth),
          endHeight: parseFloat(before.height),
          height: caption.height,
          top: caption.top,
          slotsBottom: slots.bottom,
          left: caption.left,
          right: caption.right,
          slotsLeft: slots.left,
          slotsRight: slots.right,
          contrast:
            (Math.max(foreground, back) + 0.05) /
            (Math.min(foreground, back) + 0.05),
        };
      }),
    );
  expect(measurements.length).toBeGreaterThan(0);
  for (const bracket of measurements) {
    expect(bracket.topWidth).toBeGreaterThanOrEqual(2);
    expect(bracket.sideWidth).toBeGreaterThanOrEqual(2);
    expect(bracket.contrast).toBeGreaterThanOrEqual(3);
    expect(bracket.endHeight).toBeGreaterThanOrEqual(6);
    expect(bracket.height).toBeCloseTo(24, 0);
    expect(bracket.top).toBeGreaterThan(bracket.slotsBottom);
    expect(bracket.left).toBeLessThanOrEqual(bracket.slotsLeft + 1);
    expect(bracket.right).toBeGreaterThanOrEqual(bracket.slotsRight - 1);
  }
  await test.info().attach("time-bracket-measurements.json", {
    body: JSON.stringify(measurements),
    contentType: "application/json",
  });
}

for (const theme of ["light", "dark"])
  for (const presentation of ["pane", "modal"] as const) {
    test(`${theme} ${presentation} consolidated settings retain fixtures, concise help and responsive geometry`, async () => {
      await openSettings(presentation);
      const root = settings(presentation);
      await expect(
        root
          .getByRole("tablist", { name: "Settings categories", exact: true })
          .getByRole("tab"),
      ).toHaveText(categories);
      await expect(
        root.getByRole("tab", { name: "Workspace", exact: true }),
      ).toHaveCount(0);
      await expect(
        root.getByRole("tab", { name: "Highlights tree", exact: true }),
      ).toHaveCount(0);
      await expect(page.locator(".app-footer")).toHaveCount(0);
      const connections = await choose(presentation, "Connections");
      const switches = connections.locator(".settings-access-switches");
      await expect(switches.getByRole("switch")).toHaveCount(2);
      const aws = switches.getByRole("switch", {
        name: "Enable AWS access",
        exact: true,
      });
      const fixtures = switches.getByRole("switch", {
        name: "Offline fixtures",
        exact: true,
      });
      await expect(aws).toBeDisabled();
      await expect(aws).not.toBeChecked();
      await expect(fixtures).toBeChecked();
      await expect(connections.locator(".mantine-Alert-root")).toHaveCount(0);
      await fixtures.uncheck();
      await expect
        .poll(async () =>
          (await savedWorkspace()).connections
            .filter((connection) => connection.mode === "offline")
            .every((connection) => connection.enabled === false),
        )
        .toBe(true);
      await choose(presentation, "Preferences");
      await choose(presentation, "Connections");
      await expect(fixtures).not.toBeChecked();
      await fixtures.check();
      await expect
        .poll(async () =>
          (await savedWorkspace()).connections
            .filter((connection) => connection.mode === "offline")
            .every((connection) => connection.enabled !== false),
        )
        .toBe(true);
      const saved = await savedWorkspace();
      expect(
        saved.connections
          .filter((connection) => connection.mode === "aws")
          .map((connection) => [connection.id, connection.enabled]),
      ).toEqual([
        ["saved-alpha-ireland", false],
        ["saved-beta-virginia", false],
      ]);
      expect(saved.tabs.map((tab) => tab.id)).toEqual(initialTabIds);
      const preferences = await choose(presentation, "Preferences");
      await expect(preferences.getByRole("heading", { level: 3 })).toHaveText([
        "Appearance",
        "Tabs and history",
        "Log display",
        "Data limits",
      ]);
      await expect(
        preferences.getByRole("textbox", {
          name: "Search history limit",
          exact: true,
        }),
      ).toBeVisible();
      await expect(
        preferences.getByText(
          /Auto.?refresh|Recent searches|Refresh interval/i,
        ),
      ).toHaveCount(0);
      await expect(
        preferences.locator(".mantine-InputWrapper-description"),
      ).toHaveCount(0);
      await verifyMemoryHelp(presentation);
      const highlights = await choose(presentation, "Highlights");
      await expect(
        highlights.getByRole("tree", {
          name: "Highlight profiles and rules",
          exact: true,
        }),
      ).toBeVisible();
      await expect(
        highlights.getByRole("treeitem", {
          name: "Select profile Fixture highlights",
          exact: true,
        }),
      ).toBeVisible();
      for (const width of presentation === "pane" ? [280, 560] : [560, 820]) {
        await resizeSettings(
          presentation,
          width,
          width === 280 ? 620 : width === 560 ? 560 : 850,
        );
        for (const category of categories)
          await expectContained(
            await choose(presentation, category),
            `${theme} ${presentation} ${width}px ${category}`,
          );
        await capture(`${theme}-${presentation}-${width}px.png`);
      }
      await verifyTimeBrackets(presentation);
      await capture(`${theme}-${presentation}-time-brackets.png`);
    });

    test(`${theme} ${presentation} profile and region menus focus search and add saved choices immediately`, async () => {
      await openSettings(presentation);
      if (presentation === "pane") await resizeSettings(presentation, 280, 620);
      else await resizeSettings(presentation, 560, 500);
      const panel = await choose(presentation, "Connections");
      const addProfile = panel.getByRole("button", {
        name: "Add profile",
        exact: true,
      });
      const profiles = page.getByRole("combobox", {
        name: "Search profiles",
        exact: true,
      });
      await expect(addProfile).toBeEnabled();
      await addProfile.click();
      await expect(profiles).toBeFocused();
      await profiles.fill("BETA");
      await expect(page.getByRole("option")).toHaveCount(1);
      await expect(page.getByRole("option")).toHaveText("beta");
      await expectDropdownContained();
      await profiles.press("Escape");
      await expect(profiles).toHaveCount(0);
      await expect(addProfile).toBeFocused();
      await expect(settings(presentation)).toBeVisible();
      await addProfile.click();
      await profiles.fill("no-such-profile");
      await expect(page.getByRole("option")).toHaveCount(0);
      await expect(
        page.getByRole("status").filter({ hasText: "No profiles match" }),
      ).toBeVisible();
      await profiles.press("Enter");
      await expect(profiles).toBeVisible();
      await expect(addProfile).toBeEnabled();
      await panel.getByText("Profiles and regions", { exact: true }).click();
      await expect(profiles).toHaveCount(0);
      await addProfile.click();
      await expect(profiles).toHaveValue("");
      await profiles.fill("ALPHA");
      await page.locator('[role="option"][data-add-value="alpha"]').click();
      await expect(panel.locator('[data-profile="alpha"]')).toBeVisible();
      await expect(profiles).toHaveCount(0);
      await expect(addProfile).toBeFocused();
      const addAlphaRegion = panel.getByRole("button", {
        name: "Add region for alpha",
        exact: true,
      });
      await addProfile.click();
      await profiles.press("Escape");
      await addAlphaRegion.click();
      await expect(profiles).toHaveCount(0);
      const regions = page.getByRole("combobox", {
        name: "Search regions for alpha",
        exact: true,
      });
      await expect(regions).toBeFocused();
      await regions.fill("IRELAND");
      await expect(page.getByRole("option")).toHaveCount(1);
      await expectDropdownContained();
      await capture(`${theme}-${presentation}-filtered-region.png`);
      await page.locator('[role="option"][data-add-value="eu-west-1"]').click();
      await expect(
        panel.getByRole("button", {
          name: "Remove alpha region eu-west-1",
          exact: true,
        }),
      ).toBeVisible();
      await expect(regions).toHaveCount(0);
      await expect(addAlphaRegion).toBeFocused();
      await expect
        .poll(
          async () =>
            (await savedWorkspace()).connections.find(
              (connection) => connection.id === "saved-alpha-ireland",
            )?.enabled,
        )
        .toBe(true);
      await addProfile.click();
      await profiles.fill("BETA");
      await profiles.press("ArrowDown");
      await profiles.press("Enter");
      await expect(panel.locator('[data-profile="beta"]')).toBeVisible();
      await expect(profiles).toHaveCount(0);
      await addProfile.click();
      await expect(addProfile).toBeEnabled();
      await expect(page.getByRole("option")).toHaveCount(0);
      await expect(
        page
          .getByRole("status")
          .filter({ hasText: "No additional known profiles" }),
      ).toBeVisible();
      await profiles.press("Escape");
      const addBetaRegion = panel.getByRole("button", {
        name: "Add region for beta",
        exact: true,
      });
      await addBetaRegion.click();
      const betaRegions = page.getByRole("combobox", {
        name: "Search regions for beta",
        exact: true,
      });
      await expect(betaRegions).toBeFocused();
      await betaRegions.fill("no-such-region");
      await expect(page.getByRole("option")).toHaveCount(0);
      await expect(
        page.getByRole("status").filter({ hasText: "No regions match" }),
      ).toBeVisible();
      await betaRegions.press("ArrowUp");
      await betaRegions.press("Enter");
      await expect(addBetaRegion).toBeEnabled();
      await expect(betaRegions).toBeVisible();
      await betaRegions.press("Escape");
      await expect(addBetaRegion).toBeFocused();
      await expect(settings(presentation)).toBeVisible();
      await panel
        .getByRole("button", { name: "Remove profile alpha", exact: true })
        .click();
      await expect(panel.locator('[data-profile="alpha"]')).toHaveCount(0);
      await expect
        .poll(
          async () =>
            (await savedWorkspace()).preferences.profileVisibility?.alpha,
        )
        .toBe(false);
      await addProfile.click();
      await profiles.fill("alpha");
      await profiles.press("Enter");
      await expect(
        panel.getByRole("button", {
          name: "Remove alpha region eu-west-1",
          exact: true,
        }),
      ).toBeVisible();
      await expect
        .poll(
          async () =>
            (await savedWorkspace()).preferences.profileVisibility?.alpha,
        )
        .toBe(true);
      const saved = await savedWorkspace();
      expect(
        saved.connections
          .filter((connection) => connection.mode === "aws")
          .map((connection) => [connection.id, connection.enabled]),
      ).toEqual([
        ["saved-alpha-ireland", true],
        ["saved-beta-virginia", false],
      ]);
      expect(saved.tabs.map((tab) => tab.id)).toEqual(initialTabIds);
      expect(
        (await page.evaluate(() => window.explorer.environment())).awsEnabled,
      ).toBe(false);
      await capture(`${theme}-${presentation}-configured-profiles.png`);
    });
  }

for (const theme of ["light", "dark"])
  for (const presentation of ["pane", "modal"] as const) {
    test(`${theme} ${presentation} Preferences separates sections and option rows in one vertical flow`, async () => {
      await openSettings(presentation);
      const panel = await choose(presentation, "Preferences");
      const sections = panel.locator(".settings-preference-section");
      await expect(sections).toHaveCount(4);
      await expect(panel.locator(".settings-preference-option")).toHaveCount(
        10,
      );
      for (const width of presentation === "pane" ? [280, 560] : [560, 1000]) {
        await resizeSettings(presentation, width, width === 280 ? 650 : 950);
        await expectContained(
          panel,
          `${theme} ${presentation} ${width}px Preferences`,
        );
        const metrics = await sections.evaluateAll((elements) =>
          elements.map((section) => {
            const title = section.querySelector("h3")!,
              row = section.querySelector(".settings-preference-option")!,
              label = section.querySelector(".mantine-InputWrapper-label")!,
              body = section.querySelector(".settings-preference-options")!,
              rect = section.getBoundingClientRect();
            return {
              x: rect.x,
              right: rect.right,
              top: rect.top,
              bottom: rect.bottom,
              title: parseFloat(getComputedStyle(title).fontSize),
              label: parseFloat(getComputedStyle(label).fontSize),
              border: getComputedStyle(body).borderTopWidth,
              padding: parseFloat(getComputedStyle(row).paddingTop),
              color: getComputedStyle(body).backgroundColor,
            };
          }),
        );
        for (let index = 0; index < metrics.length; index++) {
          const section = metrics[index];
          expect(section.title).toBe(16);
          expect(section.title - section.label).toBeGreaterThanOrEqual(3);
          expect(parseFloat(section.border)).toBeGreaterThan(0);
          expect(section.padding).toBeGreaterThanOrEqual(10);
          expect(section.x).toBeCloseTo(metrics[0].x, 0);
          expect(section.right).toBeCloseTo(metrics[0].right, 0);
          if (index)
            expect(
              section.top - metrics[index - 1].bottom,
            ).toBeGreaterThanOrEqual(20);
        }
        expect(
          await panel
            .locator(
              ".settings-preference-option + .settings-preference-option",
            )
            .first()
            .evaluate((element) =>
              parseFloat(getComputedStyle(element).borderTopWidth),
            ),
        ).toBeGreaterThan(0);
        await capture(`${theme}-${presentation}-${width}px-preferences.png`);
      }
      const font = panel.getByRole("textbox", {
        name: "Log font size",
        exact: true,
      });
      await font.fill("14");
      // Live preference updates still happen while the field retains focus.
      await expect(font).toBeFocused();
      await expect
        .poll(async () => (await savedWorkspace()).preferences.fontSize)
        .toBe(14);
      await capture(`${theme}-${presentation}-preferences.png`);
    });
  }
