import {
  _electron as electron,
  expect,
  test,
  type ElectronApplication,
  type Page,
} from "@playwright/test";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { join, resolve, sep } from "node:path";
import { execFileSync } from "node:child_process";
import {
  createWorkspace,
  restoreWorkspace,
} from "../../src/renderer/workspace";
import { desktopExecutablePath } from "./desktop-app";

// Every process, fixture and result stays within the checkout. Background mode
// prevents native windows and the offline flag prevents AWS credential access.
const temporaryRoot = resolve(".tmp/desktop-events-controls");
let app: ElectronApplication, page: Page, directory: string, errors: string[];
test.beforeEach(async ({}, info) => {
  errors = [];
  await mkdir(temporaryRoot, { recursive: true });
  directory = await mkdtemp(join(temporaryRoot, "case-"));
  const workspace = createWorkspace();
  workspace.tabs[0].filterPattern = "";
  workspace.preferences.theme = info.title.includes("dark") ? "dark" : "light";
  workspace.tabs[0].view.mode = "hybrid";
  workspace.tabs[0].view.columns = [
    { path: "@timestamp", width: 194, pinned: true },
    { path: "@level", width: 84 },
    { path: "@source", width: 200 },
    { path: "@message", width: 420 },
    { path: "/payload", width: 180 },
  ];
  workspace.preferences.highlightProfiles = [
    {
      id: "map",
      name: "Map",
      enabled: true,
      groupPattern: "",
      groupIgnoreCase: false,
      rules: [
        {
          id: "pale",
          enabled: true,
          scope: "text",
          path: "",
          pattern: "Alpha",
          ignoreCase: false,
          target: "row",
          colors: { background: "#fdfbf5" },
          separateThemeColors: true,
          lightColors: { background: "#fdfbf5" },
          darkColors: { background: "#1b2432" },
        },
      ],
    },
  ];
  workspace.history = [
    {
      id: "tooltip-history",
      name: "Tooltip history",
      kind: "events",
      text: "request id = abc-123; status >= 500",
    },
  ];
  await writeFile(join(directory, "workspace.json"), JSON.stringify(workspace));
  const env: Record<string, string> = {};
  for (const key of ["PATH", "SystemRoot", "WINDIR", "TEMP", "TMP", "COMSPEC"])
    if (process.env[key]) env[key] = process.env[key]!;
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
  const session = await page.context().newCDPSession(page);
  await session.send("Emulation.setFocusEmulationEnabled", { enabled: true });
  await page.emulateMedia({ reducedMotion: "reduce" });
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
      throw new Error("Unexpected verification dialog");
    };
  });
  await expect(page.locator('[data-node-kind="group"]')).toHaveCount(9);
});
test.afterEach(async () => {
  if (app?.process().exitCode === null) {
    const child = app.process();
    const closed = app.waitForEvent("close", { timeout: 8000 });
    await app.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()[0].close(),
    );
    try {
      await closed;
    } finally {
      if (child.exitCode === null)
        execFileSync("taskkill", ["/PID", String(child.pid), "/T", "/F"], {
          stdio: "ignore",
        });
    }
  }
  expect(errors).toEqual([]);
  if (
    !directory ||
    !resolve(directory).startsWith(temporaryRoot + sep + "case-")
  )
    throw new Error("Unsafe verification cleanup");
  await rm(directory, {
    recursive: true,
    force: true,
    maxRetries: 10,
    retryDelay: 100,
  });
});
const row = (name: string) => page.getByRole("treeitem", { name, exact: true });
const action = (name: string) =>
  page.getByRole("menuitem", { name, exact: true });
const selected = () => page.locator('.resource-row[aria-selected="true"]');
const stored = async () =>
  restoreWorkspace(
    (await page.evaluate(() => window.explorer.loadWorkspace())).workspace,
  );

test.beforeEach(async ({}, info) => {
  await app.evaluate(({ ipcMain, BrowserWindow, clipboard }, longList) => {
    const win = BrowserWindow.getAllWindows()[0];
    win.setContentSize(1700, 1150);
    win.webContents.setBackgroundThrottling(false);
    (globalThis as any).__refinementCopies = [];
    (globalThis as any).__eventsRuns = [];
    clipboard.writeText = async (text) => {
      (globalThis as any).__refinementCopies.push(text);
    };
    ipcMain.removeHandler("explorer:query");
    ipcMain.handle("explorer:query", (event, request) => {
      if (
        event.sender !== win.webContents ||
        request.connection.mode !== "offline"
      )
        throw new Error("Unexpected refinement request");
      (globalThis as any).__eventsRuns.push(request);
      const events = Array.from({ length: longList ? 120 : 2 }, (_, index) => ({
        id: `refinement-${index}`,
        timestamp: Date.now() - 1000 + index,
        logGroup: "/aws/lambda/orders-api",
        logStream: "2026/10/29/[$LATEST]test",
        message: JSON.stringify({
          level: "INFO",
          msg:
            index === 1
              ? "START RequestId: example Version: $LATEST"
              : "Alpha abc123 / ABC456",
          payload: {
            nested: {
              list: Array.from(
                { length: index === 0 ? 12 : index === 1 ? 100 : 1 },
                (_, id) => ({
                  id,
                }),
              ),
            },
          },
          "a/b~c": "value",
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
  }, info.title.includes("virtualization"));
  await page.getByTestId("run-query").click();
  await expect(
    page.locator('.virtual-event[data-event-id="refinement-0"]'),
  ).toBeVisible();
});
const local = () =>
  page.getByRole("textbox", {
    name: "Local filter loaded events",
    exact: true,
  });
const quick = () =>
  page.getByRole("textbox", {
    name: "Highlight text in loaded events",
    exact: true,
  });
const inspector = () =>
  page.getByRole("region", { name: "Event inspector", exact: true });
const manualMarks = () =>
  page.locator('.virtual-event mark[data-highlight-origins~="manual"]');

for (const theme of ["light", "dark"]) {
  test(`${theme} local literal filter matches message content rather than Lambda stream metadata`, async () => {
    await local().fill("$latest");
    await expect(page.locator(".viewer-scroll")).toHaveAttribute(
      "aria-rowcount",
      "1",
    );
    await expect(
      page.locator('.virtual-event[data-event-id="refinement-1"]'),
    ).toBeVisible();
    await expect(
      page.locator('.virtual-event[data-event-id="refinement-0"]'),
    ).toHaveCount(0);
    await page
      .getByRole("button", { name: "Clear local search", exact: true })
      .click();
    await expect(page.locator(".viewer-scroll")).toHaveAttribute(
      "aria-rowcount",
      "2",
    );
    await local().press("Control+z");
    await expect(local()).toHaveValue("$latest");
    await expect(page.locator(".viewer-scroll")).toHaveAttribute(
      "aria-rowcount",
      "1",
    );
  });

  test(`${theme} filter dividers center their visible line and hit area between neighboring controls`, async () => {
    const seams = [
      {
        label: "Resize local filter field",
        left: ".local-search input",
        right: ".quick-highlight input",
      },
      {
        label: "Resize highlight field",
        left: ".quick-highlight input",
        right: ".level-filter",
      },
    ];
    for (const seam of seams) {
      const handle = page.getByRole("separator", {
        name: seam.label,
        exact: true,
      });
      const geometry = async () => {
        const left = (await page.locator(seam.left).boundingBox())!;
        const right = (await page.locator(seam.right).boundingBox())!;
        const hit = (await handle.boundingBox())!;
        return {
          midpoint: (left.x + left.width + right.x) / 2,
          center: hit.x + hit.width / 2,
          hit,
          left,
          right,
        };
      };
      const initial = await geometry();
      expect(Math.abs(initial.center - initial.midpoint)).toBeLessThanOrEqual(
        0.6,
      );
      expect(
        Math.abs(
          initial.hit.y +
            initial.hit.height / 2 -
            initial.left.y -
            initial.left.height / 2,
        ),
      ).toBeLessThanOrEqual(0.6);
      await handle.hover();
      expect(
        await handle.evaluate((el) => getComputedStyle(el, "::before").width),
      ).toBe("3px");
      await page.mouse.down();
      await page.mouse.move(
        initial.center + 38,
        initial.hit.y + initial.hit.height / 2,
        { steps: 6 },
      );
      await page.mouse.up();
      const resized = await geometry();
      expect(resized.left.width).toBeGreaterThan(initial.left.width + 30);
      expect(Math.abs(resized.center - resized.midpoint)).toBeLessThanOrEqual(
        0.6,
      );
    }
    await expect(
      page.getByRole("button", { name: "Local filtering help", exact: true }),
    ).toHaveCount(0);
    let png = "";
    for (let frame = 0; frame < 3; frame++) {
      png = await app.evaluate(async ({ BrowserWindow }) => {
        const win = BrowserWindow.getAllWindows()[0];
        if (win.isVisible()) throw new Error("Verification became visible");
        return (
          await win.webContents.capturePage(undefined, {
            stayHidden: true,
            stayAwake: true,
          })
        )
          .toPNG()
          .toString("base64");
      });
    }
    await mkdir(test.info().outputDir, { recursive: true });
    await writeFile(
      test.info().outputPath(`${theme}-filter-controls.png`),
      Buffer.from(png, "base64"),
    );
  });
}
