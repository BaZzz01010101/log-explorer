import {
  copiedRows,
  copiedMessage,
  copiedMessages,
  messagePayloads,
} from "./copied-rows";
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
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join, resolve, sep } from "node:path";

test.setTimeout(150000);
test.describe.configure({ mode: "parallel" });
let app: ElectronApplication | undefined;
let child: ReturnType<ElectronApplication["process"]> | undefined;
let page: Page;
let directory: string;
let errors: string[];
const temporaryRoot = resolve(".tmp", "desktop-event-copy-records");

test.beforeEach(async ({}, testInfo) => {
  await mkdir(temporaryRoot, { recursive: true });
  directory = await mkdtemp(join(temporaryRoot, "case-"));
  errors = [];
  const state = createWorkspace();
  state.preferences.theme = testInfo.title.includes("light") ? "light" : "dark";
  state.preferences.timezone = "utc";
  state.tabs[0].filterPattern = "";
  if (testInfo.title.includes("multi-source copy"))
    state.tabs[0].sources.push({ logGroup: "/aws/lambda/payments-worker" });
  state.tabs[0].view.columns = [
    { path: "@timestamp", width: 210, pinned: true },
    { path: "@level", width: 84 },
    { path: "/request/id", width: 170, pinned: true },
    { path: "/request/durationMs", width: 140, format: "milliseconds" },
    { path: "/items", width: 190, format: "json" },
    { path: "/items/1/metadata/enabled", width: 110 },
    { path: "/missing", width: 100 },
    { path: "@message", width: 380 },
    { path: "@logGroup", width: 220, hidden: true },
  ];
  if (testInfo.title.includes("Hybrid wrapping"))
    state.tabs[0].view.columns.find(
      (column) => column.path === "@message",
    )!.width = 220;
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
        "Unexpected native dialog during hidden copy-records verification",
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
          throw new Error("Copy-records verification became visible");
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
    throw new Error("Unsafe copy-records-test cleanup path");
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

async function rawMessages(count: number) {
  await inspector()
    .locator("label")
    .filter({ hasText: /^Raw message$/ })
    .click();
  const messages: string[] = [];
  for (let index = 0; index < count; index++) {
    const row = rows().nth(index);
    const id = (await row.getAttribute("data-event-id"))!;
    await row.locator(".inspect-cell").first().click();
    await expect(inspector()).toHaveAttribute("data-event-id", id);
    messages.push(
      (await inspector().locator(".raw-content pre").textContent())!,
    );
  }
  return messages;
}

async function selectPair() {
  const messages = await rawMessages(4);
  await rows().nth(1).locator(".inspect-cell").first().click();
  await rows()
    .nth(3)
    .locator(".inspect-cell")
    .first()
    .click({ modifiers: ["Control"] });
  await expect(
    page.locator('.virtual-event[data-selected="true"]'),
  ).toHaveCount(2);
  const cells = await rows().evaluateAll((elements) =>
    [elements[1], elements[3]].map((row) =>
      Array.from(row.querySelectorAll<HTMLElement>(".log-cell")).map((cell) =>
        cell.innerText === "—"
          ? ""
          : cell.innerText.replace(/[\t\r\n]+/g, " ").trim(),
      ),
    ),
  );
  return { messages, cells };
}

for (const mode of ["Table", "Hybrid", "JSON"])
  test(`${mode} context copy uses message values and only tabular modes expose row copying`, async () => {
    await installClipboardProbe();
    const { messages, cells } = await selectPair();
    await page
      .locator("label")
      .filter({ hasText: new RegExp(`^${mode}$`) })
      .click();
    const open = async () =>
      rows()
        .nth(1)
        .locator(".inspect-cell, .json-card-meta")
        .first()
        .click({ button: "right" });
    await open();
    await expect(
      page.getByRole("menuitem", { name: "Copy selected text", exact: true }),
    ).toBeDisabled();
    const copyRows = page.getByRole("menuitem", {
      name: "Copy selected rows",
      exact: true,
    });
    if (mode === "JSON") {
      await expect(copyRows).toHaveCount(0);
      await page.keyboard.press("Escape");
      await viewer().press("Control+Shift+c");
      expect(await capturedCopies()).toEqual([]);
      await open();
    } else {
      await expect(copyRows).toBeEnabled();
      await copyRows.click();
      await expect.poll(async () => (await capturedCopies()).length).toBe(1);
      expect(copiedRows((await capturedCopies())[0])).toEqual(cells);
      const output = (await capturedCopies())[0].split("\n");
      const titles = await page
        .locator(".log-header-cell .column-sort")
        .allTextContents();
      expect(output[0].split(" | ").map((cell) => cell.trim())).toEqual(
        titles.map((title) => title.trim()),
      );
      expect(output[1]).toMatch(/^[+-]+$/);
      expect(output[1].length).toBe(output[0].length);
      expect(new Set(output.map((line) => line.length)).size).toBe(1);
      await expect(page.getByRole("menu")).toHaveCount(0);
      await open();
    }
    await page
      .getByRole("menuitem", { name: "Copy selected messages", exact: true })
      .click();
    const count = mode === "JSON" ? 1 : 2;
    await expect.poll(async () => (await capturedCopies()).length).toBe(count);
    expect(messagePayloads((await capturedCopies()).at(-1)!)).toBe(
      [messages[1], messages[3]].map(copiedMessage).join("\n"),
    );
    await viewer().press("Control+c");
    await expect
      .poll(async () => (await capturedCopies()).length)
      .toBe(count + 1);
    expect(messagePayloads((await capturedCopies()).at(-1)!)).toBe(
      [messages[1], messages[3]].map(copiedMessage).join("\n"),
    );
  });

test("row copying preserves multiple selection and follows changed sort order", async () => {
  await installClipboardProbe();
  const timestamp = page.locator(
    '.log-header-cell[data-column-path="@timestamp"]',
  );
  for (
    let count = 0;
    count < 3 && (await timestamp.getAttribute("aria-sort")) !== "ascending";
    count++
  )
    await timestamp.locator(".column-sort").click();
  const { cells } = await selectPair();
  await rows()
    .nth(1)
    .locator(".inspect-cell")
    .first()
    .click({ button: "right" });
  await page
    .getByRole("menuitem", { name: "Copy selected rows", exact: true })
    .click();
  await expect.poll(async () => (await capturedCopies()).length).toBe(1);
  expect(copiedRows((await capturedCopies())[0])).toEqual(cells);
  for (
    let count = 0;
    count < 3 && (await timestamp.getAttribute("aria-sort")) !== "descending";
    count++
  )
    await timestamp.locator(".column-sort").click();
  await viewer().press("Control+Shift+c");
  await expect.poll(async () => (await capturedCopies()).length).toBe(2);
  expect(copiedRows((await capturedCopies())[1])).toEqual([...cells].reverse());
});

test("row shortcut respects edit controls and an empty selection", async () => {
  await installClipboardProbe();
  await selectPair();
  const search = page.getByRole("textbox", {
    name: "Local filter loaded events",
    exact: true,
  });
  await search.focus();
  expect(
    await search.evaluate((element) => {
      const event = new KeyboardEvent("keydown", {
        key: "c",
        ctrlKey: true,
        shiftKey: true,
        bubbles: true,
        cancelable: true,
      });
      element.dispatchEvent(event);
      return event.defaultPrevented;
    }),
  ).toBe(false);
  expect(await capturedCopies()).toEqual([]);
  await viewer().press("Control+Shift+c");
  await expect.poll(async () => (await capturedCopies()).length).toBe(1);
  expect(copiedRows((await capturedCopies())[0])).toHaveLength(2);
  await search.fill("no-such-copy-record-event");
  await expect(viewer()).toHaveAttribute("aria-rowcount", "0");
  await viewer().press("Control+Shift+c");
  expect(await capturedCopies()).toHaveLength(1);
});

test("mixed events copy complete message and cell values with tabs, quotes and line breaks", async () => {
  await installClipboardProbe();
  const preferred = 'preferred\t"message"\n' + "full value ".repeat(180);
  const fallback = "fallback\r\nmessage";
  const plain = 'plain\t"event"\nsecond line';
  const payloads = [
    JSON.stringify({
      msg: preferred,
      message: "other",
      request: { id: 'a\t"b"', durationMs: 42 },
    }),
    JSON.stringify({ msg: " ", message: fallback }),
    plain,
  ];
  await app!.evaluate(({ ipcMain }, messages) => {
    ipcMain.removeHandler("explorer:query");
    ipcMain.handle("explorer:query", (event, request) => {
      setImmediate(() =>
        event.sender.send("explorer:update", {
          requestId: request.requestId,
          state: "complete",
          replace: true,
          events: messages.map((message, index) => ({
            id: `copy-special-${index}`,
            timestamp: 1700000000000 + index * 1000,
            logGroup: "/aws/lambda/orders-api",
            logStream: "copy-special-stream",
            message,
          })),
        }),
      );
    });
  }, payloads);
  await page.getByTestId("run-query").click();
  await expect(viewer()).toHaveAttribute("aria-rowcount", "3");
  await rows().first().locator(".inspect-cell").first().click();
  await viewer().press("Control+a");
  await viewer().press("Control+c");
  await expect
    .poll(async () =>
      copiedMessages((await capturedCopies())[0] ?? "").map(
        (record) => record.message,
      ),
    )
    .toEqual(payloads.map((raw) => JSON.parse(copiedMessage(raw))));
  const records = copiedMessages((await capturedCopies())[0]);
  expect(records.map((record) => Object.keys(record))).toEqual(
    payloads.map(() => ["timestamp", "level", "message"]),
  );
  expect(records[0].timestamp).toBe("2023-11-14T22:13:20.000Z");
  expect(records[0].level).toBe("UNKNOWN");
  await viewer().press("Control+Shift+c");
  await expect.poll(async () => (await capturedCopies()).length).toBe(2);
  const cells = copiedRows((await capturedCopies())[1]);
  const paths = await page
    .locator(".log-header-cell")
    .evaluateAll((elements) =>
      elements.map((element) => element.getAttribute("data-column-path")),
    );
  expect(cells.map((row) => row[paths.indexOf("@message")])).toEqual([
    preferred.replace(/[\t\r\n]+/g, " ").trim(),
    "fallback message",
    'plain "event" second line',
  ]);
  expect(cells[0][paths.indexOf("/request/id")]).toBe('a "b"');
  expect(cells[0][paths.indexOf("/request/durationMs")]).toBe("42 ms");
  expect(cells.every((row) => row.length === paths.length)).toBe(true);
  const lines = (await capturedCopies())[1].split("\n");
  expect(lines).toHaveLength(5);
  expect(new Set(lines.map((line) => line.length)).size).toBe(1);
  expect(
    lines
      .filter((_, index) => index !== 1)
      .map((line) => [...line.matchAll(/ \| /g)].map((match) => match.index)),
  ).toEqual(
    Array.from({ length: 4 }, () =>
      [...lines[0].matchAll(/ \| /g)].map((match) => match.index),
    ),
  );
});

test("multi-source copy messages retains all payload fields and readable sources without inspector metadata", async () => {
  await installClipboardProbe();
  await app!.evaluate(({ ipcMain }) => {
    ipcMain.removeHandler("explorer:query");
    ipcMain.handle("explorer:query", (event, request) => {
      setImmediate(() =>
        event.sender.send("explorer:update", {
          requestId: request.requestId,
          state: "complete",
          replace: true,
          events: [
            {
              id: "multi-copy-0",
              timestamp: 1700000000000,
              ingestionTime: 1700000000099,
              logGroup: "/aws/lambda/orders-api",
              logStream: "private-stream",
              message: JSON.stringify({
                level: "INFO",
                msg: "visible",
                request: { id: 7 },
                extra: "retain",
              }),
            },
            {
              id: "multi-copy-1",
              timestamp: 1700000001000,
              ingestionTime: 1700000001099,
              logGroup: "/aws/lambda/payments-worker",
              logStream: "private-stream",
              message: "ERROR payment failed\n",
            },
          ],
        }),
      );
    });
  });
  await page.getByTestId("run-query").click();
  await expect(viewer()).toHaveAttribute("aria-rowcount", "2");
  await rows().first().locator(".inspect-cell").first().click();
  await viewer().press("Control+a");
  await viewer().press("Control+c");
  await expect
    .poll(async () => copiedMessages((await capturedCopies())[0] ?? ""))
    .toEqual([
      {
        timestamp: "2023-11-14T22:13:20.000Z",
        level: "INFO",
        source: "orders-api",
        message: {
          level: "INFO",
          msg: "visible",
          request: { id: 7 },
          extra: "retain",
        },
      },
      {
        timestamp: "2023-11-14T22:13:21.000Z",
        level: "ERROR",
        source: "payments-worker",
        message: "ERROR payment failed\n",
      },
    ]);
  await viewer().press("Control+Shift+c");
  await expect.poll(async () => (await capturedCopies()).length).toBe(2);
  const table = (await capturedCopies())[1];
  expect(table.split("\n")).toHaveLength(4);
  expect(table).toContain("orders-api");
  expect(table).toContain("payments-worker");
  expect(table).not.toContain('"ERROR payment failed');
});

for (const theme of ["light", "dark"])
  test(`${theme} Hybrid wrapping preserves newlines, virtual row geometry, independent inspector wrapping and full copies`, async () => {
    await installClipboardProbe();
    await page
      .locator("label")
      .filter({ hasText: /^Hybrid$/ })
      .click();
    const normalHeight = (await rows()
      .nth(1)
      .locator(".log-table-row")
      .boundingBox())!.height;
    const search = page.getByRole("textbox", {
      name: "Local filter loaded events",
      exact: true,
    });
    await search.fill("ERROR Request failed");
    await expect
      .poll(() =>
        rows().evaluateAll(
          (elements) =>
            elements.length > 0 &&
            elements.every((element) =>
              element.textContent?.includes("ERROR Request failed"),
            ),
        ),
      )
      .toBe(true);
    const first = rows().first(),
      primary = first.locator(".log-table-row");
    let wrappedHeight = normalHeight;
    for (const wrap of [false, true]) {
      const toggle = page.getByRole("button", {
        name: "Toggle line wrap",
        exact: true,
      });
      if ((await toggle.getAttribute("aria-pressed")) !== String(wrap))
        await toggle.click();
      await expect(toggle).toHaveAttribute("aria-pressed", String(wrap));
      const cell = primary
        .locator('[role="cell"]')
        .last()
        .locator(".inspect-cell");
      await expect
        .poll(() =>
          cell.evaluate((element) => getComputedStyle(element).whiteSpace),
        )
        .toBe(wrap ? "pre-wrap" : "nowrap");
      const height = (await primary.boundingBox())!.height;
      if (wrap) {
        expect(height).toBeGreaterThan(normalHeight + 20);
        const fragments = await cell.evaluate((element) => {
          const range = document.createRange();
          range.selectNodeContents(element);
          return [...range.getClientRects()]
            .filter((rect) => rect.width > 0)
            .map((rect) => ({ width: rect.width, top: rect.top }));
        });
        // The stack trace has four explicit lines; the long TypeError also
        // needs a soft break within the configured message column.
        expect(
          new Set(fragments.map((rect) => Math.round(rect.top))).size,
        ).toBeGreaterThan(4);
        expect(
          Math.max(...fragments.map((rect) => rect.width)),
        ).toBeLessThanOrEqual((await cell.boundingBox())!.width + 1);
        wrappedHeight = height;
      } else expect(Math.abs(height - normalHeight)).toBeLessThanOrEqual(0.5);
      const current = (await first.boundingBox())!;
      const next = (await rows().nth(1).boundingBox())!;
      expect(next.y).toBeGreaterThanOrEqual(current.y + current.height - 1);
    }
    await primary.locator(".inspect-cell").first().click();
    const message =
      "ERROR Request failed\nTypeError: Cannot read properties of undefined\n    at processOrder (src/orders.ts:142:18)\n    at async handler (src/handler.ts:31:5)";
    await viewer().press("Control+c");
    await expect
      .poll(
        async () =>
          copiedMessages((await capturedCopies())[0] ?? "")[0]?.message,
      )
      .toBe(message);
    await viewer().press("Control+Shift+c");
    await expect.poll(async () => (await capturedCopies()).length).toBe(2);
    expect(copiedRows((await capturedCopies())[1])).toHaveLength(1);
    expect(copiedRows((await capturedCopies())[1])[0].at(-1)).toBe(
      message.replaceAll("\n", " "),
    );
    await first
      .getByRole("button", { name: "Expand event details", exact: true })
      .click();
    await expect(first.locator(".event-message-details")).toContainText(
      "at async handler",
    );
    expect(
      Math.abs((await primary.boundingBox())!.height - wrappedHeight),
    ).toBeLessThanOrEqual(0.5);
    await inspector()
      .locator("label")
      .filter({ hasText: /^Raw message$/ })
      .click();
    await expect(inspector().locator(".raw-content pre")).toHaveText(message);
    const inspectorWrap = inspector().getByRole("button", {
      name: "Toggle inspector line wrap",
      exact: true,
    });
    await expect(inspectorWrap).toHaveAttribute("aria-pressed", "true");
    await inspectorWrap.click();
    await expect(inspector().locator(".raw-content pre")).toHaveCSS(
      "white-space",
      "pre",
    );
    await expect(
      page.getByRole("button", { name: "Toggle line wrap", exact: true }),
    ).toHaveAttribute("aria-pressed", "true");
    const details = first.getByRole("region", {
      name: "Expanded event content",
      exact: true,
    });
    const detailHeight = (await details.boundingBox())!.height;
    await page
      .getByRole("button", { name: "Toggle line wrap", exact: true })
      .click();
    await expect(inspectorWrap).toHaveAttribute("aria-pressed", "false");
    await inspectorWrap.click();
    await expect(inspector().locator(".raw-content pre")).toHaveCSS(
      "white-space",
      "pre-wrap",
    );
    expect((await details.boundingBox())!.height).toBeCloseTo(detailHeight, 0);
    await expect(
      page.getByRole("button", { name: "Toggle line wrap", exact: true }),
    ).toHaveAttribute("aria-pressed", "false");
    await page
      .getByRole("button", { name: "Toggle line wrap", exact: true })
      .click();
    await inspectorWrap.click();
    await expect
      .poll(async () => {
        const saved = JSON.parse(
          await readFile(join(directory, "workspace.json"), "utf8"),
        );
        return {
          wrap: saved.tabs[0].view.wrap,
          inspectorWrap: saved.tabs[0].view.inspectorWrap,
        };
      })
      .toEqual({ wrap: true, inspectorWrap: false });
    await page.reload();
    await expect(
      page.getByRole("button", { name: "Toggle line wrap", exact: true }),
    ).toHaveAttribute("aria-pressed", "true");
    await rows().first().locator(".inspect-cell").first().click();
    await expect(
      inspector().getByRole("button", {
        name: "Toggle inspector line wrap",
        exact: true,
      }),
    ).toHaveAttribute("aria-pressed", "false");
  });
