import { desktopExecutablePath } from "./desktop-app";
import {
  _electron as electron,
  expect,
  test,
  type ElectronApplication,
  type Page,
} from "@playwright/test";
import { execFileSync } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm } from "node:fs/promises";
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
const temporaryRoot = resolve(".tmp", "desktop-investigation");

test.beforeEach(async () => {
  await mkdir(temporaryRoot, { recursive: true });
  directory = await mkdtemp(join(temporaryRoot, "case-"));
  const environment: Record<string, string> = {};
  for (const name of [
    "PATH",
    "SystemRoot",
    "WINDIR",
    "TEMP",
    "TMP",
    "COMSPEC",
  ]) {
    if (process.env[name]) environment[name] = process.env[name]!;
  }
  environment.EXPLORER_TEST_USER_DATA = directory;
  environment.USERPROFILE = directory;
  environment.LOCALAPPDATA = directory;
  environment.APPDATA = directory;
  environment.AWS_CONFIG_FILE = join(directory, "absent-config");
  environment.AWS_SHARED_CREDENTIALS_FILE = join(
    directory,
    "absent-credentials",
  );
  environment.AWS_EC2_METADATA_DISABLED = "true";
  errors = [];
  app = await electron.launch({
    executablePath: packaged ? desktopExecutablePath() : undefined,
    args: [
      ...(packaged ? [] : [process.cwd()]),
      "--offline-verification",
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
  await expect(
    page.locator('.query-status[data-query-state="complete"]'),
  ).toBeAttached();
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
  if (!resolve(directory).startsWith(temporaryRoot + sep + "case-"))
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
  await expect(
    page.locator('.query-status[data-query-state="complete"]'),
  ).toBeAttached();
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
  const queryIds = await page.evaluate(() => [
    ...new Set(
      (window as unknown as ProbeWindow).investigationUpdates.map(
        (update) => update.requestId,
      ),
    ),
  ]);
  expect(queryIds).toHaveLength(1);

  await page.getByLabel("Local filter loaded events").fill("req-000005");
  await expect(page.locator(".query-status")).toContainText(
    /1 shown \/ [\d,]+ loaded/,
  );
  await expect(page.getByText("Saved locally", { exact: true })).toBeVisible();
  await expect(page.locator(".query-status")).toHaveAttribute(
    "data-query-state",
    "complete",
  );
  await expect(page.locator(".query-status")).toContainText(
    `${serverResults.length.toLocaleString()} loaded`,
  );
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

  await page.locator(".inspect-cell").first().dblclick();
  const inspector = page.getByRole("region", {
    name: "Event inspector",
    exact: true,
  });
  await expect(inspector).toContainText(selected[0].logStream);
  await inspector
    .getByRole("button", { name: "Surrounding context", exact: true })
    .click();
  // Context is a new tab, so its inspector follows the default-open behavior.
  await expect(inspector).toBeVisible();
  await expect(page.getByRole("tab", { name: /^Context ·/ })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  await expect(
    page.locator('.query-status[data-query-state="complete"]'),
  ).toBeAttached();
  const timeRange = page.getByRole("button", {
    name: "Time range",
    exact: true,
  });
  await timeRange.click();
  await page.getByRole("tab", { name: "Absolute", exact: true }).click();
  const readBound = async (part: "Start" | "End") => {
    const date = await page
      .getByLabel(`${part} date`, { exact: true })
      .inputValue();
    const time = await page
      .getByLabel(`${part} time`, { exact: true })
      .inputValue();
    const zone = await page
      .getByRole("combobox", { name: "Timezone", exact: true })
      .inputValue();
    return Date.parse(
      `${date.replaceAll("/", "-")}T${time}${zone === "UTC" ? "Z" : ""}`,
    );
  };
  const start = await readBound("Start");
  // Visible fields show whole seconds; context instants retain milliseconds.
  const end = (await readBound("End")) + 999;
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
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
  await expect(page.locator(".query-status")).toHaveAttribute(
    "data-query-state",
    "error",
  );
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

  const resource = page.getByRole("button", {
    name: "/aws/lambda/payments-worker",
    exact: true,
  });
  const start = (await resource.boundingBox())!;
  await page.mouse.move(start.x + start.width / 2, start.y + start.height / 2);
  await page.mouse.down();
  await page.mouse.move(
    start.x + start.width / 2 + 15,
    start.y + start.height / 2,
    { steps: 3 },
  );
  await expect(page.locator(".source-badges")).toBeVisible();
  const end = (await page.locator(".source-badges").boundingBox())!;
  await page.mouse.move(end.x + end.width / 2, end.y + end.height / 2, {
    steps: 12,
  });
  await expect(page.locator(".source-badges")).toHaveClass(
    /source-drop-active/,
  );
  await page.mouse.up();
  await expect(page.locator(".query-status")).toHaveAttribute(
    "data-query-state",
    "complete",
  );
  await expect(page.locator(".query-status")).toContainText(
    `${(baseline.length * 2).toLocaleString()} scanned`,
  );
  const combined = JSON.parse(
    await exportLoaded("json", "combined"),
  ) as LogEvent[];
  expect(
    combined.reduce(
      (sum, event) => sum + Number(JSON.parse(event.message).total),
      0,
    ),
  ).toBe(baseline.length * 2);
  await expect(page.locator(".source-badge")).toHaveCount(2);
  expect(errors).toEqual([]);
});
