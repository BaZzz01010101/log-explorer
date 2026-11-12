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
import { createWorkspace } from "../../src/renderer/workspace";
import type { QueryUpdate } from "../../src/shared/contracts";

test.setTimeout(90000);
let app: ElectronApplication | undefined;
let child: ReturnType<ElectronApplication["process"]> | undefined;
let page: Page;
let directory: string;
let errors: string[];
const temporaryRoot = resolve(".tmp", "desktop-toggle-folding");
type ProbeWindow = Window & { inspectorUpdates: QueryUpdate[] };

test.beforeEach(async ({}, info) => {
  await mkdir(temporaryRoot, { recursive: true });
  directory = await mkdtemp(join(temporaryRoot, "case-"));
  errors = [];
  const workspace = createWorkspace();
  workspace.preferences.theme = info.title.includes("dark") ? "dark" : "light";
  workspace.preferences.autoExpandFilterMatches = false;
  workspace.tabs[0].filterPattern = "";
  workspace.tabs[0].view.mode = "table";
  await writeFile(join(directory, "workspace.json"), JSON.stringify(workspace));
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

const inspector = () =>
  page.getByRole("region", { name: "Event inspector", exact: true });
const rows = () => page.locator(".virtual-event");
async function paint() {
  await app!.evaluate(async ({ BrowserWindow }) => {
    const window = BrowserWindow.getAllWindows()[0];
    if (window.isVisible()) throw new Error("Verification became visible");
    await window.webContents.capturePage(undefined, {
      stayHidden: true,
      stayAwake: true,
    });
  });
}
test.beforeEach(async ({}, info) => {
  await app!.evaluate(({ ipcMain, BrowserWindow }, longList) => {
    const win = BrowserWindow.getAllWindows()[0];
    win.setContentSize(1700, 1100);
    ipcMain.removeHandler("explorer:query");
    ipcMain.handle("explorer:query", (event, request) => {
      if (
        event.sender !== win.webContents ||
        request.connection.mode !== "offline"
      )
        throw new Error("Unexpected folding request");
      const events = Array.from({ length: longList ? 120 : 3 }, (_, index) => ({
        id: `folding-${index}`,
        timestamp: Date.now() - 1000 + index,
        logGroup: "/aws/lambda/orders-api",
        logStream: "fixture",
        message:
          index === 2
            ? "First plain line\nSecond plain line"
            : JSON.stringify({
                level: "INFO",
                msg: "First message line\nSecond message line",
                payload: { nested: { leaf: index } },
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
  }, info.title.includes("JSON all-message"));
  await page.getByTestId("run-query").click();
  await expect(
    page.locator('.virtual-event[data-event-id="folding-0"]'),
  ).toBeVisible();
});

for (const theme of ["light", "dark"]) {
  test(`${theme} pressed toggle buttons remain distinguishable on hover and inspector copy is neutral`, async () => {
    const controls = [
      "Match case",
      "Use regular expression",
      "Match local filter case",
      "Use local filter regular expression",
      "Match highlight case",
      "Use highlight regular expression",
      "Toggle line wrap",
      "Toggle inspector line wrap",
    ];
    const background = async (button: ReturnType<Page["getByRole"]>) => {
      await paint();
      const rect = (await button.boundingBox())!;
      await page.mouse.move(rect.x + rect.width / 2, rect.y + rect.height / 2);
      expect(
        await button.evaluate((element) => element.matches(":hover")),
      ).toBe(true);
      return button.evaluate(
        (element) => getComputedStyle(element).backgroundColor,
      );
    };
    for (const label of controls) {
      const button = page.getByRole("button", { name: label, exact: true });
      if ((await button.getAttribute("aria-pressed")) === "true")
        await button.click();
      const off = await background(button);
      await button.click();
      await expect(button).toHaveAttribute("aria-pressed", "true");
      const on = await background(button);
      expect(on, label).not.toBe(off);
      await button.click();
    }
    const activeTime = page.getByRole("button", {
      name: "Recent logs",
      exact: true,
    });
    const otherTime = page.getByRole("button", {
      name: "Set last 1 minute",
      exact: true,
    });
    expect(await background(activeTime)).not.toBe(await background(otherTime));
    const copy = inspector().getByRole("button", { name: "Copy", exact: true });
    await page.mouse.move(1600, 20);
    expect(
      await copy.evaluate(
        (element) => getComputedStyle(element).backgroundColor,
      ),
    ).toBe("rgba(0, 0, 0, 0)");
    expect(await copy.getAttribute("aria-pressed")).toBeNull();
    await paint();
  });

  test(`${theme} inspector folds to first-level fields and keeps its choice per tab and selected row`, async () => {
    const first = page.locator('.virtual-event[data-event-id="folding-0"]');
    await first.locator(".inspect-cell").first().click();
    await inspector()
      .getByRole("button", { name: "Unfold structured object", exact: true })
      .click();
    await expect(
      inspector().getByRole("button", {
        name: "Collapse /payload/nested",
        exact: true,
      }),
    ).toBeVisible();
    await page
      .locator('.virtual-event[data-event-id="folding-1"]')
      .locator(".inspect-cell")
      .first()
      .click();
    await expect(
      inspector().getByRole("button", {
        name: "Collapse /payload/nested",
        exact: true,
      }),
    ).toBeVisible();
    const tabs = page
      .getByRole("tablist", { name: "Log views", exact: true })
      .getByRole("tab");
    await tabs.first().click({ button: "right" });
    await page
      .getByRole("menuitem", { name: "Duplicate tab", exact: true })
      .click();
    await expect(tabs).toHaveCount(2);
    await page.getByTestId("run-query").click();
    await expect(
      page.locator('.virtual-event[data-event-id="folding-0"]'),
    ).toBeVisible();
    await inspector()
      .getByRole("button", { name: "Fold structured object", exact: true })
      .click();
    await expect(
      inspector().getByRole("button", { name: "Collapse root", exact: true }),
    ).toBeVisible();
    await expect(
      inspector().getByRole("button", { name: "Expand /payload", exact: true }),
    ).toBeVisible();
    await expect(
      inspector().getByRole("button", {
        name: "Collapse /payload/nested",
        exact: true,
      }),
    ).toHaveCount(0);
    await page
      .locator('.virtual-event[data-event-id="folding-1"]')
      .locator(".inspect-cell")
      .first()
      .click();
    await expect(
      inspector().getByRole("button", { name: "Expand /payload", exact: true }),
    ).toBeVisible();
    await tabs.first().click();
    await expect(
      inspector().getByRole("button", {
        name: "Collapse /payload/nested",
        exact: true,
      }),
    ).toBeVisible();
    await tabs.nth(1).click();
    await expect(
      inspector().getByRole("button", { name: "Expand /payload", exact: true }),
    ).toBeVisible();
    await expect
      .poll(async () => {
        const saved = JSON.parse(
          await readFile(join(directory, "workspace.json"), "utf8"),
        );
        return saved.tabs.map((tab: any) => tab.view.inspectorExpanded);
      })
      .toEqual([true, false]);
  });

  for (const mode of ["Table", "Hybrid", "JSON"])
    test(`${theme} ${mode} all-message folding applies the correct mode behavior`, async () => {
      await page
        .locator("label")
        .filter({ hasText: new RegExp(`^${mode}$`) })
        .click();
      const first = page.locator('.virtual-event[data-event-id="folding-0"]');
      const plain = page.locator('.virtual-event[data-event-id="folding-2"]');
      const all = () =>
        page.getByRole("button", { name: /^(Fold|Unfold) all messages$/ });
      if ((await all().getAttribute("aria-pressed")) === "true")
        await all().click();
      if (mode === "JSON") {
        await expect(
          first.getByRole("button", { name: "Expand /payload", exact: true }),
        ).toBeVisible();
        await expect(
          first.getByRole("button", { name: "Collapse root", exact: true }),
        ).toBeVisible();
      }
      await all().click();
      await expect(all()).toHaveAttribute("aria-pressed", "true");
      if (mode === "Hybrid") {
        await expect(
          first.getByRole("region", {
            name: "Expanded event content",
            exact: true,
          }),
        ).toBeVisible();
      } else {
        await expect(
          first.getByRole("button", {
            name: "Collapse /payload/nested",
            exact: true,
          }),
        ).toBeVisible();
        await expect(first.locator(".expanded-event-details")).toHaveCount(0);
        await expect(plain.locator(".raw-content pre")).toHaveText(
          "First plain line\nSecond plain line",
        );
      }
      // Recycled virtual rows must keep the global choice and manual nested changes.
      if (mode === "JSON") {
        await first
          .getByRole("button", { name: "Collapse /payload", exact: true })
          .click();
        const viewer = page.locator(".viewer-scroll");
        await viewer.press("End");
        await expect(
          page
            .locator('.virtual-event[data-event-id="folding-119"]')
            .getByRole("button", {
              name: "Collapse /payload/nested",
              exact: true,
            }),
        ).toBeVisible();
        await viewer.press("Home");
        await paint();
        await expect(
          first.getByRole("button", { name: "Expand /payload", exact: true }),
        ).toBeVisible();
      }
      await all().click();
      await expect(all()).toHaveAttribute("aria-pressed", "false");
      if (mode === "Hybrid")
        await expect(
          first.getByRole("region", {
            name: "Expanded event content",
            exact: true,
          }),
        ).toHaveCount(0);
      else if (mode === "JSON") {
        await expect(
          first.getByRole("button", { name: "Collapse root", exact: true }),
        ).toBeVisible();
        await expect(
          first.getByRole("button", { name: "Expand /payload", exact: true }),
        ).toBeVisible();
      } else {
        await expect(first.locator(".json-tree")).toHaveCount(0);
        await expect(plain.locator(".raw-content")).toHaveCount(0);
      }
      await all().click();
      if (mode !== "Hybrid")
        await expect(
          first.getByRole("button", {
            name: "Collapse /payload/nested",
            exact: true,
          }),
        ).toBeVisible();
      await paint();
    });
}

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
