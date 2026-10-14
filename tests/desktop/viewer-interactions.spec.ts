import {
  _electron as electron,
  expect,
  test,
  type ElectronApplication,
  type Page,
} from "@playwright/test";
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve, sep } from "node:path";

let app: ElectronApplication;
let child: ReturnType<ElectronApplication["process"]>;
let page: Page;
let directory: string;
let errors: string[];
const packaged = process.env.EXPLORER_DESKTOP_PACKAGED === "1";
const executable = join(
  process.cwd(),
  "release/win-unpacked/AWS Log Explorer.exe",
);

test.beforeEach(async () => {
  test.skip(
    packaged && !existsSync(executable),
    "Build the packaged application first",
  );
  directory = await mkdtemp(join(tmpdir(), "aws-log-explorer-viewer-"));
  errors = [];
  const environment: Record<string, string> = {};
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
    if (process.env[key]) environment[key] = process.env[key]!;
  Object.assign(environment, {
    EXPLORER_TEST_USER_DATA: directory,
    AWS_CONFIG_FILE: join(directory, "absent-config"),
    AWS_SHARED_CREDENTIALS_FILE: join(directory, "absent-credentials"),
    AWS_EC2_METADATA_DISABLED: "true",
  });
  app = await electron.launch({
    executablePath: packaged ? executable : undefined,
    args: [
      ...(packaged ? [] : [process.cwd()]),
      "--offline-verification",
      "--background-verification",
      "--disable-background-networking",
      "--disable-component-update",
    ],
    env: environment,
  });
  child = app.process();
  page = await app.firstWindow();
  await app.evaluate(({ BrowserWindow, dialog }) => {
    if (BrowserWindow.getAllWindows()[0].isVisible())
      throw new Error("Viewer verification must remain hidden");
    dialog.showMessageBox = async () => {
      throw new Error("Unexpected native dialog in hidden viewer verification");
    };
  });
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Emulation.setFocusEmulationEnabled", { enabled: true });
  page.on("pageerror", (error) => errors.push(error.message));
  await expect(page.locator(".query-status")).toContainText("complete");
  const info = await page.evaluate(() => window.explorer.environment());
  expect(info.awsEnabled).toBe(false);
  expect(info.canEnableAws).toBe(false);
});

test.afterEach(async () => {
  if (child?.exitCode === null) {
    await Promise.race([
      app.close().catch(() => {}),
      new Promise((resolveDelay) => setTimeout(resolveDelay, 4000)),
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
  if (directory) {
    if (
      !resolve(directory).startsWith(
        resolve(tmpdir()) + sep + "aws-log-explorer-viewer-",
      )
    )
      throw new Error("Unsafe viewer verification cleanup path");
    await rm(directory, {
      recursive: true,
      force: true,
      maxRetries: 10,
      retryDelay: 100,
    });
  }
  expect(errors).toEqual([]);
});

test("column widths follow trusted pointer movement before release without selecting or native dragging", async () => {
  await page.evaluate(() => {
    (window as unknown as { nativeDrags: number }).nativeDrags = 0;
    document.addEventListener(
      "dragstart",
      () => (window as unknown as { nativeDrags: number }).nativeDrags++,
    );
  });
  await page
    .locator("label")
    .filter({ hasText: /^Table$/ })
    .click();
  const header = page.getByRole("columnheader").first();
  const handle = page.getByRole("separator", {
    name: "Resize Timestamp",
    exact: true,
  });
  const original = (await header.boundingBox())!;
  const box = (await handle.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  try {
    await page.mouse.move(
      box.x + box.width / 2 + 90,
      box.y + box.height / 2 + 45,
      { steps: 15 },
    );
    await expect
      .poll(async () => (await header.boundingBox())!.width)
      .toBeGreaterThan(original.width + 70);
    expect(await page.evaluate(() => window.getSelection()?.toString())).toBe(
      "",
    );
    await expect(handle).toHaveAttribute(
      "aria-valuenow",
      String(Math.round(original.width + 90)),
    );
  } finally {
    await page.mouse.up();
  }
  await expect(page.locator("body")).not.toHaveClass(/resizing-columns/);
  expect(
    await page.evaluate(
      () => (window as unknown as { nativeDrags: number }).nativeDrags,
    ),
  ).toBe(0);
  const resized = (await header.boundingBox())!.width;
  const next = (await handle.boundingBox())!;
  await page.mouse.move(next.x + next.width / 2, next.y + next.height / 2);
  await page.mouse.down();
  await page.mouse.move(
    next.x + next.width / 2 - 45,
    next.y + next.height / 2,
    { steps: 6 },
  );
  await page.mouse.up();
  await expect
    .poll(async () => (await header.boundingBox())!.width)
    .toBeLessThan(resized - 35);
  await page.getByLabel("Local filter loaded events").fill("Payment");
  await expect(page.locator(".log-table-row").first()).toContainText("Payment");
  const savedWidth = Math.round((await header.boundingBox())!.width);
  await expect
    .poll(async () => {
      const stored = JSON.parse(
        await readFile(join(directory, "workspace.json"), "utf8"),
      );
      return stored.tabs[0].view.columns.find(
        (column: { path: string }) => column.path === "@timestamp",
      ).width;
    })
    .toBe(savedWidth);
});

test("resizing cancels cleanly with Escape and remains keyboard adjustable", async () => {
  await page
    .locator("label")
    .filter({ hasText: /^Table$/ })
    .click();
  const header = page.getByRole("columnheader").first();
  const handle = page.getByRole("separator", {
    name: "Resize Timestamp",
    exact: true,
  });
  const original = (await header.boundingBox())!.width;
  const box = (await handle.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  try {
    await page.mouse.move(box.x + box.width / 2 + 100, box.y + box.height / 2, {
      steps: 10,
    });
    await expect
      .poll(async () => (await header.boundingBox())!.width)
      .toBeGreaterThan(original + 80);
    await page.keyboard.press("Escape");
    await expect
      .poll(async () => (await header.boundingBox())!.width)
      .toBe(original);
    await expect(page.locator("body")).not.toHaveClass(/resizing-columns/);
  } finally {
    await page.mouse.up();
  }
  await handle.press("ArrowRight");
  await expect
    .poll(async () => (await header.boundingBox())!.width)
    .toBe(original + 10);
  await handle.press("ArrowLeft");
  await expect
    .poll(async () => (await header.boundingBox())!.width)
    .toBe(original);
  await page.getByLabel("Local filter loaded events").fill("Payment");
  await expect(page.locator(".log-table-row").first()).toContainText("Payment");
});

test("pure modifier keys leave pointer focus quiet while Tab retains its visible focus ring", async () => {
  const wrap = page.getByRole("button", {
    name: "Toggle line wrap",
    exact: true,
  });
  await wrap.click();
  for (const key of ["Shift", "Control"]) {
    await page.keyboard.press(key);
    await expect(page.locator("html")).toHaveAttribute(
      "data-input-modality",
      "pointer",
    );
    const outline = await wrap.evaluate((element) => ({
      width: getComputedStyle(element).outlineWidth,
      style: getComputedStyle(element).outlineStyle,
      visible: element.matches(":focus-visible"),
      focus: element.matches(":focus"),
      marker: document.documentElement.getAttribute("data-input-modality"),
    }));
    expect(outline, JSON.stringify(outline)).toMatchObject({ style: "none" });
  }
  await page.keyboard.press("Tab");
  await expect(page.locator("html")).toHaveAttribute(
    "data-input-modality",
    "keyboard",
  );
  const focused = await page.evaluate(() => {
    const element = document.activeElement!;
    const style = getComputedStyle(element);
    return {
      visible: element.matches(":focus-visible"),
      width: parseFloat(style.outlineWidth),
      style: style.outlineStyle,
    };
  });
  expect(focused.visible).toBe(true);
  expect(focused.style).not.toBe("none");
  expect(focused.width).toBeGreaterThan(0);
  await page
    .locator("label")
    .filter({ hasText: /^Table$/ })
    .click();
  await page.keyboard.press("Shift");
  const tableLabel = page.locator("label").filter({ hasText: /^Table$/ });
  const labelFocus = await tableLabel.evaluate((element) => ({
    width: getComputedStyle(element).outlineWidth,
    style: getComputedStyle(element).outlineStyle,
    variable: getComputedStyle(element).getPropertyValue(
      "--segmented-control-outline",
    ),
    marker: document.documentElement.getAttribute("data-input-modality"),
    inputVisible: element.previousElementSibling?.matches(":focus-visible"),
  }));
  expect(labelFocus, JSON.stringify(labelFocus)).toMatchObject({
    style: "none",
  });
});

test("all view mode labels keep their icon and text on the same line", async () => {
  const labels = page
    .locator(".viewer-toolbar label")
    .filter({ hasText: /^(JSON|Table|Hybrid)$/ });
  await expect(labels).toHaveCount(3);
  const geometries = await labels.evaluateAll((elements) =>
    elements.map((element) => {
      const icon = element.querySelector("svg")!.getBoundingClientRect();
      const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
      let node = walker.nextNode();
      while (node && !node.textContent?.trim()) node = walker.nextNode();
      const range = document.createRange();
      range.selectNodeContents(node!);
      const text = range.getBoundingClientRect();
      return {
        delta: Math.abs(icon.y + icon.height / 2 - text.y - text.height / 2),
        height: element.getBoundingClientRect().height,
      };
    }),
  );
  for (const geometry of geometries) {
    expect(geometry.delta).toBeLessThan(2);
    expect(geometry.height).toBeLessThan(28);
  }
});

test("expanded hybrid rows retain aligned geometry through horizontal scrolling", async () => {
  await app.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows()[0].setSize(1000, 800),
  );
  await page
    .locator("label")
    .filter({ hasText: /^Hybrid$/ })
    .click();
  const events = page.locator(".table-event");
  await page
    .getByRole("button", { name: "Expand event details" })
    .nth(1)
    .click();
  const detail = page.locator(".hybrid-detail").first();
  await expect(detail).toBeVisible();
  await expect(detail.locator(".json-tree")).toBeVisible();
  await expect
    .poll(async () => {
      const expanded = await events.nth(1).boundingBox();
      const following = await events.nth(2).boundingBox();
      return following!.y - expanded!.y - expanded!.height;
    })
    .toBeGreaterThanOrEqual(-1);
  const viewport = page.getByRole("region", {
    name: "Log events",
    exact: true,
  });
  const rect = (await viewport.boundingBox())!;
  await page.mouse.move(rect.x + rect.width / 2, rect.y + 15);
  await page.mouse.wheel(420, 0);
  await expect
    .poll(() => viewport.evaluate((element) => element.scrollLeft))
    .toBeGreaterThan(100);
  const layout = await page.evaluate(() => {
    const viewport = document
      .querySelector(".viewer-scroll")!
      .getBoundingClientRect();
    const detail = document
      .querySelector(".hybrid-detail")!
      .getBoundingClientRect();
    const header = document
      .querySelector(".log-header-cell")!
      .getBoundingClientRect();
    const cell = document.querySelector(".log-cell")!.getBoundingClientRect();
    return { viewport, detail, delta: Math.abs(header.x - cell.x) };
  });
  expect(layout.delta).toBeLessThan(1);
  expect(layout.detail.x).toBeGreaterThanOrEqual(layout.viewport.x - 1);
  expect(layout.detail.right).toBeLessThanOrEqual(layout.viewport.right + 1);
  await page.getByRole("button", { name: "Collapse event details" }).click();
  await expect(detail).toHaveCount(0);
});
