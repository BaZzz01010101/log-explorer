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
import { execFileSync } from "node:child_process";
import {
  createWorkspace,
  restoreWorkspace,
} from "../../src/renderer/workspace";
import { desktopExecutablePath } from "./desktop-app";

// Every process, fixture and result stays within the checkout. Background mode
// prevents native windows and the offline flag prevents AWS credential access.
const temporaryRoot = resolve(".tmp/desktop-log-view-refinements");
let app: ElectronApplication, page: Page, directory: string, errors: string[];
test.beforeEach(async ({}, info) => {
  errors = [];
  await mkdir(temporaryRoot, { recursive: true });
  directory = await mkdtemp(join(temporaryRoot, "case-"));
  const workspace = createWorkspace();
  workspace.tabs[0].filterPattern = "";
  workspace.preferences.theme = info.title.includes("dark") ? "dark" : "light";
  workspace.tabs[0].view.mode = "hybrid";
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
      const events = Array.from({ length: longList ? 120 : 2 }, (_, index) => ({
        id: `refinement-${index}`,
        timestamp: Date.now() - 1000 + index,
        logGroup: "/aws/lambda/orders-api",
        logStream: "test",
        message: JSON.stringify({
          level: "INFO",
          msg: "Alpha abc123 / ABC456",
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

test("recursive row expansion survives virtualization after manual folds and height changes", async () => {
  const row = page.locator('.virtual-event[data-event-id="refinement-0"]');
  await row
    .getByRole("button", { name: "Expand event details", exact: true })
    .click({ modifiers: ["Control"] });
  const details = row.getByRole("region", { name: "Expanded event content" });
  await expect(
    details.locator('[data-json-path="/payload/nested/list/0/id"]'),
  ).toBeVisible();
  await expect
    .poll(() => details.evaluate((el) => el.clientHeight))
    .toBeGreaterThan(245);
  await details
    .getByRole("button", {
      name: "Collapse /payload/nested/list/0",
      exact: true,
    })
    .click();
  await row
    .getByRole("separator", { name: "Resize expanded event", exact: true })
    .press("ArrowUp");
  await row
    .getByRole("separator", { name: "Resize expanded event", exact: true })
    .press("ArrowUp");
  await row
    .getByRole("separator", { name: "Resize expanded event", exact: true })
    .press("ArrowUp");
  const height = await details.evaluate((el) => el.clientHeight);
  await page
    .locator(".viewer-scroll")
    .evaluate((el) => (el.scrollTop = el.scrollHeight));
  await expect(row).toHaveCount(0);
  await page.locator(".viewer-scroll").evaluate((el) => (el.scrollTop = 0));
  await expect(row).toBeVisible();
  await page.waitForTimeout(100);
  expect(await details.evaluate((el) => el.clientHeight)).toBe(height);
  await expect(
    details.getByRole("button", {
      name: "Expand /payload/nested/list/0",
      exact: true,
    }),
  ).toBeVisible();
});

for (const theme of ["light", "dark"]) {
  test(`${theme} Ctrl row expansion opens nested JSON and fits the available viewport`, async () => {
    const event = page.locator('.virtual-event[data-event-id="refinement-0"]');
    if (theme === "light") {
      await event
        .getByRole("button", { name: "Expand event details", exact: true })
        .click();
      await event
        .getByRole("button", { name: "Expand /payload", exact: true })
        .click();
    }
    await event
      .getByRole("button", {
        name:
          theme === "light" ? "Collapse event details" : "Expand event details",
        exact: true,
      })
      .click({ modifiers: ["Control"] });
    const details = event.getByRole("region", {
      name: "Expanded event content",
    });
    await expect(
      details.locator('[data-json-path="/payload/nested/list/0/id"]'),
    ).toBeVisible();
    await expect
      .poll(() => details.evaluate((el) => el.clientHeight))
      .toBeGreaterThan(245);
    expect(
      await details.evaluate((el) => el.scrollHeight - el.clientHeight),
    ).toBeLessThanOrEqual(2);
    const before = await details.evaluate((el) => el.clientHeight);
    await page
      .locator('.virtual-event[data-event-id="refinement-1"]')
      .getByRole("button", { name: "Expand event details", exact: true })
      .click({ modifiers: ["Control"] });
    const second = page.locator(
      '.expanded-event-content[data-event-id="refinement-1"]',
    );
    await expect(second).toBeVisible();
    expect(await second.evaluate((el) => el.clientHeight)).toBeLessThanOrEqual(
      await page.locator(".viewer-scroll").evaluate((el) => el.clientHeight),
    );
    await page.locator(".viewer-scroll").evaluate((el) => (el.scrollTop = 0));
    await expect(details).toBeVisible();
    expect(await details.evaluate((el) => el.clientHeight)).toBe(before);
  });

  test(`${theme} JSON keys have no path tooltip and field menu copies the exact escaped path`, async () => {
    const field = inspector().locator('[data-json-path="/a~1b~0c"]');
    await expect(field.locator(".json-key")).not.toHaveAttribute(
      "data-tooltip",
      /.+/,
    );
    await field
      .getByRole("button", { name: "Field actions for /a~1b~0c", exact: true })
      .click();
    await page
      .getByRole("menuitem", { name: "Copy /a~1b~0c path", exact: true })
      .click();
    expect(
      await app.evaluate(() => (globalThis as any).__refinementCopies.at(-1)),
    ).toBe("/a~1b~0c");
  });

  test(`${theme} field sliders resize and persist while quick highlights honor regex and case`, async () => {
    for (const [name, field, key] of [
      ["Resize local filter field", local(), "localSearchWidth"],
      ["Resize highlight field", quick(), "highlightTextWidth"],
    ] as const) {
      const separator = page.getByRole("separator", { name, exact: true });
      const before = (await field.boundingBox())!.width;
      const box = (await separator.boundingBox())!;
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
      await page.mouse.down();
      await page.mouse.move(
        box.x + box.width / 2 + 80,
        box.y + box.height / 2,
        { steps: 8 },
      );
      await page.mouse.up();
      expect((await field.boundingBox())!.width).toBeGreaterThan(before + 60);
      await separator.press("ArrowRight");
      await expect(
        page.getByText("Saved locally", { exact: true }),
      ).toBeVisible();
      expect((await stored()).tabs[0].view[key]).toBeGreaterThan(before + 80);
    }
    await quick().fill("abc\\d+");
    await page
      .getByRole("button", {
        name: "Use highlight regular expression",
        exact: true,
      })
      .click();
    await expect
      .poll(async () =>
        [...new Set(await manualMarks().allTextContents())].sort(),
      )
      .toEqual(["ABC456", "abc123"]);
    await page
      .getByRole("button", { name: "Match highlight case", exact: true })
      .click();
    await expect
      .poll(async () => [...new Set(await manualMarks().allTextContents())])
      .toEqual(["abc123"]);
    await quick().fill("[");
    await expect(quick()).toHaveAttribute("aria-invalid", "true");
    await page
      .getByRole("button", {
        name: "Use highlight regular expression",
        exact: true,
      })
      .click();
    await expect(quick()).not.toHaveAttribute("aria-invalid", "true");
    expect((await stored()).tabs[0].view.highlightCaseSensitive).toBe(true);
    await expect(
      page.getByText("Saved locally", { exact: true }),
    ).toBeVisible();
    await page.reload();
    await expect(
      page.getByRole("button", { name: "Match highlight case", exact: true }),
    ).toHaveAttribute("aria-pressed", "true");
    await expect(
      page.getByRole("button", {
        name: "Use highlight regular expression",
        exact: true,
      }),
    ).toHaveAttribute("aria-pressed", "false");
    await expect(quick()).toHaveValue("[");
    expect(
      Number(
        await page
          .getByRole("separator", {
            name: "Resize local filter field",
            exact: true,
          })
          .getAttribute("aria-valuenow"),
      ),
    ).toBeGreaterThan(400);
  });

  test(`${theme} clear crosses remain undoable in local, highlight, server and explorer fields`, async () => {
    for (const [field, button, text] of [
      [local(), "Clear local search", "Alpha"],
      [quick(), "Clear text highlight", "abc"],
      [
        page.getByRole("combobox", {
          name: "CloudWatch filter pattern",
          exact: true,
        }),
        "Clear server filter",
        "Alpha",
      ],
      [
        page.getByRole("textbox", { name: "Search log groups", exact: true }),
        "Clear log group search",
        "orders",
      ],
    ] as const) {
      await field.fill(text);
      await page.getByRole("button", { name: button, exact: true }).click();
      await expect(field).toHaveValue("");
      await field.press("Control+z");
      await expect(field).toHaveValue(text);
      await field.press("Control+y");
      await expect(field).toHaveValue("");
      await field.press("Control+z");
      await expect(field).toHaveValue(text);
    }
  });

  test(`${theme} maps strengthen pale colors without changing row paint or drawing lane borders`, async () => {
    const mark = page
      .locator(".overview-highlights .event-overview-mark")
      .first();
    await expect(mark).toBeVisible();
    const color = await mark.evaluate(
      (el) => getComputedStyle(el).backgroundColor,
    );
    expect(color).not.toBe(
      theme === "light" ? "rgb(253, 251, 245)" : "rgb(27, 36, 50)",
    );
    const event = page.locator('.virtual-event[data-event-id="refinement-0"]');
    expect(
      await event.evaluate((el) =>
        (el as HTMLElement).style.getPropertyValue("--event-highlight-bg"),
      ),
    ).toBe(theme === "light" ? "#fdfbf5" : "#1b2432");
    await quick().fill("Alpha");
    await expect(
      inspector().locator(".inspector-message-mark").first(),
    ).toBeVisible();
    expect(
      await inspector()
        .locator(".inspector-message-lane")
        .evaluateAll((elements) =>
          elements.every(
            (el) =>
              getComputedStyle(el).borderLeftWidth === "0px" &&
              getComputedStyle(el).borderRightWidth === "0px",
          ),
        ),
    ).toBe(true);
    if (theme === "dark") {
      const luminance = await page
        .locator(".overview-highlights .event-overview-mark")
        .first()
        .evaluate((el) => {
          const style = getComputedStyle(el);
          const colors =
            (style.backgroundImage === "none"
              ? style.backgroundColor
              : style.backgroundImage
            ).match(/rgb\([^)]+\)/g) ?? [];
          return Math.max(
            ...colors.map((color) => {
              const channels = color
                .match(/[\d.]+/g)!
                .slice(0, 3)
                .map(Number)
                .map((value) => {
                  const c = value / 255;
                  return c <= 0.04045
                    ? c / 12.92
                    : ((c + 0.055) / 1.055) ** 2.4;
                });
              return (
                channels[0] * 0.2126 +
                channels[1] * 0.7152 +
                channels[2] * 0.0722
              );
            }),
          );
        });
      expect(Number.isFinite(luminance)).toBe(true);
      expect(luminance).toBeLessThanOrEqual(0.31);
    }
    // Hidden windows can retain an older compositor surface. Warm up capture
    // without making the native window visible before saving visual evidence.
    let png = "";
    for (let frame = 0; frame < 3; frame++) {
      await page.evaluate(
        () =>
          new Promise<void>((resolve) =>
            requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
          ),
      );
      png = await app.evaluate(async ({ BrowserWindow }) => {
        const window = BrowserWindow.getAllWindows()[0];
        if (window.isVisible())
          throw new Error("Refinement verification became visible");
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
    await writeFile(
      test.info().outputPath(`${theme}-maps-and-controls.png`),
      Buffer.from(png, "base64"),
    );
  });
}
