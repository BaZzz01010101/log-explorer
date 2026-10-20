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
const temporaryRoot = resolve(".tmp", "desktop-event-multi-selection");

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

test("modifier clicks select multiple rows and copy raw messages in displayed order through native IPC", async () => {
  await installClipboardProbe();
  const timestamp = page.locator(
    '.log-header-cell[data-column-path="@timestamp"]',
  );
  for (
    let attempt = 0;
    attempt < 3 && (await timestamp.getAttribute("aria-sort")) !== "ascending";
    attempt++
  )
    await timestamp.locator(".column-sort").click();
  await expect(timestamp).toHaveAttribute("aria-sort", "ascending");
  const messages = await rawMessages(5);
  await rows().nth(1).locator(".inspect-cell").first().click();
  await rows()
    .nth(3)
    .locator(".inspect-cell")
    .first()
    .click({ modifiers: ["Control"] });
  await expect(
    page.locator('.virtual-event[data-selected="true"]'),
  ).toHaveCount(2);
  await expect(rows().nth(1)).toHaveAttribute("aria-selected", "true");
  await expect(rows().nth(3)).toHaveAttribute("aria-selected", "true");
  await expect(inspector()).toHaveAttribute(
    "data-event-id",
    (await rows().nth(3).getAttribute("data-event-id"))!,
  );
  await viewer().press("Control+c");
  await expect.poll(capturedCopies).toEqual([messages[1] + "\n" + messages[3]]);
  await rows()
    .nth(4)
    .locator(".inspect-cell")
    .first()
    .click({ modifiers: ["Shift"] });
  await expect(
    page.locator('.virtual-event[data-selected="true"]'),
  ).toHaveCount(2);
  await page
    .getByRole("button", { name: "Copy selected messages", exact: true })
    .click();
  await expect
    .poll(capturedCopies)
    .toEqual([
      messages[1] + "\n" + messages[3],
      messages[3] + "\n" + messages[4],
    ]);
  for (
    let attempt = 0;
    attempt < 3 && (await timestamp.getAttribute("aria-sort")) !== "descending";
    attempt++
  )
    await timestamp.locator(".column-sort").click();
  await expect(timestamp).toHaveAttribute("aria-sort", "descending");
  await page
    .getByRole("button", { name: "Copy selected messages", exact: true })
    .click();
  await expect
    .poll(capturedCopies)
    .toEqual([
      messages[1] + "\n" + messages[3],
      messages[3] + "\n" + messages[4],
      messages[4] + "\n" + messages[3],
    ]);
});

test("context copy preserves multiple selected rows and opens at the pointer", async () => {
  await installClipboardProbe();
  const messages = await rawMessages(4);
  await rows().nth(1).locator(".inspect-cell").first().click();
  await rows()
    .nth(3)
    .locator(".inspect-cell")
    .first()
    .click({ modifiers: ["Meta"] });
  const target = rows().nth(1).locator(".inspect-cell").first();
  const bounds = (await target.boundingBox())!;
  await target.click({ button: "right", position: { x: 24, y: 12 } });
  const copy = page.getByRole("menuitem", {
    name: "Copy selected messages",
    exact: true,
  });
  await expect(copy).toBeVisible();
  const menu = (await copy.boundingBox())!;
  expect(Math.abs(menu.x - (bounds.x + 24))).toBeLessThan(24);
  expect(Math.abs(menu.y - (bounds.y + 12))).toBeLessThan(40);
  await expect(
    page.locator('.virtual-event[data-selected="true"]'),
  ).toHaveCount(2);
  await copy.click();
  await expect.poll(capturedCopies).toEqual([messages[1] + "\n" + messages[3]]);
});

test("keyboard ranges and select-all stay scoped to displayed filtered events without stealing text copy", async () => {
  await installClipboardProbe();
  await rows().nth(1).locator(".inspect-cell").first().click();
  await viewer().press("Shift+ArrowDown");
  await viewer().press("Shift+ArrowDown");
  await expect(
    page.locator('.virtual-event[data-selected="true"]'),
  ).toHaveCount(3);
  const filter = page.getByRole("textbox", {
    name: "Local filter loaded events",
    exact: true,
  });
  await filter.fill("Unexpected upstream response");
  await expect(filter).toHaveValue("Unexpected upstream response");
  await expect.poll(() => viewer().getAttribute("aria-rowcount")).not.toBe("0");
  await expect
    .poll(() =>
      rows().evaluateAll(
        (elements) =>
          elements.length > 0 &&
          elements.every((element) =>
            element.textContent?.includes("Unexpected upstream response"),
          ),
      ),
    )
    .toBe(true);
  await filter.press("Control+a");
  expect(
    await filter.evaluate((element) => {
      const event = new KeyboardEvent("keydown", {
        key: "c",
        ctrlKey: true,
        bubbles: true,
        cancelable: true,
      });
      element.dispatchEvent(event);
      return event.defaultPrevented;
    }),
  ).toBe(false);
  expect(await capturedCopies()).toEqual([]);
  const firstId = (await rows().first().getAttribute("data-event-id"))!;
  await viewer().press("Control+a");
  expect(await page.evaluate(() => window.getSelection()?.toString())).toBe("");
  const count = Number(await viewer().getAttribute("aria-rowcount"));
  await expect(
    page.getByRole("button", { name: "Copy selected messages", exact: true }),
  ).toContainText(`${count} selected`);
  await viewer().press("Control+c");
  await expect
    .poll(capturedCopies)
    .toEqual([
      Array.from(
        { length: count },
        () => "Unexpected upstream response: { invalid JSON",
      ).join("\n"),
    ]);
  await viewer().press("End");
  await expect(
    page.locator('.virtual-event[data-current="true"]'),
  ).toBeInViewport();
  await expect(
    page.locator('.virtual-event[data-selected="true"]'),
  ).toHaveCount(1);
  await viewer().press("Home");
  await expect(inspector()).toHaveAttribute("data-event-id", firstId);
  await inspector()
    .locator("label")
    .filter({ hasText: /^Raw message$/ })
    .click();
  await inspector()
    .locator(".raw-content pre")
    .evaluate((element) => {
      const range = document.createRange();
      range.selectNodeContents(element);
      window.getSelection()!.removeAllRanges();
      window.getSelection()!.addRange(range);
    });
  expect(
    await viewer().evaluate((element) => {
      const event = new KeyboardEvent("keydown", {
        key: "c",
        ctrlKey: true,
        bubbles: true,
        cancelable: true,
      });
      element.dispatchEvent(event);
      return event.defaultPrevented;
    }),
  ).toBe(false);
  expect(await capturedCopies()).toHaveLength(1);
});
