import { desktopExecutablePath } from "./desktop-app";
import {
  _electron as electron,
  expect,
  test,
  type ElectronApplication,
  type Page,
} from "@playwright/test";
import { execFileSync } from "node:child_process";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { join, resolve, sep } from "node:path";

test.setTimeout(45000);
let app: ElectronApplication | undefined;
let child: ReturnType<ElectronApplication["process"]> | undefined;
let page: Page;
let directory: string;
let errors: string[];
const temporaryRoot = resolve(".tmp", "desktop-dates");

test.beforeEach(async () => {
  await mkdir(temporaryRoot, { recursive: true });
  directory = await mkdtemp(join(temporaryRoot, "case-"));
  errors = [];
  const env: Record<string, string> = {};
  for (const key of ["PATH", "SystemRoot", "WINDIR", "TEMP", "TMP", "COMSPEC"])
    if (process.env[key]) env[key] = process.env[key]!;
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
  const input = await page.context().newCDPSession(page);
  await input.send("Emulation.setFocusEmulationEnabled", { enabled: true });
  page.on("pageerror", (error) => errors.push(error.message));
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
      throw new Error(
        "Unexpected native dialog during hidden date verification",
      );
    };
  });
  await expect(
    page.locator('.query-status[data-query-state="complete"]'),
  ).toBeAttached();
});

test.afterEach(async () => {
  if (app && child && child.exitCode === null) {
    try {
      const exit = app.waitForEvent("close", { timeout: 7000 });
      const processExit = new Promise<number | null>((resolveExit) =>
        child!.once("exit", resolveExit),
      );
      await app.evaluate(({ BrowserWindow }) =>
        BrowserWindow.getAllWindows()[0].close(),
      );
      await exit;
      expect(await processExit).toBe(0);
    } finally {
      if (child.exitCode === null) {
        if (process.platform === "win32")
          execFileSync("taskkill", ["/PID", String(child.pid), "/T", "/F"], {
            stdio: "ignore",
          });
        else child.kill();
      }
    }
  }
  expect(errors).toEqual([]);
  if (!resolve(directory).startsWith(temporaryRoot + sep + "case-"))
    throw new Error("Unsafe date-test cleanup path");
  await rm(directory, {
    recursive: true,
    force: true,
    maxRetries: 10,
    retryDelay: 100,
  });
});

test("trusted date preset selection refreshes without clicking Run and leaves pattern edits manual", async () => {
  const picker = page.getByRole("button", { name: "Time range", exact: true });
  await expect(picker).toHaveText("Custom");
  await expect(
    page.getByRole("button", { name: "Recent logs", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(
    page.getByRole("combobox", { name: "Timezone", exact: true }),
  ).toBeVisible();
  const initial = await page.locator(".query-status").innerText();
  const count = Number(
    initial.match(/([\d,]+) loaded/)?.[1].replaceAll(",", ""),
  );
  expect(count).toBeGreaterThan(100);
  await picker.click();
  await page.getByRole("tab", { name: "Relative", exact: true }).click();
  await page
    .getByRole("button", { name: "Last 5 minutes", exact: true })
    .click();
  await page.getByRole("button", { name: "Apply", exact: true }).click();
  await expect(picker).toHaveText("Custom");
  await expect(picker).toHaveAttribute("aria-pressed", "false");
  await expect(
    page.getByRole("button", { name: "Set last 5 minutes", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  // A completed query can still be showing its previous snapshot while React
  // schedules the date effect. Wait for the new result count, not incidental
  // metadata changes or the previous request's already-complete status.
  await expect
    .poll(
      async () => {
        const metadata = await page.locator(".query-status").innerText();
        const loaded = Number(
          metadata.match(/([\d,]+) loaded/)?.[1].replaceAll(",", ""),
        );
        return loaded > 0 && loaded < count;
      },
      { timeout: 10000 },
    )
    .toBe(true);
  await expect(
    page.locator('.query-status[data-query-state="complete"]'),
  ).toBeAttached();
  const reduced = await page.locator(".query-status").innerText();
  const reducedCount = Number(
    reduced.match(/([\d,]+) loaded/)?.[1].replaceAll(",", ""),
  );
  expect(reducedCount).toBeGreaterThan(0);
  expect(reducedCount).toBeLessThan(count);
  const pattern = page.getByLabel("CloudWatch filter pattern", { exact: true });
  await pattern.click();
  await page.keyboard.press("ControlOrMeta+A");
  await pattern.pressSequentially("unmatched-date-regression-54837");
  await expect(page.getByText(/Query settings changed/)).toBeVisible();
  await expect(page.locator(".query-status")).toContainText(
    `${reducedCount.toLocaleString()} loaded`,
  );
  await page
    .getByRole("button", { name: "Set last 30 minutes", exact: true })
    .click();
  await expect(
    page.locator('.query-status[data-query-state="complete"]'),
  ).toBeAttached();
  await expect(page.locator(".query-status")).toContainText("0 loaded");
  await expect(page.getByText(/Query settings changed/)).toHaveCount(0);
});

test("absolute date ranges refresh automatically in UTC and clearing restores all history", async () => {
  const metadata = () => page.locator(".query-status").innerText();
  const count = (text: string) =>
    Number(text.match(/([\d,]+) loaded/)?.[1].replaceAll(",", ""));
  const all = count(await metadata());
  expect(all).toBeGreaterThan(100);
  const zone = page.getByRole("combobox", { name: "Timezone", exact: true });
  await zone.click();
  await page.getByRole("option", { name: "UTC", exact: true }).click();
  await expect(zone).toHaveValue("UTC");
  const picker = page.getByRole("button", { name: "Time range", exact: true });
  await picker.click();
  await page.getByRole("tab", { name: "Absolute", exact: true }).click();
  const anchor = Math.floor(Date.now() / 60000) * 60000;
  const start = new Date(anchor - 10 * 60000).toISOString();
  const end = new Date(anchor).toISOString();
  await page
    .getByLabel("Start date", { exact: true })
    .fill(start.slice(0, 10).replaceAll("-", "/"));
  await page
    .getByLabel("Start time", { exact: true })
    .fill(start.slice(11, 19));
  await page
    .getByLabel("End date", { exact: true })
    .fill(end.slice(0, 10).replaceAll("-", "/"));
  await page.getByLabel("End time", { exact: true }).fill(end.slice(11, 19));
  await page.getByRole("button", { name: "Apply", exact: true }).click();
  await expect
    .poll(async () => {
      const loaded = count(await metadata());
      return loaded > 0 && loaded < all;
    })
    .toBe(true);
  await expect(
    page.locator('.query-status[data-query-state="complete"]'),
  ).toBeAttached();
  await picker.click();
  await page
    .getByRole("button", { name: "Show recent logs", exact: true })
    .click();
  await expect(picker).toHaveText("Custom");
  await expect.poll(async () => count(await metadata())).toBe(all);
  await expect(zone).toHaveValue("UTC");
});
