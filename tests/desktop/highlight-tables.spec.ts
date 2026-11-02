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

for (const theme of ["light", "dark"]) {
  test(`${theme} Highlights tree dividers resize live, cancel and retain layout through docking`, async () => {
    await openHighlights();
    await dialog().locator('[data-tree-rule="first"]').click();
    const editor = dialog().getByLabel("Match regex", { exact: true });
    await editor.fill("retained divider edit");
    const tree = dialog().locator(".highlight-tree-list");
    const divider = dialog().getByRole("separator", {
      name: "Resize highlight tree and editor",
      exact: true,
    });
    const before = (await tree.boundingBox())!.width;
    let grip = (await divider.boundingBox())!;
    await page.mouse.move(grip.x + grip.width / 2, grip.y + 30);
    await page.mouse.down();
    await page.mouse.move(grip.x + 80, grip.y + 30, { steps: 6 });
    await expect
      .poll(async () => (await tree.boundingBox())!.width)
      .toBeGreaterThan(before + 50);
    await page.mouse.up();
    const committed = Math.round((await tree.boundingBox())!.width);
    grip = (await divider.boundingBox())!;
    await page.mouse.move(grip.x + grip.width / 2, grip.y + 30);
    await page.mouse.down();
    await page.mouse.move(grip.x - 60, grip.y + 30, { steps: 5 });
    await page.keyboard.press("Escape");
    await page.mouse.up();
    await expect
      .poll(async () => Math.round((await tree.boundingBox())!.width))
      .toBe(committed);
    await expect(dialog()).toBeVisible();
    const ratio = await divider.getAttribute("aria-valuenow");
    await dialog()
      .getByRole("button", { name: "Preview", exact: true })
      .click();
    const preview = dialog().locator(".highlight-preview-section");
    const previewDivider = dialog().getByRole("separator", {
      name: "Resize highlight tree area and preview",
      exact: true,
    });
    const oldHeight = (await preview.boundingBox())!.height;
    grip = (await previewDivider.boundingBox())!;
    await page.mouse.move(grip.x + grip.width / 2, grip.y + grip.height / 2);
    await page.mouse.down();
    await page.mouse.move(grip.x + grip.width / 2, grip.y - 60, { steps: 6 });
    await expect
      .poll(async () => (await preview.boundingBox())!.height)
      .toBeGreaterThan(oldHeight + 35);
    await page.mouse.up();
    const previewRatio = await previewDivider.getAttribute("aria-valuenow");
    await expect(preview.locator(".highlight-pane-divider")).toHaveCount(0);
    await dialog()
      .getByRole("button", { name: "Preview", exact: true })
      .click();
    await expect(previewDivider).toHaveCount(0);
    await dialog()
      .getByRole("button", { name: "Preview", exact: true })
      .click();
    await expect(previewDivider).toHaveAttribute(
      "aria-valuenow",
      previewRatio!,
    );
    await dialog()
      .getByRole("button", { name: "Return settings to pane", exact: true })
      .click();
    const pane = page.getByRole("region", { name: "Settings", exact: true });
    await expect(pane.getByLabel("Match regex", { exact: true })).toHaveValue(
      "retained divider edit",
    );
    await expect(
      pane.getByRole("separator", {
        name: "Resize highlight tree area and preview",
        exact: true,
      }),
    ).toHaveCount(0);
    await pane
      .getByRole("button", { name: "Open settings in window", exact: true })
      .click();
    await expect(divider).toHaveAttribute("aria-valuenow", ratio!);
    await expect(previewDivider).toHaveAttribute(
      "aria-valuenow",
      previewRatio!,
    );
    await expect(editor).toHaveValue("retained divider edit");
    await capture(`${theme}-tree-dividers.png`);
  });
}
