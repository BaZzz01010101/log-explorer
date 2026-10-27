import { openSettingsWindow } from "./settings-panel";
import {
  _electron as electron,
  expect,
  test,
  type ElectronApplication,
  type Page,
} from "@playwright/test";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join, resolve, sep } from "node:path";
import {
  createTab,
  createWorkspace,
  workspaceReducer,
} from "../../src/renderer/workspace";
import { desktopExecutablePath } from "./desktop-app";

test.setTimeout(150000);
const root = resolve(".tmp/desktop-settings-responsive");
let directory: string, app: ElectronApplication, page: Page, errors: string[];
let child: ReturnType<ElectronApplication["process"]>;
test.beforeEach(async ({}, info) => {
  await mkdir(root, { recursive: true });
  directory = await mkdtemp(join(root, "case-"));
  errors = [];
  let workspace = createWorkspace();
  workspace.preferences.theme = info.title.includes("dark") ? "dark" : "light";
  workspace.sidebarVisible = true;
  workspace.sidebarWidth = info.title.includes("narrow") ? 600 : 280;
  workspace.tabs[0].filterPattern = "";
  if (info.title.includes("wrapped")) {
    workspace.preferences.tabBarLayout = "wrap";
    workspace.preferences.pinnedTabsSeparateRow = true;
    for (let i = 0; i < 7; i++) {
      const tab = createTab("offline", [
        { logGroup: "/aws/lambda/orders-api" },
      ]);
      tab.customTitle = `A long service name ${i}`;
      tab.pinned = i < 2;
      workspace = workspaceReducer(workspace, { type: "tab/open", tab });
    }
  }
  workspace.connections.push({
    id: "layout-aws",
    name: "Layout fixture",
    mode: "aws",
    profile: "production-account-with-a-very-long-profile-name",
    region: "ap-southeast-2",
    enabled: true,
  });
  workspace.preferences.highlightProfiles = [
    {
      id: "layout",
      name: "Production highlights",
      enabled: true,
      groupPattern: "orders",
      groupIgnoreCase: true,
      rules: [
        {
          id: "layout-rule",
          enabled: true,
          scope: "text",
          path: "",
          pattern: "WARN|ERROR",
          ignoreCase: true,
          target: "row",
          colors: { foreground: "#111827", background: "#fef08a" },
          separateThemeColors: false,
        },
      ],
    },
  ];
  workspace.savedQueries.push({
    id: "layout-query",
    name: "Very long saved query name repeated across a narrow workspace settings pane",
    kind: "events",
    text: "failed",
  });
  await writeFile(join(directory, "workspace.json"), JSON.stringify(workspace));
  const env: Record<string, string> = {};
  for (const key of ["PATH", "SystemRoot", "WINDIR", "TEMP", "TMP", "COMSPEC"])
    if (process.env[key]) env[key] = process.env[key]!;
  Object.assign(env, {
    EXPLORER_TEST_USER_DATA: directory,
    USERPROFILE: directory,
    APPDATA: directory,
    LOCALAPPDATA: directory,
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
  page.setDefaultTimeout(10000);
  page.on("pageerror", (error) => errors.push(error.message));
  const session = await page.context().newCDPSession(page);
  await session.send("Emulation.setFocusEmulationEnabled", { enabled: true });
  // Resize the native hidden window itself so WCO geometry and the content use
  // the same real dimensions, rather than emulating only the page viewport.
  const width = 1800;
  await app.evaluate(({ BrowserWindow }, width) => {
    const win = BrowserWindow.getAllWindows()[0];
    win.setContentSize(width, 850);
    win.webContents.setBackgroundThrottling(false);
  }, width);
  await expect.poll(() => page.evaluate(() => innerWidth)).toBe(width);
  expect(
    (await page.evaluate(() => window.explorer.environment())).canEnableAws,
  ).toBe(false);
  await app.evaluate(({ dialog }) => {
    dialog.showMessageBox = async () => {
      throw new Error("Unexpected close-save dialog");
    };
  });
  await expect(page.locator('[data-node-kind="group"]')).toHaveCount(9);
  await app.evaluate(async ({ BrowserWindow }) => {
    for (let i = 0; i < 3; i++)
      await BrowserWindow.getAllWindows()[0].webContents.capturePage(
        undefined,
        { stayHidden: true, stayAwake: true },
      );
  });
});
test.afterEach(async () => {
  if (child?.exitCode === null) {
    expect(
      await app.evaluate(({ BrowserWindow }) =>
        BrowserWindow.getAllWindows().every((w) => !w.isVisible()),
      ),
    ).toBe(true);
    const closed = app.waitForEvent("close");
    await app.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()[0].close(),
    );
    await closed;
    expect(child.exitCode).toBe(0);
  }
  expect(errors).toEqual([]);
  if (directory?.startsWith(root + sep))
    await rm(directory, { recursive: true, force: true });
});

const categoryNames = [
  "Connections",
  "Preferences",
  "Time ranges",
  "Highlights",
  "Shortcuts",
  "Workspace",
];
async function choose(name: string) {
  await page.getByRole("tab", { name, exact: true }).click();
  return page.getByRole("tabpanel", { name, exact: true });
}
async function capturePage(name: string) {
  const png = await app.evaluate(async ({ BrowserWindow }) => {
    const contents = BrowserWindow.getAllWindows()[0].webContents;
    await contents.capturePage(undefined, {
      stayHidden: true,
      stayAwake: true,
    });
    return (
      await contents.capturePage(undefined, {
        stayHidden: true,
        stayAwake: true,
      })
    )
      .toPNG()
      .toString("base64");
  });
  await writeFile(test.info().outputPath(name), Buffer.from(png, "base64"));
}
async function resizeSettings(
  presentation: string,
  width: number,
  height: number,
) {
  if (presentation === "pane") {
    await app.evaluate(
      ({ BrowserWindow }, height) =>
        BrowserWindow.getAllWindows()[0].setContentSize(1800, height),
      height,
    );
    const current = (await page.locator(".sidebar-shell").boundingBox())!;
    const grip = (await page.locator(".sidebar-resizer").boundingBox())!;
    await page.mouse.move(grip.x + grip.width / 2, 200);
    await page.mouse.down();
    await page.mouse.move(
      grip.x + grip.width / 2 + width - current.width,
      200,
      { steps: 6 },
    );
    await page.mouse.up();
    await expect
      .poll(async () =>
        Math.round((await page.locator(".sidebar-shell").boundingBox())!.width),
      )
      .toBe(width);
  } else {
    const dialog = page.getByRole("dialog", { name: "Settings", exact: true });
    const current = (await dialog.boundingBox())!;
    const grip = (await page
      .getByRole("button", { name: "Resize Settings window", exact: true })
      .boundingBox())!;
    await page.mouse.move(grip.x + grip.width / 2, grip.y + grip.height / 2);
    await page.mouse.down();
    await page.mouse.move(
      grip.x + grip.width / 2 + width - current.width,
      grip.y + grip.height / 2 + height - current.height,
      { steps: 6 },
    );
    await page.mouse.up();
    await expect
      .poll(async () => Math.round((await dialog.boundingBox())!.width))
      .toBe(width);
  }
}
for (const theme of ["light", "dark"])
  for (const presentation of ["pane", "modal"]) {
    test(`${theme} responsive ${presentation} fits every Settings page and preserves editor state`, async () => {
      await page.getByRole("button", { name: "Settings", exact: true }).click();
      if (presentation === "modal")
        await page
          .getByRole("button", { name: "Open settings in window", exact: true })
          .click();
      const widths =
        presentation === "pane" ? [260, 620, 1100] : [560, 820, 1100];
      for (const width of widths) {
        await resizeSettings(
          presentation,
          width,
          width === widths[0] ? (presentation === "pane" ? 620 : 420) : 850,
        );
        for (const category of categoryNames) {
          const panel = await choose(category);
          const metrics = await panel.evaluate((el) => ({
            client: el.clientWidth,
            scroll: el.scrollWidth,
          }));
          expect(
            metrics.scroll,
            `${presentation} ${width}px ${category} horizontal overflow`,
          ).toBeLessThanOrEqual(metrics.client + 1);
          const escaped = await panel.evaluate((el) => {
            const outer = el.getBoundingClientRect();
            return [
              ...el.querySelectorAll<HTMLElement>(
                "input,textarea,button,[role=combobox]",
              ),
            ]
              .filter((control) => {
                if (control.closest(".highlight-rules-scroll")) return false;
                const rect = control.getBoundingClientRect();
                return (
                  rect.width > 0 &&
                  rect.height > 0 &&
                  (rect.left < outer.left - 1 || rect.right > outer.right + 1)
                );
              })
              .map(
                (control) =>
                  control.getAttribute("aria-label") ||
                  control.textContent?.slice(0, 60),
              );
          });
          expect(
            escaped,
            `${presentation} ${width}px ${category} clipped controls`,
          ).toEqual([]);
        }
        await choose("Highlights");
        const layout = await page
          .locator(".highlight-master-detail")
          .evaluate((el) => {
            const children = [...el.children].map((child) =>
              child.getBoundingClientRect(),
            );
            return {
              columns: children[0].top === children[1].top,
              height: children[0].height,
            };
          });
        expect(layout.columns).toBe(width === 1100);
        const colorFields = page.locator(
          ".highlight-detail-fields .mantine-ColorInput-input",
        );
        await expect(colorFields).toHaveCount(2);
        const clippedColors = await colorFields.evaluateAll((inputs) =>
          inputs
            .filter((input) => {
              const field = input as HTMLInputElement,
                style = getComputedStyle(field);
              const context = document
                .createElement("canvas")
                .getContext("2d")!;
              context.font = style.font;
              const available =
                field.clientWidth -
                parseFloat(style.paddingLeft) -
                parseFloat(style.paddingRight);
              return context.measureText(field.value).width > available + 1;
            })
            .map((input) => (input as HTMLInputElement).value),
        );
        expect(
          clippedColors,
          `${presentation} ${width}px color values`,
        ).toEqual([]);
        const previewToggle = page.getByRole("button", {
          name: /Test and preview/,
        });
        if (presentation === "modal") {
          await previewToggle.click();
          const preview = page.locator(".highlight-preview-body");
          await preview.scrollIntoViewIfNeeded();
          expect(
            await preview.evaluate(
              (el) => el.scrollWidth <= el.clientWidth + 1,
            ),
          ).toBe(true);
          if (width === widths[0])
            await capturePage("narrow-highlight-preview.png");
          await previewToggle.click();
        } else await expect(previewToggle).toHaveCount(0);
        await choose("Shortcuts");
        const fields = page
          .getByRole("tabpanel", { name: "Shortcuts", exact: true })
          .locator(".mantine-TextInput-root");
        const first = (await fields.nth(0).boundingBox())!,
          second = (await fields.nth(1).boundingBox())!;
        expect(Math.abs(first.y - second.y) < 1).toBe(false);
        if (width === widths[0]) {
          await choose("Time ranges");
          const slot = page.getByRole("textbox", {
            name: "Quick toolbar Minutes slot 1",
            exact: true,
          });
          await slot.fill("2");
          await expect(slot).toHaveValue("2");
          await capturePage("narrow-time-ranges.png");
          await choose("Workspace");
          await page
            .getByLabel("Import workspace JSON", { exact: true })
            .fill('{"draft":');
        }
        await choose("Workspace");
        await expect(
          page.getByLabel("Import workspace JSON", { exact: true }),
        ).toHaveValue('{"draft":');
      }
      await choose("Highlights");
      await app.evaluate(async ({ BrowserWindow }) => {
        const contents = BrowserWindow.getAllWindows()[0].webContents;
        contents.setBackgroundThrottling(false);
        await contents.capturePage(undefined, {
          stayHidden: true,
          stayAwake: true,
        });
      });
      const png = await app.evaluate(async ({ BrowserWindow }) =>
        (
          await BrowserWindow.getAllWindows()[0].webContents.capturePage(
            undefined,
            { stayHidden: true, stayAwake: true },
          )
        )
          .toPNG()
          .toString("base64"),
      );
      await writeFile(
        test.info().outputPath("responsive-settings.png"),
        Buffer.from(png, "base64"),
      );
    });
  }
