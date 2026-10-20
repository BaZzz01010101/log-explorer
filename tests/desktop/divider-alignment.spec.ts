import {
  createWorkspace,
  createTab,
  workspaceReducer,
} from "../../src/renderer/workspace";
import { desktopExecutablePath } from "./desktop-app";
import {
  _electron as electron,
  expect,
  test,
  type ElectronApplication,
  type Page,
  type Locator,
} from "@playwright/test";
import { execFileSync } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { join, resolve, sep } from "node:path";

test.setTimeout(120000);
test.describe.configure({ mode: "parallel" });
let app: ElectronApplication | undefined;
let child: ReturnType<ElectronApplication["process"]> | undefined;
let page: Page;
let directory: string;
let errors: string[];
const temporaryRoot = resolve(".tmp", "desktop-divider-alignment");

test.beforeEach(async ({}, testInfo) => {
  await mkdir(temporaryRoot, { recursive: true });
  directory = await mkdtemp(join(temporaryRoot, "case-"));
  errors = [];
  let state = createWorkspace();
  state.preferences.theme = testInfo.title.includes("light") ? "light" : "dark";
  state.tabs[0].filterPattern = "";
  state.tabs[0].view.columns = [
    { path: "@timestamp", width: 210, pinned: true },
    { path: "@level", width: 100, pinned: true },
    { path: "/service/name", width: 190 },
    { path: "@message", width: 700 },
    { path: "/request/id", width: 170 },
  ];
  if (testInfo.title.includes("split")) {
    state = workspaceReducer(state, {
      type: "tab/open",
      tab: createTab("offline", [{ logGroup: "/aws/lambda/payments-worker" }]),
    });
    state = workspaceReducer(state, {
      type: "pane/show-tabs",
      tabIds: state.tabs.map((tab) => tab.id),
    });
    if (testInfo.title.includes("vertical")) {
      const layout = state.splitTabs![0].layout;
      if (layout.type !== "split") throw new Error("Expected split fixture");
      layout.axis = "vertical";
      state.layout = layout;
    }
  }
  await writeFile(join(directory, "workspace.json"), JSON.stringify(state));
  const env: Record<string, string> = {};
  for (const name of ["PATH", "SystemRoot", "WINDIR", "TEMP", "TMP", "COMSPEC"])
    if (process.env[name]) env[name] = process.env[name]!;
  Object.assign(env, {
    EXPLORER_TEST_USER_DATA: directory,
    TEMP: directory,
    TMP: directory,
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
        "Unexpected native dialog during hidden divider-alignment verification",
      );
    };
  });
  await page
    .locator("label")
    .filter({ hasText: /^Table$/ })
    .first()
    .click();
  // A row is sufficient for the old-build regression baseline; completion
  // assertions elsewhere use the explicit state rather than status decoration.
  await expect(page.locator(".log-table-row").nth(1)).toBeVisible();
});

async function boundary(
  handle: Locator,
  owner: Locator,
  edge: "left" | "right" | "middle",
  axis: "x" | "y" = "x",
) {
  const box = (await owner.boundingBox())!;
  const line = await owner.evaluate(
    (element, { edge, axis }) => {
      const rect = element.getBoundingClientRect(),
        style = getComputedStyle(element);
      return edge === "middle"
        ? axis === "x"
          ? rect.x + rect.width / 2
          : rect.y + rect.height / 2
        : edge === "right"
          ? rect.right - parseFloat(style.borderRightWidth) / 2
          : rect.left + parseFloat(style.borderLeftWidth) / 2;
    },
    { edge, axis },
  );
  const hitbox = (await handle.boundingBox())!;
  const center =
    axis === "x" ? hitbox.x + hitbox.width / 2 : hitbox.y + hitbox.height / 2;
  expect
    .soft(Math.abs(center - line), JSON.stringify({ hitbox, box, line }))
    .toBeLessThanOrEqual(0.55);
  const middle =
    axis === "x" ? hitbox.y + hitbox.height / 2 : hitbox.x + hitbox.width / 2;
  for (const offset of [-2, 2]) {
    const point =
      axis === "x"
        ? { x: line + offset, y: middle }
        : { x: middle, y: line + offset };
    const hit = await handle.evaluate((element, point) => {
      const actual = document.elementFromPoint(point.x, point.y);
      return {
        hit: actual === element || (!!actual && element.contains(actual)),
        actual: actual?.outerHTML.slice(0, 280),
      };
    }, point);
    expect
      .soft(hit.hit, `hit target ${axis}=${line + offset}: ${hit.actual}`)
      .toBe(true);
    await page.mouse.move(point.x, point.y);
    expect
      .soft(
        await handle.evaluate((element) => element.matches(":hover")),
        `hover ${offset}`,
      )
      .toBe(true);
  }
  return { line, middle };
}

async function capturedDrag(
  handle: Locator,
  point: { x: number; y: number },
  delta: { x: number; y: number },
  cancel = true,
) {
  const original = await handle.getAttribute("aria-valuenow");
  await page.mouse.move(point.x, point.y);
  await page.mouse.down();
  try {
    await expect
      .poll(() =>
        handle.evaluate((element) =>
          Array.from({ length: 8 }, (_, i) =>
            element.hasPointerCapture(i + 1),
          ).some(Boolean),
        ),
      )
      .toBe(true);
    await page.mouse.move(point.x + delta.x, point.y + delta.y, { steps: 4 });
    await expect(handle).not.toHaveAttribute("aria-valuenow", original!);
    expect(await page.evaluate(() => window.getSelection()?.toString())).toBe(
      "",
    );
    if (cancel) {
      await page.keyboard.press("Escape");
      await expect(handle).toHaveAttribute("aria-valuenow", original!);
    }
  } finally {
    await page.mouse.up();
  }
}

for (const theme of ["light", "dark"]) {
  for (const mode of ["Table", "Hybrid"])
    test(`${theme} ${mode} column separators center hover and captured drag on both sides, including pinned and scrolled headers`, async () => {
      await page
        .locator("label")
        .filter({ hasText: new RegExp(`^${mode}$`) })
        .click();
      const scroll = page.locator(".viewer-scroll");
      for (const scrolled of [false, true]) {
        await scroll.evaluate((element, scrolled) => {
          element.scrollLeft = scrolled ? 60 : 0;
        }, scrolled);
        for (const path of ["@timestamp", "@level", "/service/name"]) {
          const owner = page.locator(
            `.log-header-cell[data-column-path="${path}"]`,
          );
          const handle = owner.locator(".column-resizer");
          const { line, middle } = await boundary(handle, owner, "right");
          // The drag must start on either side of the visible separator, not merely
          // at the handle's own potentially misplaced center.
          if (test.info().errors.length) continue;
          for (const side of [-2, 2])
            await capturedDrag(
              handle,
              { x: line + side, y: middle },
              { x: 32, y: 12 },
            );
        }
      }
    });
  test(`${theme} inspector separator centers hover and captured drag on both sides at normal and increased zoom`, async () => {
    for (const zoom of [1, 1.25]) {
      await app!.evaluate(
        ({ BrowserWindow }, zoom) =>
          BrowserWindow.getAllWindows()[0].webContents.setZoomFactor(zoom),
        zoom,
      );
      await page.evaluate(
        () =>
          new Promise<void>((resolve) =>
            requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
          ),
      );
      const handle = page.locator(".event-inspector-resizer");
      const { line, middle } = await boundary(
        handle,
        page.locator(".event-inspector"),
        "left",
      );
      if (test.info().errors.length) continue;
      for (const side of [-2, 2])
        await capturedDrag(
          handle,
          { x: line + side, y: middle },
          { x: -32, y: 12 },
        );
    }
  });
  test(`${theme} Explorer separator keeps centered hover and drag area`, async () => {
    const handle = page.locator(".sidebar-resizer");
    const { line, middle } = await boundary(
      handle,
      page.locator(".sidebar-shell"),
      "right",
    );
    await capturedDrag(
      handle,
      { x: line - 1, y: middle },
      { x: 30, y: 0 },
      false,
    );
  });
  for (const direction of ["horizontal", "vertical"])
    test(`${theme} ${direction} split separator keeps centered hover grip and drag area`, async () => {
      const handle = page.locator(".pane-layout-divider");
      const axis = direction === "horizontal" ? "x" : "y";
      const { line, middle } = await boundary(handle, handle, "middle", axis);
      const style = await handle.evaluate((element) => {
        const grip = getComputedStyle(element, "::after");
        return {
          left: parseFloat(grip.left),
          right: parseFloat(grip.right),
          top: parseFloat(grip.top),
          bottom: parseFloat(grip.bottom),
        };
      });
      expect(
        Math.abs(
          axis === "x" ? style.left - style.right : style.top - style.bottom,
        ),
      ).toBeLessThanOrEqual(0.5);
      await capturedDrag(
        handle,
        axis === "x" ? { x: line - 1, y: middle } : { x: middle, y: line - 1 },
        axis === "x" ? { x: 30, y: 0 } : { x: 0, y: 30 },
      );
    });
}

test.afterEach(async ({}, testInfo) => {
  if (
    (testInfo.status !== testInfo.expectedStatus ||
      /Table|inspector/.test(testInfo.title)) &&
    app &&
    child?.exitCode === null
  ) {
    try {
      if (testInfo.status === testInfo.expectedStatus)
        await page
          .locator(
            testInfo.title.includes("inspector")
              ? ".event-inspector-resizer"
              : ".column-resizer",
          )
          .first()
          .hover();
      const png = await app.evaluate(async ({ BrowserWindow }) => {
        const window = BrowserWindow.getAllWindows()[0];
        if (window.isVisible())
          throw new Error("Divider-alignment verification became visible");
        const image = await window.webContents.capturePage(undefined, {
          stayHidden: true,
          stayAwake: true,
        });
        return image.toPNG().toString("base64");
      });
      await mkdir(testInfo.outputDir, { recursive: true });
      await writeFile(
        testInfo.outputPath(
          testInfo.status === testInfo.expectedStatus
            ? "centered-hover.png"
            : "failure.png",
        ),
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
    throw new Error("Unsafe divider-alignment-test cleanup path");
  await rm(directory, {
    recursive: true,
    force: true,
    maxRetries: 10,
    retryDelay: 100,
  });
});
