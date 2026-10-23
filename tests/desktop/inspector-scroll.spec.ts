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
  QueryUpdate,
} from "../../src/shared/contracts";
import {
  createTab,
  createWorkspace,
  workspaceReducer,
} from "../../src/renderer/workspace";
import { desktopExecutablePath } from "./desktop-app";

test.setTimeout(45000);
const temporaryRoot = resolve(".tmp", "desktop-inspector-scroll");
let directory: string;
let app: ElectronApplication | undefined;
let page: Page;
let errors: string[];
type MainProbe = typeof globalThis & {
  feedbackRequests: QueryRequest[];
  feedbackPending: Map<string, () => void>;
  inspectorReplayEvents?: LogEvent[];
};

test.beforeEach(async ({}, info) => {
  await mkdir(temporaryRoot, { recursive: true });
  directory = await mkdtemp(join(temporaryRoot, "case-"));
  errors = [];
  app = undefined;
  let workspace = createWorkspace();
  workspace.preferences.theme = info.title.includes("dark") ? "dark" : "light";
  workspace.sidebarVisible = false;
  workspace.preferences.timezone = "utc";
  workspace.tabs[0].timePreset = "clear";
  workspace.tabs[0].filterPattern = "";
  workspace.tabs[0].view.mode = "table";
  workspace.tabs[0].view.wrap = false;
  workspace.tabs[0].view.localSearch = "";
  if (info.title.includes("profile")) {
    workspace.preferences.highlightProfiles = [
      {
        id: "inspector-profile",
        name: "Inspector profile",
        enabled: true,
        groupPattern: "orders-api$",
        groupIgnoreCase: false,
        rules: [
          {
            id: "profile-text",
            enabled: true,
            scope: "text",
            path: "",
            pattern: "profile-hit",
            target: "text",
            ignoreCase: false,
            separateThemeColors: true,
            colors: { background: "#ff9900" },
            darkColors: { background: "#cc66ff" },
            lightColors: { background: "#99ddff" },
          },
        ],
      },
    ];
  }
  if (info.title.includes("per-tab") || info.title.includes("short split")) {
    const second = createTab("offline", [
      { logGroup: "/aws/lambda/orders-api" },
    ]);
    second.id = "inspector-second";
    second.title = "Second inspector";
    second.filterPattern = "";
    second.timePreset = "clear";
    workspace = workspaceReducer(workspace, { type: "tab/open", tab: second });
    if (info.title.includes("short split")) {
      workspace = workspaceReducer(workspace, {
        type: "pane/show-tabs",
        tabIds: ["tab-orders", second.id],
      });
      const split = workspace.splitTabs![0];
      if (split.layout.type !== "split")
        throw new Error("Expected split fixture");
      split.layout.axis = "vertical";
      split.layout.ratio = 0.5;
    } else {
      workspace = workspaceReducer(workspace, {
        type: "tab/select",
        tabId: "tab-orders",
      });
    }
  }
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
        "Unexpected native dialog during hidden inspector-scroll verification",
      );
    };
  });
  await expect(page.locator(".query-status").first()).toHaveAttribute(
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
          "Inspector scroll test accepts only its trusted offline renderer",
        );
      probe.feedbackRequests.push(request);
      if (probe.inspectorReplayEvents)
        return new Promise<void>((done) =>
          setTimeout(() => {
            contents.send("explorer:update", {
              requestId: request.requestId,
              state: "complete",
              replace: true,
              events: probe.inspectorReplayEvents,
            });
            done();
          }, 0),
        );
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
    throw new Error("Unsafe inspector-scroll cleanup path");
  await rm(directory, {
    recursive: true,
    force: true,
    maxRetries: 10,
    retryDelay: 100,
  });
});

const inspector = () =>
  page.getByRole("region", { name: "Event inspector", exact: true }).first();
const messageScroll = () => inspector().locator(".inspector-content");
const messageMap = () => inspector().locator(".inspector-message-overview");
const messageMarks = (origin: string) =>
  messageMap().locator(
    `.inspector-message-mark[data-match-origin="${origin}"]`,
  );
const listMarks = () =>
  page
    .locator(".event-overview .overview-highlights .event-overview-mark")
    .first();

async function requests() {
  return app!.evaluate(() => (globalThis as MainProbe).feedbackRequests);
}

async function load(message: string, filterPattern = "", count = 80) {
  const before = (await requests()).length;
  const input = page
    .getByRole("combobox", {
      name: "CloudWatch filter pattern",
      exact: true,
    })
    .first();
  await input.fill(filterPattern);
  await page.getByTestId("run-query").first().click();
  await expect.poll(async () => (await requests()).length).toBe(before + 1);
  const events: LogEvent[] = Array.from({ length: count }, (_, index) => ({
    id: index === 0 ? "inspector-target" : `inspector-filler-${index}`,
    timestamp: 100000 + index * 1000,
    message:
      index === 0
        ? message
        : JSON.stringify({ server: "server-hit", local: "local-hit", index }),
    logGroup: "/aws/lambda/orders-api",
    logStream: "inspector-stream",
    ingestionTime: 250000,
  }));
  await app!.evaluate(
    ({ BrowserWindow }, payload) => {
      const probe = globalThis as MainProbe;
      const requestId = probe.feedbackRequests[payload.index].requestId;
      BrowserWindow.getAllWindows()[0].webContents.send("explorer:update", {
        requestId,
        state: "complete",
        events: payload.events,
        replace: true,
      });
      probe.feedbackPending.get(requestId)?.();
      probe.feedbackPending.delete(requestId);
    },
    { index: before, events },
  );
  await expect(page.locator(".query-status").first()).toContainText(
    `${count} loaded`,
  );
  await page
    .locator('.virtual-event[data-event-id="inspector-target"] .inspect-cell')
    .first()
    .click();
  await expect(inspector()).toHaveAttribute(
    "data-event-id",
    "inspector-target",
  );
}

function structuredMessage() {
  return JSON.stringify({
    server: "server-hit",
    local: "local-hit",
    manual: "manual-hit",
    ...Object.fromEntries(
      Array.from({ length: 60 }, (_, index) => [
        `padding${index}`,
        `ordinary payload ${index}`,
      ]),
    ),
    nested: { deep: { target: "manual-hit local-hit server-hit" } },
    final: "profile-hit",
  });
}

async function mode(name: "Raw message" | "Structured") {
  await inspector()
    .locator("label")
    .filter({ hasText: new RegExp(`^${name}$`) })
    .click();
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
        throw new Error("Inspector capture became visible");
      const image = await window.webContents.capturePage(undefined, {
        stayHidden: true,
        stayAwake: true,
      });
      if (window.isVisible())
        throw new Error("Inspector capture changed visibility");
      return image.toPNG().toString("base64");
    });
  }
  const output = resolve(test.info().outputPath(filename));
  if (!output.startsWith(resolve(".tmp") + sep))
    throw new Error("Inspector evidence must stay under .tmp");
  await mkdir(test.info().outputDir, { recursive: true });
  await writeFile(output, Buffer.from(png, "base64"));
}

async function assertOnlyMessageScrolls() {
  const geometry = await inspector().evaluate((element) => {
    const body = element.querySelector<HTMLElement>(".event-inspector-body")!;
    const message = element.querySelector<HTMLElement>(".inspector-content")!;
    const rect = element.getBoundingClientRect();
    return {
      bodyTop: body.scrollTop,
      bodyRange: body.scrollHeight - body.clientHeight,
      messageRange: message.scrollHeight - message.clientHeight,
      messageHeight: message.clientHeight,
      messageTop: message.scrollTop,
      messageBottom: message.getBoundingClientRect().bottom,
      panelBottom: rect.bottom,
      overflowing: [...body.querySelectorAll<HTMLElement>("*")]
        .filter(
          (node) =>
            ["auto", "scroll"].includes(getComputedStyle(node).overflowY) &&
            node.scrollHeight > node.clientHeight + 1,
        )
        .map((node) => node.className),
    };
  });
  if (
    geometry.bodyRange > 1 ||
    geometry.messageBottom > geometry.panelBottom + 1 ||
    geometry.messageHeight < 1
  ) {
    const diagnostics = await inspector().evaluate((element) =>
      [
        element,
        ...element.querySelectorAll<HTMLElement>(
          ".event-inspector-header,.event-inspector-body,.inspector-information,.inspector-information-toolbar,.inspector-source,.inspector-tools,.inspector-message-layout,.inspector-message-overview,.inspector-content",
        ),
      ].map((node) => {
        const style = getComputedStyle(node);
        const rect = node.getBoundingClientRect();
        return {
          className: node.className,
          text: node.textContent?.slice(0, 80),
          top: rect.top,
          bottom: rect.bottom,
          width: rect.width,
          height: rect.height,
          clientHeight: node.clientHeight,
          scrollHeight: node.scrollHeight,
          css: Object.fromEntries(
            [
              "display",
              "flex",
              "flex-direction",
              "flex-shrink",
              "flex-grow",
              "flex-basis",
              "height",
              "min-height",
              "max-height",
              "margin",
              "padding",
              "gap",
              "overflow",
              "overflow-x",
              "overflow-y",
              "box-sizing",
            ].map((property) => [property, style.getPropertyValue(property)]),
          ),
        };
      }),
    );
    await test.info().attach("inspector-layout-diagnostics", {
      body: JSON.stringify(diagnostics, null, 2),
      contentType: "application/json",
    });
    await capture("overflow-layout.png");
  }
  expect(geometry.bodyRange, JSON.stringify(geometry)).toBeLessThanOrEqual(1);
  expect(geometry.bodyTop).toBe(0);
  expect(geometry.messageRange).toBeGreaterThan(300);
  expect(geometry.messageHeight).toBeGreaterThan(0);
  expect(geometry.messageBottom).toBeLessThanOrEqual(geometry.panelBottom + 1);
  expect(geometry.overflowing).toEqual([
    expect.stringContaining("inspector-content"),
  ]);
  await expect(
    inspector()
      .locator("label")
      .filter({ hasText: /^Structured$/ }),
  ).toBeInViewport();
  await expect(
    inspector()
      .locator("label")
      .filter({ hasText: /^Raw message$/ }),
  ).toBeInViewport();
  await expect(
    inspector().getByRole("button", { name: "Copy", exact: true }),
  ).toBeInViewport();
}

for (const theme of ["light", "dark"])
  test(`${theme} AWS and local evidence stay in the inspector map while quick highlights remain in the list map`, async () => {
    await load(structuredMessage(), '{ $.server = "server-hit" }');
    await page
      .getByRole("textbox", { name: "Local filter loaded events", exact: true })
      .fill("local-hit");
    await expect(
      inspector().locator('[data-highlight-origins="server"]').first(),
    ).toBeVisible();
    await expect(
      inspector().locator('[data-highlight-origins="local"]').first(),
    ).toBeVisible();
    await expect(listMarks()).toHaveCount(0);
    await expect(messageMarks("server").first()).toBeVisible();
    await expect(messageMarks("local").first()).toBeVisible();
    await page
      .getByRole("textbox", {
        name: "Highlight text in loaded events",
        exact: true,
      })
      .fill("manual-hit");
    await expect(messageMarks("manual").first()).toBeVisible();
    await expect(listMarks()).toBeVisible();
    const colors = await messageMap().evaluate((element) =>
      ["server", "local", "manual"].map(
        (origin) =>
          getComputedStyle(
            element.querySelector(
              `.inspector-message-mark[data-match-origin="${origin}"]`,
            )!,
          ).backgroundColor,
      ),
    );
    expect(new Set(colors).size).toBe(3);
    expect((await requests()).length).toBe(1);
    await capture(`inspector-map-${theme}.png`);
  });

test("profile matches keep both list and inspector maps with theme colors", async () => {
  await load(structuredMessage());
  await expect(listMarks()).toBeVisible();
  await expect(messageMarks("profile").first()).toBeVisible();
  await expect(messageMarks("profile").first()).toHaveCSS(
    "background-color",
    "rgb(153, 221, 255)",
  );
  await messageMarks("profile").last().click();
  await expect(
    inspector().locator('[data-json-path="/final"]'),
  ).toBeInViewport();
  expect(
    await messageScroll().evaluate((element) => element.scrollTop),
  ).toBeGreaterThan(300);
});

test("raw multiline message map uses rendered positions and navigates after wrapping and resize", async () => {
  const text = Array.from(
    { length: 120 },
    (_, index) =>
      `${String(index).padStart(3, "0")} ${index === 8 || index === 65 || index === 110 ? "raw-hit" : "ordinary"} ${"wide payload ".repeat(8)}`,
  ).join("\n");
  await load(text);
  await mode("Raw message");
  await page
    .getByRole("textbox", {
      name: "Highlight text in loaded events",
      exact: true,
    })
    .fill("raw-hit");
  await expect(messageMarks("manual")).toHaveCount(3);
  const assertProportions = async () => {
    await expect(messageMarks("manual")).toHaveCount(3);
    await expect
      .poll(() =>
        messageMap().evaluate((element) => {
          const box = element.getBoundingClientRect();
          const scroll =
            element.parentElement!.querySelector<HTMLElement>(
              ".inspector-content",
            )!;
          const matches = [
            ...scroll.querySelectorAll<HTMLElement>(
              '.raw-content mark[data-highlight-origins="manual"]',
            ),
          ];
          const scrollBox = scroll.getBoundingClientRect();
          const marks = [
            ...element.querySelectorAll<HTMLElement>(
              '.inspector-message-mark[data-match-origin="manual"]',
            ),
          ];
          if (marks.length !== 3 || matches.length !== 3) return Infinity;
          const positions = marks.map((mark, index) => ({
            actual: mark.getBoundingClientRect().top - box.top,
            expected:
              ((matches[index].getBoundingClientRect().top -
                scrollBox.top +
                scroll.scrollTop -
                scroll.clientTop) /
                scroll.scrollHeight) *
              box.height,
          }));
          return Math.max(
            ...positions.map((position) =>
              Math.abs(position.actual - position.expected),
            ),
          );
        }),
      )
      // The overview deliberately rounds measured spans into one-pixel buckets.
      .toBeLessThanOrEqual(1.1);
  };
  await assertProportions();
  await messageMarks("manual").last().click();
  await expect(
    inspector()
      .locator('.raw-content mark[data-highlight-origins="manual"]')
      .last(),
  ).toBeInViewport();
  await assertOnlyMessageScrolls();
  await page.setViewportSize({ width: 950, height: 680 });
  const wrap = page
    .getByRole("button", { name: "Toggle line wrap", exact: true })
    .first();
  await wrap.click();
  await expect(messageScroll()).toHaveClass(/inspector-wrap/);
  await assertOnlyMessageScrolls();
  await assertProportions();
  await messageMarks("manual").first().click();
  await expect(
    inspector()
      .locator('.raw-content mark[data-highlight-origins="manual"]')
      .first(),
  ).toBeInViewport();
  await messageMarks("manual").last().click();
  await expect(
    inspector()
      .locator('.raw-content mark[data-highlight-origins="manual"]')
      .last(),
  ).toBeInViewport();
  await assertOnlyMessageScrolls();
  await capture("raw-message-resized.png");
});

test("folded structured branches keep measured map markers and clicking reveals the folded match", async () => {
  await load(structuredMessage());
  await page
    .getByRole("textbox", {
      name: "Highlight text in loaded events",
      exact: true,
    })
    .fill("manual-hit");
  const fold = inspector().getByRole("button", {
    name: "Collapse /nested",
    exact: true,
  });
  await expect(fold).toBeVisible();
  await fold.click();
  const folded = inspector().locator(
    '[data-json-path="/nested"] .json-match-indicator',
  );
  await expect(folded).toBeVisible();
  await expect(messageMarks("manual")).toHaveCount(2);
  await messageMarks("manual").last().click();
  await expect(
    inspector().locator('[data-json-path="/nested"]'),
  ).toBeInViewport();
  await expect(folded).toBeVisible();
  const before = await messageMarks("manual")
    .last()
    .getAttribute("data-content-start");
  await inspector()
    .getByRole("button", { name: "Expand /nested", exact: true })
    .click();
  const expandDeep = inspector().getByRole("button", {
    name: "Expand /nested/deep",
    exact: true,
  });
  if (await expandDeep.count()) await expandDeep.click();
  await expect(messageMarks("manual").last()).not.toHaveAttribute(
    "data-content-start",
    before!,
  );
  await messageMarks("manual").last().click();
  await expect(
    inspector().locator('[data-json-path="/nested/deep/target"]'),
  ).toBeInViewport();
  await capture("folded-message-map.png");
});

test("short split keeps metadata and mode controls reachable while only message scrolls", async () => {
  await page.setViewportSize({ width: 1150, height: 920 });
  await load(structuredMessage());
  const collapse = inspector().getByRole("button", {
    name: "Collapse event information",
    exact: true,
  });
  await collapse.click();
  await expect(inspector().locator(".inspector-source")).toBeHidden();
  await assertOnlyMessageScrolls();
  const before = await inspector()
    .locator("label")
    .filter({ hasText: /^Raw message$/ })
    .boundingBox();
  await messageScroll().hover();
  await page.mouse.wheel(0, 20000);
  await expect
    .poll(() => messageScroll().evaluate((element) => element.scrollTop))
    .toBeGreaterThan(300);
  await assertOnlyMessageScrolls();
  expect(
    await inspector()
      .locator("label")
      .filter({ hasText: /^Raw message$/ })
      .boundingBox(),
  ).toEqual(before);
  await mode("Raw message");
  await expect(inspector().locator(".raw-content pre")).toContainText(
    "profile-hit",
  );
  await mode("Structured");
  await expect(inspector().locator(".json-tree")).toBeVisible();
  await capture("short-split-message-scroll.png");
});

test("event information collapse is independent per-tab and persists after reload", async () => {
  await load(structuredMessage());
  await app!.evaluate((_, message) => {
    (globalThis as MainProbe).inspectorReplayEvents = [
      {
        id: "inspector-target",
        timestamp: 100000,
        message,
        logGroup: "/aws/lambda/orders-api",
        logStream: "inspector-stream",
      },
    ];
  }, structuredMessage());
  await expect(inspector().locator(".inspector-source")).toBeVisible();
  await inspector()
    .getByRole("button", { name: "Collapse event information", exact: true })
    .click();
  await expect(inspector().locator(".inspector-source")).toBeHidden();
  await page
    .locator('[data-tab-id="inspector-second"]')
    .getByRole("tab")
    .click();
  await expect(
    inspector().getByRole("button", {
      name: "Collapse event information",
      exact: true,
    }),
  ).toBeVisible();
  await expect(inspector().locator(".inspector-source")).toBeVisible();
  await page.locator('[data-tab-id="tab-orders"]').getByRole("tab").click();
  await expect(
    inspector().getByRole("button", {
      name: "Expand event information",
      exact: true,
    }),
  ).toBeVisible();
  await expect
    .poll(async () => {
      const stored = JSON.parse(
        await readFile(join(directory, "workspace.json"), "utf8"),
      );
      return {
        activeTabId: stored.activeTabId,
        tabs: stored.tabs.map(
          (tab: { id: string; view: { inspectorInfoCollapsed?: boolean } }) => [
            tab.id,
            tab.view.inspectorInfoCollapsed === true,
          ],
        ),
      };
    })
    .toEqual({
      activeTabId: "tab-orders",
      tabs: [
        ["tab-orders", true],
        ["inspector-second", false],
      ],
    });
  await page.reload();
  await expect(
    inspector().getByRole("button", {
      name: "Expand event information",
      exact: true,
    }),
  ).toBeVisible();
  await page
    .locator('[data-tab-id="inspector-second"]')
    .getByRole("tab")
    .click();
  await expect(
    inspector().getByRole("button", {
      name: "Collapse event information",
      exact: true,
    }),
  ).toBeVisible();
});

test("slow highlight worker updates keep real row content visible without preparing placeholders", async () => {
  await load(
    JSON.stringify({ message: "payload remains readable manual-hit" }),
  );
  await page.evaluate(() => {
    const probe = window as unknown as {
      delayedHighlightJobs: number;
      presentationViolations: string[];
      stopPresentationProbe: () => void;
    };
    probe.delayedHighlightJobs = 0;
    probe.presentationViolations = [];
    const original = Worker.prototype.postMessage;
    Worker.prototype.postMessage = function (
      message: unknown,
      options?: unknown,
    ) {
      if (
        message &&
        typeof message === "object" &&
        "events" in message &&
        "profiles" in message
      ) {
        probe.delayedHighlightJobs++;
        setTimeout(
          () =>
            original.call(this, message, options as StructuredSerializeOptions),
          250,
        );
      } else
        original.call(this, message, options as StructuredSerializeOptions);
    };
    const inspect = () => {
      for (const row of document.querySelectorAll<HTMLElement>(
        ".virtual-event",
      )) {
        if (
          getComputedStyle(row, "::after").content.includes(
            "Preparing highlights",
          ) ||
          row.textContent?.includes("Preparing highlights")
        )
          probe.presentationViolations.push("Preparing highlights placeholder");
        if (
          [...row.children].some(
            (child) => getComputedStyle(child).visibility === "hidden",
          )
        )
          probe.presentationViolations.push("Hidden row content");
      }
    };
    const observer = new MutationObserver(inspect);
    observer.observe(document.querySelector(".virtual-events")!, {
      subtree: true,
      attributes: true,
      childList: true,
      characterData: true,
    });
    let frame = 0;
    const sample = () => {
      inspect();
      frame = requestAnimationFrame(sample);
    };
    frame = requestAnimationFrame(sample);
    probe.stopPresentationProbe = () => {
      observer.disconnect();
      cancelAnimationFrame(frame);
      Worker.prototype.postMessage = original;
    };
  });
  await page
    .getByRole("textbox", {
      name: "Highlight text in loaded events",
      exact: true,
    })
    .fill("manual-hit");
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (window as unknown as { delayedHighlightJobs: number })
            .delayedHighlightJobs,
      ),
    )
    .toBeGreaterThan(0);
  await expect(
    page.locator('.virtual-event[data-event-id="inspector-target"]'),
  ).toContainText("payload remains readable");
  await expect(
    inspector().locator('[data-highlight-origins="manual"]').first(),
  ).toBeVisible();
  const violations = await page.evaluate(() => {
    const probe = window as unknown as {
      presentationViolations: string[];
      stopPresentationProbe: () => void;
    };
    probe.stopPresentationProbe();
    return [...new Set(probe.presentationViolations)];
  });
  expect(violations).toEqual([]);
  expect((await requests()).length).toBe(1);
});

test("unwrapped raw and structured map clicks reveal late-column matches using the message scroll in both axes", async () => {
  const message = JSON.stringify(
    {
      ...Object.fromEntries(
        Array.from({ length: 60 }, (_, index) => [
          `padding${index}`,
          `ordinary payload ${index}`,
        ]),
      ),
      tail: `${"wide ".repeat(300)}late-column-hit`,
    },
    null,
    2,
  );
  await load(message);
  await page
    .getByRole("textbox", {
      name: "Highlight text in loaded events",
      exact: true,
    })
    .fill("late-column-hit");
  for (const name of ["Structured", "Raw message"] as const) {
    await mode(name);
    await expect(messageMarks("manual")).toHaveCount(1);
    await messageScroll().hover();
    await page.mouse.wheel(-20000, -20000);
    await expect
      .poll(() => messageScroll().evaluate((element) => element.scrollLeft))
      .toBe(0);
    await messageMarks("manual").first().click();
    const match = inspector()
      .locator('.inspector-content mark[data-highlight-origins="manual"]')
      .last();
    await expect(match).toBeInViewport();
    await expect
      .poll(() => messageScroll().evaluate((element) => element.scrollLeft))
      .toBeGreaterThan(300);
    await expect
      .poll(() => messageScroll().evaluate((element) => element.scrollTop))
      .toBeGreaterThan(300);
    const horizontalOwners = await messageScroll().evaluate((element) =>
      [element, ...element.querySelectorAll<HTMLElement>("*")]
        .filter(
          (node) =>
            ["auto", "scroll"].includes(getComputedStyle(node).overflowX) &&
            node.scrollWidth > node.clientWidth + 1,
        )
        .map((node) => node.className),
    );
    expect(horizontalOwners).toEqual([
      expect.stringContaining("inspector-content"),
    ]);
    await assertOnlyMessageScrolls();
  }
  await capture("late-column-message-scroll.png");
});
