import {
  _electron as electron,
  expect,
  test,
  type ElectronApplication,
  type Page,
} from "@playwright/test";
import { execFileSync } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve, sep } from "node:path";

test.setTimeout(45000);
let app: ElectronApplication | undefined;
let child: ReturnType<ElectronApplication["process"]> | undefined;
let page: Page;
let directory: string;
let errors: string[];

test.beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), "aws-log-explorer-dates-"));
  errors = [];
  const env: Record<string, string> = {};
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
    if (process.env[key]) env[key] = process.env[key]!;
  Object.assign(env, {
    EXPLORER_TEST_USER_DATA: directory,
    AWS_CONFIG_FILE: join(directory, "absent-config"),
    AWS_SHARED_CREDENTIALS_FILE: join(directory, "absent-credentials"),
    AWS_EC2_METADATA_DISABLED: "true",
  });
  const packaged = process.env.EXPLORER_DESKTOP_PACKAGED === "1";
  app = await electron.launch({
    executablePath: packaged
      ? join(process.cwd(), "release/win-unpacked/AWS Log Explorer.exe")
      : undefined,
    args: [
      ...(packaged ? ["--offline-verification"] : [process.cwd()]),
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
  await expect(page.locator(".query-status")).toContainText("complete");
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
  if (
    !resolve(directory).startsWith(
      resolve(tmpdir()) + sep + "aws-log-explorer-dates-",
    )
  )
    throw new Error("Unsafe date-test cleanup path");
  await rm(directory, {
    recursive: true,
    force: true,
    maxRetries: 10,
    retryDelay: 100,
  });
});

test("trusted date preset selection refreshes without clicking Run and leaves pattern edits manual", async () => {
  const initial = await page.locator(".viewer-meta").innerText();
  const count = Number(
    initial.match(/([\d,]+) \/ [\d,]+ loaded events/)?.[1].replaceAll(",", ""),
  );
  expect(count).toBeGreaterThan(100);
  await page.getByRole("combobox", { name: "Time range", exact: true }).click();
  await page
    .getByRole("option", { name: "Last 5 minutes", exact: true })
    .click();
  await expect(
    page.getByRole("combobox", { name: "Time range", exact: true }),
  ).toHaveValue("Last 5 minutes");
  // A completed query can still be showing its previous snapshot while React
  // schedules the date effect. Wait for the new result count, not incidental
  // metadata changes or the previous request's already-complete status.
  await expect
    .poll(
      async () => {
        const metadata = await page.locator(".viewer-meta").innerText();
        const loaded = Number(
          metadata
            .match(/([\d,]+) \/ [\d,]+ loaded events/)?.[1]
            .replaceAll(",", ""),
        );
        return loaded > 0 && loaded < count;
      },
      { timeout: 10000 },
    )
    .toBe(true);
  await expect(page.locator(".query-status")).toContainText("complete");
  const reduced = await page.locator(".viewer-meta").innerText();
  const reducedCount = Number(
    reduced.match(/([\d,]+) \/ [\d,]+ loaded events/)?.[1].replaceAll(",", ""),
  );
  expect(reducedCount).toBeGreaterThan(0);
  expect(reducedCount).toBeLessThan(count);
  const pattern = page.getByLabel("CloudWatch filter pattern", { exact: true });
  await pattern.click();
  await page.keyboard.press("ControlOrMeta+A");
  await pattern.pressSequentially("unmatched-date-regression-54837");
  await expect(page.getByText(/Query settings changed/)).toBeVisible();
  await expect(page.locator(".viewer-meta")).toContainText(
    `${reducedCount} / ${reducedCount} loaded events`,
  );
  await page.getByRole("combobox", { name: "Time range", exact: true }).click();
  await page
    .getByRole("option", { name: "Last 30 minutes", exact: true })
    .click();
  await expect(page.locator(".query-status")).toContainText(
    "complete · 0 loaded",
  );
  await expect(page.getByText(/Query settings changed/)).toHaveCount(0);
});
