import { openSettingsWindow } from "./settings-panel";
import {
  _electron as electron,
  expect,
  test,
  type ElectronApplication,
  type Page,
} from "@playwright/test";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join, resolve, sep } from "node:path";
import { desktopExecutablePath } from "./desktop-app";
import {
  createWorkspace,
  createTab,
  workspaceReducer,
} from "../../src/renderer/workspace";

test.setTimeout(90000);
let app: ElectronApplication;
let child: ReturnType<ElectronApplication["process"]> | undefined;
let page: Page;
let directory: string;
let errors: string[];
const temporaryRoot = resolve(".tmp/desktop-highlights-sources-window");
async function launch(state = "complete") {
  const env: Record<string, string> = {};
  for (const name of ["PATH", "SystemRoot", "WINDIR", "TEMP", "TMP", "COMSPEC"])
    if (process.env[name]) env[name] = process.env[name]!;
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
  page.setDefaultTimeout(6000);
  page.on("pageerror", (error) => errors.push(error.message));
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Emulation.setFocusEmulationEnabled", { enabled: true });
  await page.emulateMedia({ reducedMotion: "reduce" });
  expect(
    (await page.evaluate(() => window.explorer.environment())).canEnableAws,
  ).toBe(false);
  expect(
    await app.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()[0].isVisible(),
    ),
  ).toBe(false);
  await app.evaluate(({ dialog }) => {
    dialog.showMessageBox = async () => {
      throw new Error("Unexpected native dialog");
    };
  });
  await expect(
    page.locator(`.query-status[data-query-state="${state}"]`).first(),
  ).toBeVisible();
}
async function close() {
  const currentChild = child;
  if (!app || !currentChild || currentChild.exitCode !== null) return;
  const processExited = new Promise<void>((resolve) =>
    currentChild.once("exit", () => resolve()),
  );
  const exited = app.waitForEvent("close");
  await app.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows()[0].close(),
  );
  await exited;
  await processExited;
  child = undefined;
}
test.beforeEach(async () => {
  errors = [];
  await mkdir(temporaryRoot, { recursive: true });
  directory = await mkdtemp(join(temporaryRoot, "case-"));
  const workspace = createWorkspace();
  workspace.connections.push({
    ...workspace.connections[0],
    id: "other-fixtures",
    name: "Other fixtures",
    region: "us-east-1",
  });
  workspace.tabs[0].view.mode = "table";
  workspace.tabs[0].filterPattern = "";
  await writeFile(join(directory, "workspace.json"), JSON.stringify(workspace));
  await launch();
});
test.afterEach(async () => {
  await close();
  expect(errors).toEqual([]);
  if (!resolve(directory).startsWith(temporaryRoot + sep + "case-"))
    throw new Error("Unsafe verification cleanup");
  await rm(directory, {
    recursive: true,
    force: true,
    maxRetries: 10,
    retryDelay: 100,
  });
});
async function settings() {
  await openSettingsWindow(page);
  await page.getByRole("tab", { name: "Highlights", exact: true }).click();
}
const dialog = () => page.getByRole("dialog", { name: "Settings" });
async function editFirstHighlightRule() {
  const selected = dialog()
    .locator('[role="treeitem"][aria-selected="true"]')
    .first();
  const id = await selected.getAttribute("data-tree-profile");
  const profile = dialog().locator(
    `[role="treeitem"][data-tree-profile="${id}"]:not([data-tree-rule])`,
  );
  if ((await profile.getAttribute("aria-expanded")) === "false")
    await profile.getByRole("button").first().click();
  await dialog()
    .locator(`[role="treeitem"][data-tree-profile="${id}"][data-tree-rule]`)
    .first()
    .click();
}
async function saveHighlightRule() {
  await dialog().getByLabel("Match regex", { exact: true }).press("Tab");
}
async function capture(filename: string) {
  let image = "";
  for (let i = 0; i < 3; i++) {
    await page.evaluate(
      () =>
        new Promise<void>((done) =>
          requestAnimationFrame(() => requestAnimationFrame(() => done())),
        ),
    );
    image = await app.evaluate(async ({ BrowserWindow }) => {
      const window = BrowserWindow.getAllWindows()[0];
      if (window.isVisible()) throw new Error("Verification became visible");
      const image = await window.webContents.capturePage(undefined, {
        stayHidden: true,
        stayAwake: true,
      });
      if (window.isVisible()) throw new Error("Capture changed visibility");
      return image.toPNG().toString("base64");
    });
  }
  await mkdir(test.info().outputDir, { recursive: true });
  await writeFile(
    test.info().outputPath(filename),
    Buffer.from(image, "base64"),
  );
}
async function dragResource(source: ReturnType<Page["locator"]>) {
  const start = (await source.boundingBox())!;
  await page.mouse.move(start.x + start.width / 2, start.y + start.height / 2);
  await page.mouse.down();
  await page.mouse.move(
    start.x + start.width / 2 + 15,
    start.y + start.height / 2,
    { steps: 3 },
  );
  await expect(page.locator(".source-badges")).toBeVisible();
  const end = (await page.locator(".source-badges").boundingBox())!;
  await page.mouse.move(end.x + end.width / 2, end.y + end.height / 2, {
    steps: 5,
  });
  await expect(page.locator(".resource-drag-preview")).toBeVisible();
  await expect(page.locator(".source-badges")).toHaveClass(
    /source-drop-active/,
  );
  await page.mouse.up();
  await expect(page.locator(".resource-drag-preview")).toHaveCount(0);
  await expect(page.locator(".source-badges")).not.toHaveClass(
    /source-drop-active/,
  );
  expect(await page.evaluate(() => getSelection()?.toString())).toBe("");
}
test("highlight profiles edit, scope, color rows and structured text, and persist across restart", async () => {
  await settings();
  await dialog()
    .getByRole("button", { name: "Add highlight profile", exact: true })
    .click();
  await dialog()
    .getByLabel("Profile name", { exact: true })
    .fill("Payment investigation");
  await dialog()
    .getByLabel("Log group regex", { exact: true })
    .fill("orders-api$");
  await editFirstHighlightRule();
  await dialog().getByLabel("Match regex", { exact: true }).fill("ERROR");
  await dialog()
    .getByLabel("Shared background", { exact: true })
    .fill("#552211");
  await dialog().getByLabel("Shared background", { exact: true }).press("Tab");
  await saveHighlightRule();
  await dialog().locator(".mantine-Modal-close").click();
  const errorRow = page.locator(".virtual-event.level-error").first(),
    infoRow = page.locator(".virtual-event.level-info").first();
  await expect(errorRow).toHaveAttribute("data-highlighted", "true");
  await expect(infoRow).toHaveAttribute("data-highlighted", "false");
  await expect(errorRow.locator(".log-cell").first()).toHaveCSS(
    "background-color",
    "rgb(85, 34, 17)",
  );
  await errorRow.locator(".inspect-cell").first().click();
  await expect(errorRow).toHaveCSS("outline-style", "none");
  await expect(errorRow).toHaveAttribute("aria-selected", "true");
  await settings();
  await editFirstHighlightRule();
  await dialog()
    .getByRole("combobox", { name: "Search in", exact: true })
    .click();
  await page
    .getByRole("option", { name: "Structured property", exact: true })
    .click();
  await dialog()
    .getByLabel("JSON Pointer path", { exact: true })
    .fill("/level");
  await dialog()
    .getByRole("combobox", { name: "Highlight", exact: true })
    .click();
  await page
    .getByRole("option", { name: "Matching text", exact: true })
    .click();
  await dialog()
    .getByLabel("Separate light and dark colors", { exact: true })
    .locator("..")
    .click();
  await expect(
    dialog().getByLabel("Separate light and dark colors", { exact: true }),
  ).toBeChecked();
  await dialog().getByLabel("Dark background", { exact: true }).fill("#772222");
  await dialog().getByLabel("Dark background", { exact: true }).press("Tab");
  await dialog()
    .getByLabel("Light background", { exact: true })
    .fill("#ffdddd");
  await dialog().getByLabel("Light background", { exact: true }).press("Tab");
  await saveHighlightRule();
  await dialog().locator(".mantine-Modal-close").click();
  await page
    .locator("label")
    .filter({ hasText: /^Hybrid$/ })
    .click();
  await errorRow
    .getByRole("button", { name: "Expand event details", exact: true })
    .click();
  await expect(
    errorRow.locator(".json-value .profile-highlight-text"),
  ).toHaveText("ERROR");
  await expect(
    errorRow.locator(".json-value .profile-highlight-text"),
  ).toHaveCSS("background-color", "rgb(119, 34, 34)");
  await capture("structured-highlight-dark.png");
  await settings();
  await dialog().getByRole("tab", { name: "Preferences", exact: true }).click();
  await dialog().getByRole("combobox", { name: "Theme", exact: true }).click();
  await page.getByRole("option", { name: "Light", exact: true }).click();
  await dialog().locator(".mantine-Modal-close").click();
  await expect(
    errorRow.locator(".json-value .profile-highlight-text"),
  ).toHaveCSS("background-color", "rgb(255, 221, 221)");
  await capture("structured-highlight-light.png");
  await close();
  await launch();
  await settings();
  const profileRow = dialog().getByRole("treeitem", {
    name: "Select profile Payment investigation",
    exact: true,
  });
  await expect(profileRow).toBeVisible();
  await profileRow.click();
  await editFirstHighlightRule();
  await expect(
    dialog().getByLabel("JSON Pointer path", { exact: true }),
  ).toHaveValue("/level");
  await profileRow.click();
  const enabled = dialog()
    .locator(".highlight-tree-detail")
    .getByRole("switch", { name: "Enabled", exact: true });
  await enabled.locator("..").click();
  await expect(enabled).not.toBeChecked();
  await dialog().locator(".mantine-Modal-close").click();
  await expect(page.locator(".profile-highlight-text")).toHaveCount(0);
});
test("catastrophic captured-log regex times out in preview workers and recovers", async () => {
  await app.evaluate(({ ipcMain }) => {
    ipcMain.removeHandler("explorer:query");
    ipcMain.handle("explorer:query", (event, request) => {
      setTimeout(
        () =>
          event.sender.send("explorer:update", {
            requestId: request.requestId,
            state: "complete",
            events: [
              {
                id: "bounded-preview",
                timestamp: 1720000000000,
                logGroup: request.sources[0].logGroup,
                logStream: "preview",
                message: "ERROR recovered " + "a".repeat(200) + "!",
              },
            ],
            replace: true,
          }),
        10,
      );
      return request.requestId;
    });
  });
  await page.locator('[data-testid="run-query"]:visible').click();
  await expect(
    page.locator(".workspace-pane.active-pane .viewer-scroll"),
  ).toHaveAttribute("aria-rowcount", "1");
  await settings();
  await dialog()
    .getByRole("button", { name: "Add highlight profile", exact: true })
    .click();
  await editFirstHighlightRule();
  await dialog().getByLabel("Match regex", { exact: true }).fill("(a+)+$");
  await saveHighlightRule();
  await dialog().getByRole("button", { name: "Preview", exact: true }).click();
  const light = dialog().getByRole("region", {
    name: "Light preview",
    exact: true,
  });
  await expect(
    light.getByText(/Highlighting paused: a regex exceeded/),
  ).toBeVisible({ timeout: 10000 });
  await editFirstHighlightRule();
  await dialog().getByLabel("Match regex", { exact: true }).fill("ERROR");
  await saveHighlightRule();
  await expect(light.locator(".virtual-event").first()).toHaveCSS(
    "background-color",
    "rgb(113, 63, 18)",
  );
  await dialog().locator(".mantine-Modal-close").click();
  await page
    .getByRole("textbox", { name: "Local filter loaded events", exact: true })
    .fill("no-match");
  await expect(
    page.locator(".workspace-pane.active-pane .viewer-scroll"),
  ).toHaveAttribute("aria-rowcount", "0");
});

test("Explorer source badges refresh automatically, preserve individual streams and manual titles", async () => {
  test.setTimeout(180000);
  const group = page.getByRole("button", {
    name: "/aws/lambda/payments-worker",
    exact: true,
  });
  await dragResource(group);
  await expect(page.locator(".source-badge")).toHaveCount(2);
  await expect(page.locator(".source-badge").nth(1)).toContainText(
    "payments-worker",
  );
  await expect(page.locator(".source-badge").nth(1)).not.toContainText(
    "/aws/lambda/",
  );
  await expect(page.locator(".query-status")).toContainText("1,080 loaded");
  await expect(page.locator(".workspace-tab").getByRole("tab")).toContainText(
    "Mixed Sources",
  );
  await expect(
    page.getByText("Sources updated. Run to query the current selection.", {
      exact: true,
    }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("dialog", { name: "Log sources", exact: true }),
  ).toHaveCount(0);
  await dragResource(group);
  await expect(page.locator(".source-badge")).toHaveCount(2);
  await page
    .locator(".workspace-tab")
    .getByRole("tab")
    .click({ button: "right" });
  await page.getByRole("menuitem", { name: "Rename tab", exact: true }).click();
  await page.getByLabel("Tab name", { exact: true }).fill("Investigation");
  await page.getByRole("button", { name: "Rename", exact: true }).click();
  await page
    .getByRole("button", {
      name: "Expand /aws/lambda/media-pipeline",
      exact: true,
    })
    .click();
  const streams = page.locator(".stream-row .resource-label");
  await expect(streams).toHaveCount(4);
  const firstName = (await streams.nth(0).innerText()).trim();
  const secondName = (await streams.nth(1).innerText()).trim();
  expect(firstName.endsWith("worker-4")).toBe(true);
  expect(secondName.endsWith("worker-3")).toBe(true);
  await dragResource(streams.nth(0));
  await dragResource(streams.nth(1));
  await expect(page.locator(".source-badge")).toHaveCount(4);
  await expect(page.locator(".query-status")).toContainText("1,350 loaded");
  await expect(page.locator(".workspace-tab").getByRole("tab")).toContainText(
    "Investigation",
  );
  await expect(page.locator(".pane-heading")).toContainText("Investigation");
  await capture("source-badges.png");
  await page
    .locator(".source-badge")
    .filter({ hasText: "media-pipeline" })
    .first()
    .getByRole("button")
    .click();
  await expect(page.locator(".source-badge")).toHaveCount(3);
  await expect(page.locator(".query-status")).toContainText("1,215 loaded");
  await expect(
    page.locator(`.source-badge[data-source-stream="${secondName}"]`),
  ).toBeVisible();
  await close();
  await launch();
  await expect(page.locator(".source-badge")).toHaveCount(3);
  await expect(page.locator(".workspace-tab").getByRole("tab")).toContainText(
    "Investigation",
  );
  await expect(page.getByLabel("CloudWatch filter pattern")).toHaveValue("");
});

test("source-strip drops cancel with Escape and query another region", async () => {
  test.setTimeout(180000);
  const group = page.getByRole("button", {
    name: "/aws/lambda/payments-worker",
    exact: true,
  });
  const start = (await group.boundingBox())!;
  await page.mouse.move(start.x + 40, start.y + 10);
  await page.mouse.down();
  await page.mouse.move(start.x + 55, start.y + 10, { steps: 3 });
  await expect(page.locator(".resource-drag-preview")).toBeVisible();
  await expect(page.locator(".source-badges")).not.toHaveClass(
    /source-drop-active/,
  );
  const strip = (await page.locator(".source-badges").boundingBox())!;
  await page.mouse.move(strip.x + 40, strip.y + 15, { steps: 5 });
  await expect(page.locator(".source-badges")).toHaveClass(
    /source-drop-active/,
  );
  await page.keyboard.press("Escape");
  await page.mouse.up();
  await expect(page.locator(".resource-drag-preview")).toHaveCount(0);
  await expect(page.locator(".source-badge")).toHaveCount(1);
  await page
    .getByRole("combobox", { name: "Explorer region", exact: true })
    .click();
  await page.getByRole("option", { name: "us-east-1", exact: true }).click();
  const otherGroup = page
    .locator('[data-node-kind="group"][data-connection-id="other-fixtures"]')
    .getByRole("button", { name: "/aws/lambda/orders-api", exact: true });
  await dragResource(otherGroup);
  await expect(page.locator(".pane-heading")).toContainText("2 regions");
  await expect(page.locator(".source-badge")).toHaveCount(2);
  await expect(page.locator(".query-status")).toContainText("1,080 loaded");
  await expect(
    page.locator('.source-badge[data-source-connection="other-fixtures"]'),
  ).toHaveAttribute("data-tooltip", /us-east-1/);
  await capture("source-regions.png");
  await close();
  await launch();
  await expect(page.locator(".source-badge")).toHaveCount(2);
  await expect(page.locator(".query-status")).toContainText("1,080 loaded");
  await page
    .locator(".source-badge")
    .first()
    .getByRole("button", { name: /^Remove source/ })
    .click();
  await expect(page.locator(".source-badge")).toHaveCount(1);
  await expect(page.locator(".query-status")).toContainText("540 loaded");
  await expect(page.locator(".pane-heading")).toContainText("us-east-1");
  await page.locator(".virtual-event").first().click({ button: "right" });
  await page
    .getByRole("menuitem", { name: "Surrounding context", exact: true })
    .hover();
  await page
    .getByRole("menuitem", { name: "Both directions", exact: true })
    .hover();
  await page.getByRole("menuitem", { name: "1 minute", exact: true }).click();
  await expect(
    page.getByRole("tab", { name: /^Context \u00b7/ }),
  ).toBeVisible();
  await expect(page.locator(".pane-heading")).toContainText("us-east-1");
  await expect(
    page.locator('.source-badge[data-source-connection="other-fixtures"]'),
  ).toHaveCount(1);
  await page
    .getByRole("tab", { name: /^Context \u00b7/ })
    .click({ button: "middle" });
  await expect(page.locator(".source-control")).toBeHidden();
});

test("maximized state is saved before an immediate minimize without showing verification windows", async () => {
  await app.evaluate(({ BrowserWindow }) => {
    const window = BrowserWindow.getAllWindows()[0];
    // Emulate state accessors rather than physically maximizing/minimizing a
    // hidden window, which can show it on Windows. The real main listeners run.
    window.isMaximized = () => true;
    window.emit("maximize");
    window.isMinimized = () => true;
    window.emit("minimize");
  });
  await expect
    .poll(async () => {
      try {
        return JSON.parse(
          await readFile(join(directory, "window-state.json"), "utf8"),
        ).maximized;
      } catch {
        return undefined;
      }
    })
    .toBe(true);
  expect(
    await app.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()[0].isVisible(),
    ),
  ).toBe(false);
});
for (const size of ["normal", "minimum"] as const) {
  test(`main window saves ${size} geometry and restores it on a hidden restart`, async () => {
    const bounds = await app.evaluate(({ BrowserWindow, screen }, size) => {
      const window = BrowserWindow.getAllWindows()[0],
        area = screen.getPrimaryDisplay().workArea;
      const bounds = {
        x: area.x + 30,
        y: area.y + 30,
        width: size === "minimum" ? 860 : 1000,
        height: size === "minimum" ? 580 : 720,
      };
      window.setBounds(bounds);
      return window.getNormalBounds();
    }, size);
    await close();
    const saved = JSON.parse(
      await readFile(join(directory, "window-state.json"), "utf8"),
    );
    expect(saved.bounds).toEqual(bounds);
    expect(saved.maximized).toBe(false);
    await launch();
    for (let restart = 0; restart < 3; restart++) {
      expect(
        await app.evaluate(({ BrowserWindow }) =>
          BrowserWindow.getAllWindows()[0].getNormalBounds(),
        ),
      ).toEqual(bounds);
      if (restart < 2) {
        await close();
        await launch();
      }
    }
    expect(
      await app.evaluate(({ BrowserWindow }) =>
        BrowserWindow.getAllWindows()[0].isVisible(),
      ),
    ).toBe(false);
  });
}

test("unused AWS anchor permits the selected fixture source with accurate Live hints", async () => {
  await close();
  const workspace = createWorkspace(),
    offline = workspace.connections[0];
  workspace.connections = [
    { ...offline, id: "aws-anchor", mode: "aws" },
    { ...offline, id: "selected-fixture", region: "us-east-1" },
  ];
  workspace.tabs[0].connectionId = "aws-anchor";
  workspace.tabs[0].sources = [
    { connectionId: "selected-fixture", logGroup: "/aws/lambda/orders-api" },
  ];
  workspace.activeConnectionId = "selected-fixture";
  await writeFile(join(directory, "workspace.json"), JSON.stringify(workspace));
  await launch();
  await expect(page.locator(".query-status")).toContainText("540 loaded");
  await expect(page.locator(".pane-heading")).toContainText("us-east-1");
  const live = page.getByRole("button", { name: "Live", exact: true });
  await expect(live).toHaveAttribute(
    "aria-description",
    "Start an explicitly simulated fixture stream",
  );
  await live.hover();
  await page.waitForTimeout(650);
  await expect(page.getByRole("tooltip")).toHaveCount(0);
  await expect(page.getByText(/limited fixture interpreter/)).toHaveCount(0);
});

test("sole AWS source retains the AWS Live cost description despite an offline anchor without enabling AWS", async () => {
  await close();
  const workspace = createWorkspace(),
    offline = workspace.connections[0];
  workspace.connections.push({
    ...offline,
    id: "aws-selected",
    mode: "aws",
    region: "us-east-1",
  });
  workspace.tabs[0].sources = [
    { connectionId: "aws-selected", logGroup: "/aws/lambda/orders-api" },
  ];
  workspace.activeConnectionId = offline.id;
  await writeFile(join(directory, "workspace.json"), JSON.stringify(workspace));
  await launch("error");
  await expect(page.getByRole("alert")).toContainText("AWS access is disabled");
  const live = page.getByRole("button", { name: "Live", exact: true });
  await expect(live).toHaveAttribute("aria-description", /AWS charges apply/);
  await live.hover();
  await page.waitForTimeout(650);
  await expect(page.getByRole("tooltip")).toHaveCount(0);
  await expect(page.getByText(/limited fixture interpreter/)).toHaveCount(0);
  expect(
    (await page.evaluate(() => window.explorer.environment())).canEnableAws,
  ).toBe(false);
});

test("source strips fit narrow split panes and removable badges remain reachable in light mode", async () => {
  await close();
  let workspace = createWorkspace();
  workspace.preferences.theme = "light";
  const sources = [
    {
      logGroup: "/aws/lambda/orders-api",
      logStreams: [1, 2, 3, 4].map(
        (index) => `2026/10/13/[$LATEST]worker-${index}`,
      ),
    },
    { logGroup: "/aws/lambda/payments-worker" },
    { logGroup: "/aws/lambda/media-pipeline" },
  ];
  workspace.tabs[0].sources = sources;
  const tab = createTab(workspace.connections[0].id, sources);
  workspace = workspaceReducer(workspace, { type: "tab/open", tab });
  workspace = workspaceReducer(workspace, {
    type: "pane/show-tabs",
    tabIds: workspace.tabs.map((tab) => tab.id),
  });
  await writeFile(join(directory, "workspace.json"), JSON.stringify(workspace));
  await launch();
  await app.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows()[0].setBounds({ width: 1100, height: 800 }),
  );
  await expect(
    page.locator('.query-status[data-query-state="complete"]'),
  ).toHaveCount(2);
  const panes = page.locator(".query-pane");
  await expect(panes).toHaveCount(2);
  for (const pane of await panes.all()) {
    const bounds = (await pane.boundingBox())!,
      strip = (await pane.locator(".source-badges").boundingBox())!;
    expect(strip.x).toBeGreaterThanOrEqual(bounds.x);
    expect(strip.x + strip.width).toBeLessThanOrEqual(
      bounds.x + bounds.width + 1,
    );
    await expect(pane.locator(".source-badge")).toHaveCount(6);
  }
  await panes
    .first()
    .locator(".source-badge")
    .last()
    .getByRole("button")
    .click();
  await expect(panes.first().locator(".source-badge")).toHaveCount(5);
  await expect(panes.first().locator(".query-status")).toContainText(
    "1,080 loaded",
  );
  await expect(panes.nth(1).locator(".source-badge")).toHaveCount(6);
  await capture("source-badges-split-light.png");
});

async function startResourceDrag(source: ReturnType<Page["locator"]>) {
  const rect = (await source.boundingBox())!;
  await page.mouse.move(rect.x + rect.width / 2, rect.y + rect.height / 2);
  await page.mouse.down();
  await page.mouse.move(
    rect.x + rect.width / 2 + 15,
    rect.y + rect.height / 2,
    { steps: 3 },
  );
  await expect(page.locator(".resource-drag-preview")).toBeVisible();
}

test("Explorer drags reveal another region's single-source tab without losing the drag and restore on cancel", async () => {
  test.setTimeout(180000);
  await close();
  let workspace = createWorkspace();
  workspace.connections.push({
    ...workspace.connections[0],
    id: "east-target",
    region: "us-east-1",
  });
  const original = workspace.tabs[0].id;
  const target = createTab("east-target", [
    { logGroup: "/aws/lambda/orders-api" },
  ]);
  target.filterPattern = "";
  workspace = workspaceReducer(workspace, { type: "tab/open", tab: target });
  workspace = workspaceReducer(workspace, {
    type: "tab/select",
    tabId: original,
  });
  await writeFile(join(directory, "workspace.json"), JSON.stringify(workspace));
  await launch();
  const group = page.getByRole("button", {
    name: "/aws/lambda/payments-worker",
    exact: true,
  });
  const targetTab = page
    .locator(`.workspace-tab[data-tab-id="${target.id}"]`)
    .getByRole("tab");
  const hoverTarget = async () => {
    await startResourceDrag(group);
    const rect = (await targetTab.boundingBox())!;
    await page.mouse.move(rect.x + rect.width / 2, rect.y + rect.height / 2, {
      steps: 5,
    });
    await expect(targetTab).toHaveAttribute("aria-selected", "true");
    await expect(page.locator(".resource-drag-preview")).toBeVisible();
    await expect(page.locator(".source-control")).toBeVisible();
    await expect(
      page.getByRole("combobox", { name: "Explorer region", exact: true }),
    ).toHaveValue("eu-west-1");
  };
  await hoverTarget();
  await page.keyboard.press("Escape");
  await page.mouse.up();
  await expect(
    page.locator(`.workspace-tab[data-tab-id="${original}"]`).getByRole("tab"),
  ).toHaveAttribute("aria-selected", "true");
  await expect(page.locator(".source-control")).toBeHidden();
  await hoverTarget();
  const strip = (await page.locator(".source-badges").boundingBox())!;
  await page.mouse.move(strip.x + strip.width / 2, strip.y + strip.height / 2, {
    steps: 5,
  });
  await expect(page.locator(".source-badges")).toHaveClass(
    /source-drop-active/,
  );
  await expect(page.locator("[data-resource-split-preview]")).toHaveCount(0);
  await page.mouse.up();
  // Source-strip completion restores the entry active at drag start; the target still receives its sources.
  await targetTab.click();
  await expect(page.locator(".query-pane")).toHaveCount(1);
  await expect(page.locator(".source-badge")).toHaveCount(2);
  await expect(page.locator(".query-status")).toContainText("1,080 loaded");
  await expect(page.locator(".pane-heading")).toContainText("Mixed Sources");
});

test("Explorer groups and streams create and extend splits with exact drop previews", async () => {
  test.setTimeout(180000);
  await expect(page.locator(".source-control")).toBeHidden();
  const originalLabel = await page
    .locator(".query-pane")
    .getAttribute("aria-label");
  const group = page.getByRole("button", {
    name: "/aws/lambda/payments-worker",
    exact: true,
  });
  await startResourceDrag(group);
  const pane = (await page.locator("[data-pane-drop-target]").boundingBox())!;
  await page.mouse.move(pane.x + pane.width / 2, pane.y + pane.height - 10, {
    steps: 6,
  });
  const overlay = page.locator("[data-resource-split-preview]");
  await expect(overlay).toHaveAttribute(
    "data-resource-split-preview",
    "bottom",
  );
  const preview = (await overlay.boundingBox())!;
  expect(preview.width).toBeCloseTo(pane.width, -1);
  expect(preview.height).toBeCloseTo((pane.height - 4) / 2, -1);
  // A preview never publishes a draft query/view.
  await expect(page.locator(".query-pane")).toHaveCount(1);
  await page.mouse.up();
  await expect(page.locator(".query-pane")).toHaveCount(2);
  const final = (await page
    .locator("[data-pane-drop-target]")
    .nth(1)
    .boundingBox())!;
  for (const key of ["x", "y", "width", "height"] as const)
    expect(Math.abs(final[key] - preview[key])).toBeLessThanOrEqual(5);
  await expect(page.locator(".query-pane").first()).toHaveAttribute(
    "aria-label",
    originalLabel!,
  );
  await expect(
    page.locator(".workspace-tab[data-entry-kind='split']"),
  ).toContainText("Mixed Sources");
  await expect(page.locator(".source-control").first()).toBeHidden();
  await page
    .getByRole("button", {
      name: "Expand /aws/lambda/media-pipeline",
      exact: true,
    })
    .click();
  await startResourceDrag(page.locator(".stream-row .resource-label").first());
  const bottom = (await page
    .locator("[data-pane-drop-target]")
    .nth(1)
    .boundingBox())!;
  await page.mouse.move(
    bottom.x + bottom.width - 10,
    bottom.y + bottom.height / 2,
    { steps: 6 },
  );
  await expect(overlay).toHaveAttribute("data-resource-split-preview", "right");
  await page.mouse.up();
  await expect(page.locator(".query-pane")).toHaveCount(3);
  await expect(page.locator(".workspace-tab")).toHaveCount(1);
  await expect(page.locator(".workspace-tab")).toContainText("Mixed Sources");
  await expect(page.locator(".source-badge[data-source-stream]")).toHaveCount(
    1,
  );
  await expect(
    page.locator(".query-status[data-query-state='complete']"),
  ).toHaveCount(3);
  await capture("explorer-three-pane-split-dark.png");
  expect(await page.evaluate(() => getSelection()?.toString())).toBe("");
});

test("pane headers stay distinct from status and controls in both themes and every event mode", async () => {
  await close();
  let workspace = createWorkspace();
  workspace.tabs[0].filterPattern = "";
  const tab = createTab(workspace.connections[0].id, [
    { logGroup: "/aws/lambda/payments-worker" },
  ]);
  workspace = workspaceReducer(workspace, {
    type: "pane/drop-resource",
    tab,
    paneId: workspace.panes[0].id,
    edge: "bottom",
  });
  await writeFile(join(directory, "workspace.json"), JSON.stringify(workspace));
  await launch();
  for (const theme of ["dark", "light"]) {
    if (theme === "light") {
      await settings();
      await dialog()
        .getByRole("tab", { name: "Preferences", exact: true })
        .click();
      await dialog()
        .getByRole("combobox", { name: "Theme", exact: true })
        .click();
      await page.getByRole("option", { name: theme, exact: true }).click();
      await dialog().locator(".mantine-Modal-close").click();
    }
    for (const mode of ["JSON", "Table", "Hybrid"]) {
      for (const pane of await page.locator(".query-pane").all())
        await pane
          .locator("label")
          .filter({ hasText: new RegExp("^" + mode + "$") })
          .click();
      const colors = await page
        .locator(".pane-heading")
        .evaluateAll((headings) =>
          headings.map((heading) => {
            const pane = heading.closest("[data-pane-drop-target]")!;
            const rgb = (color: string) => {
              const context = document
                .createElement("canvas")
                .getContext("2d")!;
              context.fillStyle = color;
              context.fillRect(0, 0, 1, 1);
              return (
                "rgb(" +
                [...context.getImageData(0, 0, 1, 1).data]
                  .slice(0, 3)
                  .join(", ") +
                ")"
              );
            };
            return {
              header: rgb(getComputedStyle(heading).backgroundColor),
              text: rgb(
                getComputedStyle(heading.querySelector(".pane-title")!).color,
              ),
              secondary: [
                ...heading.querySelectorAll(
                  ".mantine-Text-root:not(.pane-title), .mantine-Badge-label",
                ),
              ].map((element) => rgb(getComputedStyle(element).color)),
              status: rgb(
                getComputedStyle(pane.querySelector(".query-status")!)
                  .backgroundColor,
              ),
              tools: getComputedStyle(
                pane.querySelector(".query-toolbar") ??
                  pane.querySelector(".query-pane")!,
              ).backgroundColor,
            };
          }),
        );
      expect(colors[0].header).not.toBe(colors[1].header);
      for (const color of colors) {
        expect(color.header).not.toBe(color.status);
        expect(color.header).not.toBe(color.tools);
        const values = (color: string) =>
          color
            .match(/[\d.]+/g)!
            .slice(0, 3)
            .map(Number)
            .map((x) => x / 255)
            .map((x) =>
              x <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4,
            );
        const luminance = (color: string) => {
          const [r, g, b] = values(color);
          return 0.2126 * r + 0.7152 * g + 0.0722 * b;
        };
        for (const text of [color.text, ...color.secondary]) {
          const foreground = luminance(text),
            background = luminance(color.header);
          expect(
            (Math.max(foreground, background) + 0.05) /
              (Math.min(foreground, background) + 0.05),
          ).toBeGreaterThanOrEqual(4.5);
        }
      }
      await capture(`pane-headers-${theme}-${mode.toLowerCase()}.png`);
    }
  }
});

test("tab context menu saves a complete split view, reopens an independent snapshot and removes it by right click", async () => {
  test.setTimeout(180000);
  await close();
  let workspace = createWorkspace();
  workspace.tabs[0].customTitle = "Requests";
  workspace.tabs[0].filterPattern = "ERROR";
  workspace.tabs[0].view.mode = "table";
  workspace.tabs[0].view.localSearch = "Payment";
  workspace.tabs[0].view.wrap = true;
  workspace.tabs[0].view.highlightText = "timeout";
  workspace.tabs[0].view.columns = [
    { path: "timestamp", width: 290, pinned: true },
    { path: "message", width: 460 },
  ];
  workspace.tabs[0].view.sort = { path: "timestamp", desc: true };
  workspace.tabs[0].timePreset = "custom";
  workspace.tabs[0].customStart = new Date(Date.now() - 3600000).toISOString();
  workspace.tabs[0].customEnd = new Date().toISOString();
  const second = createTab("other-fixtures", [
    {
      logGroup: "/aws/lambda/payments-worker",
      logStreams: ["2026/10/13/[$LATEST]worker-2"],
    },
  ]);
  workspace.connections.push({
    ...workspace.connections[0],
    id: "other-fixtures",
    region: "us-east-1",
  });
  second.timePreset = "15m";
  second.filterPattern = "";
  workspace = workspaceReducer(workspace, { type: "tab/open", tab: second });
  workspace = workspaceReducer(workspace, {
    type: "pane/show-tabs",
    tabIds: workspace.tabs.map((tab) => tab.id),
  });
  workspace = workspaceReducer(workspace, {
    type: "pane/resize",
    path: "",
    ratio: 0.62,
  });
  workspace = workspaceReducer(workspace, {
    type: "tab/rename",
    tabId: workspace.activeTabId!,
    title: "Saved investigation",
  });
  const originalIds = workspace.tabs.map((tab) => tab.id),
    originalTabs = structuredClone(workspace.tabs);
  await writeFile(join(directory, "workspace.json"), JSON.stringify(workspace));
  await launch();
  await page
    .locator(".workspace-tab")
    .getByRole("tab")
    .click({ button: "right" });
  await page
    .getByRole("menuitem", { name: "Save view to Favorites", exact: true })
    .click();
  let favorite = page.locator(".saved-view-favorite");
  await expect(favorite).toHaveCount(1);
  await expect(favorite).toHaveText("Saved investigation");
  await expect(
    page.locator(".resource-tree .favorite-button[aria-label^='Favorite ']"),
  ).toHaveCount(0);
  await close();
  const saved = JSON.parse(
    await readFile(join(directory, "workspace.json"), "utf8"),
  );
  expect(saved.favorites[0].tabs).toEqual(originalTabs);
  expect(saved.favorites[0].split.layout.ratio).toBe(0.62);
  await launch();
  favorite = page.locator(".saved-view-favorite");
  await page
    .locator(".workspace-tab")
    .getByRole("button", { name: "Close Saved investigation", exact: true })
    .click();
  await expect(page.locator(".workspace-tab")).toHaveCount(0);
  await favorite.click();
  await expect(page.locator(".workspace-tab")).toHaveCount(1);
  await expect(page.locator(".query-pane")).toHaveCount(2);
  await expect(page.locator(".pane-title").first()).toHaveText("Requests");
  await expect(
    page.getByLabel("Local filter loaded events").first(),
  ).toHaveValue("Payment");
  await expect(
    page.getByLabel("CloudWatch filter pattern").first(),
  ).toHaveValue("ERROR");
  await expect(
    page.locator(".source-badge[data-source-connection='other-fixtures']"),
  ).toHaveCount(1);
  await expect(
    page.getByRole("menuitem", { name: "Delete", exact: true }),
  ).toHaveCount(0);
  await favorite.click({ button: "right" });
  await page.getByRole("menuitem", { name: "Delete", exact: true }).click();
  await page
    .getByRole("group", {
      name: "Delete favorite Saved investigation",
      exact: true,
    })
    .getByRole("button", { name: "Delete", exact: true })
    .click();
  await expect(favorite).toHaveCount(0);
  await expect(page.locator(".query-pane")).toHaveCount(2);
  await capture("saved-split-view-restored.png");
  await close();
  const restored = JSON.parse(
    await readFile(join(directory, "workspace.json"), "utf8"),
  );
  expect(restored.favorites).toHaveLength(0);
  expect(
    restored.tabs.every((tab: { id: string }) => !originalIds.includes(tab.id)),
  ).toBe(true);
  expect(restored.tabs[0].customStart).toBe(originalTabs[0].customStart);
  expect(restored.tabs[0].customEnd).toBe(originalTabs[0].customEnd);
  expect(restored.tabs[1].timePreset).toBe("15m");
  expect(restored.tabs[0].view).toEqual(originalTabs[0].view);
});

test("dragging normal and combined tabs onto Favorites saves without moving or breaking their layouts", async () => {
  test.setTimeout(180000);
  const dragToFavorites = async () => {
    const source = (await page
      .locator(".workspace-tab")
      .first()
      .getByRole("tab")
      .boundingBox())!;
    const target = (await page
      .getByRole("region", { name: "Favorite views", exact: true })
      .boundingBox())!;
    await page.mouse.move(source.x + 35, source.y + source.height / 2);
    await page.mouse.down();
    await page.mouse.move(source.x + 50, source.y + source.height / 2, {
      steps: 3,
    });
    await page.mouse.move(
      target.x + target.width / 2,
      target.y + target.height / 2,
      { steps: 6 },
    );
    await expect(page.locator(".workspace-drag-preview")).toBeVisible();
    await expect(page.locator("[data-view-favorites]")).toHaveClass(
      /is-drop-target/,
    );
    await page.mouse.up();
    await expect(page.locator(".workspace-drag-preview")).toHaveCount(0);
  };
  await dragToFavorites();
  await expect(page.locator(".saved-view-favorite")).toHaveCount(1);
  await expect(page.locator(".workspace-tab")).toHaveCount(1);
  await expect(page.locator(".query-pane")).toHaveCount(1);
  await page.getByRole("button", { name: "Split pane", exact: true }).click();
  await expect(page.locator(".query-pane")).toHaveCount(2);
  await dragToFavorites();
  await expect(page.locator(".saved-view-favorite")).toHaveCount(2);
  await expect(page.locator(".workspace-tab")).toHaveCount(1);
  await expect(page.locator(".query-pane")).toHaveCount(2);
  await expect(page.locator(".saved-view-favorite").last()).toHaveAttribute(
    "aria-description",
    "Saved split view",
  );
  await capture("drag-split-to-favorites.png");
});

test("advanced connection settings are removed and remembered AWS access stays hard-disabled during hidden verification", async () => {
  await close();
  await writeFile(
    join(directory, "access-settings.json"),
    JSON.stringify({ awsEnabled: true }),
  );
  await launch();
  expect(
    (await page.evaluate(() => window.explorer.environment())).awsEnabled,
  ).toBe(false);
  await openSettingsWindow(page);
  await expect(
    page.getByText("Advanced connection settings", { exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByLabel("Enable AWS access", { exact: true }),
  ).toBeDisabled();
  expect(
    await page.evaluate(async () => {
      try {
        await window.explorer.enableAws(true);
        return "unexpectedly enabled";
      } catch (error) {
        return String(error);
      }
    }),
  ).toMatch(/disabled|packaged/);
  await page.evaluate(() => window.explorer.enableAws(false));
  expect(
    JSON.parse(await readFile(join(directory, "access-settings.json"), "utf8"))
      .awsEnabled,
  ).toBe(true);
  await dialog().locator(".mantine-Modal-close").click();
  await close();
  await launch();
  expect(
    (await page.evaluate(() => window.explorer.environment())).awsEnabled,
  ).toBe(false);
});

test("enabling access refreshes failed Explorer data and log views through an isolated IPC fixture", async () => {
  await close();
  const workspace = createWorkspace();
  workspace.connections[0].mode = "aws";
  workspace.tabs[0].filterPattern = "";
  await writeFile(join(directory, "workspace.json"), JSON.stringify(workspace));
  await launch("error");
  await app.evaluate(({ ipcMain, BrowserWindow }) => {
    const fixture = { enabled: false, groups: 0, queries: 0 };
    (globalThis as any).__accessRefreshFixture = fixture;
    for (const name of [
      "environment",
      "enable-aws",
      "profiles",
      "groups",
      "streams",
      "query",
    ])
      ipcMain.removeHandler("explorer:" + name);
    ipcMain.handle("explorer:environment", () => ({
      version: "fixture",
      platform: process.platform,
      packaged: true,
      canEnableAws: true,
      awsEnabled: fixture.enabled,
    }));
    ipcMain.handle("explorer:enable-aws", (_event, enabled) => {
      fixture.enabled = enabled;
      return {
        version: "fixture",
        platform: process.platform,
        packaged: true,
        canEnableAws: true,
        awsEnabled: enabled,
      };
    });
    ipcMain.handle("explorer:profiles", () => ["fixture-profile"]);
    ipcMain.handle("explorer:groups", () => {
      fixture.groups++;
      if (!fixture.enabled)
        throw new Error("AWS access is disabled (injected fixture)");
      return { items: [{ name: "/aws/lambda/orders-api" }] };
    });
    ipcMain.handle("explorer:streams", () => ({
      items: [{ name: "fixture-stream" }],
    }));
    ipcMain.handle("explorer:query", (_event, request) => {
      fixture.queries++;
      const window = BrowserWindow.getAllWindows()[0];
      window.webContents.send(
        "explorer:update",
        fixture.enabled
          ? {
              requestId: request.requestId,
              state: "complete",
              events: [
                {
                  id: "access-refresh-event",
                  timestamp: Date.now(),
                  message: "Loaded after enabling access",
                  logGroup: "/aws/lambda/orders-api",
                  logStream: "fixture-stream",
                },
              ],
              stats: { scanned: 1, matched: 1, elapsedMs: 1 },
            }
          : {
              requestId: request.requestId,
              state: "error",
              error: "AWS access is disabled (injected fixture)",
            },
      );
    });
  });
  await page.reload();
  await expect(page.locator(".query-status")).toHaveAttribute(
    "data-query-state",
    "error",
  );
  await expect(page.locator(".resource-tree")).toContainText(
    "AWS access is disabled",
  );
  const before = await app.evaluate(() => ({
    ...(globalThis as any).__accessRefreshFixture,
  }));
  await openSettingsWindow(page);
  await page.getByLabel("Enable AWS access", { exact: true }).click();
  await expect(
    page.getByLabel("Enable AWS access", { exact: true }),
  ).toBeChecked();
  await dialog().locator(".mantine-Modal-close").click();
  await expect(page.locator(".query-status")).toHaveAttribute(
    "data-query-state",
    "complete",
  );
  await expect(page.locator(".query-status")).toContainText("1 loaded");
  await expect(
    page.getByRole("button", { name: "/aws/lambda/orders-api", exact: true }),
  ).toBeVisible();
  const after = await app.evaluate(() => ({
    ...(globalThis as any).__accessRefreshFixture,
  }));
  expect(after.groups).toBeGreaterThan(before.groups);
  expect(after.queries).toBe(before.queries + 1);
  // The immutable process arguments keep the real gate off; only these test IPC handlers emulate access.
  expect(
    await app.evaluate(
      () =>
        process.argv.includes("--offline-verification") &&
        process.argv.includes("--background-verification"),
    ),
  ).toBe(true);
  await capture("access-enabling-refresh.png");
});

test("favorite context menus track the pointer and rename aliases persist without changing saved tabs", async () => {
  await page
    .locator(".workspace-tab")
    .getByRole("tab")
    .click({ button: "right" });
  await page
    .getByRole("menuitem", { name: "Save view to Favorites", exact: true })
    .click();
  const favorite = page.locator(".saved-view-favorite");
  const rect = (await favorite.boundingBox())!;
  const point = { x: rect.x + 25, y: rect.y + rect.height / 2 };
  await page.mouse.click(point.x, point.y, { button: "right" });
  const menu = page.getByRole("menu").filter({
    has: page.getByRole("menuitem", { name: "Open", exact: true }),
  });
  await expect(menu).toBeVisible();
  await capture("favorite-menu-at-pointer.png");
  await expect
    .poll(async () => {
      const box = (await menu.boundingBox())!;
      return Math.hypot(box.x - point.x, box.y - point.y);
    })
    .toBeLessThan(18);
  await page.getByRole("menuitem", { name: "Rename", exact: true }).click();
  const rename = page.getByRole("dialog", {
    name: "Rename favorite",
    exact: true,
  });
  await rename.getByLabel("Favorite name", { exact: true }).fill(" ");
  await expect(
    rename.getByRole("button", { name: "Rename", exact: true }),
  ).toBeDisabled();
  await rename
    .getByLabel("Favorite name", { exact: true })
    .fill("Production errors");
  await rename.getByRole("button", { name: "Rename", exact: true }).click();
  await expect(rename).not.toBeVisible();
  await expect(favorite).toHaveText("Production errors");
  await expect(page.locator(".workspace-tab").getByRole("tab")).toContainText(
    "orders-api",
  );
  await favorite.focus();
  await expect(favorite).toBeFocused();
  await page.keyboard.press("Shift+F10");
  await capture("favorite-keyboard-menu.png");
  await expect(
    page.getByRole("menuitem", { name: "Rename", exact: true }),
  ).toBeVisible();
  await page.keyboard.press("Escape");
  await close();
  await launch();
  await expect(page.locator(".saved-view-favorite")).toHaveText(
    "Production errors",
  );
  const saved = JSON.parse(
    await readFile(join(directory, "workspace.json"), "utf8"),
  );
  expect(saved.favorites[0].tabs[0].customTitle).toBeUndefined();
  await capture("favorite-renamed.png");
});

for (const theme of ["light", "dark"] as const)
  test(`favorite aliases, exclusive menus and tab tooltips follow ${theme} theme`, async () => {
    await close();
    let state = createWorkspace();
    state.preferences.theme = theme;
    state.tabs[0].filterPattern = "";
    state = workspaceReducer(state, {
      type: "favorites/save",
      tabId: state.activeTabId!,
    });
    state = workspaceReducer(state, {
      type: "favorites/rename",
      favoriteId: state.favorites[0].id,
      title: "Production requests",
    });
    const other = createTab("offline", [
      { logGroup: "/aws/lambda/payments-worker" },
    ]);
    other.filterPattern = "";
    state = workspaceReducer(state, { type: "tab/open", tab: other });
    state = workspaceReducer(state, {
      type: "pane/show-tabs",
      tabIds: state.tabs.map((tab) => tab.id),
    });
    state = workspaceReducer(state, {
      type: "favorites/save",
      tabId: state.activeTabId!,
    });
    state = workspaceReducer(state, {
      type: "favorites/rename",
      favoriteId: state.favorites[1].id,
      title: "Production comparison",
    });
    await writeFile(join(directory, "workspace.json"), JSON.stringify(state));
    await launch();
    const favorites = page.locator(".saved-view-favorite");
    const favoriteRows = page.locator(".saved-view-favorite-row");
    await expect(favorites).toHaveCount(2);
    await page.mouse.move(1000, 80);
    const idleColor = await favoriteRows
      .first()
      .evaluate((el) => getComputedStyle(el).backgroundColor);
    await favorites.first().hover();
    await expect
      .poll(() =>
        favoriteRows
          .first()
          .evaluate((el) => getComputedStyle(el).backgroundColor),
      )
      .not.toBe(idleColor);
    await favorites
      .first()
      .click({ button: "right", position: { x: 180, y: 10 } });
    await expect(
      page.getByRole("menuitem", { name: "Open", exact: true }),
    ).toHaveCount(1);
    const previousMenuId = await page.getByRole("menu").getAttribute("id");
    await favorites
      .last()
      .click({ button: "right", position: { x: 8, y: 10 } });
    await expect(page.getByRole("menu")).not.toHaveAttribute(
      "id",
      previousMenuId!,
    );
    await expect(
      page.getByRole("menuitem", { name: "Open", exact: true }),
    ).toHaveCount(1);
    await page.getByRole("menuitem", { name: "Open", exact: true }).click();
    const activeTab = page
      .locator(".workspace-tab")
      .getByRole("tab", { selected: true });
    await expect(activeTab).toContainText("Production comparison");
    await expect(page.locator(".query-pane")).toHaveCount(2);
    await activeTab.hover();
    const tooltip = page.getByRole("tooltip");
    await expect(tooltip).toContainText("orders-api");
    await expect(tooltip).toContainText("payments-worker");
    const colors = await tooltip.evaluate((el) => {
      const themeProbe = document.createElement("span");
      themeProbe.style.cssText =
        "background:var(--mantine-color-body);color:var(--mantine-color-text)";
      document.body.append(themeProbe);
      const actual = getComputedStyle(el),
        expected = getComputedStyle(themeProbe);
      const result = {
        background: actual.backgroundColor,
        color: actual.color,
        expectedBackground: expected.backgroundColor,
        expectedColor: expected.color,
      };
      themeProbe.remove();
      return result;
    });
    expect(colors.background).toBe(colors.expectedBackground);
    expect(colors.color).toBe(colors.expectedColor);
    await capture(`favorite-tooltip-${theme}.png`);
    await activeTab.click({ button: "right" });
    await expect(tooltip).toHaveCount(0);
    await page.keyboard.press("Escape");
    await favorites.first().click();
    await expect(activeTab).toContainText("Production requests");
    await expect(page.locator(".query-pane")).toHaveCount(1);
    await close();
    const saved = JSON.parse(
      await readFile(join(directory, "workspace.json"), "utf8"),
    );
    expect(saved.favorites[0].tabs[0].customTitle).toBeUndefined();
  });

for (const mode of ["table", "hybrid"] as const)
  test(`multi-source ${mode} shows a configurable Source column with regional and stream identity`, async () => {
    await close();
    const state = createWorkspace();
    state.connections.push({
      ...state.connections[0],
      id: "east",
      region: "us-east-1",
    });
    state.tabs[0].filterPattern = "";
    state.tabs[0].view.mode = mode;
    state.preferences.theme = mode === "hybrid" ? "light" : "dark";
    state.tabs[0].sources = [
      { logGroup: "/aws/lambda/orders-api" },
      {
        connectionId: "east",
        logGroup: "/aws/lambda/orders-api",
        logStreams: [
          "2026/10/13/[$LATEST]worker-1",
          "2026/10/13/[$LATEST]worker-2",
        ],
      },
    ];
    await writeFile(join(directory, "workspace.json"), JSON.stringify(state));
    await launch();
    const source = page.locator('.log-header-cell[data-column-path="@source"]');
    await expect(source).toBeVisible();
    await expect(source).toHaveText(/Source/);
    await expect(
      page.locator(".log-cell .event-source-label").first(),
    ).toContainText("orders-api");
    await capture("source-column-" + mode + ".png");
    await page
      .getByRole("button", { name: "Configure columns", exact: true })
      .click();
    const columns = page.getByRole("dialog", {
      name: "Customize columns",
      exact: true,
    });
    await columns
      .getByRole("button", { name: "Hide Source", exact: true })
      .click();
    await columns.locator(".mantine-Modal-close").click();
    await expect(source).toHaveCount(0);
    await close();
    await launch();
    await expect(
      page.locator('.log-header-cell[data-column-path="@source"]'),
    ).toHaveCount(0);
  });

test("selected rows retain selection hover colors in both themes and every event mode", async () => {
  for (const theme of ["light", "dark"] as const) {
    await close();
    const state = createWorkspace();
    state.preferences.theme = theme;
    state.tabs[0].filterPattern = "";
    await writeFile(join(directory, "workspace.json"), JSON.stringify(state));
    await launch();
    for (const mode of ["Table", "Hybrid", "JSON"]) {
      await page.getByText(mode, { exact: true }).first().click();
      const selected = page
        .locator('.virtual-event[data-selected="true"]')
        .first();
      const other = page
        .locator('.virtual-event[data-selected="false"]')
        .first();
      const primary =
        mode === "JSON"
          ? selected.locator(".json-card-meta")
          : selected.locator(".log-table-row");
      const target =
        mode === "JSON" ? primary : primary.locator(".log-cell").first();
      await page.mouse.move(1, 1);
      const idleColor = await target.evaluate(
        (node) => getComputedStyle(node).backgroundColor,
      );
      await primary.hover();
      const selectedColor = await target.evaluate(
        (node) => getComputedStyle(node).backgroundColor,
      );
      expect(selectedColor).not.toBe(idleColor);
      await other.hover();
      const otherColor = await (
        mode === "JSON" ? other : other.locator(".log-cell").first()
      ).evaluate((node) => getComputedStyle(node).backgroundColor);
      expect(otherColor).not.toBe(selectedColor);
    }
  }
  await page.locator('.virtual-event[data-selected="true"]').first().hover();
  await capture("selected-hover.png");
});
