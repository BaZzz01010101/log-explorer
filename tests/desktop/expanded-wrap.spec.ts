import { createWorkspace } from "../../src/renderer/workspace";
import { desktopExecutablePath } from "./desktop-app";
import {
  _electron as electron,
  expect,
  test,
  type ElectronApplication,
  type Page,
} from "@playwright/test";
import { execFileSync } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { join, resolve, sep } from "node:path";
import type { QueryUpdate } from "../../src/shared/contracts";

test.setTimeout(90000);
let app: ElectronApplication | undefined;
let child: ReturnType<ElectronApplication["process"]> | undefined;
let page: Page;
let directory: string;
let errors: string[];
const temporaryRoot = resolve(".tmp", "desktop-expanded-wrap");
type ProbeWindow = Window & { inspectorUpdates: QueryUpdate[] };

test.beforeEach(async ({}, info) => {
  await mkdir(temporaryRoot, { recursive: true });
  directory = await mkdtemp(join(temporaryRoot, "case-"));
  errors = [];
  const state = createWorkspace();
  state.preferences.theme = info.title.includes("dark") ? "dark" : "light";
  state.preferences.autoExpandFilterMatches = false;
  state.preferences.timezone = "local";
  state.tabs[0].filterPattern = "";
  state.tabs[0].view.mode = "table";
  state.tabs[0].view.columns.find(
    (column) => column.path === "@message",
  )!.width = 260;
  await writeFile(join(directory, "workspace.json"), JSON.stringify(state));
  const env: Record<string, string> = {};
  for (const name of ["PATH", "SystemRoot", "WINDIR", "TEMP", "TMP", "COMSPEC"])
    if (process.env[name]) env[name] = process.env[name]!;
  Object.assign(env, {
    EXPLORER_TEST_USER_DATA: directory,
    USERPROFILE: directory,
    LOCALAPPDATA: directory,
    APPDATA: directory,
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
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Emulation.setFocusEmulationEnabled", { enabled: true });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.addStyleTag({
    content:
      "*, *::before, *::after { transition-duration: 0s !important; animation-duration: 0s !important; animation-delay: 0s !important; }",
  });
  page.on("pageerror", (error) => errors.push(error.message));
  const environment = await page.evaluate(() => window.explorer.environment());
  expect(environment.canEnableAws).toBe(false);
  expect(environment.awsEnabled).toBe(false);
  expect(
    await app.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()[0].isVisible(),
    ),
  ).toBe(false);
  await app.evaluate(({ dialog }) => {
    dialog.showMessageBox = async () => {
      throw new Error(
        "Unexpected native dialog during hidden inspector verification",
      );
    };
  });
  await page
    .locator("label")
    .filter({ hasText: /^Table$/ })
    .click();
  // A row is sufficient for the old-build regression baseline; completion
  // assertions elsewhere use the explicit state rather than status decoration.
  await expect(page.locator(".log-table-row").nth(1)).toBeVisible();
});

test.afterEach(async ({}, testInfo) => {
  if (
    testInfo.status !== testInfo.expectedStatus &&
    app &&
    child?.exitCode === null
  ) {
    try {
      const png = await app.evaluate(async ({ BrowserWindow }) => {
        const window = BrowserWindow.getAllWindows()[0];
        if (window.isVisible())
          throw new Error("Inspector verification became visible");
        const image = await window.webContents.capturePage(undefined, {
          stayHidden: true,
          stayAwake: true,
        });
        return image.toPNG().toString("base64");
      });
      await mkdir(testInfo.outputDir, { recursive: true });
      await writeFile(
        testInfo.outputPath("failure.png"),
        Buffer.from(png, "base64"),
      );
    } catch {}
  }
  try {
    if (app && child && child.exitCode === null) {
      const closed = app.waitForEvent("close", { timeout: 7000 });
      const exited = new Promise<number | null>((done) =>
        child!.once("exit", done),
      );
      await app.evaluate(({ BrowserWindow }) =>
        BrowserWindow.getAllWindows()[0].close(),
      );
      await closed;
      expect(await exited).toBe(0);
    }
  } finally {
    if (child && child.exitCode === null) {
      if (process.platform === "win32")
        execFileSync("taskkill", ["/PID", String(child.pid), "/T", "/F"], {
          stdio: "ignore",
        });
      else child.kill();
    }
  }
  expect(errors).toEqual([]);
  if (!resolve(directory).startsWith(temporaryRoot + sep + "case-"))
    throw new Error("Unsafe inspector-test cleanup path");
  await rm(directory, {
    recursive: true,
    force: true,
    maxRetries: 10,
    retryDelay: 100,
  });
});

const rows = () => page.locator(".virtual-event");
const row = (index: number) =>
  page.locator(`.virtual-event[data-event-id="wrap-${index}"]`);
async function paint() {
  await app!.evaluate(async ({ BrowserWindow }) => {
    const win = BrowserWindow.getAllWindows()[0];
    if (win.isVisible()) throw new Error("Wrap test became visible");
    await win.webContents.capturePage(undefined, {
      stayHidden: true,
      stayAwake: true,
    });
  });
  await page.evaluate(
    () =>
      new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      ),
  );
}
async function mode(name: string) {
  await page
    .locator("label")
    .filter({ hasText: new RegExp(`^${name}$`) })
    .click();
}
async function wrap(enabled: boolean) {
  const button = page.getByRole("button", {
    name: "Toggle line wrap",
    exact: true,
  });
  if ((await button.getAttribute("aria-pressed")) !== String(enabled))
    await button.click();
}
async function unfold(enabled: boolean) {
  const button = page.getByRole("button", {
    name: /^(Fold|Unfold) all messages$/,
  });
  if ((await button.getAttribute("aria-pressed")) !== String(enabled))
    await button.click();
}
test.beforeEach(async () => {
  await app!.evaluate(({ ipcMain, BrowserWindow }) => {
    BrowserWindow.getAllWindows()[0].setContentSize(1700, 1000);
    ipcMain.removeHandler("explorer:query");
    ipcMain.handle("explorer:query", (event, request) => {
      const events = Array.from({ length: 80 }, (_, index) => ({
        id: `wrap-${index}`,
        timestamp: 1793723557077 + index * 1000,
        logGroup: "/aws/lambda/orders-api",
        logStream: "wrap-fixture",
        message:
          index % 2 === 0
            ? JSON.stringify({
                level: "INFO",
                configurationId: "baron_C_right",
                originUUID: "8dd315c0-2dd5-477a-b01f-54b20c234fa7",
                payload: { nested: { deep: { leaf: index } } },
                msg:
                  "GroupingService.findGroupRaw | did not find raw configuration " +
                  "long value ".repeat(index % 6 ? 5 : 45),
              })
            : index % 4 === 1
              ? `short event ${index}`
              : Array.from(
                  { length: 22 },
                  (_, line) =>
                    `stack trace ${index} line ${line} ` +
                    "message ".repeat(12),
                ).join("\n"),
      }));
      setImmediate(() =>
        event.sender.send("explorer:update", {
          requestId: request.requestId,
          state: "complete",
          events,
          replace: true,
        }),
      );
    });
  });
  await page.getByTestId("run-query").click();
  await expect(row(0)).toBeVisible();
});

test("Hybrid removes redundant row action links while retaining detail resizing", async () => {
  await mode("Hybrid");
  await row(0)
    .getByRole("button", { name: "Expand event details", exact: true })
    .click();
  for (const name of ["Fold message", "Open inspector", "Copy raw"])
    await expect(row(0).getByRole("button", { name, exact: true })).toHaveCount(
      0,
    );
  await expect(
    row(0).getByRole("separator", {
      name: "Resize expanded event",
      exact: true,
    }),
  ).toBeVisible();
});

test("JSON removes Inspect and raw-copy actions from each event", async () => {
  await mode("JSON");
  await expect(rows().getByRole("button", { name: /^Inspect/ })).toHaveCount(0);
  await expect(
    rows().getByRole("button", { name: "Copy raw event", exact: true }),
  ).toHaveCount(0);
});

test("default timestamp column fits the complete local timestamp", async () => {
  const sizes = await row(0)
    .locator(".event-timestamp")
    .evaluate((element) => {
      const range = document.createRange();
      range.selectNodeContents(element);
      const cell = element.closest<HTMLElement>(".inspect-cell")!;
      return {
        available: cell.clientWidth,
        text: range.getBoundingClientRect().width,
        content: element.textContent,
      };
    });
  await test.info().attach("timestamp-width", {
    body: JSON.stringify(sizes),
    contentType: "application/json",
  });
  expect(sizes.available).toBeGreaterThanOrEqual(sizes.text);
});

test("Hybrid Ctrl-unfold opens nested branches, fits content and retains a manually chosen height", async () => {
  await mode("Hybrid");
  await wrap(true);
  await row(0)
    .getByRole("button", { name: "Expand event details", exact: true })
    .click({ modifiers: ["Control"] });
  await paint();
  await expect(
    row(0).locator('[data-json-path="/payload/nested/deep/leaf"]'),
  ).toHaveCount(1);
  const content = row(0).getByRole("region", {
    name: "Expanded event content",
    exact: true,
  });
  await expect
    .poll(() =>
      content.evaluate(
        (element) => element.scrollHeight - element.clientHeight,
      ),
    )
    .toBeLessThanOrEqual(1);
  await row(0)
    .getByRole("separator", { name: "Resize expanded event", exact: true })
    .press("ArrowDown");
  const height = (await content.boundingBox())!.height;
  await row(0)
    .getByRole("button", { name: "Collapse event details", exact: true })
    .click();
  await row(0)
    .getByRole("button", { name: "Expand event details", exact: true })
    .click();
  await paint();
  expect((await content.boundingBox())!.height).toBeCloseTo(height, 0);
  await expect(
    row(0).locator('[data-json-path="/payload/nested/deep/leaf"]'),
  ).toHaveCount(1);
});

test("tab switching preserves wrapped expanded content, both scroll positions and row identity", async () => {
  await mode("Hybrid");
  await wrap(true);
  await row(0)
    .getByRole("button", { name: "Expand event details", exact: true })
    .click({ modifiers: ["Control"] });
  await paint();
  const content = row(0).getByRole("region", {
    name: "Expanded event content",
    exact: true,
  });
  const grip = row(0).getByRole("separator", {
    name: "Resize expanded event",
    exact: true,
  });
  for (let index = 0; index < 8; index++) await grip.press("ArrowUp");
  await content.evaluate((element) => (element.scrollTop = 35));
  const scroll = page.locator(".viewer-scroll");
  await scroll.evaluate((element) => (element.scrollTop = 100));
  await paint();
  const previous = await row(0).evaluate((element) => {
    (window as any).__retainedWrapRow = element;
    return {
      scroll: element.closest(".viewer-scroll")!.scrollTop,
      detail: element.querySelector(".expanded-event-content")!.scrollTop,
    };
  });
  expect(previous.detail).toBeGreaterThan(0);
  await page
    .getByRole("treeitem", { name: "/aws/lambda/payments-worker", exact: true })
    .getByRole("button", { name: "/aws/lambda/payments-worker", exact: true })
    .dblclick();
  await page
    .locator('.workspace-tab[data-tab-id="tab-orders"] [role="tab"]')
    .click();
  await paint();
  const restored = await row(0).evaluate((element) => ({
    same: element === (window as any).__retainedWrapRow,
    scroll: element.closest(".viewer-scroll")!.scrollTop,
    detail: element.querySelector(".expanded-event-content")!.scrollTop,
  }));
  expect(restored.same).toBe(true);
  expect(restored.scroll).toBeCloseTo(previous.scroll, 0);
  expect(restored.detail).toBeCloseTo(previous.detail, 0);
  await expect(
    row(0).locator('[data-json-path="/payload/nested/deep/leaf"]'),
  ).toHaveCount(1);
});

for (const theme of ["light", "dark"]) {
  test(`${theme} Table wrapped structured message preserves field names before shrinking values`, async () => {
    await mode("Table");
    await wrap(true);
    await unfold(true);
    await paint();
    const geometry = await row(0)
      .locator('[data-json-path="/configurationId"]')
      .evaluate((element) => {
        const key = element.querySelector<HTMLElement>(".json-key")!;
        const value = element.querySelector<HTMLElement>(".json-value")!;
        return {
          keyHeight: key.getBoundingClientRect().height,
          lineHeight: parseFloat(getComputedStyle(element).lineHeight),
          keyWidth: key.getBoundingClientRect().width,
          keyScroll: key.scrollWidth,
          valueWidth: value.getBoundingClientRect().width,
        };
      });
    await test.info().attach("field-geometry", {
      body: JSON.stringify(geometry),
      contentType: "application/json",
    });
    expect(geometry.keyHeight).toBeLessThanOrEqual(geometry.lineHeight + 1);
    expect(geometry.valueWidth).toBeGreaterThan(20);
    const uuid = row(0).locator('[data-json-path="/originUUID"] .json-key');
    expect((await uuid.boundingBox())!.height).toBeLessThanOrEqual(
      geometry.lineHeight + 1,
    );
  });

  for (const display of ["Table", "Hybrid", "JSON"]) {
    test(`${theme} ${display} unfold and wrap keep complete trees and stable adjacent rows across scrolling and resizing`, async () => {
      await mode(display);
      await wrap(true);
      await unfold(true);
      await paint();
      const failures: unknown[] = [];
      const snapshot = async (phase: string) => {
        await paint();
        const result = await rows().evaluateAll((elements) =>
          elements.map((element, index) => {
            const rect = element.getBoundingClientRect(),
              next = elements[index + 1]?.getBoundingClientRect();
            const id = Number(
              element.getAttribute("data-event-id")!.split("-").at(-1),
            );
            const detail = element.querySelector<HTMLElement>(
              ".expanded-event-content",
            );
            return {
              id,
              height: rect.height,
              top: rect.top,
              nextTop: next?.top,
              gap: next ? next.top - rect.bottom : 0,
              leaf:
                id % 2 !== 0 ||
                !!element.querySelector(
                  '[data-json-path="/payload/nested/deep/leaf"]',
                ),
              detail: detail && {
                client: detail.clientHeight,
                scroll: detail.scrollHeight,
              },
            };
          }),
        );
        const bad = result.filter(
          (item) => Math.abs(item.gap) > 1.5 || !item.leaf,
        );
        if (bad.length) failures.push({ phase, bad, all: result });
      };
      await snapshot("initial");
      for (const top of [600, 1600, 4000, 10000, 22000, 8000, 0]) {
        await page
          .locator(".viewer-scroll")
          .evaluate((element, top) => (element.scrollTop = top), top);
        await snapshot(`scroll-${top}`);
      }
      if (display !== "JSON") {
        const handle = page.getByRole("separator", {
          name: "Resize Message",
          exact: true,
        });
        for (const key of [
          "ArrowRight",
          "ArrowRight",
          "ArrowLeft",
          "ArrowLeft",
        ])
          await handle.press(key);
        await snapshot("column-resize");
      }
      await wrap(false);
      await snapshot("unwrapped");
      await wrap(true);
      await snapshot("rewrapped");
      await app!.evaluate(({ BrowserWindow }) => {
        const win = BrowserWindow.getAllWindows()[0];
        let pending = false;
        (globalThis as any).__wrapFramePump = setInterval(() => {
          if (pending || win.isDestroyed()) return;
          pending = true;
          void win.webContents
            .capturePage(undefined, { stayHidden: true, stayAwake: true })
            .catch(() => {})
            .finally(() => {
              pending = false;
            });
        }, 30);
      });
      let duringScroll: unknown[];
      try {
        duringScroll = await page
          .locator(".viewer-scroll")
          .evaluate(async (element) => {
            const bad: unknown[] = [];
            for (let step = 0; step < 30; step++) {
              element.scrollTop = step < 15 ? step * 420 : (29 - step) * 420;
              await new Promise<void>((resolve) =>
                requestAnimationFrame(() =>
                  requestAnimationFrame(() => resolve()),
                ),
              );
              const items = [
                ...element.querySelectorAll<HTMLElement>(".virtual-event"),
              ];
              for (let index = 0; index + 1 < items.length; index++) {
                const first = items[index].getBoundingClientRect(),
                  next = items[index + 1].getBoundingClientRect();
                const gap = next.top - first.bottom;
                if (Math.abs(gap) > 1.5)
                  bad.push({ step, id: items[index].dataset.eventId, gap });
              }
            }
            return bad;
          });
      } finally {
        await app!.evaluate(() =>
          clearInterval((globalThis as any).__wrapFramePump),
        );
      }
      if (duringScroll.length)
        failures.push({ phase: "continuous-scroll", bad: duringScroll });
      await app!.evaluate(({ BrowserWindow }) =>
        BrowserWindow.getAllWindows()[0].setContentSize(1200, 850),
      );
      await snapshot("narrower-window");
      await app!.evaluate(({ BrowserWindow }) =>
        BrowserWindow.getAllWindows()[0].setContentSize(1700, 1000),
      );
      await snapshot("restored-window");
      await test.info().attach("row-layout", {
        body: JSON.stringify(failures, null, 2),
        contentType: "application/json",
      });
      expect(failures).toEqual([]);
      await unfold(false);
      await unfold(true);
      await paint();
      await expect(
        row(0).locator('[data-json-path="/payload/nested/deep/leaf"]'),
      ).toHaveCount(1);
    });
  }
}
