import {
  _electron as electron,
  expect,
  test,
  type ElectronApplication,
  type Page,
} from "@playwright/test";
import { execFileSync } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve, sep } from "node:path";
import type { LogEvent, QueryUpdate } from "../../src/shared/contracts";

test.setTimeout(90000);
test.use({ actionTimeout: 5000 });

let app: ElectronApplication | undefined;
let child: ReturnType<ElectronApplication["process"]> | undefined;
let page: Page;
let directory: string;
let errors: string[];
type ProbeWindow = Window & { investigationUpdates: QueryUpdate[] };
const packaged = process.env.EXPLORER_DESKTOP_PACKAGED === "1";

test.beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), "aws-log-explorer-investigation-"));
  const environment: Record<string, string> = {};
  for (const name of [
    "PATH",
    "SystemRoot",
    "WINDIR",
    "TEMP",
    "TMP",
    "USERPROFILE",
    "LOCALAPPDATA",
    "APPDATA",
    "COMSPEC",
  ]) {
    if (process.env[name]) environment[name] = process.env[name]!;
  }
  environment.EXPLORER_TEST_USER_DATA = directory;
  environment.AWS_CONFIG_FILE = join(directory, "absent-config");
  environment.AWS_SHARED_CREDENTIALS_FILE = join(
    directory,
    "absent-credentials",
  );
  environment.AWS_EC2_METADATA_DISABLED = "true";
  errors = [];
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
    env: environment,
  });
  child = app.process();
  page = await app.firstWindow();
  page.setDefaultTimeout(5000);
  const session = await page.context().newCDPSession(page);
  await session.send("Emulation.setFocusEmulationEnabled", { enabled: true });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.addStyleTag({
    content:
      "*, *::before, *::after { transition-duration: 0s !important; animation-duration: 0s !important; animation-delay: 0s !important; }",
  });
  page.on("pageerror", (error) => errors.push(error.message));
  const environmentInfo = await page.evaluate(() =>
    window.explorer.environment(),
  );
  expect(environmentInfo.awsEnabled).toBe(false);
  expect(environmentInfo.canEnableAws).toBe(false);
  expect(
    await app.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()[0].isVisible(),
    ),
  ).toBe(false);
  await expect(page.locator(".query-status")).toContainText("complete");
  // Observation only; all application actions below use trusted Chromium input.
  await page.evaluate(() => {
    const probe = window as unknown as ProbeWindow;
    probe.investigationUpdates = [];
    window.explorer.onUpdate((update) =>
      probe.investigationUpdates.push(update),
    );
  });
});

test.afterEach(async () => {
  if (app && child && child.exitCode === null) {
    await Promise.race([
      app.close().catch(() => {}),
      new Promise((done) => setTimeout(done, 5000)),
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
  app = undefined;
  child = undefined;
  if (
    !resolve(directory).startsWith(
      resolve(tmpdir()) + sep + "aws-log-explorer-investigation-",
    )
  )
    throw new Error("Unsafe investigation cleanup path");
  await rm(directory, {
    recursive: true,
    force: true,
    maxRetries: 10,
    retryDelay: 100,
  });
});

async function exportLoaded(format: "json" | "csv", name: string) {
  const path = resolve(directory, `${name}.${format}`);
  if (!path.startsWith(resolve(directory) + sep))
    throw new Error("Unsafe export path");
  // Replace only the file picker; the real preload/export IPC and file writer run.
  await app!.evaluate(({ dialog }, filePath) => {
    dialog.showSaveDialog = async () => ({ canceled: false, filePath });
  }, path);
  await page.getByLabel("Export loaded filtered events").click();
  await page
    .getByRole("menuitem", {
      name:
        format === "json"
          ? "JSON · full events"
          : "CSV · visible columns, formula-safe",
      exact: true,
    })
    .click();
  await expect
    .poll(() => readFile(path, "utf8").catch(() => null))
    .not.toBeNull();
  return readFile(path, "utf8");
}

async function runQuery() {
  await page.getByTestId("run-query").click();
  await expect(page.locator(".query-status")).toContainText("complete");
}

test("server and local filtering export real selected data and inspector opens source context", async () => {
  await page.getByLabel("CloudWatch filter pattern").fill('"Payment"');
  await runQuery();
  const serverResults = JSON.parse(
    await exportLoaded("json", "server"),
  ) as LogEvent[];
  expect(serverResults.length).toBeGreaterThan(1);
  expect(
    serverResults.every((event) => event.message.includes("Payment")),
  ).toBe(true);
  const serverStatus = await page.locator(".query-status").innerText();
  const queryIds = await page.evaluate(() => [
    ...new Set(
      (window as unknown as ProbeWindow).investigationUpdates.map(
        (update) => update.requestId,
      ),
    ),
  ]);
  expect(queryIds).toHaveLength(1);

  await page.getByLabel("Local filter loaded events").fill("req-000005");
  await expect(page.locator(".viewer-meta")).toContainText(
    /1 \/ \d+ loaded events/,
  );
  await expect(page.getByText("Saved locally", { exact: true })).toBeVisible();
  expect(await page.locator(".query-status").innerText()).toBe(serverStatus);
  expect(
    await page.evaluate(() => [
      ...new Set(
        (window as unknown as ProbeWindow).investigationUpdates.map(
          (update) => update.requestId,
        ),
      ),
    ]),
  ).toEqual(queryIds);
  const selected = JSON.parse(
    await exportLoaded("json", "local"),
  ) as LogEvent[];
  expect(selected).toHaveLength(1);
  expect(JSON.parse(selected[0].message).request.id).toBe("req-000005");
  const csv = await exportLoaded("csv", "local-columns");
  expect(csv.trim().split(/\r?\n/)).toHaveLength(2);
  expect(csv).toContain('"@timestamp"');
  expect(csv).toContain('"Payment provider timed out"');
  expect(csv).toContain('"req-000005"');

  await page.getByLabel("Inspect event", { exact: false }).first().click();
  const inspector = page.getByRole("dialog", { name: "Event inspector" });
  await expect(inspector).toContainText(selected[0].logStream);
  await inspector
    .getByRole("button", { name: "Surrounding context", exact: true })
    .click();
  await expect(inspector).toHaveCount(0);
  await expect(page.getByRole("tab", { name: /^Context ·/ })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  await expect(page.locator(".query-status")).toContainText("complete");
  const start = Date.parse(await page.getByLabel("Range start").inputValue());
  const end = Date.parse(await page.getByLabel("Range end").inputValue());
  const context = JSON.parse(
    await exportLoaded("json", "context"),
  ) as LogEvent[];
  expect(context.length).toBeGreaterThan(1);
  expect(context.some((event) => event.id === selected[0].id)).toBe(true);
  expect(
    context.every(
      (event) =>
        event.logGroup === selected[0].logGroup &&
        event.logStream === selected[0].logStream &&
        event.timestamp >= start &&
        event.timestamp <= end,
    ),
  ).toBe(true);
  expect(errors).toEqual([]);
});

test("Insights recovers after unsupported syntax and aggregates changed sources with real exports", async () => {
  const baseline = JSON.parse(
    await exportLoaded("json", "baseline"),
  ) as LogEvent[];
  await page
    .locator("label")
    .filter({ hasText: /^Insights$/ })
    .click();
  const editor = page.getByLabel("CloudWatch Logs Insights query");
  await editor.fill("dedup @message");
  await page.getByTestId("run-query").click();
  await expect(page.locator(".query-status")).toContainText("error");
  await expect(page.getByRole("alert")).toContainText(
    "Offline Insights supports",
  );
  await editor.fill("stats count(*) as total by level");
  await runQuery();
  const aggregate = JSON.parse(
    await exportLoaded("json", "aggregate"),
  ) as LogEvent[];
  const buckets = aggregate.map(
    (event) =>
      JSON.parse(event.message) as { level: string | null; total: number },
  );
  expect(buckets.reduce((sum, bucket) => sum + bucket.total, 0)).toBe(
    baseline.length,
  );
  expect(
    buckets.some((bucket) => bucket.level === "ERROR" && bucket.total > 0),
  ).toBe(true);
  await expect(page.locator(".query-status")).toContainText(
    `${baseline.length} scanned`,
  );

  await page.getByRole("button", { name: "1 source", exact: true }).click();
  await page
    .getByRole("menuitem", { name: "Edit sources", exact: true })
    .click();
  const sources = page.getByRole("dialog", {
    name: "Log sources",
    exact: true,
  });
  const groups = sources.getByLabel("Log groups, one per line");
  await groups.fill("");
  await expect(
    sources.getByRole("button", { name: "Apply sources" }),
  ).toBeDisabled();
  await groups.fill("/aws/lambda/orders-api\n/aws/lambda/payments-worker");
  await sources.getByRole("button", { name: "Apply sources" }).click();
  await expect(sources).toHaveCount(0);
  await expect(page.locator(".query-status")).toContainText("idle");
  await expect(page.locator(".viewer-meta")).toContainText(
    "0 / 0 loaded events",
  );
  await runQuery();
  const combined = JSON.parse(
    await exportLoaded("json", "combined"),
  ) as LogEvent[];
  expect(
    combined.reduce(
      (sum, event) => sum + Number(JSON.parse(event.message).total),
      0,
    ),
  ).toBe(baseline.length * 2);
  await expect(
    page.getByRole("button", { name: "2 sources", exact: true }),
  ).toBeVisible();
  expect(errors).toEqual([]);
});
