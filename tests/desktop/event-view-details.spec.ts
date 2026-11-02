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

test.setTimeout(90000);
let app: ElectronApplication | undefined;
let child: ReturnType<ElectronApplication["process"]> | undefined;
let page: Page;
let directory: string;
let errors: string[];
const temporaryRoot = resolve(".tmp", "desktop-event-view-details");

test.beforeEach(async ({}, info) => {
  await mkdir(temporaryRoot, { recursive: true });
  directory = await mkdtemp(join(temporaryRoot, "case-"));
  errors = [];
  const state = createWorkspace();
  state.preferences.theme = info.title.includes("dark") ? "dark" : "light";
  state.preferences.autoExpandFilterMatches = false;
  state.tabs[0].filterPattern = "";
  state.tabs[0].view.inspectorInfoCollapsed = true;
  if (info.title.includes("multi-source"))
    state.tabs[0].sources.push({ logGroup: "/aws/lambda/payments-worker" });
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
        "Unexpected native dialog during hidden multi-selection verification",
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
          throw new Error("Multi-selection verification became visible");
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
    throw new Error("Unsafe multi-selection-test cleanup path");
  await rm(directory, {
    recursive: true,
    force: true,
    maxRetries: 10,
    retryDelay: 100,
  });
});

const inspector = () =>
  page.getByRole("region", { name: "Event inspector", exact: true });
const rows = () => page.locator(".virtual-event");
const viewer = () => page.locator(".viewer-scroll");

async function paintHiddenWindow() {
  await app!.evaluate(async ({ BrowserWindow }) => {
    const window = BrowserWindow.getAllWindows()[0];
    if (window.isVisible()) throw new Error("Verification became visible");
    await window.webContents.capturePage(undefined, {
      stayHidden: true,
      stayAwake: true,
    });
  });
}

type CopyProbe = typeof globalThis & { selectedMessageCopies: string[] };

async function capturedCopies() {
  return app!.evaluate(() =>
    (globalThis as CopyProbe).selectedMessageCopies.slice(),
  );
}

async function installClipboardProbe() {
  // Exercise the renderer, preload and validated main-process IPC handler while
  // replacing only the final OS clipboard write, preserving the user's clipboard.
  await app!.evaluate(({ clipboard }) => {
    (globalThis as CopyProbe).selectedMessageCopies = [];
    clipboard.writeText = async (text) => {
      (globalThis as CopyProbe).selectedMessageCopies.push(text);
    };
  });
}

test.beforeEach(async ({}, info) => {
  await installClipboardProbe();
  await app!.evaluate(({ ipcMain, BrowserWindow }, ordering) => {
    const win = BrowserWindow.getAllWindows()[0];
    win.setContentSize(1700, 1100);
    ipcMain.removeHandler("explorer:query");
    ipcMain.handle("explorer:query", (event, request) => {
      if (
        event.sender !== win.webContents ||
        request.connection.mode !== "offline"
      )
        throw new Error("Unexpected details request");
      const events = Array.from({ length: ordering ? 40 : 3 }, (_, index) => {
        const id = ordering ? index * 2 + (request.cursor ? 0 : 1) : index;
        return {
          id: `details-${id}`,
          timestamp: 1793620800000 + (ordering ? 80 - id : index) * 1000,
          logGroup:
            index % 2
              ? "/aws/lambda/payments-worker"
              : "/aws/lambda/orders-api",
          logStream: "fixture",
          message:
            index === 2
              ? "Alpha bravo charlie delta"
              : index === 1
                ? JSON.stringify({
                    level: "INFO",
                    msg: "Alpha bravo charlie delta",
                  })
                : JSON.stringify({
                    level: "INFO",
                    msg: "Alpha bravo charlie delta",
                    payload: { nested: { value: id } },
                  }),
        };
      });
      setImmediate(() =>
        event.sender.send("explorer:update", {
          requestId: request.requestId,
          state: "complete",
          events,
          replace: !request.cursor,
          cursor: ordering && !request.cursor ? "second" : undefined,
        }),
      );
    });
  }, info.title.includes("multi-source"));
  await page.getByTestId("run-query").click();
  await expect(
    page.locator(
      '.virtual-event[data-event-id="details-0"],.virtual-event[data-event-id="details-39"]',
    ),
  ).toBeVisible();
});

async function wordPoints() {
  await paintHiddenWindow();
  return rows()
    .first()
    .getByText("Alpha bravo charlie delta", { exact: true })
    .evaluate((element) => {
      const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
      const nodes: Text[] = [];
      while (walker.nextNode()) nodes.push(walker.currentNode as Text);
      (window as any).__detailsTextNode = nodes[0];
      const at = (offset: number) => {
        for (const node of nodes) {
          if (offset > node.length) {
            offset -= node.length;
            continue;
          }
          const range = document.createRange();
          range.setStart(node, offset);
          range.collapse(true);
          const rect = range.getBoundingClientRect();
          return { x: rect.x, y: rect.y + rect.height / 2 };
        }
        throw new Error("Missing message glyphs");
      };
      return { start: at(8), end: at(23) };
    });
}

for (const theme of ["light", "dark"]) {
  for (const mode of ["Table", "Hybrid"])
    test(`${theme} ${mode} double-click and word dragging preserve native selection while unfolding`, async () => {
      await page
        .locator("label")
        .filter({ hasText: new RegExp(`^${mode}$`) })
        .click();
      const first = rows().first();
      let points = await wordPoints();
      await page.mouse.dblclick(points.start.x, points.start.y);
      if (mode === "Hybrid")
        await expect(
          first.getByRole("region", {
            name: "Expanded event content",
            exact: true,
          }),
        ).toBeVisible();
      expect(
        (await page.evaluate(() => window.getSelection()?.toString()))?.trim(),
      ).toBe("bravo");
      expect(
        await page.evaluate(
          () => (window as any).__detailsTextNode.isConnected,
        ),
      ).toBe(true);
      if (mode === "Hybrid")
        await first
          .getByRole("button", { name: "Collapse event details", exact: true })
          .click();
      await page.evaluate(() => window.getSelection()?.removeAllRanges());
      points = await wordPoints();
      await page.mouse.move(points.start.x, points.start.y);
      await page.mouse.down({ clickCount: 1 });
      await page.mouse.up({ clickCount: 1 });
      await page.mouse.down({ clickCount: 2 });
      await page.mouse.move(points.end.x, points.end.y, { steps: 12 });
      await page.mouse.up({ clickCount: 2 });
      expect(
        (await page.evaluate(() => window.getSelection()?.toString()))?.trim(),
      ).toBe("bravo charlie delta");
      expect(
        await page.evaluate(
          () => (window as any).__detailsTextNode.isConnected,
        ),
      ).toBe(true);
    });

  test(`${theme} plain events and raw display retain the tab folding control`, async () => {
    await page
      .locator('.virtual-event[data-event-id="details-1"]')
      .locator(".inspect-cell")
      .first()
      .click();
    await expect(
      inspector().getByRole("button", {
        name: "Unfold structured object",
        exact: true,
      }),
    ).toHaveAttribute("aria-pressed", "false");
    const plain = page.locator('.virtual-event[data-event-id="details-2"]');
    await plain.locator(".inspect-cell").first().click();
    const control = () =>
      inspector().getByRole("button", {
        name: /^(Unfold|Fold) structured object$/,
      });
    await expect(control()).toBeVisible();
    await control().click();
    await expect(control()).toHaveAttribute("aria-pressed", "true");
    await page
      .locator('.virtual-event[data-event-id="details-0"]')
      .locator(".inspect-cell")
      .first()
      .click();
    await expect(
      inspector().getByRole("button", {
        name: "Collapse /payload/nested",
        exact: true,
      }),
    ).toBeVisible();
    await inspector()
      .locator("label")
      .filter({ hasText: /^Raw message$/ })
      .click();
    await expect(control()).toBeVisible();
    await control().click();
    await expect(control()).toHaveAttribute("aria-pressed", "false");
    await inspector()
      .locator("label")
      .filter({ hasText: /^Structured$/ })
      .click();
    await expect(
      inspector().getByRole("button", { name: "Expand /payload", exact: true }),
    ).toBeVisible();
    await plain.locator(".inspect-cell").first().click();
    await expect(control()).toHaveAttribute("aria-pressed", "false");
  });

  test(`${theme} calendar makes Today prominent and marks the current date through range selection`, async () => {
    await page.clock.setFixedTime(new Date("2026-11-02T12:00:00Z"));
    await page.getByRole("button", { name: "Time range", exact: true }).click();
    await page.getByRole("tab", { name: "Absolute", exact: true }).click();
    const today = page.getByRole("button", { name: "Today", exact: true });
    await today.click();
    expect(
      await today.evaluate((element) =>
        parseFloat(getComputedStyle(element).fontSize),
      ),
    ).toBeGreaterThanOrEqual(14);
    expect(
      await today.evaluate((element) =>
        Number(getComputedStyle(element).fontWeight),
      ),
    ).toBeGreaterThanOrEqual(600);
    const current = page.locator('[data-calendar-day="2026-11-02"]');
    await expect(current).toHaveAttribute("aria-current", "date");
    await page.locator('[data-calendar-day="2026-11-05"]').click();
    await page.locator('[data-calendar-day="2026-11-10"]').click();
    await expect(current).toHaveAttribute("aria-current", "date");
    await page.locator('[data-calendar-day="2026-11-01"]').click();
    await page.locator('[data-calendar-day="2026-11-04"]').click();
    await expect(current).toHaveClass(/is-in-range/);
    await expect(current).toHaveAttribute("aria-current", "date");
    await current.click();
    await expect(current).toHaveAttribute("aria-pressed", "true");
    expect(
      await current.evaluate(
        (element) => getComputedStyle(element, "::after").content,
      ),
    ).not.toBe("none");
    expect(
      await current.evaluate((element) =>
        parseFloat(getComputedStyle(element, "::after").width),
      ),
    ).toBeGreaterThanOrEqual(4);
  });

  test(`${theme} event-row copy actions share the same icon`, async () => {
    await rows()
      .first()
      .locator(".inspect-cell")
      .first()
      .click({ button: "right" });
    for (const name of [
      "Copy selected text",
      "Copy selected messages",
      "Copy selected records",
    ])
      await expect(
        page.getByRole("menuitem", { name, exact: true }).locator("svg"),
      ).toHaveClass(/tabler-icon-copy/);
  });
}

test("multi-source default order stays chronological through unordered pages without column sorting", async () => {
  const viewer = page.locator(".viewer-scroll");
  const timestamp = page.locator(
    '.log-header-cell[data-column-path="@timestamp"]',
  );
  await expect(viewer).toHaveAttribute("aria-rowcount", "40");
  await expect(timestamp).toHaveAttribute("aria-sort", "none");
  const copyTimes = async () => {
    await viewer.press("Control+a");
    await viewer.press("Control+Shift+c");
    await expect
      .poll(async () => (await capturedCopies()).length)
      .toBeGreaterThan(0);
    const copies = await capturedCopies();
    return copies
      .at(-1)!
      .split("\n")
      .map((line) => JSON.parse(line)["@timestamp"] as number);
  };
  const before = await copyTimes();
  expect(before).toHaveLength(40);
  expect(before).toEqual([...before].sort((a, b) => a - b));
  await viewer.evaluate((element) => {
    element.scrollTop = element.scrollHeight;
  });
  await expect(viewer).toHaveAttribute("aria-rowcount", "80");
  const after = await copyTimes();
  expect(after).toHaveLength(80);
  expect(after).toEqual([...after].sort((a, b) => a - b));
  for (
    let attempt = 0;
    attempt < 3 && (await timestamp.getAttribute("aria-sort")) !== "descending";
    attempt++
  )
    await timestamp.locator(".column-sort").click();
  await expect(timestamp).toHaveAttribute("aria-sort", "descending");
  const descending = await copyTimes();
  expect(descending).toEqual([...descending].sort((a, b) => b - a));
});
