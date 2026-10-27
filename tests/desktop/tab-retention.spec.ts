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
const root = resolve(".tmp/desktop-tab-retention");
let directory: string, app: ElectronApplication, page: Page, errors: string[];
let child: ReturnType<ElectronApplication["process"]>;
test.beforeEach(async ({}, info) => {
  await mkdir(root, { recursive: true });
  directory = await mkdtemp(join(root, "case-"));
  errors = [];
  let workspace = createWorkspace();
  workspace.preferences.theme = info.title.includes("dark") ? "dark" : "light";
  workspace.sidebarVisible = true;
  workspace.sidebarWidth =
    info.title.includes("narrow") || info.title.includes("all time slots")
      ? 600
      : 280;
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
async function fixtures() {
  await app.evaluate(({ ipcMain }) => {
    (globalThis as any).__retentionQueries = [];
    ipcMain.removeHandler("explorer:query");
    ipcMain.handle("explorer:query", (event, request) => {
      (globalThis as any).__retentionQueries.push({
        filter: request.filterPattern,
        source: request.sources[0].logGroup,
      });
      const group = request.sources[0].logGroup;
      const events = Array.from(
        { length: request.filterPattern ? 0 : 200 },
        (_, index) => ({
          id: `retained:${group}:${index}`,
          timestamp: 1000 + index,
          logGroup: group,
          logStream: "retention-stream",
          message: JSON.stringify({
            message: `Retained event ${index} ` + "wide message ".repeat(30),
            nested: { value: `nested-${index}`, deeper: { preserved: true } },
            embedded: JSON.stringify({ decoded: `decoded-${index}` }),
            ...Object.fromEntries(
              Array.from({ length: 60 }, (_, i) => [
                `field-${i}`,
                `Value ${i} ` + "long payload ".repeat(8),
              ]),
            ),
          }),
        }),
      );
      setImmediate(() =>
        event.sender.send("explorer:update", {
          requestId: request.requestId,
          state: "complete",
          replace: true,
          events,
        }),
      );
    });
  });
  await page.getByTestId("run-query").click();
  await expect(page.locator(".viewer-scroll")).toHaveAttribute(
    "aria-rowcount",
    "200",
  );
}
const queries = () =>
  app.evaluate(() => (globalThis as any).__retentionQueries);
const current = (id: string) => page.locator(`#view-${id}`);
const row = (index: number) =>
  current("tab-orders").locator(
    `.virtual-event[data-event-id="retained:/aws/lambda/orders-api:${index}"]`,
  );

for (const theme of ["light", "dark"]) {
  test(`${theme} tab switches retain list scroll, expanded row size, decoded content and inspector mode`, async () => {
    await fixtures();
    const view = current("tab-orders"),
      scroll = view.locator(".viewer-scroll");
    await scroll.evaluate((element) => {
      element.scrollTop = 1150;
      element.scrollLeft = 110;
    });
    await row(30).locator(".inspect-cell").first().click();
    await row(30)
      .getByRole("button", { name: "Expand event details", exact: true })
      .click();
    const details = row(30).getByRole("region", {
      name: "Expanded event content",
      exact: true,
    });
    await expect(details).toBeVisible();
    const resize = row(30).getByRole("separator", {
      name: "Resize expanded event",
      exact: true,
    });
    await resize.press("ArrowDown");
    await resize.press("ArrowDown");
    const height = await resize.getAttribute("aria-valuenow");
    const branch = details.getByRole("button", {
      name: "Expand /nested",
      exact: true,
    });
    if (await branch.count()) await branch.click();
    await details
      .getByRole("button", { name: "Expand /nested/deeper", exact: true })
      .click();
    await expect(
      details.locator('[data-json-path="/nested/deeper/preserved"]'),
    ).toBeVisible();
    const inspector = view.getByRole("region", {
      name: "Event inspector",
      exact: true,
    });
    await inspector
      .getByRole("button", { name: "Field actions for /embedded", exact: true })
      .click();
    await page
      .getByRole("menuitem", { name: "Deserialize /embedded", exact: true })
      .click();
    await expect(
      inspector.locator('[data-json-path="/embedded/decoded"]'),
    ).toContainText("decoded-30");
    await inspector
      .locator("label")
      .filter({ hasText: /^Raw message$/ })
      .click();
    await details.evaluate((element) => {
      element.scrollTop = 95;
    });
    await inspector.locator(".inspector-content").evaluate((element) => {
      element.scrollTop = 120;
    });
    const before = await scroll.evaluate((element) => ({
      top: element.scrollTop,
      left: element.scrollLeft,
    }));
    const detailTop = await details.evaluate((element) => element.scrollTop);
    const inspectorTop = await inspector
      .locator(".inspector-content")
      .evaluate((element) => element.scrollTop);
    expect(before.top).toBeGreaterThan(500);
    expect(detailTop).toBeGreaterThan(0);
    await tabNode("activity-tab-0").getByRole("tab").click();
    await page.getByTestId("run-query").click();
    await expect(
      current("activity-tab-0").locator(".viewer-scroll"),
    ).toHaveAttribute("aria-rowcount", "200");
    await current("activity-tab-0")
      .locator(".viewer-scroll")
      .evaluate((element) => {
        element.scrollTop = 700;
      });
    const count = (await queries()).length;
    await tabNode("tab-orders").getByRole("tab").click();
    await expect(details).toBeVisible();
    await expect(resize).toHaveAttribute("aria-valuenow", height!);
    await expect(
      details.locator('[data-json-path="/nested/deeper/preserved"]'),
    ).toBeVisible();
    await expect(inspector.locator(".raw-content")).toBeVisible();
    await expect
      .poll(() =>
        scroll.evaluate((element) => ({
          top: element.scrollTop,
          left: element.scrollLeft,
        })),
      )
      .toEqual(before);
    expect(await details.evaluate((element) => element.scrollTop)).toBe(
      detailTop,
    );
    expect(
      await inspector
        .locator(".inspector-content")
        .evaluate((element) => element.scrollTop),
    ).toBe(inspectorTop);
    await inspector
      .locator("label")
      .filter({ hasText: /^Structured$/ })
      .click();
    await expect(
      inspector.locator('[data-json-path="/embedded"]'),
    ).toHaveAttribute("data-deserialized", "true");
    const embedded = inspector.getByRole("button", {
      name: "Expand /embedded",
      exact: true,
    });
    if (await embedded.count()) await embedded.click();
    await expect(
      inspector.locator('[data-json-path="/embedded/decoded"]'),
    ).toContainText("decoded-30");
    expect((await queries()).length).toBe(count);
    await tabNode("activity-tab-0").getByRole("tab").click();
    await expect
      .poll(() =>
        current("activity-tab-0")
          .locator(".viewer-scroll")
          .evaluate((element) => element.scrollTop),
      )
      .toBe(700);
  });
}

for (const mode of ["Plain Text", "AWS Patterns", "Auto"]) {
  test(`clear server filter queries automatically with empty pattern in ${mode}`, async () => {
    await fixtures();
    await page.getByRole("button", { name: /^AWS filter mode:/ }).click();
    await page.getByRole("menuitem", { name: new RegExp(`${mode}$`) }).click();
    const input = page.getByRole("combobox", {
      name: "CloudWatch filter pattern",
      exact: true,
    });
    await input.fill("no-results");
    await input.press("Enter");
    await expect(page.locator(".viewer-scroll")).toHaveAttribute(
      "aria-rowcount",
      "0",
    );
    const count = (await queries()).length;
    await page
      .getByRole("button", { name: "Clear server filter", exact: true })
      .click();
    await expect(input).toHaveValue("");
    await expect(page.locator(".viewer-scroll")).toHaveAttribute(
      "aria-rowcount",
      "200",
    );
    await expect(
      page.getByRole("button", { name: "Clear server filter", exact: true }),
    ).toHaveCount(0);
    const requests = await queries();
    expect(requests).toHaveLength(count + 1);
    expect(requests.at(-1).filter).toBe("");
    await expect(
      page.getByRole("button", {
        name: `AWS filter mode: ${mode}`,
        exact: true,
      }),
    ).toBeVisible();
    await expect(input).toBeFocused();
  });
}

test("switching tabs keeps a manually folded matched inspector branch folded", async () => {
  await fixtures();
  await page
    .getByRole("textbox", { name: "Local filter loaded events", exact: true })
    .fill("nested-0");
  const inspector = current("tab-orders").getByRole("region", {
    name: "Event inspector",
    exact: true,
  });
  await expect(
    inspector.locator('[data-json-path="/nested/value"]'),
  ).toBeVisible();
  await inspector
    .getByRole("button", { name: "Collapse /nested", exact: true })
    .click();
  await tabNode("activity-tab-0").getByRole("tab").click();
  await tabNode("tab-orders").getByRole("tab").click();
  await expect(
    inspector.getByRole("button", { name: "Expand /nested", exact: true }),
  ).toBeVisible();
  await expect(
    inspector.locator('[data-json-path="/nested/value"]'),
  ).toHaveCount(0);
});

test("retained viewers survive becoming split panes and switching between split and single tabs", async () => {
  await fixtures();
  const scroll = current("tab-orders").locator(".viewer-scroll");
  await scroll.evaluate((element) => {
    element.scrollTop = 1150;
  });
  await row(30)
    .getByRole("button", { name: "Expand event details", exact: true })
    .click();
  const before = await scroll.evaluate((element) => element.scrollTop);
  await tabNode("activity-tab-0")
    .getByRole("tab")
    .click({ modifiers: ["Control"] });
  await tabNode("tab-orders").getByRole("tab").click({ button: "right" });
  await page
    .getByRole("menuitem", { name: "Show in split mode", exact: true })
    .click();
  await expect(page.locator(".workspace-pane")).toHaveCount(2);
  const combined = page
    .locator('.workspace-tab[data-entry-kind="split"]')
    .getByRole("tab");
  await expect(row(30).locator(".event-message-details")).toBeVisible();
  await expect
    .poll(() => scroll.evaluate((element) => element.scrollTop))
    .toBe(before);
  await tabNode("activity-tab-1").getByRole("tab").click();
  await expect(page.locator(".workspace-pane")).toHaveCount(1);
  await combined.click();
  await expect(page.locator(".workspace-pane")).toHaveCount(2);
  await expect(row(30).locator(".event-message-details")).toBeVisible();
  await row(30).locator(".inspect-cell").first().click();
  const pane = row(30).locator(
    "xpath=ancestor::*[contains(@class,'workspace-pane')][1]",
  );
  await expect(pane).toHaveClass(/active-pane/);
  await combined.click({ button: "right" });
  await page
    .getByRole("menuitem", { name: "Exit split screen", exact: true })
    .click();
  await tabNode("tab-orders").getByRole("tab").click();
  await expect(row(30).locator(".event-message-details")).toBeVisible();
});

for (const theme of ["light", "dark"]) {
  test(`${theme} all time slots have steppers and focused wheel editing, and relative duration has both`, async () => {
    test.setTimeout(240000);
    await activity("Settings").click();
    const settings = page.getByRole("region", {
      name: "Settings",
      exact: true,
    });
    await settings
      .getByRole("tab", { name: "Time ranges", exact: true })
      .click();
    const inputs = settings.locator(".time-template-editor input");
    await expect(inputs).toHaveCount(27);
    await expect(
      settings.locator(
        '.time-template-editor .mantine-NumberInput-control[data-direction="up"]',
      ),
    ).toHaveCount(27);
    await expect(
      settings.locator(
        '.time-template-editor .mantine-NumberInput-control[data-direction="down"]',
      ),
    ).toHaveCount(27);
    for (let index = 0; index < 27; index++) {
      const input = inputs.nth(index);
      const before = Number(await input.inputValue());
      const controls = input.locator(
        "xpath=ancestor::*[contains(@class,'mantine-NumberInput-root')][1]",
      );
      // Trusted pointer clicks without RAF stability waits in hidden windows;
      // the following value assertion verifies that the intended control took it.
      await controls.locator('[data-direction="up"]').click({ force: true });
      await expect(input).toHaveValue(String(before + 1));
      await input.focus();
      const box = (await input.boundingBox())!;
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
      const scroll = await settings
        .locator(".settings-pane-scroll")
        .evaluate((element) => element.scrollTop);
      await page.mouse.wheel(0, 90);
      await expect(input).toHaveValue(String(before));
      expect(
        await settings
          .locator(".settings-pane-scroll")
          .evaluate((element) => element.scrollTop),
      ).toBe(scroll);
      await controls.locator('[data-direction="up"]').click({ force: true });
      await expect(input).toHaveValue(String(before + 1));
      await controls.locator('[data-direction="down"]').click({ force: true });
      await expect(input).toHaveValue(String(before));
    }
    await activity("AWS logs explorer").click();
    await activity("Time range").click();
    const popup = page.locator(".time-range-popover");
    await popup.getByRole("tab", { name: "Relative", exact: true }).click();
    const duration = popup.getByRole("textbox", {
      name: "Duration",
      exact: true,
    });
    await duration.fill("25");
    await popup
      .getByRole("button", { name: "Increase duration", exact: true })
      .click();
    await expect(duration).toHaveValue("26");
    await expect(duration).toBeFocused();
    await duration.hover();
    await page.mouse.wheel(0, -80);
    await expect(duration).toHaveValue("27");
    await popup
      .getByRole("button", { name: "Decrease duration", exact: true })
      .click();
    await expect(duration).toHaveValue("26");
  });
}
