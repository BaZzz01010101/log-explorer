import { openSettingsWindow } from "./settings-panel";
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
  createTab,
  createWorkspace,
  workspaceReducer,
} from "../../src/renderer/workspace";
import { desktopExecutablePath } from "./desktop-app";

test.setTimeout(120000);
const root = resolve(".tmp/desktop-settings-layout-preview");
let directory: string, app: ElectronApplication, page: Page, errors: string[];
let child: ReturnType<ElectronApplication["process"]>;

test.beforeEach(async ({}, info) => {
  await mkdir(root, { recursive: true });
  directory = await mkdtemp(join(root, "case-"));
  errors = [];
  let workspace = createWorkspace();
  workspace.preferences.theme = info.title.startsWith("dark")
    ? "dark"
    : "light";
  workspace.preferences.timezone = "utc";
  workspace.sidebarVisible = true;
  workspace.sidebarWidth = 620;
  workspace.tabs[0].customTitle = "Snapshot orders";
  workspace.tabs[0].filterPattern = "";
  workspace.tabs[0].view.mode = "table";
  workspace.tabs[0].view.columns = [
    { path: "@timestamp", width: 180 },
    { path: "@message", width: 420 },
  ];
  for (const [id, title, group, filterPattern] of [
    [
      "snapshot-payments",
      "Snapshot payments",
      "/aws/lambda/payments-worker",
      "",
    ],
    ["snapshot-empty", "Snapshot empty", "/aws/lambda/orders-api", "EMPTY"],
  ]) {
    const tab = createTab("offline", [{ logGroup: group }]);
    tab.id = id;
    tab.customTitle = title;
    tab.filterPattern = filterPattern;
    workspace = workspaceReducer(workspace, { type: "tab/open", tab });
  }
  workspace = workspaceReducer(workspace, {
    type: "tab/select",
    tabId: "tab-orders",
  });
  workspace.connections.push({
    id: "layout-aws",
    name: "Layout fixture",
    mode: "aws",
    profile: "production-layout-fixture",
    region: "eu-west-1",
    enabled: true,
  });
  workspace.preferences.highlightProfiles = [
    {
      id: "layout",
      name: "Layout profile",
      enabled: true,
      groupPattern: "orders-api$",
      groupIgnoreCase: false,
      rules: Array.from({ length: 20 }, (_, index) => ({
        id: `layout-rule-${index}`,
        enabled: true,
        scope: "text" as const,
        path: "",
        pattern: "SNAPSHOT_ORDERS",
        ignoreCase: false,
        target: "row" as const,
        colors: { background: "#fef08a" },
        separateThemeColors: true,
        lightColors: { foreground: "#111827", background: "#fef08a" },
        darkColors: { foreground: "#ffffff", background: "#713f12" },
      })),
    },
  ];
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
  await page.emulateMedia({ reducedMotion: "reduce" });
  await app.evaluate(({ BrowserWindow, dialog, ipcMain }) => {
    const win = BrowserWindow.getAllWindows()[0];
    win.setContentSize(1800, 1600);
    win.webContents.setBackgroundThrottling(false);
    dialog.showMessageBox = async () => {
      throw new Error(
        "Unexpected native dialog in isolated Settings verification",
      );
    };
    ipcMain.removeHandler("explorer:query");
    ipcMain.handle("explorer:query", (event, request) => {
      const group = request.sources[0].logGroup;
      const marker = group.includes("payments")
        ? "SNAPSHOT_PAYMENTS"
        : "SNAPSHOT_ORDERS";
      const events = Array.from(
        { length: request.filterPattern.includes("EMPTY") ? 0 : 40 },
        (_, index) => ({
          id: `${marker}:${index}`,
          timestamp: 1720000000000 + index,
          logGroup: group,
          logStream: "settings-preview-stream",
          message: JSON.stringify({
            level: "ERROR",
            message: `${marker} event ${index}`,
            nested: { source: marker },
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
  await expect.poll(() => page.evaluate(() => innerWidth)).toBe(1800);
  const environment = await page.evaluate(() => window.explorer.environment());
  expect(environment.canEnableAws).toBe(false);
  expect(environment.awsEnabled).toBe(false);
  await expect(page.locator('[data-node-kind="group"]')).toHaveCount(9);
  await wake();
});

test.afterEach(async () => {
  if (child?.exitCode === null) {
    expect(
      await app.evaluate(({ BrowserWindow }) =>
        BrowserWindow.getAllWindows().every((win) => !win.isVisible()),
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

const dialog = () =>
  page.getByRole("dialog", { name: "Settings", exact: true });
const pane = () => page.getByRole("region", { name: "Settings", exact: true });
async function wake() {
  await app.evaluate(async ({ BrowserWindow }) => {
    const win = BrowserWindow.getAllWindows()[0];
    if (win.isVisible()) throw new Error("Verification window became visible");
    await win.webContents.capturePage(undefined, {
      stayHidden: true,
      stayAwake: true,
    });
  });
}
async function openWindow() {
  await openSettingsWindow(page);
  await expect
    .poll(async () => {
      await wake();
      return dialog().evaluate((el) => getComputedStyle(el).opacity);
    })
    .toBe("1");
}
async function choose(category: string, owner = dialog()) {
  await owner.getByRole("tab", { name: category, exact: true }).click();
  await wake();
  return owner.getByRole("tabpanel", { name: category, exact: true });
}
async function resizeSettings(width: number, height: number) {
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
      const rect = (await dialog().boundingBox())!;
      return [Math.round(rect.width), Math.round(rect.height)];
    })
    .toEqual([width, height]);
}
async function bounds(locator: Locator) {
  return locator.evaluate((el) => {
    const rect = el.getBoundingClientRect();
    return {
      left: rect.left,
      right: rect.right,
      top: rect.top,
      bottom: rect.bottom,
      width: rect.width,
      height: rect.height,
    };
  });
}
async function centered(panel: Locator, content: Locator, maxWidth: number) {
  const outer = await bounds(panel),
    inner = await bounds(content);
  expect(inner.width).toBeLessThanOrEqual(maxWidth + 1);
  expect(
    Math.abs(inner.left - outer.left - (outer.right - inner.right)),
  ).toBeLessThanOrEqual(18);
}
async function loadTab(title: string, marker?: string) {
  await page.getByRole("tab", { name: title, exact: true }).click();
  await page.locator('[data-testid="run-query"]:visible').click();
  const viewer = page.locator(".workspace-pane.active-pane .viewer-scroll");
  await expect(viewer).toHaveAttribute("aria-rowcount", marker ? "40" : "0");
  if (marker)
    await expect(
      page.locator(".workspace-pane.active-pane .virtual-event").first(),
    ).toContainText(marker);
  await wake();
}

for (const theme of ["light", "dark"]) {
  test(`${theme} Settings centers single-column forms and preserves shortcut search while resizing`, async () => {
    await openWindow();
    await resizeSettings(1100, 650);
    for (const category of ["Shortcuts", "Preferences", "Connections"]) {
      const panel = await choose(category);
      if (category !== "Connections") {
        const fields = panel.locator(
          category === "Shortcuts"
            ? ".shortcut-editor-row"
            : ".settings-preferences-form .mantine-InputWrapper-root",
        );
        const first = await bounds(fields.nth(0)),
          second = await bounds(fields.nth(1));
        expect(
          second.top,
          `${category} fields stay in a single column`,
        ).toBeGreaterThanOrEqual(first.bottom);
        expect(Math.abs(first.left - second.left)).toBeLessThanOrEqual(1);
        expect(Math.abs(first.width - second.width)).toBeLessThanOrEqual(1);
      }
      const content = panel.locator(
        category === "Shortcuts"
          ? ".shortcut-editor"
          : ".settings-form-content",
      );
      await centered(panel, content, 720);
      const notes = panel.locator(
        ".mantine-Text-root, .mantine-InputWrapper-description",
      );
      const escapedNotes = await notes.evaluateAll((elements) =>
        elements
          .filter((el) => {
            const rect = el.getBoundingClientRect(),
              form = el
                .closest(".settings-form-content")
                ?.getBoundingClientRect();
            return (
              rect.width > 0 &&
              (!form ||
                rect.left < form.left - 1 ||
                rect.right > form.right + 1)
            );
          })
          .map((el) => el.textContent),
      );
      expect(
        escapedNotes,
        `${category} explanatory notes share the centered content`,
      ).toEqual([]);
    }
    const timePanel = await choose("Time ranges");
    await centered(timePanel, timePanel.locator(".time-template-editor"), 840);
    const shortcuts = await choose("Shortcuts");
    const search = shortcuts.getByRole("searchbox", {
      name: "Search commands",
      exact: true,
    });
    await search.fill("highlight");
    await resizeSettings(1100, 1000);
    await expect(search).toHaveValue("highlight");
    await expect(shortcuts.locator(".shortcut-editor-row")).toHaveCount(2);
  });

  test(`${theme} Highlights grows the tree and editor and keeps their scrolling separate from preview`, async () => {
    await openWindow();
    await resizeSettings(1100, 700);
    const panel = await choose("Highlights");
    const profiles = panel.locator(".highlight-tree-scroll");
    const rules = panel.locator(".highlight-tree-editor-scroll");
    const small = await bounds(rules);
    await profiles.evaluate((element) => {
      element.scrollTop = element.scrollHeight;
    });
    expect(
      await profiles.evaluate((element) => element.scrollTop),
    ).toBeGreaterThan(0);
    await panel
      .getByRole("treeitem", { name: /^Select rule/ })
      .last()
      .click();
    await resizeSettings(1100, 1300);
    await expect
      .poll(async () => (await bounds(rules)).height)
      .toBeGreaterThan(small.height + 450);
    expect((await bounds(rules)).height).toBeGreaterThan(600);
    const collapsed = await bounds(rules);
    const toggle = panel.getByRole("button", {
      name: "Preview",
      exact: true,
    });
    const scheme = await page
      .locator("html")
      .getAttribute("data-mantine-color-scheme");
    const gutters: number[] = [];
    for (let cycle = 0; cycle < 3; cycle++) {
      for (const expanded of [true, false]) {
        await toggle.click();
        await expect(toggle).toHaveAttribute("aria-expanded", String(expanded));
        await wake();
        await panel.evaluate((el) => {
          el.scrollTop = el.scrollHeight;
        });
        expect(
          await panel.evaluate((el) => el.scrollTop),
          "Highlights has no competing page scrollbar",
        ).toBe(0);
        for (const viewport of [profiles, rules]) {
          const metrics = await viewport.evaluate((el) => ({
            gutter: (el as HTMLElement).offsetWidth - el.clientWidth,
            horizontal: el.scrollWidth - el.clientWidth,
          }));
          gutters.push(metrics.gutter);
          expect(metrics.horizontal).toBeLessThanOrEqual(1);
        }
        if (expanded) {
          const light = panel.getByRole("region", {
            name: "Light preview",
            exact: true,
          });
          const dark = panel.getByRole("region", {
            name: "Dark preview",
            exact: true,
          });
          await expect(light).toBeVisible();
          await expect(dark).toBeVisible();
          const lightBox = await bounds(light),
            darkBox = await bounds(dark);
          expect(Math.abs(lightBox.top - darkBox.top)).toBeLessThanOrEqual(1);
          expect(darkBox.left).toBeGreaterThanOrEqual(lightBox.right);
        } else {
          await expect
            .poll(async () => Math.round((await bounds(rules)).height))
            .toBe(Math.round(collapsed.height));
        }
        await expect(page.locator("html")).toHaveAttribute(
          "data-mantine-color-scheme",
          scheme!,
        );
      }
    }
    expect(
      new Set(gutters).size,
      "Tree and editor scrollbar gutters remain stable across preview folds",
    ).toBe(1);
  });

  test(`${theme} modal previews keep the opening tab snapshot in scoped hybrid viewers and show empty data honestly`, async () => {
    await loadTab("Snapshot orders", "SNAPSHOT_ORDERS");
    await page.getByRole("button", { name: "Settings", exact: true }).click();
    await choose("Highlights", pane());
    await expect(
      pane().getByRole("button", { name: "Preview", exact: true }),
    ).toHaveCount(0);
    await expect(
      pane().getByRole("region", { name: /^(Light|Dark) preview$/ }),
    ).toHaveCount(0);
    await loadTab("Snapshot payments", "SNAPSHOT_PAYMENTS");
    await pane()
      .getByRole("button", { name: "Open settings in window", exact: true })
      .click();
    await resizeSettings(1100, 1000);
    const panel = await choose("Highlights");
    await panel.getByRole("button", { name: "Preview", exact: true }).click();
    for (const side of ["Light", "Dark"]) {
      const preview = panel.getByRole("region", {
        name: `${side} preview`,
        exact: true,
      });
      await expect(preview).toHaveAttribute("data-theme", side.toLowerCase());
      await expect(preview.locator(".viewer-scroll")).toHaveAttribute(
        "aria-rowcount",
        "40",
      );
      const row = preview.locator(".virtual-event").first();
      await expect(row).toContainText("SNAPSHOT_ORDERS");
      await expect(preview).not.toContainText("SNAPSHOT_PAYMENTS");
      await expect(
        row.getByRole("button", { name: "Expand event details", exact: true }),
      ).toBeVisible();
      const background =
        side === "Light" ? "rgb(254, 240, 138)" : "rgb(113, 63, 18)";
      await expect
        .poll(() => row.evaluate((el) => getComputedStyle(el).backgroundColor))
        .toBe(background);
      await row
        .getByRole("button", { name: "Expand event details", exact: true })
        .click();
      await expect(preview.locator(".expanded-event-content")).toContainText(
        "SNAPSHOT_ORDERS",
      );
      await row
        .getByRole("button", { name: "Collapse event details", exact: true })
        .click();
    }
    const lightPreview = panel.getByRole("region", {
      name: "Light preview",
      exact: true,
    });
    const separator = lightPreview.getByRole("separator", {
      name: "Resize Timestamp",
      exact: true,
    });
    const column = lightPreview.getByRole("columnheader").first();
    const originalWidth = (await column.boundingBox())!.width,
      grip = (await separator.boundingBox())!;
    await page.mouse.move(grip.x + grip.width / 2, grip.y + grip.height / 2);
    await page.mouse.down();
    await page.mouse.move(grip.x + 40, grip.y + grip.height / 2, { steps: 4 });
    await page.keyboard.press("Escape");
    await page.mouse.up();
    await expect(dialog()).toBeVisible();
    await expect
      .poll(async () => Math.round((await column.boundingBox())!.width))
      .toBe(Math.round(originalWidth));
    await wake();
    const frame = (await dialog().boundingBox())!;
    const image = await app.evaluate(async ({ BrowserWindow }, frame) => {
      const contents = BrowserWindow.getAllWindows()[0].webContents;
      await contents.capturePage(undefined, {
        stayHidden: true,
        stayAwake: true,
      });
      return (
        await contents.capturePage(
          {
            x: Math.floor(frame.x),
            y: Math.floor(frame.y),
            width: Math.ceil(frame.width),
            height: Math.ceil(frame.height),
          },
          { stayHidden: true, stayAwake: true },
        )
      )
        .toPNG()
        .toString("base64");
    }, frame);
    await writeFile(
      test.info().outputPath("settings-loaded-preview.png"),
      Buffer.from(image, "base64"),
    );
    await page.keyboard.press("Escape");
    await expect(dialog()).toHaveCount(0);
    await loadTab("Snapshot empty");
    await openWindow();
    const emptyPanel = await choose("Highlights");
    const toggle = emptyPanel.getByRole("button", {
      name: "Preview",
      exact: true,
    });
    if ((await toggle.getAttribute("aria-expanded")) !== "true")
      await toggle.click();
    await expect(
      emptyPanel.getByText("No loaded events in this tab.", { exact: true }),
    ).toBeVisible();
    await expect(
      emptyPanel.locator(".highlight-preview-section .virtual-event"),
    ).toHaveCount(0);
    await expect(
      emptyPanel.getByLabel("Preview event", { exact: true }),
    ).toHaveCount(0);
    await expect(page.locator("html")).toHaveAttribute(
      "data-mantine-color-scheme",
      theme,
    );
  });
}
