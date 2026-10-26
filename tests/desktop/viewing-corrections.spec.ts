import {
  _electron as electron,
  expect,
  test,
  type ElectronApplication,
  type Page,
} from "@playwright/test";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join, resolve, sep } from "node:path";
import {
  createTab,
  createWorkspace,
  workspaceReducer,
} from "../../src/renderer/workspace";
import { desktopExecutablePath } from "./desktop-app";

test.setTimeout(90000);
const root = resolve(".tmp/desktop-viewing-corrections");
let directory: string, app: ElectronApplication, page: Page, errors: string[];
let child: ReturnType<ElectronApplication["process"]>;
test.beforeEach(async ({}, info) => {
  await mkdir(root, { recursive: true });
  directory = await mkdtemp(join(root, "case-"));
  errors = [];
  let workspace = createWorkspace();
  workspace.preferences.theme = info.title.includes("dark") ? "dark" : "light";
  workspace.sidebarVisible = true;
  workspace.sidebarWidth = info.title.includes("narrow") ? 600 : 280;
  workspace.tabs[0].filterPattern = "";
  workspace.preferences.pinnedTabsSeparateRow = true;
  workspace.preferences.tabBarLayout = info.title.includes("wrapped")
    ? "wrap"
    : "scroll";
  for (let i = 0; i < (info.title.includes("wrapped") ? 7 : 2); i++) {
    const tab = createTab("offline", [
      { logGroup: "/aws/lambda/payments-worker" },
    ]);
    tab.id = `activity-tab-${i}`;
    tab.customTitle = `Another service ${i}`;
    tab.filterPattern = "";
    workspace = workspaceReducer(workspace, { type: "tab/open", tab });
  }
  workspace = workspaceReducer(workspace, {
    type: "tab/select",
    tabId: "tab-orders",
  });
  if (info.title.includes("pane-header"))
    workspace = workspaceReducer(workspace, {
      type: "pane/show-tabs",
      tabIds: ["tab-orders", "activity-tab-0"],
    });
  if (info.title.includes("legacy")) {
    Object.assign(workspace, {
      groups: [
        { id: "old-group", name: "Old group", color: "blue", collapsed: true },
      ],
    });
    workspace.tabs.forEach((tab) =>
      Object.assign(tab, { groupId: "old-group" }),
    );
  }
  if (!("groups" in workspace)) Object.assign(workspace, { groups: [] });
  if (info.title.includes("Explorer independence")) {
    const base = workspace.connections[0];
    workspace.connections.push(
      {
        ...base,
        id: "aws-a",
        mode: "aws",
        profile: "prod",
        region: "eu-west-1",
        name: "Production",
      },
      {
        ...base,
        id: "aws-b",
        mode: "aws",
        profile: "prod",
        region: "us-east-1",
        name: "Production East",
      },
      {
        ...base,
        id: "aws-c",
        mode: "aws",
        profile: "dev",
        region: "eu-west-2",
        name: "Development",
      },
    );
    workspace.activeConnectionId = "aws-a";
  }
  if (info.title.includes("Live marker")) workspace.tabs[1].kind = "insights";
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
  page.setDefaultTimeout(10000);
  page.on("pageerror", (error) => errors.push(error.message));
  const session = await page.context().newCDPSession(page);
  await session.send("Emulation.setFocusEmulationEnabled", { enabled: true });
  // Resize the native hidden window itself so WCO geometry and the content use
  // the same real dimensions, rather than emulating only the page viewport.
  const width = info.title.includes("narrow") ? 860 : 1500;
  await app.evaluate(
    ({ BrowserWindow }, width) =>
      BrowserWindow.getAllWindows()[0].setContentSize(width, 850),
    width,
  );
  await expect.poll(() => page.evaluate(() => innerWidth)).toBe(width);
  expect(
    (await page.evaluate(() => window.explorer.environment())).canEnableAws,
  ).toBe(false);
  await app.evaluate(({ dialog }) => {
    dialog.showMessageBox = async () => {
      throw new Error("Unexpected close-save dialog");
    };
  });
  if (!info.title.includes("Explorer independence"))
    await expect(page.locator('[data-node-kind="group"]')).toHaveCount(9);
  else
    await expect(
      page.getByRole("combobox", { name: "Explorer region", exact: true }),
    ).toBeVisible();
  await app.evaluate(async ({ BrowserWindow }) => {
    for (let i = 0; i < 3; i++)
      await BrowserWindow.getAllWindows()[0].webContents.capturePage(
        undefined,
        { stayHidden: true, stayAwake: true },
      );
  });
});
test.afterEach(async () => {
  if (child?.exitCode === null) {
    expect(
      await app.evaluate(({ BrowserWindow }) =>
        BrowserWindow.getAllWindows().every((w) => !w.isVisible()),
      ),
    ).toBe(true);
    const closed = app.waitForEvent("close");
    await app.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()[0].close(),
    );
    await closed;
    expect(child.exitCode).toBe(0);
  }
  expect(errors).toEqual([]);
  if (directory?.startsWith(root + sep))
    await rm(directory, { recursive: true, force: true });
});

const activity = (name: string) =>
  page.getByRole("button", { name, exact: true });
const stored = async () =>
  (await page.evaluate(() => window.explorer.loadWorkspace()))
    .workspace as ReturnType<typeof createWorkspace>;
const tabNode = (id: string) => page.locator(`[data-tab-id="${id}"]`);
async function capture(name: string) {
  const png = await app.evaluate(async ({ BrowserWindow }) => {
    const contents = BrowserWindow.getAllWindows()[0].webContents;
    let png = "";
    // Wake and drain hidden compositor frames before retaining the snapshot.
    for (let index = 0; index < 3; index++) {
      const image = await contents.capturePage(undefined, {
        stayHidden: true,
        stayAwake: true,
      });
      png = image.toPNG().toString("base64");
    }
    return png;
  });
  await mkdir(test.info().outputDir, { recursive: true });
  await writeFile(test.info().outputPath(name), Buffer.from(png, "base64"));
}
for (const theme of ["light", "dark"]) {
  test(`${theme} numeric relative rows and fixed editable time slots`, async () => {
    await activity("Time range").click();
    const popup = page.locator(".time-range-popover");
    await popup.getByRole("tab", { name: "Relative", exact: true }).click();
    const rows = popup.locator(".relative-range-row");
    await expect(rows).toHaveCount(4);
    const defaults = [
      [5, 10, 15, 30, 45],
      [1, 2, 3, 6, 8, 12],
      [1, 2, 3, 4, 5, 6],
      [1, 2, 3, 4],
    ];
    for (let i = 0; i < defaults.length; i++) {
      await expect(rows.nth(i).getByRole("button")).toHaveText(
        defaults[i].map(String),
      );
    }
    const gear = popup.getByRole("button", {
      name: "Time range settings",
      exact: true,
    });
    await expect(gear).toHaveText("");
    const gb = (await gear.boundingBox())!,
      pb = (await popup.boundingBox())!;
    expect(pb.x + pb.width - gb.x - gb.width).toBeLessThan(25);
    expect(gb.y - pb.y).toBeLessThan(25);
    await capture("relative-picker.png");
    await gear.click();
    const settings = page.getByRole("region", {
      name: "Workspace settings",
      exact: true,
    });
    await expect(
      settings.getByRole("tab", { name: "Time ranges", exact: true }),
    ).toHaveAttribute("aria-selected", "true");
    const section = settings.getByRole("region", {
      name: "Relative dropdown templates",
      exact: true,
    });
    await expect(popup).toBeHidden();
    await capture("fixed-slots-settings.png");
    await expect(section.getByRole("textbox")).toHaveCount(21);
    const first = section.getByLabel("Relative dropdown Minutes slot 1", {
      exact: true,
    });
    await first.fill("30");
    await expect(first).toBeFocused();
    for (const [i, v] of [30, 31, 32, 33, 45].entries())
      await expect(
        section.getByLabel(`Relative dropdown Minutes slot ${i + 1}`, {
          exact: true,
        }),
      ).toHaveValue(String(v));
    await section
      .getByLabel("Relative dropdown Minutes slot 5", { exact: true })
      .fill("20");
    for (const [i, v] of [16, 17, 18, 19, 20].entries())
      await expect(
        section.getByLabel(`Relative dropdown Minutes slot ${i + 1}`, {
          exact: true,
        }),
      ).toHaveValue(String(v));
    await expect(
      settings.getByRole("button", { name: /Add template|Remove template/ }),
    ).toHaveCount(0);
    await expect
      .poll(async () =>
        (await stored()).preferences.relativeTimeTemplates?.dropdown
          .filter((t) => t.unit === "m")
          .map((t) => t.duration),
      )
      .toEqual([16, 17, 18, 19, 20]);
    await activity("AWS logs explorer").click();
    await activity("Time range").click();
    await expect(
      popup.locator(".relative-range-row").first().getByRole("button"),
    ).toHaveText(["16", "17", "18", "19", "20"]);
    await popup
      .getByRole("button", { name: "Last 18 minutes", exact: true })
      .click();
    await popup.getByRole("button", { name: "Apply", exact: true }).click();
    await expect(activity("Time range")).toContainText("Last 18 minutes");
  });

  test(`${theme} Explorer independence from offline tab and restored selection`, async () => {
    const profile = page.getByRole("combobox", {
      name: "Explorer profile",
      exact: true,
    });
    const region = page.getByRole("combobox", {
      name: "Explorer region",
      exact: true,
    });
    await expect(profile).toHaveValue("prod");
    await expect(region).toHaveValue("eu-west-1");
    await tabNode("activity-tab-0").click();
    await expect(region).toHaveValue("eu-west-1");
    await expect(profile).toHaveValue("prod");
    await region.click();
    await page.getByRole("option", { name: "us-east-1", exact: true }).click();
    await expect(region).toHaveValue("us-east-1");
    await tabNode("tab-orders").click();
    await expect(region).toHaveValue("us-east-1");
    await profile.click();
    await page.getByRole("option", { name: "dev", exact: true }).click();
    await expect(region).toHaveValue("eu-west-2");
    await tabNode("activity-tab-1").click();
    await expect(profile).toHaveValue("dev");
    await expect(region).toHaveValue("eu-west-2");
    await expect
      .poll(async () => (await stored()).activeConnectionId)
      .toBe("aws-c");
    await page.reload();
    await expect(profile).toHaveValue("dev");
    await expect(region).toHaveValue("eu-west-2");
  });

  test(`${theme} Live marker persists while inactive and Insights has no SQL badge`, async () => {
    const exportBox = (await activity(
      "Export loaded filtered events",
    ).boundingBox())!;
    const inspectorBox = (await activity(
      "Hide event inspector",
    ).boundingBox())!;
    expect(inspectorBox.x).toBeGreaterThanOrEqual(
      exportBox.x + exportBox.width,
    );
    await expect(
      page.getByRole("button", { name: /^Copy selected/ }),
    ).toHaveCount(0);
    await expect(
      page.locator('.query-status[data-query-state="complete"]'),
    ).toBeVisible();
    await activity("Live").click();
    const marker = tabNode("tab-orders").locator('[data-tab-activity="live"]');
    await expect(marker).toHaveAttribute("aria-label", "Live active");
    await tabNode("activity-tab-0").click();
    await expect(marker).toBeVisible();
    await expect(marker).toHaveAttribute("aria-label", "Live paused");
    await expect(tabNode("activity-tab-0").locator(".tab-kind")).toHaveCount(0);
    await tabNode("tab-orders").click();
    await expect(marker).toHaveAttribute("aria-label", "Live active");
    await activity("Stop Live").click();
  });
}
