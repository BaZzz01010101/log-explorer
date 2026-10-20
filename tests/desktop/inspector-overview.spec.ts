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

test.setTimeout(90000);
const temporaryRoot = resolve(".tmp", "desktop-inspector-overview");
let directory: string;
let app: ElectronApplication | undefined;
let page: Page;
let errors: string[];
type MainProbe = typeof globalThis & {
  feedbackRequests: QueryRequest[];
  feedbackPending: Map<string, () => void>;
};

test.beforeEach(async () => {
  await mkdir(temporaryRoot, { recursive: true });
  directory = await mkdtemp(join(temporaryRoot, "case-"));
  errors = [];
  app = undefined;
  const workspace = createWorkspace();
  workspace.sidebarVisible = false;
  workspace.preferences.timezone = "utc";
  workspace.tabs[0].timePreset = "clear";
  workspace.tabs[0].filterPattern = "";
  workspace.tabs[0].view.mode = "table";
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
async function assertBottomStatus() {
  await expect(status()).toHaveCount(1);
  const positions = await page.locator(".log-viewer").evaluate((element) => {
    const scroll = element
      .querySelector(".viewer-scroll")!
      .getBoundingClientRect();
    const status = element
      .querySelector(".query-status")!
      .getBoundingClientRect();
    return {
      viewerBottom: scroll.bottom,
      statusTop: status.top,
      statusBottom: status.bottom,
      panelBottom: element.getBoundingClientRect().bottom,
    };
  });
  expect(positions.statusTop).toBeGreaterThanOrEqual(
    positions.viewerBottom - 1,
  );
  expect(positions.statusBottom).toBeLessThanOrEqual(positions.panelBottom + 1);
}

test("new tabs open the inspector at 30 percent and the toolbar toggle preserves selection and resizing", async () => {
  const region = page.getByRole("region", {
    name: "Event inspector",
    exact: true,
  });
  await expect(region).toBeVisible();
  const ratio = () =>
    region.evaluate(
      (element) =>
        element.getBoundingClientRect().width /
        element.parentElement!.getBoundingClientRect().width,
    );
  expect(await ratio()).toBeCloseTo(0.3, 2);
  const toggle = page.getByRole("button", {
    name: "Hide event inspector",
    exact: true,
  });
  const exportButton = page.getByRole("button", {
    name: "Export loaded filtered events",
    exact: true,
  });
  const a = (await toggle.boundingBox())!,
    b = (await exportButton.boundingBox())!;
  expect(Math.abs(a.y + a.height / 2 - b.y - b.height / 2)).toBeLessThan(2);
  expect(a.x + a.width).toBeLessThan(b.x);
  expect(b.x - a.x - a.width).toBeLessThan(15);
  const selected = await region.getAttribute("data-event-id");
  await toggle.click();
  await expect(region).toHaveCount(0);
  await page
    .getByRole("button", { name: "Show event inspector", exact: true })
    .click();
  await expect(region).toHaveAttribute("data-event-id", selected!);
  const handle = page.getByRole("separator", {
    name: "Resize event inspector",
    exact: true,
  });
  await handle.focus();
  await page.keyboard.press("ArrowLeft");
  const resized = await region.evaluate(
    (element) => element.getBoundingClientRect().width,
  );
  await page
    .getByRole("button", { name: "Hide event inspector", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Show event inspector", exact: true })
    .click();
  expect(
    await region.evaluate((element) => element.getBoundingClientRect().width),
  ).toBeCloseTo(resized, 0);
  await page
    .getByRole("button", { name: "Toggle explorer", exact: true })
    .click();
  await page
    .getByRole("button", { name: "/aws/lambda/payments-worker", exact: true })
    .dblclick();
  await expect(region).toBeVisible();
  expect(await ratio()).toBeCloseTo(0.3, 2);
  await capture("inspector-default-and-toggle.png");
});

test("three adjacent errors form one proportional band and each part navigates to its own event", async () => {
  await page.getByTestId("run-query").click();
  await expect.poll(async () => (await requests()).length).toBe(1);
  const events: LogEvent[] = Array.from({ length: 40 }, (_, index) => ({
    id: `band-${index}`,
    timestamp: index * 1000,
    logGroup: "/aws/lambda/orders-api",
    logStream: "s",
    message: JSON.stringify({
      level: (index >= 5 && index <= 7) || index === 15 ? "ERROR" : "INFO",
      message: index >= 5 && index <= 7 ? "hotspot" : "plain",
      index,
    }),
  }));
  await send(0, { state: "complete", events, replace: true }, true);
  await page
    .getByRole("textbox", {
      name: "Highlight text in loaded events",
      exact: true,
    })
    .fill("hotspot");
  const errors = page.locator(
    '.overview-severity .event-overview-mark[data-level="error"]',
  );
  await expect(errors).toHaveCount(2);
  const band = errors.first(),
    single = errors.last();
  const bandBox = (await band.boundingBox())!,
    singleBox = (await single.boundingBox())!;
  expect(bandBox.height / singleBox.height).toBeCloseTo(3, 0);
  const grid = viewer();
  const expected = await grid.evaluate((element) => {
    const content = element.querySelector<HTMLElement>(".virtual-events")!;
    const row = element.querySelector<HTMLElement>('[data-event-id="band-5"]')!;
    return {
      scale: element.clientHeight / element.scrollHeight,
      offset: content.offsetTop,
      height: row.getBoundingClientRect().height,
    };
  });
  expect(
    Math.abs(bandBox.height - 3 * expected.height * expected.scale),
  ).toBeLessThanOrEqual(2);
  const redPixels = await app!.evaluate(
    async ({ BrowserWindow }, rect) => {
      const window = BrowserWindow.getAllWindows()[0];
      if (window.isVisible()) throw new Error("Verification became visible");
      let pixels: Buffer = Buffer.alloc(0);
      for (let frame = 0; frame < 3; frame++) {
        const image = await window.webContents.capturePage(rect, {
          stayHidden: true,
          stayAwake: true,
        });
        pixels = image.toBitmap();
      }
      let red = 0,
        total = 0;
      for (let index = 0; index < pixels.length; index += 4) {
        total++;
        // Native bitmap channels on Windows are BGRA.
        if (
          pixels[index + 2] > 200 &&
          pixels[index + 1] < 150 &&
          pixels[index] < 150
        )
          red++;
      }
      return { red, total };
    },
    {
      x: Math.ceil(bandBox.x + 2),
      y: Math.ceil(bandBox.y + 1),
      width: 1,
      height: Math.max(1, Math.floor(bandBox.height) - 2),
    },
  );
  expect(redPixels.total).toBeGreaterThan(0);
  expect(redPixels.red / redPixels.total).toBeGreaterThan(0.95);
  const highlights = page.locator(".overview-highlights .event-overview-mark");
  await expect(highlights).toHaveCount(1);
  expect(
    Math.abs((await highlights.boundingBox())!.height - bandBox.height),
  ).toBeLessThanOrEqual(1);
  for (const offset of [0, 1, 2]) {
    const rect = (await band.boundingBox())!;
    await page.mouse.click(
      rect.x + 2,
      rect.y + (rect.height * (offset + 0.5)) / 3,
    );
    await expect(
      page.locator('.virtual-event[data-selected="true"]'),
    ).toHaveAttribute("data-event-id", `band-${5 + offset}`);
    await expect(page.locator(".event-inspector")).toHaveAttribute(
      "data-event-id",
      `band-${5 + offset}`,
    );
  }
  await capture("proportional-three-error-band.png");
});

test("decoded and formatted highlights appear in the full right lane in both themes", async () => {
  await page.getByTestId("run-query").click();
  await expect.poll(async () => (await requests()).length).toBe(1);
  const events: LogEvent[] = Array.from({ length: 40 }, (_, index) => ({
    id: `decoded-${index}`,
    timestamp: index * 1000,
    logGroup: "/aws/lambda/orders-api",
    logStream: "s",
    message:
      index === 15
        ? '{"level":"INFO","message":"\\u0068otspot"}'
        : JSON.stringify({ level: "INFO", message: "plain", index }),
  }));
  await send(0, { state: "complete", events, replace: true }, true);
  for (const theme of ["light", "dark"]) {
    await page
      .getByRole("button", { name: "Workspace settings", exact: true })
      .click();
    await page.getByRole("tab", { name: "Preferences", exact: true }).click();
    await page.getByRole("combobox", { name: "Theme", exact: true }).click();
    await page.getByRole("option", { name: theme, exact: true }).click();
    await page.locator(".mantine-Modal-close").click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await page
      .getByRole("textbox", {
        name: "Highlight text in loaded events",
        exact: true,
      })
      .fill("hotspot");
    const marker = page.locator(".overview-highlights .event-overview-mark");
    await expect(marker).toHaveCount(1);
    const box = (await marker.boundingBox())!;
    expect(box.width).toBe(5);
    const hit = await marker.evaluate((element) => {
      const r = element.getBoundingClientRect();
      const target = document.elementFromPoint(
        r.right - 0.5,
        r.top + r.height / 2,
      );
      return {
        exposed: target?.closest(".event-overview-mark") === element,
        target: target?.outerHTML.slice(0, 400),
        right: r.right,
        top: r.top,
        height: r.height,
        viewport: innerWidth,
      };
    });
    expect(hit.exposed, JSON.stringify(hit)).toBe(true);
    await marker.click();
    await expect(
      viewer()
        .locator('.virtual-event[data-event-id="decoded-15"] mark')
        .first(),
    ).toBeVisible();
    await capture(`right-highlight-${theme}.png`);
    await page
      .getByRole("textbox", {
        name: "Highlight text in loaded events",
        exact: true,
      })
      .fill("plain");
    await expect(marker.first()).toBeVisible();
  }
});
