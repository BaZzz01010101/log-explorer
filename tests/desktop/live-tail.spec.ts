import { createWorkspace } from "../../src/renderer/workspace";
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

test.setTimeout(150000);
test.describe.configure({ mode: "parallel" });
let app: ElectronApplication | undefined;
let child: ReturnType<ElectronApplication["process"]> | undefined;
let page: Page;
let directory: string;
let errors: string[];
const temporaryRoot = resolve(".tmp", "desktop-live-tail");

test.beforeEach(async ({}, testInfo) => {
  await mkdir(temporaryRoot, { recursive: true });
  directory = await mkdtemp(join(temporaryRoot, "case-"));
  errors = [];
  const state = createWorkspace();
  state.preferences.theme = testInfo.title.includes("light") ? "light" : "dark";
  state.preferences.timezone = "utc";
  state.tabs[0].filterPattern = testInfo.title.includes("quiet")
    ? "no-such-live-message"
    : "";
  state.tabs[0].view.columns = [
    { path: "@timestamp", width: 210, pinned: true },
    { path: "@message", width: 700 },
  ];
  if (
    testInfo.title.includes("light") &&
    testInfo.title.includes("native text selection")
  )
    state.preferences.highlightProfiles = [
      {
        id: "selection",
        name: "Selection",
        enabled: true,
        groupPattern: "",
        groupIgnoreCase: false,
        rules: [
          {
            id: "processed",
            enabled: true,
            scope: "structured",
            path: "/message",
            pattern: "processed",
            ignoreCase: false,
            target: "text",
            colors: { background: "#ffdd66", foreground: "#111111" },
            separateThemeColors: false,
          },
        ],
      },
    ];
  await writeFile(join(directory, "workspace.json"), JSON.stringify(state));

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
        "Unexpected native dialog during hidden Live verification",
      );
    };
  });
  await page
    .locator("label")
    .filter({ hasText: /^Table$/ })
    .click();
  await expect(
    page.locator('.query-status[data-query-state="complete"]'),
  ).toBeVisible();
});

const status = () => page.locator(".query-status");
const rows = () => page.locator(".virtual-event");
const received = async () =>
  Number(await status().getAttribute("data-live-received"));

for (const mode of ["Table", "Hybrid", "JSON"])
  test(`${mode} Live starts receiving after an empty five-minute query without Run`, async () => {
    await app!.evaluate(({ ipcMain }) => {
      (globalThis as any).__emptyHistoryRequests = [];
      ipcMain.removeHandler("explorer:query");
      ipcMain.handle("explorer:query", (event, request) => {
        (globalThis as any).__emptyHistoryRequests.push(request);
        setImmediate(() =>
          event.sender.send("explorer:update", {
            requestId: request.requestId,
            state: "complete",
            events: [],
            replace: true,
          }),
        );
      });
    });
    await page
      .getByRole("button", { name: "Set last 5 minutes", exact: true })
      .click();
    await expect(status()).toHaveAttribute("data-query-state", "complete");
    await expect(page.locator(".viewer-scroll")).toHaveAttribute(
      "aria-rowcount",
      "0",
    );
    await page
      .locator("label")
      .filter({ hasText: new RegExp(`^${mode}$`) })
      .click();
    await page.getByRole("button", { name: "Live", exact: true }).click();
    await expect(status()).toHaveAttribute("data-live-state", "streaming");
    await expect.poll(received).toBeGreaterThan(0);
    await expect.poll(() => rows().count()).toBeGreaterThan(0);
    // Keep one matching event while reception continues. Hidden mouse input
    // acknowledgements can take a second, during which JSON cards would grow
    // from an underfilled list into an overflowing list before the wheel fires.
    const firstId = (await rows().first().getAttribute("data-event-id"))!;
    const fixtureIndex = Number(firstId.split(":").at(-1));
    await page
      .getByRole("textbox", { name: "Local filter loaded events", exact: true })
      .fill(new Date(fixtureIndex * 1000).toISOString());
    await expect(rows()).toHaveCount(1);
    const follow = status().getByRole("button", {
      name: "Follow Live",
      exact: true,
    });
    await expect(follow).toHaveAttribute("aria-pressed", "false");
    const scroll = page.locator(".viewer-scroll"),
      box = (await scroll.boundingBox())!;
    expect(
      await scroll.evaluate(
        (element) => element.scrollHeight <= element.clientHeight + 1,
      ),
    ).toBe(true);
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.wheel(0, 100);
    await expect(follow).toHaveAttribute("aria-pressed", "true");
    await page.mouse.wheel(0, -100);
    await expect(follow).toHaveAttribute("aria-pressed", "false");
    const requests = await app!.evaluate(
      () => (globalThis as any).__emptyHistoryRequests,
    );
    expect(requests).toHaveLength(1);
    expect(requests[0].endTime - requests[0].startTime).toBe(300000);
    await expect(
      page.getByRole("button", { name: "Stop Live", exact: true }),
    ).toBeVisible();
    await capture(`empty-five-minute-live-${mode.toLowerCase()}.png`);
  });

async function capture(filename: string) {
  let png = "";
  for (let index = 0; index < 3; index++) {
    await page.evaluate(
      () =>
        new Promise<void>((done) =>
          requestAnimationFrame(() => requestAnimationFrame(() => done())),
        ),
    );
    png = await app!.evaluate(async ({ BrowserWindow }) => {
      const window = BrowserWindow.getAllWindows()[0];
      if (window.isVisible())
        throw new Error("Live verification became visible");
      return (
        await window.webContents.capturePage(undefined, {
          stayHidden: true,
          stayAwake: true,
        })
      )
        .toPNG()
        .toString("base64");
    });
  }
  await mkdir(test.info().outputDir, { recursive: true });
  await writeFile(test.info().outputPath(filename), Buffer.from(png, "base64"));
}

test("light quiet connected Live waits without an endless loading spinner and time presets return to history", async () => {
  await page.getByRole("button", { name: "Live", exact: true }).click();
  await expect(status()).toHaveAttribute("data-live-state", "streaming");
  await expect(
    page.getByText("Waiting for new events", { exact: true }),
  ).toBeVisible();
  await expect(page.getByLabel("Loading events", { exact: true })).toHaveCount(
    0,
  );
  await expect(
    page.getByRole("button", { name: "Stop Live", exact: true }),
  ).toBeVisible();
  await expect(
    status().getByRole("button", { name: "Follow Live", exact: true }),
  ).toHaveAttribute("aria-pressed", "false");
  await expect(page.locator(".live-session-controls")).toHaveCount(0);
  await capture("live-waiting-light.png");
  await page
    .getByRole("button", { name: "Set last 5 minutes", exact: true })
    .click();
  await expect(status()).toHaveAttribute("data-query-state", "complete");
  await expect(status()).not.toHaveAttribute("data-live-state", "streaming");
  await expect(
    page.getByRole("button", { name: "Live", exact: true }),
  ).toBeVisible();
  await expect(page.getByLabel("Loading events", { exact: true })).toHaveCount(
    0,
  );
});

test("Live preserves matching history, appends events automatically, and Stop retains the received rows", async () => {
  const before = Number(
    await page.locator(".viewer-scroll").getAttribute("aria-rowcount"),
  );
  expect(before).toBe(540);
  await page.getByRole("button", { name: "Live", exact: true }).click();
  await expect(status()).toHaveAttribute("data-query-state", "running");
  await expect
    .poll(async () =>
      Number(
        await page.locator(".viewer-scroll").getAttribute("aria-rowcount"),
      ),
    )
    .toBeGreaterThanOrEqual(before);
  await expect(status()).toHaveAttribute("data-live-state", "streaming");
  await expect.poll(received).toBeGreaterThanOrEqual(2);
  await page.getByRole("button", { name: "Follow Live", exact: true }).click();
  await expect(
    page.locator('.virtual-event[data-event-id^="fixture:live:"]').last(),
  ).toBeVisible();
  await expect(page.getByLabel("Loading events", { exact: true })).toHaveCount(
    0,
  );
  await capture("live-streaming-dark.png");
  await page.getByRole("button", { name: "Stop Live", exact: true }).click();
  await expect(status()).toHaveAttribute("data-live-state", "stopped");
  const stopped = received();
  await page.waitForTimeout(2000);
  expect(await received()).toBe(await stopped);
  await expect(status()).toContainText("Live stopped");
  expect(
    Number(await page.locator(".viewer-scroll").getAttribute("aria-rowcount")),
  ).toBeGreaterThan(before);
});

test("inactive Live tabs cancel reception, resume history on activation and stay stopped after Stop", async () => {
  await page.evaluate(() => {
    (window as any).__liveVisibilityUpdates = [];
    window.explorer.onUpdate((update) =>
      (window as any).__liveVisibilityUpdates.push({
        id: update.requestId,
        state: update.state,
        live: update.liveState,
        count: update.events?.length ?? 0,
      }),
    );
  });
  await page.getByRole("button", { name: "Live", exact: true }).click();
  await expect.poll(received).toBeGreaterThan(0);
  const previousReceived = await received();
  const oldId = await page.evaluate(
    () =>
      (window as any).__liveVisibilityUpdates.findLast(
        (update: any) => update.live === "streaming",
      ).id,
  );
  const orders = page.locator(
    '.workspace-tab[data-tab-id="tab-orders"] [role="tab"]',
  );
  await page
    .getByRole("treeitem", { name: "/aws/lambda/payments-worker", exact: true })
    .getByRole("button", { name: "/aws/lambda/payments-worker", exact: true })
    .dblclick();
  await expect
    .poll(() =>
      page.evaluate(
        (id) =>
          (window as any).__liveVisibilityUpdates.some(
            (update: any) => update.id === id && update.state === "cancelled",
          ),
        oldId,
      ),
    )
    .toBe(true);
  const packetCount = await page.evaluate(
    (id) =>
      (window as any).__liveVisibilityUpdates.filter(
        (update: any) => update.id === id,
      ).length,
    oldId,
  );
  // Observe beyond a fixture generation interval; canceled sessions emit nothing.
  await page.evaluate(() => new Promise((done) => setTimeout(done, 1500)));
  expect(
    await page.evaluate(
      (id) =>
        (window as any).__liveVisibilityUpdates.filter(
          (update: any) => update.id === id,
        ).length,
      oldId,
    ),
  ).toBe(packetCount);
  await orders.click();
  await expect(
    page.getByRole("button", { name: "Stop Live", exact: true }),
  ).toBeVisible();
  await expect.poll(received).toBeGreaterThan(previousReceived);
  const newId = await page.evaluate(
    () =>
      (window as any).__liveVisibilityUpdates.findLast(
        (update: any) => update.live === "streaming",
      ).id,
  );
  expect(newId).not.toBe(oldId);
  await page.getByRole("button", { name: "Stop Live", exact: true }).click();
  await page
    .locator('.workspace-tab:not([data-tab-id="tab-orders"]) [role="tab"]')
    .click();
  await orders.click();
  await expect(
    page.getByRole("button", { name: "Live", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Stop Live", exact: true }),
  ).toHaveCount(0);
});

test("compact Live footer defaults to paused and wheel direction toggles Follow even without overflow", async () => {
  await page
    .getByRole("combobox", { name: "CloudWatch filter pattern", exact: true })
    .fill("no-such-live-message");
  await page.getByTestId("run-query").click();
  await expect(status()).toHaveAttribute("data-query-state", "complete");
  await page.getByRole("button", { name: "Live", exact: true }).click();
  await expect(status()).toHaveAttribute("data-live-state", "streaming");
  const follow = status().getByRole("button", {
    name: "Follow Live",
    exact: true,
  });
  await expect(follow).toHaveAttribute("aria-pressed", "false");
  await expect(page.locator(".live-session-controls")).toHaveCount(0);
  await expect(
    page.getByText(/CloudWatch pattern.*server-side selection/),
  ).toHaveCount(0);
  const viewer = page.locator(".viewer-scroll"),
    box = (await viewer.boundingBox())!;
  expect(
    await viewer.evaluate(
      (element) => element.scrollHeight <= element.clientHeight + 1,
    ),
  ).toBe(true);
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.wheel(0, 100);
  await expect(follow).toHaveAttribute("aria-pressed", "true");
  await capture("compact-live-footer.png");
  await page.mouse.wheel(0, -100);
  await expect(follow).toHaveAttribute("aria-pressed", "false");
});

test("reading older rows pauses following while events continue and Follow Live returns to the newest event", async () => {
  await page.getByRole("button", { name: "Live", exact: true }).click();
  await expect.poll(received).toBeGreaterThanOrEqual(1);
  const follow = page.getByRole("button", { name: "Follow Live", exact: true });
  await expect(follow).toHaveAttribute("aria-pressed", "false");
  await follow.click();
  await expect(follow).toHaveAttribute("aria-pressed", "true");
  const viewer = page.locator(".viewer-scroll"),
    box = (await viewer.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.wheel(0, -900);
  await expect(follow).toHaveAttribute("aria-pressed", "false");
  await expect
    .poll(async () =>
      viewer.evaluate(
        (element) =>
          element.scrollHeight - element.scrollTop - element.clientHeight,
      ),
    )
    .toBeGreaterThan(200);
  const position = await viewer.evaluate((element) => element.scrollTop),
    prior = await received();
  await expect.poll(received).toBeGreaterThan(prior + 1);
  expect(
    Math.abs(
      (await viewer.evaluate((element) => element.scrollTop)) - position,
    ),
  ).toBeLessThan(2);
  await follow.click();
  await expect(follow).toHaveAttribute("aria-pressed", "true");
  await expect(
    page.locator('.virtual-event[data-event-id^="fixture:live:"]').last(),
  ).toBeVisible();
  await expect
    .poll(async () =>
      viewer.evaluate(
        (element) =>
          element.scrollHeight - element.scrollTop - element.clientHeight,
      ),
    )
    .toBeLessThan(80);
});

test("Run leaves Live explicitly and Stop retains received rows without late updates before another Run", async () => {
  await page.getByRole("button", { name: "Live", exact: true }).click();
  await expect.poll(received).toBeGreaterThanOrEqual(1);
  const run = page.getByTestId("run-query");
  await expect(run).toBeEnabled();
  await run.click();
  await expect(status()).toHaveAttribute("data-query-state", "complete");
  await expect(
    page.getByRole("button", { name: "Live", exact: true }),
  ).toBeVisible();
  await expect(page.locator(".viewer-scroll")).toHaveAttribute(
    "aria-rowcount",
    "540",
  );
  await page.evaluate(() => {
    (window as any).__stoppedLiveId = undefined;
    window.explorer.onUpdate((update) => {
      if (update.liveState === "streaming")
        (window as any).__stoppedLiveId = update.requestId;
    });
  });
  await page.getByRole("button", { name: "Live", exact: true }).click();
  await expect(status()).toHaveAttribute("data-live-state", "streaming");
  await expect.poll(received).toBeGreaterThanOrEqual(1);
  const retiredId = await page.evaluate(
    () => (window as any).__stoppedLiveId as string,
  );
  expect(retiredId).toBeTruthy();
  await page.getByRole("button", { name: "Stop Live", exact: true }).click();
  await expect(status()).toHaveAttribute("data-live-state", "stopped");
  const stoppedReceived = await received();
  const stoppedRows = await page
    .locator(".viewer-scroll")
    .getAttribute("aria-rowcount");
  expect(stoppedReceived).toBeGreaterThan(0);
  expect(Number(stoppedRows)).toBeGreaterThan(540);
  await expect(
    page.getByRole("button", { name: "Live", exact: true }),
  ).toBeEnabled();
  await app!.evaluate(({ BrowserWindow }, requestId) => {
    BrowserWindow.getAllWindows()[0].webContents.send("explorer:update", {
      requestId,
      state: "running",
      liveState: "streaming",
      events: [
        {
          id: "retired-live-event",
          timestamp: Date.now(),
          logGroup: "/aws/lambda/orders-api",
          logStream: "retired",
          message: "Late event from a stopped Live session",
        },
      ],
      replace: false,
    });
  }, retiredId);
  await page.waitForTimeout(1500);
  await expect(status()).toHaveAttribute("data-live-state", "stopped");
  expect(await received()).toBe(stoppedReceived);
  await expect(page.locator(".viewer-scroll")).toHaveAttribute(
    "aria-rowcount",
    stoppedRows!,
  );
  await expect(
    page.locator('.virtual-event[data-event-id="retired-live-event"]'),
  ).toHaveCount(0);
  await run.click();
  await expect(status()).toHaveAttribute("data-query-state", "complete");
  await expect(page.locator(".viewer-scroll")).toHaveAttribute(
    "aria-rowcount",
    "540",
  );
});

test("native keyboard scrolling pauses Live following without stopping reception", async () => {
  await page.getByRole("button", { name: "Live", exact: true }).click();
  await expect.poll(received).toBeGreaterThanOrEqual(1);
  const follow = page.getByRole("button", { name: "Follow Live", exact: true });
  const viewer = page.locator(".viewer-scroll");
  for (const key of ["PageUp", "PageDown", "Space", "Shift+Space"]) {
    await viewer.focus();
    await page.keyboard.press(key);
    await expect(follow).toHaveAttribute("aria-pressed", "false");
    const count = await received();
    await expect.poll(received).toBeGreaterThan(count);
    await follow.click();
    await expect(follow).toHaveAttribute("aria-pressed", "true");
  }
});

for (const mode of ["Table", "Hybrid"])
  for (const theme of ["light", "dark"])
    test(`${theme} ${mode} Live preserves forward and backward native text selection through event arrivals`, async () => {
      await page
        .locator("label")
        .filter({ hasText: new RegExp(`^${mode}$`) })
        .click();
      await page
        .getByPlaceholder("Highlight text…", { exact: true })
        .fill("processed");
      await page.getByRole("button", { name: "Live", exact: true }).click();
      await expect.poll(received).toBeGreaterThanOrEqual(2);
      for (const backwards of [false, true]) {
        // Coordinates are measured through separate CDP commands. Auto-follow
        // may move a different event under those coordinates before mouse-down.
        // Pause following while reception continues, then test selection through
        // real arrivals; following behavior has its own native regression cases.
        const follow = page.getByRole("button", {
          name: "Follow Live",
          exact: true,
        });
        if ((await follow.getAttribute("aria-pressed")) === "true")
          await follow.click();
        await app!.evaluate(async ({ BrowserWindow }) => {
          await BrowserWindow.getAllWindows()[0].webContents.capturePage(
            undefined,
            { stayHidden: true, stayAwake: true },
          );
        });
        let visibleId = "";
        await expect
          .poll(async () => {
            visibleId = await page
              .locator(".virtual-event")
              .evaluateAll((elements) => {
                const viewer = document
                  .querySelector(".viewer-scroll")!
                  .getBoundingClientRect();
                return (
                  elements
                    .find((element) => {
                      const rect = element.getBoundingClientRect();
                      return (
                        element.textContent?.includes("Request processed") &&
                        rect.top >= viewer.top + viewer.height * 0.2 &&
                        rect.bottom <= viewer.top + viewer.height * 0.8
                      );
                    })
                    ?.getAttribute("data-event-id") ?? ""
                );
              });
            return visibleId;
          })
          .not.toBe("");
        const row = page.locator(`[data-event-id="${visibleId}"]`).first();
        const cell = row.locator(".inspect-cell").nth(1);
        await expect(cell).toBeVisible();
        const id = (await row.getAttribute("data-event-id"))!;
        const points = await cell.evaluate((element) => {
          const walker = document.createTreeWalker(
            element,
            NodeFilter.SHOW_TEXT,
          );
          const nodes: Text[] = [];
          while (walker.nextNode()) nodes.push(walker.currentNode as Text);
          const pointAt = (index: number) => {
            for (const node of nodes) {
              if (index <= node.length) {
                const range = document.createRange();
                range.setStart(node, index);
                range.collapse(true);
                const rect = range.getBoundingClientRect();
                return { x: rect.x, y: rect.y + rect.height / 2 };
              }
              index -= node.length;
            }
            throw new Error("Missing message glyphs");
          };
          // Observe DOM replacement, not just equal text after a re-render.
          (window as any).__liveSelectedTextNode = nodes[0];
          return { start: pointAt(2), end: pointAt(13) };
        });
        const from = backwards ? points.end : points.start;
        const to = backwards ? points.start : points.end;
        const beforeDrag = await received();
        const geometry = async () => ({
          rect: await row.boundingBox(),
          scroll: await page
            .locator(".viewer-scroll")
            .evaluate((element) => element.scrollTop),
          selection: await page.evaluate(() => {
            const selection = window.getSelection();
            return {
              text: selection?.toString(),
              anchorId: selection?.anchorNode?.parentElement
                ?.closest(".virtual-event")
                ?.getAttribute("data-event-id"),
              anchorOffset: selection?.anchorOffset,
            };
          }),
        });
        const beforeGeometry = await geometry();
        await page.mouse.move(from.x, from.y);
        await page.mouse.down();
        await page.mouse.move((from.x + to.x) / 2, (from.y + to.y) / 2, {
          steps: 6,
        });
        await expect.poll(received).toBeGreaterThan(beforeDrag);
        const duringGeometry = await geometry();
        await page.mouse.move(to.x, to.y, { steps: 14 });
        await page.mouse.up();
        await mkdir(test.info().outputDir, { recursive: true });
        await writeFile(
          test.info().outputPath(`drag-${backwards}.json`),
          JSON.stringify(
            {
              id,
              points,
              beforeGeometry,
              duringGeometry,
              after: await geometry(),
            },
            null,
            2,
          ),
        );
        expect
          .soft(
            await page.evaluate(() => window.getSelection()?.toString()),
            `${mode}: correct ${backwards ? "backward" : "forward"} selection anchor`,
          )
          .toBe("quest proce");
        const prior = await received();
        await expect.poll(received).toBeGreaterThanOrEqual(prior + 2);
        expect
          .soft(
            await page.evaluate(() => window.getSelection()?.toString()),
            `${mode}: selection survives new events`,
          )
          .toBe("quest proce");
        expect
          .soft(
            await page.evaluate(
              () => (window as any).__liveSelectedTextNode.isConnected,
            ),
            `${mode}: selected text nodes remain mounted`,
          )
          .toBe(true);
        await expect(
          page.getByRole("button", { name: "Follow Live", exact: true }),
        ).toHaveAttribute("aria-pressed", "false");
        expect(await row.getAttribute("data-event-id")).toBe(id);
        await page.evaluate(() => window.getSelection()?.removeAllRanges());
        if (!backwards)
          await page
            .getByRole("button", { name: "Follow Live", exact: true })
            .click();
      }
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
          throw new Error("Live verification became visible");
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
    throw new Error("Unsafe live-test cleanup path");
  await rm(directory, {
    recursive: true,
    force: true,
    maxRetries: 10,
    retryDelay: 100,
  });
});
