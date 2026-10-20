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

const fields = [
  "@timestamp",
  "/request/id",
  "@level",
  "/request/durationMs",
  "/items",
  "/items/1/metadata/enabled",
  "/missing",
  "@message",
];
async function selectPair() {
  const messages = await rawMessages(4);
  const timestamps = await rows().evaluateAll((elements) =>
    elements
      .slice(0, 4)
      .map((element) =>
        Date.parse(
          element
            .querySelector(".event-timestamp")!
            .textContent!.replace(" UTC", "Z")
            .replace(" ", "T"),
        ),
      ),
  );
  await rows().nth(1).locator(".inspect-cell").first().click();
  await rows()
    .nth(3)
    .locator(".inspect-cell")
    .first()
    .click({ modifiers: ["Control"] });
  await expect(
    page.locator('.virtual-event[data-selected="true"]'),
  ).toHaveCount(2);
  return { messages, timestamps };
}
function recordsOf(text: string) {
  return text.split("\n").map((line) => JSON.parse(line));
}
function expected(message: string, timestamp: number) {
  const value = JSON.parse(message);
  return {
    "@timestamp": timestamp,
    "/request/id": value.request.id,
    "@level": value.level.toLowerCase(),
    "/request/durationMs": value.request.durationMs,
    "/items": value.items,
    "/items/1/metadata/enabled": true,
    "/missing": null,
    "@message": message,
  };
}
for (const mode of ["Table", "Hybrid", "JSON"])
  test(`${mode} toolbar copies typed selected records with visible pinned-column order and preserves one-click messages`, async () => {
    await installClipboardProbe();
    const { messages, timestamps } = await selectPair();
    await page
      .locator("label")
      .filter({ hasText: new RegExp(`^${mode}$`) })
      .click();
    await page
      .getByRole("button", { name: "Copy selected events as", exact: true })
      .click();
    await page
      .getByRole("menuitem", { name: /^Copy selected records(?:\s|$)/ })
      .click();
    await expect.poll(async () => (await capturedCopies()).length).toBe(1);
    const copied = recordsOf((await capturedCopies())[0]);
    expect(copied).toEqual([
      expected(messages[1], timestamps[1]),
      expected(messages[3], timestamps[3]),
    ]);
    expect(Object.keys(copied[0])).toEqual(fields);
    expect(copied[0]).not.toHaveProperty("@logGroup");
    await page
      .getByRole("button", { name: "Copy selected messages", exact: true })
      .click();
    await expect
      .poll(async () => (await capturedCopies())[1])
      .toBe(messages[1] + "\n" + messages[3]);
  });

test("context records preserve multi-selection and copying follows changed sort order", async () => {
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
  const { messages, timestamps } = await selectPair();
  await rows()
    .nth(1)
    .locator(".inspect-cell")
    .first()
    .click({ button: "right" });
  await page
    .getByRole("menuitem", { name: /^Copy selected records(?:\s|$)/ })
    .click();
  await expect.poll(async () => (await capturedCopies()).length).toBe(1);
  expect(recordsOf((await capturedCopies())[0])).toEqual([
    expected(messages[1], timestamps[1]),
    expected(messages[3], timestamps[3]),
  ]);
  for (
    let count = 0;
    count < 3 && (await timestamp.getAttribute("aria-sort")) !== "descending";
    count++
  )
    await timestamp.locator(".column-sort").click();
  await viewer().press("Control+Shift+c");
  await expect.poll(async () => (await capturedCopies()).length).toBe(2);
  expect(recordsOf((await capturedCopies())[1])).toEqual([
    expected(messages[3], timestamps[3]),
    expected(messages[1], timestamps[1]),
  ]);
});

test("record shortcut respects text input and disabled empty selection", async () => {
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
  expect(recordsOf((await capturedCopies())[0])).toHaveLength(2);
  await search.fill("no-such-copy-record-event");
  await expect(viewer()).toHaveAttribute("aria-rowcount", "0");
  await expect(
    page.getByRole("button", { name: "Copy selected events as", exact: true }),
  ).toBeDisabled();
  await viewer().press("Control+Shift+c");
  expect(await capturedCopies()).toHaveLength(1);
});

for (const theme of ["light", "dark"])
  test(`${theme} multiline Hybrid messages keep one-line row height while details, inspector and copies retain the full message`, async () => {
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
    for (const wrap of [false, true]) {
      const toggle = page.getByRole("button", {
        name: "Toggle line wrap",
        exact: true,
      });
      if ((await toggle.getAttribute("aria-pressed")) !== String(wrap))
        await toggle.click();
      expect(
        Math.abs((await primary.boundingBox())!.height - normalHeight),
      ).toBeLessThanOrEqual(0.5);
    }
    await primary.locator(".inspect-cell").first().click();
    const message =
      "ERROR Request failed\nTypeError: Cannot read properties of undefined\n    at processOrder (src/orders.ts:142:18)\n    at async handler (src/handler.ts:31:5)";
    await viewer().press("Control+c");
    await expect.poll(async () => (await capturedCopies())[0]).toBe(message);
    await viewer().press("Control+Shift+c");
    await expect.poll(async () => (await capturedCopies()).length).toBe(2);
    expect(recordsOf((await capturedCopies())[1])).toHaveLength(1);
    expect(recordsOf((await capturedCopies())[1])[0]["@message"]).toBe(message);
    await first
      .getByRole("button", { name: "Expand event details", exact: true })
      .click();
    await expect(first.locator(".event-message-details")).toContainText(
      "at async handler",
    );
    expect(
      Math.abs((await primary.boundingBox())!.height - normalHeight),
    ).toBeLessThanOrEqual(0.5);
    await inspector()
      .locator("label")
      .filter({ hasText: /^Raw message$/ })
      .click();
    await expect(inspector().locator(".raw-content pre")).toHaveText(message);
  });
