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
import { createWorkspace } from "../../src/renderer/workspace";
import type { Workspace } from "../../src/shared/contracts";

test.setTimeout(90000);
test.describe.configure({ mode: "parallel" });
let app: ElectronApplication | undefined;
let child: ReturnType<ElectronApplication["process"]> | undefined;
let page: Page;
let directory: string;
let errors: string[];
const temporaryRoot = resolve(".tmp", "desktop-query-mode-detail-hover");

test.beforeEach(async () => {
  await mkdir(temporaryRoot, { recursive: true });
  directory = await mkdtemp(join(temporaryRoot, "case-"));
  errors = [];
});

async function launch(workspace: Workspace) {
  workspace.tabs[0]!.filterPattern = "";
  await writeFile(join(directory, "workspace.json"), JSON.stringify(workspace));
  const env: Record<string, string> = {};
  for (const key of ["PATH", "SystemRoot", "WINDIR", "TEMP", "TMP", "COMSPEC"])
    if (process.env[key]) env[key] = process.env[key]!;
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
      "*,*::before,*::after { transition-duration: 0s !important; animation-duration: 0s !important; }",
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
        "Unexpected native dialog during hidden query/hover verification",
      );
    };
  });
  await expect(
    page.locator('.query-status[data-query-state="complete"]'),
  ).toBeAttached();
}

test.afterEach(async () => {
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
    child = undefined;
    app = undefined;
  }
  expect(errors).toEqual([]);
  if (!resolve(directory).startsWith(temporaryRoot + sep + "case-"))
    throw new Error("Unsafe query/hover cleanup path");
  await rm(directory, {
    recursive: true,
    force: true,
    maxRetries: 10,
    retryDelay: 100,
  });
});

const loaded = async () =>
  Number(
    (await page.locator(".query-status").innerText())
      .match(/([\d,]+) loaded/)?.[1]
      .replaceAll(",", ""),
  );

test("switching Events and Insights runs each selected query without Run and leaves text drafts manual", async () => {
  const workspace = createWorkspace();
  workspace.tabs[0]!.query =
    "fields @timestamp, @message | sort @timestamp desc | limit 3";
  await launch(workspace);
  const initial = await loaded();
  expect(initial).toBeGreaterThan(3);
  await page
    .locator("label")
    .filter({ hasText: /^Insights$/ })
    .click();
  await expect.poll(loaded).toBe(3);
  await expect(page.getByText(/Query settings changed/)).toHaveCount(0);
  const query = page.getByLabel("CloudWatch Logs Insights query", {
    exact: true,
  });
  await query.fill(
    "fields @timestamp, @message | sort @timestamp desc | limit 2",
  );
  await expect(page.getByText(/Query settings changed/)).toBeVisible();
  expect(await loaded()).toBe(3);
  await page.getByTestId("run-query").click();
  await expect.poll(loaded).toBe(2);
  await page
    .locator("label")
    .filter({ hasText: /^Events$/ })
    .click();
  await expect.poll(loaded).toBe(initial);
  await page
    .getByLabel("CloudWatch filter pattern", { exact: true })
    .fill("unmatched-mode-regression-7812");
  await expect(page.getByText(/Query settings changed/)).toBeVisible();
  expect(await loaded()).toBe(initial);
  await page
    .locator("label")
    .filter({ hasText: /^Insights$/ })
    .click();
  await expect.poll(loaded).toBe(2);
  await page
    .locator("label")
    .filter({ hasText: /^Events$/ })
    .click();
  await expect.poll(loaded).toBe(0);
});

for (const theme of ["dark", "light"] as const)
  for (const highlighted of [false, true])
    test(`expanded details keep their base colors while only primary rows hover in ${theme}, profile ${highlighted}`, async () => {
      const workspace = createWorkspace();
      workspace.preferences.theme = theme;
      if (highlighted)
        workspace.preferences.highlightProfiles = [
          {
            id: "hover-profile",
            name: "Hover fixture",
            enabled: true,
            groupPattern: "",
            groupIgnoreCase: false,
            rules: [
              {
                id: "all-rows",
                enabled: true,
                scope: "text",
                path: "",
                pattern: ".",
                ignoreCase: false,
                target: "row",
                colors: { background: "#25415a", foreground: "#f1dca7" },
                separateThemeColors: false,
              },
            ],
          },
        ];
      await launch(workspace);
      for (const mode of ["Table", "Hybrid", "JSON"]) {
        await page
          .locator("label")
          .filter({ hasText: new RegExp(`^${mode}$`) })
          .click();
        const row = page.locator(".virtual-event").first();
        if (!(await row.locator(".event-message-details").count()))
          await page
            .getByRole("button", { name: "Unfold all messages", exact: true })
            .click();
        const detail = row.locator(".event-message-details");
        await expect(detail).toBeVisible();
        if (highlighted)
          await expect(row).toHaveAttribute("data-highlighted", "true");
        const primary =
          mode === "JSON"
            ? row.locator(".json-card-meta")
            : row.locator(".log-table-row");
        const colored =
          mode === "JSON" ? primary : primary.locator(".log-cell").first();
        const colors = () =>
          detail.evaluate((node) => {
            const style = getComputedStyle(node);
            let current: Element | null = node;
            let background = style.backgroundColor;
            while (
              background === "rgba(0, 0, 0, 0)" &&
              current?.parentElement
            ) {
              current = current.parentElement;
              background = getComputedStyle(current).backgroundColor;
            }
            return { background, foreground: style.color };
          });
        for (const selected of [false, true]) {
          // Ctrl-click toggles the first row without collapsing the detail.
          if ((await row.getAttribute("data-selected")) !== String(selected))
            await primary.click({
              modifiers: ["Control"],
              position: { x: 100, y: 10 },
            });
          await expect(row).toHaveAttribute("data-selected", String(selected));
          await page.mouse.move(1, 1);
          const baseline = await colors();
          const primaryBackground = await colored.evaluate(
            (node) => getComputedStyle(node).backgroundColor,
          );
          await primary.hover({ position: { x: 100, y: 10 } });
          expect(await colors()).toEqual(baseline);
          expect(
            await colored.evaluate(
              (node) => getComputedStyle(node).backgroundColor,
            ),
          ).not.toBe(primaryBackground);
          await detail.hover({ position: { x: 80, y: 12 } });
          expect(await colors()).toEqual(baseline);
          if (highlighted) expect(baseline.background).toBe("rgb(37, 65, 90)");
        }
      }
      const screenshot = await app!.evaluate(async ({ BrowserWindow }) => {
        const window = BrowserWindow.getAllWindows()[0];
        if (window.isVisible())
          throw new Error("Hover verification became visible");
        const image = await window.webContents.capturePage(undefined, {
          stayHidden: true,
          stayAwake: true,
        });
        if (window.isVisible())
          throw new Error("Hover capture changed visibility");
        return image.toPNG().toString("base64");
      });
      await mkdir(test.info().outputDir, { recursive: true });
      await writeFile(
        test
          .info()
          .outputPath(`expanded-details-${theme}-profile-${highlighted}.png`),
        Buffer.from(screenshot, "base64"),
      );
    });
