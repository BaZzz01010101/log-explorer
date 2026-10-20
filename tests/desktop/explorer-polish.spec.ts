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
import {
  createWorkspace,
  restoreWorkspace,
} from "../../src/renderer/workspace";
import { desktopExecutablePath } from "./desktop-app";

const temporaryRoot = resolve(".tmp/desktop-explorer-polish");
const orders = "/aws/lambda/orders-api";
const payments = "/aws/lambda/payments-worker";
let app: ElectronApplication, page: Page, directory: string, errors: string[];
test.beforeEach(async () => {
  errors = [];
  await mkdir(temporaryRoot, { recursive: true });
  directory = await mkdtemp(join(temporaryRoot, "case-"));
  const workspace = createWorkspace();
  workspace.preferences.theme = "light";
  workspace.tabs[0].filterPattern = "";
  // Two streams in one source object must still get the multi-source tab icon.
  workspace.tabs[0].sources = [
    { logGroup: orders, logStreams: ["seed-one", "seed-two"] },
  ];
  await writeFile(join(directory, "workspace.json"), JSON.stringify(workspace));
  const env: Record<string, string> = {};
  for (const key of ["PATH", "SystemRoot", "WINDIR", "COMSPEC"])
    if (process.env[key]) env[key] = process.env[key]!;
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
  page = await app.firstWindow();
  page.on("pageerror", (error) => errors.push(error.message));
  const session = await page.context().newCDPSession(page);
  await session.send("Emulation.setFocusEmulationEnabled", { enabled: true });
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
      throw new Error("Unexpected verification dialog");
    };
  });
  await expect(page.locator('[data-node-kind="group"]')).toHaveCount(9);
  await expect(page.locator(".source-badge")).toHaveCount(2);
});
test.afterEach(async () => {
  if (app?.process().exitCode === null) {
    const closed = app.waitForEvent("close");
    await app.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()[0].close(),
    );
    await closed;
  }
  expect(errors).toEqual([]);
  if (
    !directory ||
    !resolve(directory).startsWith(temporaryRoot + sep + "case-")
  )
    throw new Error("Unsafe verification cleanup");
  await rm(directory, {
    recursive: true,
    force: true,
    maxRetries: 10,
    retryDelay: 100,
  });
});
const row = (name: string) => page.getByRole("treeitem", { name, exact: true });
const selected = () => page.locator('.resource-row[aria-selected="true"]');
const stored = async () =>
  restoreWorkspace(
    (await page.evaluate(() => window.explorer.loadWorkspace())).workspace,
  );
async function edge(resource: Locator, bottom: boolean) {
  await resource.scrollIntoViewIfNeeded();
  const bounds = (await resource.boundingBox())!;
  return { x: bounds.x + 120, y: bounds.y + (bottom ? bounds.height - 1 : 1) };
}
async function beginDrag(resource: Locator, bottom: boolean) {
  const point = await edge(resource, bottom);
  await page.mouse.move(point.x, point.y);
  await page.mouse.down();
  await page.mouse.move(point.x + 12, point.y, { steps: 3 });
  await expect(page.locator(".resource-drag-preview")).toBeVisible();
  // The original label retains capture while the pointer leaves its bounds.
  expect(
    await resource.locator(".resource-label").evaluate((label) => {
      for (let id = 1; id < 8; id++)
        if (label.hasPointerCapture(id)) return true;
      return false;
    }),
  ).toBe(true);
}

test("regex tooltip uses light theme colors and its glyph has a filled dot", async () => {
  const toggle = page.getByRole("button", {
    name: "Use regular expression",
    exact: true,
  });
  await toggle.hover();
  const tooltip = page.getByRole("tooltip", {
    name: "Use regular expression",
    exact: true,
  });
  await expect(tooltip).toBeVisible();
  expect(
    await tooltip.evaluate((element) => {
      const style = getComputedStyle(element);
      const probe = document.createElement("div");
      probe.style.background = "var(--mantine-color-body)";
      probe.style.color = "var(--mantine-color-text)";
      element.append(probe);
      const themed = getComputedStyle(probe);
      const result = {
        background: style.backgroundColor,
        color: style.color,
        expectedBackground: themed.backgroundColor,
        expectedColor: themed.color,
      };
      probe.remove();
      return result;
    }),
  ).toEqual({
    background: "rgb(255, 255, 255)",
    color: "rgb(0, 0, 0)",
    expectedBackground: "rgb(255, 255, 255)",
    expectedColor: "rgb(0, 0, 0)",
  });
  await expect(toggle.locator('svg circle[fill="currentColor"]')).toHaveCount(
    1,
  );
});

test("source removal cross is centered inside its hover hit area", async () => {
  const remove = page.locator(".source-badge button").first();
  await remove.hover();
  const button = (await remove.boundingBox())!,
    icon = (await remove.locator("svg").boundingBox())!;
  expect(
    Math.abs(button.x + button.width / 2 - icon.x - icon.width / 2),
  ).toBeLessThanOrEqual(0.5);
  expect(
    Math.abs(button.y + button.height / 2 - icon.y - icon.height / 2),
  ).toBeLessThanOrEqual(0.5);
  await remove.click();
  await expect(page.locator(".source-badge")).toHaveCount(1);
});

test("normal multi-source tab icon counts individual streams and changes after removal while split keeps its icon", async () => {
  await expect(page.locator(".workspace-tab .tabler-icon-stack-2")).toHaveCount(
    1,
  );
  await expect(page.locator("[data-split-tab-icon]")).toHaveCount(0);
  await page.locator(".source-badge button").first().click();
  await expect(
    page.locator(".workspace-tab .tabler-icon-terminal-2"),
  ).toHaveCount(1);
  await expect(page.locator(".workspace-tab .tabler-icon-stack-2")).toHaveCount(
    0,
  );
  await row(orders)
    .locator(".resource-label")
    .click({ modifiers: ["ControlOrMeta"] });
  await row(payments)
    .locator(".resource-label")
    .click({ modifiers: ["ControlOrMeta"] });
  await row(payments).click({ button: "right", position: { x: 120, y: 16 } });
  await page
    .getByRole("menuitem", { name: "Open in new split tab", exact: true })
    .click();
  await expect(page.locator("[data-split-tab-icon]")).toHaveCount(1);
});

test("group and stream top and bottom strips perform modifier selection and open previews", async () => {
  await page
    .getByRole("button", { name: `Expand ${orders}`, exact: true })
    .click();
  const stream = page.locator('[data-node-kind="stream"]').first();
  await expect(page.locator('[data-node-kind="stream"]')).toHaveCount(4);
  for (const resource of [row(payments), stream]) {
    for (const bottom of [false, true]) {
      const point = await edge(resource, bottom);
      await page.keyboard.down("ControlOrMeta");
      await page.mouse.click(point.x, point.y);
      await page.keyboard.up("ControlOrMeta");
      await expect(resource).toHaveAttribute("aria-selected", "true");
      await expect(selected()).toHaveCount(1);
      await page.keyboard.down("ControlOrMeta");
      await page.mouse.click(point.x, point.y);
      await page.keyboard.up("ControlOrMeta");
      await expect(resource).toHaveAttribute("aria-selected", "false");
      await page.mouse.click(point.x, point.y);
      await expect(resource).toHaveAttribute("aria-selected", "true");
      const label = await resource.getAttribute("aria-label");
      await expect
        .poll(async () =>
          (await stored()).tabs.some(
            (tab) =>
              tab.preview &&
              tab.sources.some(
                (source) =>
                  (source.logGroup === payments && label === payments) ||
                  source.logStreams?.includes(label!),
              ),
          ),
        )
        .toBe(true);
      await page.keyboard.down("ControlOrMeta");
      await page.mouse.click(point.x, point.y);
      await page.keyboard.up("ControlOrMeta");
    }
  }
  // Blank padding at both horizontal edges also belongs to the resource.
  const bounds = (await row(payments).boundingBox())!;
  for (const point of [
    { x: bounds.x + 1, y: bounds.y + 1 },
    { x: bounds.x + bounds.width - 1, y: bounds.y + bounds.height - 1 },
  ]) {
    await page.keyboard.down("ControlOrMeta");
    await page.mouse.click(point.x, point.y);
    await page.keyboard.up("ControlOrMeta");
    await expect(row(payments)).toHaveAttribute("aria-selected", "true");
    await page.keyboard.down("ControlOrMeta");
    await page.mouse.click(point.x, point.y);
    await page.keyboard.up("ControlOrMeta");
    await expect(row(payments)).toHaveAttribute("aria-selected", "false");
  }
  const tabCount = await page.locator(".workspace-tab").count();
  await page
    .getByRole("checkbox", { name: `Select ${payments}`, exact: true })
    .check();
  await expect(row(payments)).toHaveAttribute("aria-selected", "true");
  await expect(page.locator(".workspace-tab")).toHaveCount(tabCount);
  // Dedicated controls keep their behavior and do not open a group view.
  await page
    .getByRole("button", { name: `Details for ${payments}`, exact: true })
    .click();
  await expect(
    page.getByText("Log group details", { exact: true }),
  ).toBeVisible();
  await page.keyboard.press("Escape");
});

test("group and stream edge drags preserve captured batches, live preview and Escape cancellation", async () => {
  await page
    .getByRole("button", { name: `Expand ${orders}`, exact: true })
    .click();
  const streams = page.locator('[data-node-kind="stream"]');
  await expect(streams).toHaveCount(4);
  const names = await streams.evaluateAll((elements) =>
    elements.slice(0, 2).map((element) => element.getAttribute("aria-label")!),
  );
  // Native Ctrl + Shift selection forms two streams and one whole group.
  await streams
    .nth(0)
    .locator(".resource-label")
    .click({ modifiers: ["ControlOrMeta"] });
  await streams
    .nth(1)
    .locator(".resource-label")
    .click({ modifiers: ["Shift"] });
  await row(payments)
    .locator(".resource-label")
    .click({ modifiers: ["ControlOrMeta"] });
  await expect(selected()).toHaveCount(3);
  for (const resource of [row(payments), streams.nth(0)]) {
    for (const bottom of [false, true]) {
      await beginDrag(resource, bottom);
      const target = (await page.locator(".source-badges").boundingBox())!;
      await page.mouse.move(target.x + 20, target.y + target.height / 2, {
        steps: 6,
      });
      await expect(page.locator(".source-drop-active")).toHaveCount(1);
      const preview = (await page
        .locator(".resource-drag-preview")
        .boundingBox())!;
      expect(preview.x).toBeGreaterThan(target.x + 20);
      await page.keyboard.press("Escape");
      await page.mouse.up();
      await expect(
        page.locator(
          ".resource-drag-preview,.source-drop-active,.pane-drop-overlay",
        ),
      ).toHaveCount(0);
      await expect(page.locator(".source-badge")).toHaveCount(2);
      await expect(selected()).toHaveCount(3);
    }
  }
  await beginDrag(streams.nth(0), true);
  const target = (await page.locator(".source-badges").boundingBox())!;
  await page.mouse.move(target.x + 20, target.y + target.height / 2, {
    steps: 6,
  });
  await page.mouse.up();
  await expect(page.locator(".source-badge")).toHaveCount(5);
  await expect
    .poll(async () => (await stored()).tabs[0].sources)
    .toEqual([
      { logGroup: orders, logStreams: ["seed-one", "seed-two", ...names] },
      { logGroup: payments },
    ]);
  await expect(
    page.locator(
      ".resource-drag-preview,.source-drop-active,.pane-drop-overlay",
    ),
  ).toHaveCount(0);
});
