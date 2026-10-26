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
const temporaryRoot = resolve(".tmp", "desktop-hybrid-details");
type ProbeWindow = Window & { inspectorUpdates: QueryUpdate[] };

test.beforeEach(async () => {
  await mkdir(temporaryRoot, { recursive: true });
  directory = await mkdtemp(join(temporaryRoot, "case-"));
  errors = [];
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

const eventRow = (id: string) =>
  page.locator(`.virtual-event[data-event-id="${id}"]`);
const inspector = () =>
  page.getByRole("region", { name: "Event inspector", exact: true });
async function mode(name: string) {
  await page
    .locator("label")
    .filter({ hasText: new RegExp(`^${name}$`) })
    .click();
}
async function fixtures() {
  await app!.evaluate(({ ipcMain }) => {
    ipcMain.removeHandler("explorer:query");
    ipcMain.handle("explorer:query", (event, request) => {
      const values = [
        { message: "wrong message", msg: "preferred msg" },
        { message: "fallback message", msg: "" },
        { message: "whitespace fallback", msg: "   " },
        { message: "non-string fallback", msg: null },
        { message: 42, msg: "string msg" },
        { message: "", msg: " " },
      ];
      const events = Array.from({ length: 50 }, (_, index) => ({
        id: "hybrid-" + index,
        timestamp: 1000 + index,
        logGroup: "/aws/lambda/orders-api",
        logStream: "hybrid-test",
        message:
          index === 2
            ? Array.from(
                { length: 100 },
                (_, i) => "stack trace line " + i,
              ).join("\n")
            : JSON.stringify({
                ...values[index % values.length],
                ...Object.fromEntries(
                  Array.from({ length: 70 }, (_, i) => [
                    "field" + i,
                    { nested: "value " + i },
                  ]),
                ),
              }),
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
  await expect(eventRow("hybrid-0")).toBeVisible();
}

test("Hybrid double click expands the row while Table double click still opens the inspector", async () => {
  await fixtures();
  await mode("Hybrid");
  await page
    .getByRole("button", { name: "Hide event inspector", exact: true })
    .click();
  const row = eventRow("hybrid-0");
  await row.locator(".inspect-cell").first().dblclick();
  await expect(row.locator(".hybrid-detail")).toBeVisible();
  await expect(inspector()).toHaveCount(0);
  await row.locator(".inspect-cell").first().dblclick();
  await expect(row.locator(".hybrid-detail")).toHaveCount(0);
  await mode("Table");
  await row.locator(".inspect-cell").first().dblclick();
  await expect(inspector()).toBeVisible();
});

test("expanding a second Hybrid row retains the first measured height and valid independent scroll areas", async () => {
  await fixtures();
  await mode("Hybrid");
  const first = eventRow("hybrid-0"),
    second = eventRow("hybrid-1");
  await first
    .getByRole("button", { name: "Expand event details", exact: true })
    .click();
  const tree = first.getByRole("region", {
    name: "Expanded event content",
    exact: true,
  });
  await tree.evaluate((e) => (e.scrollTop = 150));
  await expect.poll(() => tree.evaluate((e) => e.scrollTop)).toBeGreaterThan(0);
  const before = (await first.boundingBox())!;
  await second
    .getByRole("button", { name: "Expand event details", exact: true })
    .click();
  await expect(second.locator(".hybrid-detail")).toBeVisible();
  const after = (await first.boundingBox())!,
    next = (await second.boundingBox())!;
  await test.info().attach("expanded-row-geometry", {
    body: JSON.stringify({ before, after, next }),
    contentType: "application/json",
  });
  expect(after.height).toBeCloseTo(before.height, 0);
  expect(next.y).toBeGreaterThanOrEqual(after.y + after.height - 1);
  await expect.poll(() => tree.evaluate((e) => e.scrollTop)).toBe(150);
  const secondContent = second.getByRole("region", {
    name: "Expanded event content",
    exact: true,
  });
  await secondContent.hover({ position: { x: 100, y: 100 } });
  await page.mouse.wheel(0, 180);
  await expect
    .poll(() => secondContent.evaluate((e) => e.scrollTop))
    .toBeGreaterThan(0);
  expect(await tree.evaluate((e) => e.scrollTop)).toBe(150);
});

test("Hybrid detail resizing stays independent, survives folding and virtualization, and shares one scroll area for raw messages", async () => {
  await fixtures();
  await mode("Hybrid");
  const first = eventRow("hybrid-0");
  await first
    .getByRole("button", { name: "Expand event details", exact: true })
    .click();
  const content = first.getByRole("region", {
    name: "Expanded event content",
    exact: true,
  });
  const handle = first.getByRole("separator", {
    name: "Resize expanded event",
    exact: true,
  });
  const second = eventRow("hybrid-1");
  await second
    .getByRole("button", { name: "Expand event details", exact: true })
    .click();
  const secondContent = second.getByRole("region", {
    name: "Expanded event content",
    exact: true,
  });
  const otherHeight = (await secondContent.boundingBox())!.height;
  const before = (await content.boundingBox())!;
  const area = (await first.locator(".hybrid-detail").boundingBox())!;
  const grip = (await handle.boundingBox())!;
  expect(grip.y + grip.height / 2).toBeCloseTo(area.y + area.height - 0.5, 0);
  await page.mouse.move(grip.x + 80, grip.y + grip.height / 2);
  await test.info().attach("resize-pointer-hit", {
    body: JSON.stringify(
      await page.evaluate(
        ({ x, y }) => ({
          hit: document.elementFromPoint(x, y)?.outerHTML,
          cursor: getComputedStyle(document.elementFromPoint(x, y)!).cursor,
        }),
        { x: grip.x + 80, y: grip.y + grip.height / 2 },
      ),
    ),
    contentType: "application/json",
  });
  await page.mouse.down();
  await test.info().attach("resize-pointer-down", {
    body: JSON.stringify(
      await first.locator(".hybrid-detail").evaluate((e) => ({
        classes: e.className,
        cursor: document.documentElement.style.cursor,
      })),
    ),
    contentType: "application/json",
  });
  await page.mouse.move(grip.x + 80, grip.y + grip.height / 2 + 100, {
    steps: 5,
  });
  await expect
    .poll(async () => (await content.boundingBox())!.height)
    .toBeCloseTo(before.height + 100, 0);
  await page.mouse.up();
  expect(await page.evaluate(() => getSelection()?.toString())).toBe("");
  const chosen = (await content.boundingBox())!.height;
  expect((await secondContent.boundingBox())!.height).toBeCloseTo(
    otherHeight,
    0,
  );
  await first
    .getByRole("button", { name: "Collapse event details", exact: true })
    .click();
  await first
    .getByRole("button", { name: "Expand event details", exact: true })
    .click();
  expect((await content.boundingBox())!.height).toBeCloseTo(chosen, 0);
  await page.locator(".viewer-scroll").press("End");
  await expect(first).toHaveCount(0);
  await page.locator(".viewer-scroll").press("Home");
  await expect(first).toBeVisible();
  expect((await content.boundingBox())!.height).toBeCloseTo(chosen, 0);
  const raw = eventRow("hybrid-2");
  await raw
    .getByRole("button", { name: "Expand event details", exact: true })
    .click();
  const rawContent = raw.getByRole("region", {
    name: "Expanded event content",
    exact: true,
  });
  await rawContent.hover({ position: { x: 100, y: 100 } });
  await page.mouse.wheel(0, 200);
  await expect
    .poll(() => rawContent.evaluate((e) => e.scrollTop))
    .toBeGreaterThan(0);
  expect(
    await raw.locator(".raw-content").evaluate((e) => ({
      overflow: getComputedStyle(e).overflowY,
      clipped: e.scrollHeight > e.clientHeight,
    })),
  ).toEqual({ overflow: "visible", clipped: false });
  await rawContent.evaluate((e) => (e.scrollTop = 0));
  await raw
    .locator(".raw-content pre")
    .dblclick({ position: { x: 100, y: 10 } });
  await expect(rawContent).toBeVisible();
  const image = await app!.evaluate(async ({ BrowserWindow }) => {
    const window = BrowserWindow.getAllWindows()[0];
    if (window.isVisible()) throw new Error("Verification became visible");
    return (
      await window.webContents.capturePage(undefined, {
        stayHidden: true,
        stayAwake: true,
      })
    )
      .toPNG()
      .toString("base64");
  });
  await test.info().attach("hybrid-resizable-details.png", {
    body: Buffer.from(image, "base64"),
    contentType: "image/png",
  });
});

test("message preview prefers non-empty msg then message in both Table and Hybrid", async () => {
  await fixtures();
  for (const layout of ["Table", "Hybrid"]) {
    await mode(layout);
    for (const [index, text] of [
      [0, "preferred msg"],
      [1, "fallback message"],
      [3, "non-string fallback"],
      [4, "string msg"],
    ] as const) {
      await expect(
        eventRow("hybrid-" + index)
          .getByRole("cell")
          .last(),
      ).toHaveText(text);
    }
  }
});
