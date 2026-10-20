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
import { createWorkspace } from "../../src/renderer/workspace";

test.setTimeout(120000);
const temporaryRoot = resolve(".tmp/desktop-batch-splits");
let app: ElectronApplication;
let child: ReturnType<ElectronApplication["process"]> | undefined;
let page: Page;
let directory: string;
let errors: string[];

async function launch() {
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
      throw new Error(
        "Unexpected native dialog during batch split verification",
      );
    };
  });
  await expect(
    page.locator('.query-status[data-query-state="complete"]').first(),
  ).toBeAttached();
}

async function close() {
  if (!child || child.exitCode !== null) return;
  const exited = new Promise<void>((done) => child!.once("exit", () => done()));
  const closed = app.waitForEvent("close", { timeout: 10000 });
  await app.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows()[0].close(),
  );
  await closed;
  await exited;
  child = undefined;
}

test.beforeEach(async () => {
  errors = [];
  await mkdir(temporaryRoot, { recursive: true });
  directory = await mkdtemp(join(temporaryRoot, "case-"));
  await writeFile(
    join(directory, "workspace.json"),
    JSON.stringify(createWorkspace()),
  );
  await launch();
});

test.afterEach(async () => {
  await close();
  expect(errors).toEqual([]);
  if (!resolve(directory).startsWith(temporaryRoot + sep + "case-"))
    throw new Error("Unsafe batch verification cleanup");
  await rm(directory, {
    recursive: true,
    force: true,
    maxRetries: 10,
    retryDelay: 100,
  });
});

test("selected groups and streams drop as seven panes with matching batch preview, saved layout and split dissolution", async () => {
  await page
    .getByRole("button", { name: "Expand /aws/lambda/orders-api", exact: true })
    .click();
  const streams = page.locator(
    '.resource-row[data-node-kind="stream"] input[type="checkbox"]',
  );
  await expect(streams).toHaveCount(4);
  for (let index = 0; index < 4; index++) await streams.nth(index).check();
  await page
    .getByLabel("Select /aws/lambda/payments-worker", { exact: true })
    .check();
  await page
    .getByLabel("Select /aws/lambda/media-pipeline", { exact: true })
    .check();
  await expect(page.locator('.resource-row[aria-selected="true"]')).toHaveCount(
    6,
  );

  const originalPane = (await page
    .locator("[data-pane-drop-target]")
    .getAttribute("data-pane-drop-target"))!;
  const original = (await page
    .locator("[data-pane-drop-target]")
    .boundingBox())!;
  const label = page
    .getByRole("treeitem", { name: "/aws/lambda/payments-worker", exact: true })
    .locator(".resource-label");
  const from = (await label.boundingBox())!;
  await page.mouse.move(from.x + 25, from.y + from.height / 2);
  await page.mouse.down();
  await page.mouse.move(from.x + 40, from.y + from.height / 2, { steps: 3 });
  await page.mouse.move(
    original.x + original.width / 2,
    original.y + original.height - 15,
    { steps: 6 },
  );
  const overlay = page.locator('[data-resource-split-preview="bottom"]');
  await expect(overlay).toBeVisible();
  const predicted = (await overlay.boundingBox())!;
  await page.mouse.up();
  await expect(
    page.locator(".pane-drop-overlay,.resource-drag-preview"),
  ).toHaveCount(0);
  await expect(page.locator(".workspace-pane")).toHaveCount(7);
  await expect(page.locator(".workspace-tab")).toHaveCount(1);
  const actual = await page
    .locator("[data-pane-drop-target]")
    .evaluateAll((elements, originalPane) => {
      const rectangles = elements
        .filter(
          (element) =>
            element.getAttribute("data-pane-drop-target") !== originalPane,
        )
        .map((element) => element.getBoundingClientRect());
      const x = Math.min(...rectangles.map((rect) => rect.left));
      const y = Math.min(...rectangles.map((rect) => rect.top));
      return {
        x,
        y,
        width: Math.max(...rectangles.map((rect) => rect.right)) - x,
        height: Math.max(...rectangles.map((rect) => rect.bottom)) - y,
      };
    }, originalPane);
  for (const key of ["x", "y", "width", "height"] as const)
    expect(
      Math.abs(predicted[key] - actual[key]),
      JSON.stringify({ predicted, actual, key }),
    ).toBeLessThanOrEqual(2);

  await page
    .locator(".workspace-tab")
    .getByRole("tab")
    .click({ button: "right" });
  await page
    .getByRole("menuitem", { name: "Save view to Favorites", exact: true })
    .click();
  await expect(page.locator(".saved-view-favorite")).toHaveCount(1);
  await close();
  const saved = JSON.parse(
    await readFile(join(directory, "workspace.json"), "utf8"),
  );
  expect(saved.panes).toHaveLength(7);
  expect(saved.splitTabs[0].panes).toHaveLength(7);
  expect(saved.favorites[0].tabs).toHaveLength(7);
  await launch();
  await expect(page.locator(".workspace-pane")).toHaveCount(7);
  await page
    .locator(".workspace-tab")
    .getByRole("tab")
    .click({ button: "right" });
  await page
    .getByRole("menuitem", { name: "Exit split screen", exact: true })
    .click();
  await expect(page.locator(".workspace-pane")).toHaveCount(1);
  await expect(page.locator(".workspace-tab")).toHaveCount(7);
});
