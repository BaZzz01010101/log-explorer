import {
  _electron as electron,
  expect,
  test,
  type ElectronApplication,
  type Page,
} from "@playwright/test";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join, resolve, sep } from "node:path";
import type {
  LogEvent,
  QueryRequest,
  Workspace,
} from "../../src/shared/contracts";
import { LOG_LEVELS } from "../../src/shared/log-data";
import { createWorkspace } from "../../src/renderer/workspace";
import { desktopExecutablePath } from "./desktop-app";

test.setTimeout(90000);
const temporaryRoot = resolve(".tmp", "desktop-context-ranges");
let directory: string;
let app: ElectronApplication | undefined;
let page: Page;
let errors: string[];
let originId: string;
type Probe = typeof globalThis & {
  contextRequests: QueryRequest[];
  contextInitialDone?: () => void;
};
const anchor: LogEvent = {
  id: "context-anchor",
  timestamp: Date.parse("2026-07-15T10:20:30.123Z"),
  connectionId: "context-connection",
  logGroup: "/aws/lambda/orders-api",
  logStream: "context-profile/selected-stream",
  message: JSON.stringify({
    level: "error",
    message: "anchor selected source",
  }),
};
const other: LogEvent = {
  ...anchor,
  id: "context-other-row",
  connectionId: "offline",
  timestamp: anchor.timestamp - 7000,
  logStream: "origin-profile/other-stream",
  message: JSON.stringify({ level: "error", message: "anchor other source" }),
};

test.beforeEach(async ({}, info) => {
  await mkdir(temporaryRoot, { recursive: true });
  directory = await mkdtemp(join(temporaryRoot, "case-"));
  errors = [];
  app = undefined;
  const workspace = createWorkspace();
  workspace.preferences.theme = info.title.includes("dark") ? "dark" : "light";
  workspace.preferences.timezone = "utc";
  workspace.sidebarVisible = false;
  workspace.connections.push({
    id: "context-connection",
    name: "Context profile",
    profile: "context-profile",
    region: "us-east-1",
    mode: "offline",
  });
  const origin = workspace.tabs[0];
  originId = origin.id;
  origin.title = "Original filtered view";
  origin.sources = [
    { connectionId: "offline", logGroup: anchor.logGroup },
    { connectionId: "context-connection", logGroup: anchor.logGroup },
  ];
  origin.timePreset = "clear";
  origin.filterPattern = "anchor";
  origin.filterMode = "plain";
  origin.view.mode = "table";
  origin.view.localSearch = "anchor";
  origin.view.levels = ["error"];
  origin.view.level = "error";
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
  await expect(page.locator(".query-status")).toHaveAttribute(
    "data-query-state",
    "complete",
  );
  await app.evaluate(({ ipcMain, BrowserWindow, dialog }) => {
    const probe = globalThis as Probe;
    probe.contextRequests = [];
    const contents = BrowserWindow.getAllWindows()[0].webContents;
    dialog.showMessageBox = async () => {
      throw new Error("Unexpected dialog during hidden context verification");
    };
    ipcMain.removeHandler("explorer:query");
    ipcMain.handle("explorer:query", (event, request: QueryRequest) => {
      if (
        event.sender !== contents ||
        event.senderFrame !== contents.mainFrame ||
        request.connection.mode !== "offline" ||
        request.connections?.some((connection) => connection.mode !== "offline")
      )
        throw new Error(
          "Context test accepts only its trusted offline renderer",
        );
      probe.contextRequests.push(request);
      if (probe.contextRequests.length === 1)
        return new Promise<void>((done) => {
          probe.contextInitialDone = done;
        });
      contents.send("explorer:update", {
        requestId: request.requestId,
        state: "complete",
        events: [],
        replace: true,
      });
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
    throw new Error("Unsafe context verification cleanup path");
  await rm(directory, {
    recursive: true,
    force: true,
    maxRetries: 10,
    retryDelay: 100,
  });
});

async function requests() {
  return app!.evaluate(() => (globalThis as Probe).contextRequests);
}
async function savedWorkspace() {
  return JSON.parse(
    await readFile(join(directory, "workspace.json"), "utf8"),
  ) as Workspace;
}
async function loadEvents(events = [other, anchor]) {
  await page.getByTestId("run-query").click();
  await expect.poll(async () => (await requests()).length).toBe(1);
  await app!.evaluate(({ BrowserWindow }, events) => {
    const requestId = (globalThis as Probe).contextRequests[0].requestId;
    BrowserWindow.getAllWindows()[0].webContents.send("explorer:update", {
      requestId,
      state: "complete",
      events,
      replace: true,
    });
    (globalThis as Probe).contextInitialDone?.();
  }, events);
  await expect(page.locator(".virtual-event")).toHaveCount(events.length);
}
async function openContext(id = anchor.id) {
  await page
    .locator(`[data-event-id="${id}"] .inspect-cell`)
    .first()
    .click({ button: "right" });
  await page
    .getByRole("menuitem", { name: "Surrounding context", exact: true })
    .hover();
}
async function capture(filename: string) {
  let png = "";
  for (let frame = 0; frame < 3; frame++) {
    await page.evaluate(
      () =>
        new Promise<void>((done) =>
          requestAnimationFrame(() => requestAnimationFrame(() => done())),
        ),
    );
    png = await app!.evaluate(async ({ BrowserWindow }) => {
      const window = BrowserWindow.getAllWindows()[0];
      if (window.isVisible())
        throw new Error("Context verification became visible");
      const image = await window.webContents.capturePage(undefined, {
        stayHidden: true,
        stayAwake: true,
      });
      if (window.isVisible())
        throw new Error("Context capture changed visibility");
      return image.toPNG().toString("base64");
    });
  }
  const output = resolve(test.info().outputPath(filename));
  if (!output.startsWith(resolve(".tmp") + sep))
    throw new Error("Context evidence must remain under .tmp");
  await mkdir(test.info().outputDir, { recursive: true });
  await writeFile(output, Buffer.from(png, "base64"));
}

test("all 18 direction and duration choices query the clicked event source at exact milliseconds and preserve the filtered origin", async () => {
  test.setTimeout(300000);
  await loadEvents();
  // Leave another row selected: context must use the right-clicked event.
  await page
    .locator(`[data-event-id="${other.id}"] .inspect-cell`)
    .first()
    .click();
  const original = (await savedWorkspace()).tabs.find(
    (tab) => tab.id === originId,
  )!;
  let count = 1;
  for (const [direction, menu] of [
    ["past", "Back"],
    ["future", "Forward"],
    ["both", "Both directions"],
  ] as const) {
    for (const [duration, durationMs] of [
      ["1 second", 1000],
      ["5 seconds", 5000],
      ["10 seconds", 10000],
      ["30 seconds", 30000],
      ["1 minute", 60000],
      ["5 minutes", 300000],
    ] as const) {
      await openContext();
      await page.getByRole("menuitem", { name: menu, exact: true }).hover();
      await page.getByRole("menuitem", { name: duration, exact: true }).click();
      await expect(page.getByRole("menu")).toHaveCount(0);
      await expect.poll(async () => (await requests()).length).toBe(++count);
      const request = (await requests()).at(-1)!;
      const startTime =
        direction === "future"
          ? anchor.timestamp
          : anchor.timestamp - durationMs;
      const endTime =
        direction === "past"
          ? anchor.timestamp + 1
          : anchor.timestamp + durationMs;
      expect(request).toMatchObject({
        connection: {
          id: "context-connection",
          region: "us-east-1",
          profile: "context-profile",
        },
        sources: [
          {
            connectionId: "context-connection",
            logGroup: anchor.logGroup,
            logStreams: [anchor.logStream],
          },
        ],
        startTime,
        endTime,
        kind: "events",
        filterPattern: "",
      });
      expect(startTime).toBeLessThanOrEqual(anchor.timestamp);
      expect(endTime).toBeGreaterThan(anchor.timestamp);
      await expect(
        page.getByRole("combobox", {
          name: "CloudWatch filter pattern",
          exact: true,
        }),
      ).toHaveValue("");
      await expect(
        page.getByRole("textbox", {
          name: "Local filter loaded events",
          exact: true,
        }),
      ).toHaveValue("");
      await expect
        .poll(async () => (await savedWorkspace()).tabs.length)
        .toBe(count);
      const saved = await savedWorkspace();
      expect(saved.tabs.find((tab) => tab.id === originId)).toEqual(original);
      const context = saved.tabs.at(-1)!;
      expect(context).toMatchObject({
        connectionId: "context-connection",
        timePreset: "custom",
        customStart: new Date(startTime).toISOString(),
        customEnd: new Date(endTime).toISOString(),
        filterPattern: "",
        view: { localSearch: "", level: "", levels: [...LOG_LEVELS] },
      });
      expect(context.title).toContain(
        direction === "both"
          ? `${duration} before and after`
          : `${direction === "past" ? "Previous" : "Next"} ${duration}`,
      );
      await page.locator(`[data-tab-id="${originId}"] [role="tab"]`).click();
      await expect(
        page.locator(`.virtual-event[data-event-id="${anchor.id}"]`),
      ).toBeVisible();
    }
  }
});

test("dark nested context menus keep one owner, themed hoverable hints and dismiss on Escape, outside clicks and another menu", async () => {
  await loadEvents();
  await openContext();
  await page.getByRole("menuitem", { name: "Back", exact: true }).hover();
  const choice = page.getByRole("menuitem", { name: "5 seconds", exact: true });
  await choice.hover();
  await expect(page.getByRole("menu")).toHaveCount(3);
  const owners = await page
    .getByRole("menu")
    .evaluateAll((menus) =>
      menus.map((menu) => menu.getAttribute("data-app-menu-id")),
    );
  expect(new Set(owners).size).toBe(1);
  expect(owners[0]).toBeTruthy();
  const tooltip = page
    .getByRole("tooltip")
    .filter({ hasText: "Previous 5 seconds" });
  await expect(tooltip).toBeVisible();
  await tooltip.hover();
  await expect(tooltip).toBeVisible();
  await expect(page.getByRole("menu")).toHaveCount(3);
  await capture("dark-context-menu.png");
  await page.keyboard.press("Escape");
  await expect(page.getByRole("menu")).toHaveCount(0);
  await openContext();
  await page.locator(".pane-title").click();
  await expect(page.getByRole("menu")).toHaveCount(0);
  await openContext();
  await page.getByRole("button", { name: /^AWS filter mode:/ }).click();
  await expect(
    page.getByRole("menuitem", { name: "Surrounding context", exact: true }),
  ).toHaveCount(0);
  await expect(page.getByRole("menu")).toHaveCount(1);
  await page.keyboard.press("Escape");
  expect(await requests()).toHaveLength(1);
});

for (const paged of [false, true])
  test(`opening surrounding context selects and reveals the origin ${paged ? "after paging" : "on the first page"}`, async () => {
    await loadEvents();
    await app!.evaluate(
      ({ ipcMain, BrowserWindow }, { origin, paged }) => {
        const probe = globalThis as Probe;
        const contents = BrowserWindow.getAllWindows()[0].webContents;
        ipcMain.removeHandler("explorer:query");
        ipcMain.handle("explorer:query", (event, request: QueryRequest) => {
          if (
            event.sender !== contents ||
            event.senderFrame !== contents.mainFrame ||
            request.connection.mode !== "offline"
          )
            throw new Error("Unexpected context query source");
          probe.contextRequests.push(request);
          const start = request.cursor ? 400 : 0;
          const events = Array.from(
            { length: request.cursor || !paged ? 300 : 400 },
            (_, index) => ({
              ...origin,
              id: `context-neighbor-${start + index}`,
              timestamp: origin.timestamp - 600 + start + index,
              message: JSON.stringify({
                level: "info",
                message: `neighbor ${start + index}`,
              }),
            }),
          );
          if (request.cursor || !paged)
            events.splice(200, 0, { ...origin, id: "context-returned-anchor" });
          contents.send("explorer:update", {
            requestId: request.requestId,
            state: "complete",
            events,
            replace: !request.cursor,
            cursor: request.cursor || !paged ? undefined : "origin-page-2",
          });
        });
      },
      { origin: anchor, paged },
    );
    await openContext();
    await page
      .getByRole("menuitem", { name: "Both directions", exact: true })
      .hover();
    await page
      .getByRole("menuitem", { name: "5 minutes", exact: true })
      .click();
    await expect
      .poll(async () => (await requests()).length)
      .toBe(paged ? 3 : 2);
    const selected = page.locator(
      '.virtual-event[data-event-id="context-returned-anchor"]',
    );
    await expect(selected).toBeVisible();
    await expect(selected).toHaveAttribute("aria-selected", "true");
    await expect(selected).toHaveAttribute("data-current", "true");
    const position = await selected.evaluate((row) => {
      const viewport = row.closest(".viewer-scroll")!;
      const item = row.getBoundingClientRect(),
        outer = viewport.getBoundingClientRect();
      return {
        inside: item.top >= outer.top && item.bottom <= outer.bottom,
        top: viewport.scrollTop,
      };
    });
    expect(position.inside).toBe(true);
    expect(position.top).toBeGreaterThan(0);
    // Subsequent renders must not take selection back from the user.
    await page.locator(".viewer-scroll:visible").press("ArrowUp");
    await expect(selected).toHaveAttribute("data-current", "false");
  });

for (const theme of ["light", "dark"])
  test(`${theme} inspector Ctrl-click recursively toggles only the requested JSON branch`, async () => {
    await loadEvents([
      {
        ...anchor,
        message: JSON.stringify({
          level: "error",
          message: "anchor recursive toggle",
          payload: { nested: { list: [{ value: "leaf" }] } },
          sibling: { keep: { value: 2 } },
        }),
      },
    ]);
    const inspector = page.getByRole("region", {
      name: "Event inspector",
      exact: true,
    });
    await inspector
      .getByRole("button", { name: "Expand /sibling", exact: true })
      .click();
    await inspector
      .getByRole("button", { name: "Expand /sibling/keep", exact: true })
      .click();
    await inspector
      .getByRole("button", { name: "Expand /payload", exact: true })
      .click({ modifiers: ["Control"] });
    await expect(
      inspector.getByRole("button", {
        name: "Collapse /payload/nested/list/0",
        exact: true,
      }),
    ).toBeVisible();
    await inspector
      .getByRole("button", { name: "Collapse /payload/nested", exact: true })
      .click();
    await inspector
      .getByRole("button", { name: "Collapse /payload", exact: true })
      .click({ modifiers: ["Control"] });
    await expect(
      inspector.getByRole("button", {
        name: "Collapse /payload/nested/list/0",
        exact: true,
      }),
    ).toBeVisible();
    await inspector
      .getByRole("button", { name: "Collapse /payload", exact: true })
      .click({ modifiers: ["Control"] });
    await expect(
      inspector.getByRole("button", { name: "Expand /payload", exact: true }),
    ).toBeVisible();
    await expect(
      inspector.getByRole("button", {
        name: "Collapse /sibling/keep",
        exact: true,
      }),
    ).toBeVisible();
    await inspector
      .getByRole("button", { name: "Expand /payload", exact: true })
      .click();
    await expect(
      inspector.getByRole("button", {
        name: "Expand /payload/nested",
        exact: true,
      }),
    ).toBeVisible();
  });

test("aggregate rows without a source stream disable surrounding context", async () => {
  await loadEvents([{ ...anchor, id: "aggregate-row", logStream: "" }]);
  await page
    .locator('[data-event-id="aggregate-row"] .inspect-cell')
    .first()
    .click({ button: "right" });
  const trigger = page.getByRole("menuitem", {
    name: "Surrounding context",
    exact: true,
  });
  await expect(trigger).toBeDisabled();
  await expect(trigger).toHaveAttribute("data-tooltip", /no source stream/);
  await page.keyboard.press("Escape");
  await expect(page.getByRole("menu")).toHaveCount(0);
  expect(await requests()).toHaveLength(1);
});
