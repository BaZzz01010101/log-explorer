import { openSettingsWindow } from "./settings-panel";
import {
  _electron as electron,
  expect,
  test,
  type ElectronApplication,
  type Page,
} from "@playwright/test";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { join, resolve, sep } from "node:path";
import type {
  LogEvent,
  QueryRequest,
  QueryUpdate,
} from "../../src/shared/contracts";
import { createWorkspace } from "../../src/renderer/workspace";
import { desktopExecutablePath } from "./desktop-app";

test.setTimeout(45000);
const temporaryRoot = resolve(".tmp", "desktop-filter-highlights");
let directory: string;
let app: ElectronApplication | undefined;
let page: Page;
let errors: string[];
type MainProbe = typeof globalThis & {
  feedbackRequests: QueryRequest[];
  feedbackPending: Map<string, () => void>;
};

test.beforeEach(async ({}, info) => {
  await mkdir(temporaryRoot, { recursive: true });
  directory = await mkdtemp(join(temporaryRoot, "case-"));
  errors = [];
  app = undefined;
  const workspace = createWorkspace();
  workspace.preferences.theme = info.title.includes("dark") ? "dark" : "light";
  workspace.sidebarVisible = false;
  workspace.preferences.timezone = "utc";
  workspace.tabs[0].timePreset = "clear";
  workspace.tabs[0].filterPattern = "";
  workspace.tabs[0].view.mode = info.title.includes("Hybrid")
    ? "hybrid"
    : info.title.includes("JSON")
      ? "json"
      : "table";
  workspace.tabs[0].view.wrap = false;
  workspace.tabs[0].view.localSearch = "";
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
  page = await app.firstWindow();
  page.setDefaultTimeout(6000);
  page.on("pageerror", (error) => errors.push(error.message));
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Emulation.setFocusEmulationEnabled", { enabled: true });
  await cdp.send("Emulation.setTimezoneOverride", {
    timezoneId: "Europe/Madrid",
  });
  await page.setViewportSize({ width: 1150, height: 820 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  const environment = await page.evaluate(() => window.explorer.environment());
  expect(environment.awsEnabled).toBe(false);
  expect(environment.canEnableAws).toBe(false);
  expect(
    await app.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows().every((window) => !window.isVisible()),
    ),
  ).toBe(true);
  await app.evaluate(({ dialog }) => {
    dialog.showMessageBox = async () => {
      throw new Error(
        "Unexpected native dialog during hidden event-feedback verification",
      );
    };
  });
  await expect(page.locator(".query-status")).toHaveAttribute(
    "data-query-state",
    "complete",
  );
  // Replace only this isolated application's query transport. Rendering, query
  // generations, update subscription and continuation remain production code.
  await app.evaluate(({ ipcMain, BrowserWindow }) => {
    const probe = globalThis as MainProbe;
    probe.feedbackRequests = [];
    probe.feedbackPending = new Map();
    const contents = BrowserWindow.getAllWindows()[0].webContents;
    ipcMain.removeHandler("explorer:query");
    ipcMain.handle("explorer:query", (event, request: QueryRequest) => {
      if (
        event.sender !== contents ||
        event.senderFrame !== contents.mainFrame ||
        request.connection.mode !== "offline"
      )
        throw new Error(
          "Feedback test accepts only its trusted offline renderer",
        );
      probe.feedbackRequests.push(request);
      return new Promise<void>((done) =>
        probe.feedbackPending.set(request.requestId, done),
      );
    });
  });
});

test.afterEach(async () => {
  if (app && app.process().exitCode === null) {
    const closed = app.waitForEvent("close", { timeout: 7000 });
    const exited = new Promise<number | null>((done) =>
      app!.process().once("exit", done),
    );
    await app.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()[0].close(),
    );
    await closed;
    expect(await exited).toBe(0);
  }
  expect(errors).toEqual([]);
  if (!resolve(directory).startsWith(temporaryRoot + sep + "case-"))
    throw new Error("Unsafe event-feedback cleanup path");
  await rm(directory, {
    recursive: true,
    force: true,
    maxRetries: 10,
    retryDelay: 100,
  });
});

const viewer = () => page.locator(".viewer-scroll");
const status = () => page.locator(".query-status");
async function requests() {
  return app!.evaluate(() => (globalThis as MainProbe).feedbackRequests);
}
async function send(
  index: number,
  update: Omit<QueryUpdate, "requestId">,
  finish = false,
) {
  await app!.evaluate(
    ({ BrowserWindow }, payload) => {
      const probe = globalThis as MainProbe;
      const requestId = probe.feedbackRequests[payload.index].requestId;
      BrowserWindow.getAllWindows()[0].webContents.send("explorer:update", {
        ...payload.update,
        requestId,
      });
      if (payload.finish) {
        probe.feedbackPending.get(requestId)?.();
        probe.feedbackPending.delete(requestId);
      }
    },
    { index, update, finish },
  );
}
async function capture(filename: string) {
  // Hidden windows can retain the last compositor surface. A native capture
  // requests a frame without showing the window; discard the warm-up captures.
  let png = "";
  for (let frame = 0; frame < 3; frame++) {
    await page.evaluate(
      () =>
        new Promise<void>((resolve) => {
          requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
        }),
    );
    png = await app!.evaluate(async ({ BrowserWindow }) => {
      const window = BrowserWindow.getAllWindows()[0];
      if (window.isVisible())
        throw new Error("Feedback verification became visible");
      const image = await window.webContents.capturePage(undefined, {
        stayHidden: true,
        stayAwake: true,
      });
      if (window.isVisible())
        throw new Error("Feedback capture changed visibility");
      return image.toPNG().toString("base64");
    });
  }
  const output = resolve(test.info().outputPath(filename));
  if (!output.startsWith(resolve(".tmp") + sep))
    throw new Error("Feedback evidence must remain under .tmp");
  await mkdir(test.info().outputDir, { recursive: true });
  await writeFile(output, Buffer.from(png, "base64"));
}

for (const mode of ["Table", "Hybrid", "JSON"])
  for (const theme of ["light", "dark"])
    test(`${theme} ${mode} filter evidence uses distinct colors, expands matched paths and marks folded matches`, async () => {
      const input = page.getByRole("combobox", {
        name: "CloudWatch filter pattern",
        exact: true,
      });
      await input.fill('{ $.outer.deep.id = "needle" && $.status = "ready" }');
      await input.press("Enter");
      await expect.poll(async () => (await requests()).length).toBe(1);
      const message = JSON.stringify({
        msg: "ready needle manual",
        status: "ready",
        outer: { deep: { id: "needle", untouched: "ready" } },
        unrelated: { id: "needle" },
      });
      const event: LogEvent = {
        id: "evidence-1",
        timestamp: 100000,
        message,
        logGroup: "/aws/lambda/orders-api",
        logStream: "evidence-stream",
      };
      await send(
        0,
        { state: "complete", events: [event], replace: true },
        true,
      );
      await page
        .getByRole("textbox", {
          name: "Local filter loaded events",
          exact: true,
        })
        .fill('@/outer/deep/id="needle"');
      await page
        .getByRole("textbox", {
          name: "Highlight text in loaded events",
          exact: true,
        })
        .fill("manual");
      const row = page.locator('[data-event-id="evidence-1"]').first();
      await row.click();
      const inspector = page.getByRole("region", {
        name: "Event inspector",
        exact: true,
      });
      const matched = inspector.locator('[data-json-path="/outer/deep/id"]');
      await expect(
        matched.locator('[data-highlight-origins="server local"]'),
      ).toHaveText("needle");
      await expect(
        inspector.locator(
          '[data-json-path="/outer/deep/untouched"] [data-highlight-origins]',
        ),
      ).toHaveCount(0);
      await expect(
        inspector.getByRole("button", {
          name: "Expand /unrelated",
          exact: true,
        }),
      ).toBeVisible();
      await expect(
        inspector.locator(
          '[data-json-path="/unrelated"] .json-match-indicator',
        ),
      ).toHaveCount(0);
      const server = inspector.locator(
        '[data-json-path="/status"] [data-highlight-origins="server"]',
      );
      const manual = inspector.locator(
        '[data-json-path="/msg"] [data-highlight-origins="manual"]',
      );
      await expect(server).toHaveText("ready");
      await expect(manual).toHaveText("manual");
      const colors = await inspector.evaluate((element) => {
        const style = getComputedStyle(element.querySelector(".json-tree")!);
        return ["server", "local", "manual"].map((origin) =>
          style.getPropertyValue(`--filter-match-${origin}`),
        );
      });
      expect(new Set(colors).size).toBe(3);
      expect(colors.every(Boolean)).toBe(true);
      // Editing the draft must not misrepresent the already loaded AWS result.
      await input.fill('{ $.unrelated.id = "other" }');
      await expect(server).toHaveText("ready");
      expect((await requests()).length).toBe(1);
      await inspector
        .getByRole("button", { name: "Collapse /outer", exact: true })
        .click();
      const folded = inspector.locator(
        '[data-json-path="/outer"] .json-match-indicator',
      );
      await expect(folded).toHaveAttribute(
        "aria-label",
        "Contains server and local match",
      );
      await expect(folded.locator("i")).toHaveCount(2);
      // Unrelated UI changes must respect a manually folded branch.
      await page
        .getByRole("textbox", {
          name: "Highlight text in loaded events",
          exact: true,
        })
        .fill("manual!");
      // A changed query intentionally re-expands matching paths.
      await expect(matched).toBeVisible();
      await openSettingsWindow(page);
      await page.getByRole("tab", { name: "Preferences", exact: true }).click();
      const auto = page.getByRole("checkbox", {
        name: "Automatically expand inspector paths to highlighted matches",
        exact: true,
      });
      await expect(auto).toBeChecked();
      await auto.uncheck();
      await page.keyboard.press("Escape");
      const unfoldAll = inspector.getByRole("button", {
        name: "Unfold structured object",
        exact: true,
      });
      if (await unfoldAll.count()) await unfoldAll.click();
      await inspector
        .getByRole("button", { name: "Fold structured object", exact: true })
        .click();
      await inspector
        .getByRole("button", { name: "Expand root", exact: true })
        .click();
      await expect(folded).toBeVisible();
      await page
        .getByRole("textbox", {
          name: "Local filter loaded events",
          exact: true,
        })
        .fill('@/outer/deep/id="needle" ready');
      await expect(folded).toBeVisible();
      await expect(matched).toHaveCount(0);
      await capture(`filter-evidence-${theme}-${mode}.png`);
      if (mode !== "JSON") {
        await expect(page.locator(".log-table-header")).not.toContainText(
          "/service/name",
        );
        await expect(page.locator(".log-table-header")).not.toContainText(
          "/request/id",
        );
      }
    });

test("unsupported AWS syntax never invents evidence while local highlighting still works", async () => {
  const input = page.getByRole("combobox", {
    name: "CloudWatch filter pattern",
    exact: true,
  });
  await input.fill("[ip, user, timestamp, request, status_code = 4*, bytes]");
  await input.press("Enter");
  await expect.poll(async () => (await requests()).length).toBe(1);
  await send(
    0,
    {
      state: "complete",
      replace: true,
      events: [
        {
          id: "unsupported-1",
          timestamp: 100000,
          message: "warning request failed",
          logGroup: "/aws/lambda/orders-api",
          logStream: "evidence-stream",
        },
      ],
    },
    true,
  );
  await page
    .getByRole("textbox", { name: "Local filter loaded events", exact: true })
    .fill("request");
  await page.locator('[data-event-id="unsupported-1"]').first().click();
  await expect(
    page.locator('[data-highlight-origins="local"]').first(),
  ).toHaveText("request");
  await expect(page.locator('[data-highlight-origins*="server"]')).toHaveCount(
    0,
  );
});
