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
import {
  createWorkspace,
  restoreWorkspace,
} from "../../src/renderer/workspace";
import { desktopExecutablePath } from "./desktop-app";
import { openSettingsWindow, setShortcutBinding } from "./settings-panel";

// Hidden windows, private storage and offline-only requests keep these checks
// independent of the installed application and the user's AWS configuration.
const temporaryRoot = resolve(".tmp/desktop-favorite-filter-controls");
const streamId = "abcdef0123456789abcdef0123456789";
const streamName = `2026/10/30/[$LATEST]${streamId}`;
const groupName = "/aws/lambda/source-metadata-only";
const ingestionTime = 1999000123456;
let app: ElectronApplication, page: Page, directory: string, errors: string[];

test.beforeEach(async ({}, info) => {
  errors = [];
  await mkdir(temporaryRoot, { recursive: true });
  directory = await mkdtemp(join(temporaryRoot, "case-"));
  const workspace = createWorkspace();
  workspace.preferences.theme = info.title.includes("dark") ? "dark" : "light";
  workspace.preferences.highlightProfiles = [];
  workspace.preferences.autoExpandFilterMatches = false;
  workspace.tabs[0].filterPattern = "";
  workspace.tabs[0].view.mode = "hybrid";
  workspace.tabs[0].view.columns = [
    { path: "@timestamp", width: 194, pinned: true },
    { path: "@source", width: 350 },
    { path: "@message", width: 500 },
  ];
  const savedTab = structuredClone(workspace.tabs[0]);
  savedTab.sources = [{ logGroup: "/saved/favorite-source" }];
  workspace.favorites = [
    {
      id: "favorite-alpha",
      title: "Alpha investigation",
      tabs: [savedTab],
      connections: structuredClone(workspace.connections),
      timezone: "utc",
    },
  ];
  await writeFile(join(directory, "workspace.json"), JSON.stringify(workspace));
  const env: Record<string, string> = {};
  for (const name of ["PATH", "SystemRoot", "WINDIR", "TEMP", "TMP", "COMSPEC"])
    if (process.env[name]) env[name] = process.env[name]!;
  Object.assign(env, {
    EXPLORER_TEST_USER_DATA: directory,
    USERPROFILE: directory,
    APPDATA: directory,
    LOCALAPPDATA: directory,
    TEMP: directory,
    TMP: directory,
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
  page.on("pageerror", (error) => errors.push(error.message));
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Emulation.setFocusEmulationEnabled", { enabled: true });
  await page.emulateMedia({ reducedMotion: "reduce" });
  expect(
    (await page.evaluate(() => window.explorer.environment())).canEnableAws,
  ).toBe(false);
  expect(
    await app.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()[0].isVisible(),
    ),
  ).toBe(false);
  await expect(page.locator('[data-node-kind="group"]')).toHaveCount(9);
  await expect(page.locator(".query-status")).toHaveAttribute(
    "data-query-state",
    "complete",
  );
  await app.evaluate(
    ({ BrowserWindow, dialog, ipcMain }, fixture) => {
      const window = BrowserWindow.getAllWindows()[0];
      window.setContentSize(1700, 1150);
      window.webContents.setBackgroundThrottling(false);
      dialog.showMessageBox = async () => {
        throw new Error("Unexpected favorite/filter verification dialog");
      };
      (globalThis as any).__favoriteFilterRequests = [];
      ipcMain.removeHandler("explorer:query");
      ipcMain.handle("explorer:query", (event, request) => {
        if (
          event.sender !== window.webContents ||
          request.connection.mode !== "offline" ||
          request.kind !== "events"
        )
          throw new Error("Unexpected favorite/filter verification request");
        (globalThis as any).__favoriteFilterRequests.push(request);
        const events = [
          "Alpha request",
          "alpha request",
          "Beta reply",
          '{"msg":"gamma request","level":"WARN","payload":{"value":"gamma"}}',
        ].map((message, index) => ({
          id: `metadata-event-id-${index}`,
          timestamp: Date.UTC(2026, 9, 30, 10, 0, index),
          ingestionTime: fixture.ingestionTime,
          logGroup: fixture.groupName,
          logStream: fixture.streamName,
          message,
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
    },
    { streamName, groupName, ingestionTime },
  );
  await page.getByTestId("run-query").click();
  await expect(page.locator(".viewer-scroll")).toHaveAttribute(
    "aria-rowcount",
    "4",
  );
});

test.afterEach(async () => {
  const child = app?.process();
  let closeFailure: unknown;
  if (child && child.exitCode === null && child.signalCode === null) {
    const closed = app.waitForEvent("close", { timeout: 8000 });
    const exited = new Promise<number | null>((done) =>
      child.once("exit", done),
    );
    try {
      await app.evaluate(({ BrowserWindow }) =>
        BrowserWindow.getAllWindows()[0].close(),
      );
      await closed;
      expect(await exited).toBe(0);
    } catch (error) {
      closeFailure = error;
    } finally {
      if (child.exitCode === null && child.signalCode === null) {
        try {
          execFileSync("taskkill", ["/PID", String(child.pid), "/T", "/F"], {
            stdio: "ignore",
            windowsHide: true,
          });
        } catch (error) {
          // Cleanup must not replace the original natural-close failure.
          closeFailure ??= error;
        }
      }
    }
  }
  if (closeFailure) throw closeFailure;
  expect(errors).toEqual([]);
  if (
    !directory ||
    !resolve(directory).startsWith(temporaryRoot + sep + "case-")
  )
    throw new Error("Unsafe favorite/filter verification cleanup");
  await rm(directory, {
    recursive: true,
    force: true,
    maxRetries: 10,
    retryDelay: 100,
  });
});

const local = () =>
  page.getByRole("textbox", {
    name: "Local filter loaded events",
    exact: true,
  });
const highlight = () =>
  page.getByRole("textbox", {
    name: "Highlight text in loaded events",
    exact: true,
  });
const option = (name: string) =>
  page.getByRole("button", { name, exact: true });
const eventRow = (index: number) =>
  page.locator(`.virtual-event[data-event-id="metadata-event-id-${index}"]`);
const rows = (count: number) =>
  expect(page.locator(".viewer-scroll")).toHaveAttribute(
    "aria-rowcount",
    String(count),
  );
const requests = () =>
  app.evaluate(
    () => (globalThis as any).__favoriteFilterRequests.length as number,
  );
const stored = async () =>
  restoreWorkspace(
    (await page.evaluate(() => window.explorer.loadWorkspace())).workspace,
  );
async function capture(name: string) {
  let png = "";
  for (let frame = 0; frame < 3; frame++)
    png = await app.evaluate(async ({ BrowserWindow }) => {
      const window = BrowserWindow.getAllWindows()[0];
      if (window.isVisible())
        throw new Error("Favorite/filter verification became visible");
      return (
        await window.webContents.capturePage(undefined, {
          stayHidden: true,
          stayAwake: true,
        })
      )
        .toPNG()
        .toString("base64");
    });
  await mkdir(test.info().outputDir, { recursive: true });
  await writeFile(test.info().outputPath(name), Buffer.from(png, "base64"));
}

for (const theme of ["light", "dark"]) {
  test(`${theme} favorite deletion stays inline until a choice and never opens the saved view`, async () => {
    const favorite = page.locator('[data-favorite-id="favorite-alpha"]');
    const open = favorite.getByRole("button", {
      name: "Alpha investigation",
      exact: true,
    });
    const confirmation = favorite.getByRole("group", {
      name: "Delete favorite Alpha investigation",
      exact: true,
    });
    const trash = favorite.getByRole("button", {
      name: "Delete favorite Alpha investigation",
      exact: true,
    });
    const tabsBefore = await page.locator(".workspace-tab").count();
    const requestsBefore = await requests();
    const unopened = async () => {
      await expect(page.locator(".workspace-tab")).toHaveCount(tabsBefore);
      expect(await requests()).toBe(requestsBefore);
    };
    await expect(favorite.locator("button button")).toHaveCount(0);
    await open.click({ button: "right" });
    await expect(page.getByRole("menu").getByRole("menuitem")).toHaveText([
      "Open",
      "Rename",
      "Delete",
    ]);
    await page.getByRole("menuitem", { name: "Delete", exact: true }).click();
    await expect(confirmation.getByRole("button")).toHaveText([
      "Delete",
      "Cancel",
    ]);
    await local().click();
    await page.mouse.move(1200, 30);
    await expect(confirmation).toBeVisible();
    await unopened();
    await confirmation
      .getByRole("button", { name: "Cancel", exact: true })
      .click();
    await expect(confirmation).toHaveCount(0);
    await expect(favorite).toBeVisible();
    await expect.poll(async () => (await stored()).favorites.length).toBe(1);
    await unopened();

    await open.focus();
    await expect
      .poll(() =>
        trash.evaluate((element) => getComputedStyle(element).opacity),
      )
      .toBe("1");
    await open.press("Tab");
    await expect(trash).toBeFocused();
    const openBounds = (await open.boundingBox())!;
    const trashBounds = (await trash.boundingBox())!;
    expect(trashBounds.x).toBeGreaterThanOrEqual(
      openBounds.x + openBounds.width,
    );
    await trash.press("Enter");
    await expect(confirmation).toBeVisible();
    await confirmation
      .getByRole("button", { name: "Cancel", exact: true })
      .press("Enter");
    await expect(confirmation).toHaveCount(0);
    await unopened();

    await favorite.hover();
    await expect
      .poll(() =>
        trash.evaluate((element) => getComputedStyle(element).opacity),
      )
      .toBe("1");
    await trash.click();
    await page.mouse.move(1200, 30);
    await expect(confirmation).toBeVisible();
    await capture(`${theme}-favorite-inline-delete.png`);
    await unopened();
    await confirmation
      .getByRole("button", { name: "Delete", exact: true })
      .click();
    await expect(favorite).toHaveCount(0);
    await expect.poll(async () => (await stored()).favorites.length).toBe(0);
    await unopened();
  });

  test(`${theme} local case and regex options filter messages and clear remains undoable`, async () => {
    await local().fill("Alpha");
    await rows(2);
    await expect(
      eventRow(0).locator('mark[data-highlight-origins~="local"]'),
    ).toHaveText("Alpha");
    await expect(
      eventRow(1).locator('mark[data-highlight-origins~="local"]'),
    ).toHaveText("alpha");
    await local().press("Alt+c");
    await expect(option("Match local filter case")).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await expect(option("Match highlight case")).toHaveAttribute(
      "aria-pressed",
      "false",
    );
    await rows(1);
    await expect(eventRow(0)).toBeVisible();
    await local().fill("^Alpha");
    await rows(0);
    await local().press("Alt+e");
    await expect(option("Use local filter regular expression")).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await expect(option("Use highlight regular expression")).toHaveAttribute(
      "aria-pressed",
      "false",
    );
    await rows(1);
    await local().press("Alt+c");
    await rows(2);
    await option("Clear local search").click();
    await expect(local()).toHaveValue("");
    await rows(4);
    await local().press("Control+z");
    await expect(local()).toHaveValue("^Alpha");
    await rows(2);
    await local().press("Control+Shift+z");
    await expect(local()).toHaveValue("");
    await rows(4);
    await local().fill("[");
    await expect(local()).toHaveAttribute("aria-invalid", "true");
    await local().fill("Alpha");
    await expect(local()).not.toHaveAttribute("aria-invalid", "true");
    await rows(2);
    await local().fill("gamma");
    await local().press("Alt+c");
    await rows(1);
    await eventRow(3).locator(".inspect-cell").first().click();
    await page
      .getByRole("grid", { name: "Log events", exact: true })
      .press("Enter");
    const inspector = page.getByRole("region", {
      name: "Event inspector",
      exact: true,
    });
    await inspector
      .getByRole("button", { name: "Expand /payload", exact: true })
      .click();
    const addProperty = async () => {
      await inspector
        .getByRole("button", {
          name: "Field actions for /payload/value",
          exact: true,
        })
        .click();
      await page
        .getByRole("menuitem", {
          name: "Add /payload/value to filter",
          exact: true,
        })
        .click();
    };
    await addProperty();
    await expect(local()).toHaveValue('@"/payload/value"="gamma"');
    await expect(option("Use local filter regular expression")).toHaveAttribute(
      "aria-pressed",
      "false",
    );
    await expect(option("Match local filter case")).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await rows(1);
    await local().fill("gamma");
    await addProperty();
    await expect(local()).toHaveValue('gamma @"/payload/value"="gamma"');
    await rows(1);
    expect(await requests()).toBe(1);
  });

  test(`${theme} highlight shortcuts and option hints are independent of local filtering`, async () => {
    await highlight().fill("Alpha");
    await expect(
      eventRow(0).locator('mark[data-highlight-origins~="manual"]'),
    ).toHaveText("Alpha");
    await expect(
      eventRow(1).locator('mark[data-highlight-origins~="manual"]'),
    ).toHaveText("alpha");
    await highlight().press("Alt+c");
    await expect(option("Match highlight case")).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await expect(option("Match local filter case")).toHaveAttribute(
      "aria-pressed",
      "false",
    );
    await expect(
      eventRow(1).locator('mark[data-highlight-origins~="manual"]'),
    ).toHaveCount(0);
    await highlight().press("Alt+e");
    await highlight().fill("^Alpha");
    await expect(option("Use highlight regular expression")).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await expect(option("Use local filter regular expression")).toHaveAttribute(
      "aria-pressed",
      "false",
    );
    await rows(4);
    await expect(
      eventRow(0).locator('mark[data-highlight-origins~="manual"]'),
    ).toHaveText("Alpha");
    for (const [name, shortcut] of [
      ["Match local filter case", "Alt+C"],
      ["Use local filter regular expression", "Alt+E"],
      ["Match highlight case", "Alt+C"],
      ["Use highlight regular expression", "Alt+E"],
    ]) {
      await option(name).hover();
      await expect(page.getByRole("tooltip")).toContainText(shortcut);
      await page.mouse.move(1200, 30);
      await expect(page.getByRole("tooltip")).toHaveCount(0);
    }
    await highlight().fill("[");
    await expect(highlight()).toHaveAttribute("aria-invalid", "true");
    await highlight().fill("Alpha");
    await expect(highlight()).not.toHaveAttribute("aria-invalid", "true");
    await option("Clear text highlight").click();
    await expect(highlight()).toHaveValue("");
    await highlight().press("Control+z");
    await expect(highlight()).toHaveValue("Alpha");
    await expect(local()).toHaveValue("");
    await rows(4);
    await page.mouse.move(1200, 30);
    await expect(page.getByRole("tooltip")).toHaveCount(0);
    await capture(`${theme}-filter-match-options.png`);
  });

  test(`${theme} local filtering searches Lambda stream identifiers without metadata or cross-field phrases`, async () => {
    await local().fill(streamId.slice(8));
    await rows(4);
    await local().fill(`Alpha ${streamId}`);
    await rows(2);
    await local().fill(`"Alpha request ${streamId}"`);
    await rows(0);
    for (const metadata of [
      "2026/10/30",
      "$LATEST",
      "source-metadata-only",
      "metadata-event-id",
      String(ingestionTime),
    ]) {
      await local().fill(metadata);
      await rows(0);
    }
    await local().fill("@/payload/value=gamma");
    await rows(1);
    await expect(eventRow(3)).toBeVisible();
    expect(await requests()).toBe(1);
  });

  test(`${theme} Live and time range controls have no hover popups while toolbar help remains`, async () => {
    for (const name of [
      "Live",
      "Time range",
      "Recent logs",
      "Set last 5 minutes",
    ]) {
      await option(name).hover();
      // Wait beyond the shared 450 ms tooltip open delay.
      await page.waitForTimeout(650);
      await expect(page.getByRole("tooltip")).toHaveCount(0);
    }
    await option("Configure columns").hover();
    await expect(page.getByRole("tooltip")).toContainText("Column order");
    expect(await requests()).toBe(1);
  });

  test(`${theme} Settings persist separate local and highlight option shortcuts`, async () => {
    await openSettingsWindow(page);
    await page.getByRole("tab", { name: "Shortcuts", exact: true }).click();
    for (const [label, binding] of [
      ["Local filter regex", "Alt+R"],
      ["Local filter match case", "Alt+M"],
      ["Highlight regex", "Alt+U"],
      ["Highlight match case", "Alt+I"],
    ])
      await setShortcutBinding(page, label, binding);
    await page
      .getByRole("button", { name: "Close Settings", exact: true })
      .click();
    await expect
      .poll(async () => (await stored()).preferences.shortcuts)
      .toMatchObject({
        localFilterRegex: "Alt+R",
        localFilterCaseSensitive: "Alt+M",
        highlightRegex: "Alt+U",
        highlightCaseSensitive: "Alt+I",
      });
    await local().fill("Alpha");
    await local().press("Alt+m");
    await local().press("Alt+r");
    await rows(1);
    await expect(option("Match local filter case")).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await expect(option("Use local filter regular expression")).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await local().press("Alt+c");
    await expect(option("Match local filter case")).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await highlight().fill("Alpha");
    await highlight().press("Alt+i");
    await highlight().press("Alt+u");
    await expect(option("Match highlight case")).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await expect(option("Use highlight regular expression")).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await option("Match local filter case").hover();
    await expect(page.getByRole("tooltip")).toContainText("Alt+M");
    await option("Use highlight regular expression").hover();
    await expect(page.getByRole("tooltip")).toContainText("Alt+U");
    expect(await requests()).toBe(1);
  });
}
