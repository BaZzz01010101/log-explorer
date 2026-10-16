import { desktopExecutablePath } from "./desktop-app";
import {
  _electron as electron,
  expect,
  test,
  type ElectronApplication,
  type Page,
} from "@playwright/test";
import { execFileSync } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve, sep } from "node:path";
import {
  createTab,
  createWorkspace,
  workspaceReducer,
} from "../../src/renderer/workspace";

test.setTimeout(150000);
let app: ElectronApplication | undefined;
let child: ReturnType<ElectronApplication["process"]> | undefined;
let page: Page;
let directory: string;
let errors: string[];
const names = [
  "orders-api",
  "payments-worker",
  "media-pipeline",
  "notifications",
];
const packaged = process.env.EXPLORER_DESKTOP_PACKAGED === "1";

async function launch(panels: number, singleTabs = 0) {
  let state = createWorkspace();
  state.tabs[0].filterPattern = "";
  state.tabs[0].view.localSearch = "processed";
  state.tabs[0].view.wrap = true;
  for (const name of names.slice(1, panels + singleTabs)) {
    const tab = createTab("offline", [{ logGroup: `/aws/lambda/${name}` }]);
    state = workspaceReducer(state, { type: "tab/open", tab });
  }
  state = workspaceReducer(state, {
    type: "pane/show-tabs",
    tabIds: state.tabs.slice(0, panels).map((tab) => tab.id),
  });
  await writeFile(join(directory, "workspace.json"), JSON.stringify(state));
  const env: Record<string, string> = {};
  for (const key of [
    "PATH",
    "SystemRoot",
    "WINDIR",
    "TEMP",
    "TMP",
    "USERPROFILE",
    "LOCALAPPDATA",
    "APPDATA",
    "COMSPEC",
  ])
    if (process.env[key]) env[key] = process.env[key]!;
  Object.assign(env, {
    EXPLORER_TEST_USER_DATA: directory,
    AWS_CONFIG_FILE: join(directory, "absent-config"),
    AWS_SHARED_CREDENTIALS_FILE: join(directory, "absent-credentials"),
    AWS_EC2_METADATA_DISABLED: "true",
  });
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
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Emulation.setFocusEmulationEnabled", { enabled: true });
  await page.emulateMedia({ reducedMotion: "reduce" });
  page.on("pageerror", (error) => errors.push(error.message));
  expect(
    await app.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()[0].isVisible(),
    ),
  ).toBe(false);
  const info = await page.evaluate(() => window.explorer.environment());
  expect(info.awsEnabled).toBe(false);
  expect(info.canEnableAws).toBe(false);
  await app.evaluate(({ dialog }) => {
    dialog.showMessageBox = async () => {
      throw new Error(
        "Unexpected native dialog in hidden panel-drag verification",
      );
    };
  });
  await expect(page.locator(".workspace-pane")).toHaveCount(panels);
  await expect(
    page.locator('.query-status[data-query-state="complete"]').first(),
  ).toBeAttached();
  return state;
}

test.beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), "aws-log-explorer-panel-drag-"));
  app = undefined;
  child = undefined;
  errors = [];
});
test.afterEach(async () => {
  if (app && child?.exitCode === null) {
    await Promise.race([
      app.close().catch(() => {}),
      new Promise((done) => setTimeout(done, 3000)),
    ]);
    if (child.exitCode === null) {
      if (process.platform === "win32") {
        try {
          execFileSync("taskkill", ["/PID", String(child.pid), "/T", "/F"], {
            stdio: "ignore",
          });
        } catch {}
      } else child.kill();
    }
  }
  if (
    !resolve(directory).startsWith(
      resolve(tmpdir()) + sep + "aws-log-explorer-panel-drag-",
    )
  )
    throw new Error("Unsafe panel-drag cleanup path");
  await rm(directory, {
    recursive: true,
    force: true,
    maxRetries: 10,
    retryDelay: 100,
  });
  expect(errors).toEqual([]);
});

const paneFor = (name: string) =>
  page
    .locator(".workspace-pane")
    .filter({ has: page.locator(".pane-title", { hasText: name }) });
async function startPanel(name: string) {
  const header = (await paneFor(name)
    .locator("[data-pane-header]")
    .boundingBox())!;
  await page.mouse.move(header.x + 75, header.y + header.height / 2);
  await page.mouse.down();
  await page.mouse.move(header.x + 85, header.y + header.height / 2, {
    steps: 2,
  });
}

async function savedWorkspace() {
  return JSON.parse(await readFile(join(directory, "workspace.json"), "utf8"));
}

async function assertFinalPreview(name: string) {
  const preview = (await page.locator(".pane-drop-overlay").boundingBox())!;
  await expect(page.locator(".workspace-drag-preview")).toBeVisible();
  await page.mouse.up();
  await expect(
    page.locator(".pane-drop-overlay,.workspace-drag-preview"),
  ).toHaveCount(0);
  const actual = (await paneFor(name).boundingBox())!;
  for (const key of ["x", "y", "width", "height"] as const)
    expect(
      Math.abs(actual[key] - preview[key]),
      JSON.stringify({ preview, actual, key }),
    ).toBeLessThanOrEqual(2);
}

async function moveToPane(
  name: string,
  edge: "left" | "right" | "top" | "bottom" | "center",
) {
  const rect = (await paneFor(name).boundingBox())!;
  await page.mouse.move(
    edge === "left"
      ? rect.x + 20
      : edge === "right"
        ? rect.x + rect.width - 20
        : rect.x + rect.width / 2,
    edge === "top"
      ? rect.y + 20
      : edge === "bottom"
        ? rect.y + rect.height - 20
        : rect.y + rect.height / 2,
    { steps: 3 },
  );
  await expect(page.locator(`[data-split-preview="${edge}"]`)).toBeVisible();
}

test("panel headers share the floating preview and two-pane final-half drop geometry", async () => {
  await launch(2);
  const destination = (await paneFor("payments-worker").boundingBox())!;
  await startPanel("orders-api");
  await page.mouse.move(
    destination.x + destination.width - 20,
    destination.y + destination.height / 2,
    { steps: 3 },
  );
  await expect(page.locator(".workspace-drag-preview")).toBeVisible();
  await expect(page.locator('[data-split-preview="right"]')).toBeVisible();
  const preview = (await page.locator(".pane-drop-overlay").boundingBox())!;
  expect(preview.width).toBeCloseTo(destination.width, 0);
  expect(preview.height).toBeCloseTo(destination.height, 0);
  await page.mouse.up();
  const actual = (await paneFor("orders-api").boundingBox())!;
  for (const key of ["x", "y", "width", "height"] as const)
    expect(
      Math.abs(actual[key] - preview[key]),
      JSON.stringify({ preview, actual, key }),
    ).toBeLessThanOrEqual(2);
  await expect(page.locator(".workspace-pane")).toHaveCount(2);
});

for (const panels of [3, 4]) {
  test(`${panels}-panel moves preview the final occupied rectangle after source space collapses`, async () => {
    const state = await launch(panels);
    const sourceId = state.tabs[0].id;
    await startPanel("orders-api");
    await moveToPane(names[panels - 1], panels === 3 ? "right" : "top");
    await assertFinalPreview("orders-api");
    await expect(page.locator(".workspace-pane")).toHaveCount(panels);
    await expect(page.locator(".workspace-tab")).toHaveCount(1);
    await expect(
      paneFor("orders-api").getByRole("textbox", {
        name: "Local filter loaded events",
        exact: true,
      }),
    ).toHaveValue("processed");
    // Center drops keep both full destination regions and swap their views.
    const targetName = names[1];
    const targetBefore = (await paneFor(targetName).boundingBox())!;
    await startPanel("orders-api");
    await moveToPane(targetName, "center");
    const centerPreview = (await page
      .locator(".pane-drop-overlay")
      .boundingBox())!;
    for (const key of ["x", "y", "width", "height"] as const)
      expect(
        Math.abs(centerPreview[key] - targetBefore[key]),
      ).toBeLessThanOrEqual(2);
    await assertFinalPreview("orders-api");
    await expect
      .poll(async () =>
        (await savedWorkspace()).tabs
          .map((tab: { id: string }) => tab.id)
          .sort(),
      )
      .toEqual(state.tabs.map((tab) => tab.id).sort());
    const stored = (await savedWorkspace()).tabs.find(
      (tab: { id: string }) => tab.id === sourceId,
    );
    expect(stored.view).toEqual(state.tabs[0].view);
    expect(stored.filterPattern).toBe(state.tabs[0].filterPattern);
  });
}

test("panels detach at the selected tab position and the remaining single pane dissolves", async () => {
  const state = await launch(2, 2);
  const filter = paneFor("orders-api").getByRole("textbox", {
    name: "CloudWatch filter pattern",
    exact: true,
  });
  await filter.fill('"request"');
  await startPanel("orders-api");
  const beforeTab = (await page
    .getByRole("tab", { name: "media-pipeline", exact: true })
    .boundingBox())!;
  await page.mouse.move(beforeTab.x + 8, beforeTab.y + beforeTab.height / 2, {
    steps: 3,
  });
  await expect(page.locator(".workspace-drag-preview")).toBeVisible();
  await expect(page.locator(".workspace-tab-insertion")).toHaveAttribute(
    "data-tab-insertion-before",
    state.tabs[2].id,
  );
  await page.mouse.up();
  await expect(
    page.locator('.workspace-tab[data-entry-kind="split"]'),
  ).toHaveCount(0);
  await expect(page.locator(".workspace-tab")).toHaveCount(4);
  await expect(page.getByRole("tab")).toHaveText([
    "payments-worker",
    "orders-api",
    "media-pipeline",
    "notifications",
  ]);
  await expect(page.locator(".workspace-pane")).toHaveCount(1);
  await expect(page.locator(".pane-title")).toHaveText("orders-api");
  await expect(
    page.getByRole("textbox", {
      name: "CloudWatch filter pattern",
      exact: true,
    }),
  ).toHaveValue('"request"');
  await expect(
    page.getByRole("textbox", {
      name: "Local filter loaded events",
      exact: true,
    }),
  ).toHaveValue("processed");
  await expect.poll(async () => (await savedWorkspace()).splitTabs).toEqual([]);
  const stored = await savedWorkspace();
  expect(stored.tabs.map((tab: { id: string }) => tab.id).sort()).toEqual(
    state.tabs.map((tab) => tab.id).sort(),
  );
  expect(stored.closedTabs).toEqual([]);
  const orders = stored.tabs.find(
    (tab: { id: string }) => tab.id === state.tabs[0].id,
  );
  expect(orders.view).toEqual(state.tabs[0].view);
  expect(orders.filterPattern).toBe('"request"');
  await page.getByRole("tab", { name: "payments-worker", exact: true }).click();
  await expect(page.locator(".pane-title")).toHaveText("payments-worker");
  await expect(page.locator(".pane-layout-divider")).toHaveCount(0);
  await page.getByRole("tab", { name: "orders-api", exact: true }).click();
  await expect(
    page.getByRole("textbox", {
      name: "CloudWatch filter pattern",
      exact: true,
    }),
  ).toHaveValue('"request"');
});

test("panel transfer survives destination hover, cancellation, and movement between combined entries", async () => {
  const state = await launch(3, 1);
  const splitId = state.splitTabs![0].id;
  const sourceTab = page.locator(`[data-tab-id="${splitId}"]`).getByRole("tab");
  const destinationTab = page.getByRole("tab", {
    name: "notifications",
    exact: true,
  });
  async function hoverDestination() {
    const rect = (await destinationTab.boundingBox())!;
    await page.mouse.move(rect.x + rect.width / 2, rect.y + rect.height / 2, {
      steps: 3,
    });
    await expect(page.locator(".workspace-pane")).toHaveCount(1);
    await expect(page.locator(".pane-title")).toHaveText("notifications");
  }
  await startPanel("orders-api");
  await hoverDestination();
  await moveToPane("notifications", "left");
  await page.keyboard.press("Escape");
  await page.mouse.up();
  await expect(page.locator(".workspace-pane")).toHaveCount(3);
  await expect(sourceTab).toHaveAttribute("aria-selected", "true");
  await expect(
    page.locator(".pane-drop-overlay,.workspace-drag-preview"),
  ).toHaveCount(0);
  await startPanel("orders-api");
  await hoverDestination();
  await moveToPane("notifications", "left");
  await assertFinalPreview("orders-api");
  await expect(page.locator(".workspace-pane")).toHaveCount(2);
  await expect(
    page.locator('.workspace-tab[data-entry-kind="split"]'),
  ).toHaveCount(2);
  const destinationId = await page
    .locator(
      `.workspace-tab[data-entry-kind="split"]:not([data-tab-id="${splitId}"])`,
    )
    .getAttribute("data-tab-id");
  await sourceTab.click();
  await expect(page.locator(".workspace-pane")).toHaveCount(2);
  await startPanel("payments-worker");
  const rect = (await page
    .locator(`[data-tab-id="${destinationId}"]`)
    .getByRole("tab")
    .boundingBox())!;
  await page.mouse.move(rect.x + rect.width / 2, rect.y + rect.height / 2, {
    steps: 3,
  });
  await expect(paneFor("orders-api")).toBeVisible();
  await moveToPane("orders-api", "bottom");
  await assertFinalPreview("payments-worker");
  await expect(page.locator(".workspace-pane")).toHaveCount(3);
  await expect(
    page.locator('.workspace-tab[data-entry-kind="split"]'),
  ).toHaveCount(1);
  await expect(
    page.getByRole("tab", { name: "media-pipeline", exact: true }),
  ).toBeVisible();
  await expect
    .poll(async () =>
      (await savedWorkspace()).tabs.map((tab: { id: string }) => tab.id).sort(),
    )
    .toEqual(state.tabs.map((tab) => tab.id).sort());
  await page.getByRole("tab", { name: "media-pipeline", exact: true }).click();
  await expect(page.locator(".workspace-pane")).toHaveCount(1);
  await expect(page.locator(".pane-title")).toHaveText("media-pipeline");
});

test("detaching into tab-bar whitespace appends the panel and preserves a remaining split", async () => {
  const state = await launch(3, 1);
  await startPanel("media-pipeline");
  const strip = (await page.locator(".workspace-tab-list").boundingBox())!;
  await page.mouse.move(
    strip.x + strip.width - 12,
    strip.y + strip.height / 2,
    { steps: 3 },
  );
  await expect(page.locator(".workspace-drag-preview")).toBeVisible();
  await expect(page.locator(".workspace-tab-insertion")).toHaveAttribute(
    "data-tab-insertion-before",
    "__end__",
  );
  await page.mouse.up();
  await expect(page.locator(".workspace-tab")).toHaveCount(3);
  await expect(
    page.locator('.workspace-tab[data-entry-kind="split"]'),
  ).toHaveCount(1);
  expect(
    await page
      .locator(".workspace-tab")
      .evaluateAll((elements) =>
        elements.map((element) => element.getAttribute("data-tab-id")),
      ),
  ).toEqual([state.splitTabs![0].id, state.tabs[3].id, state.tabs[2].id]);
  await expect(page.locator(".workspace-pane")).toHaveCount(1);
  await expect(page.locator(".pane-title")).toHaveText("media-pipeline");
  await page
    .locator(`[data-tab-id="${state.splitTabs![0].id}"]`)
    .getByRole("tab")
    .click();
  await expect(page.locator(".workspace-pane")).toHaveCount(2);
  await expect(page.locator(".pane-title")).toHaveText([
    "orders-api",
    "payments-worker",
  ]);
});
