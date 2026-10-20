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

test.setTimeout(120000);
test.describe.configure({ mode: "parallel" });
let app: ElectronApplication | undefined;
let child: ReturnType<ElectronApplication["process"]> | undefined;
let page: Page;
let directory: string;
let errors: string[];
const temporaryRoot = resolve(".tmp", "desktop-row-colors");

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

const primary = (row: ReturnType<Page["locator"]>, mode: string) =>
  row.locator(mode === "JSON" ? ".json-card-meta" : ".log-table-row");
const paint = (row: ReturnType<Page["locator"]>, mode: string) =>
  (mode === "JSON"
    ? primary(row, mode)
    : row.locator(".log-cell").first()
  ).evaluate((node) => {
    const style = getComputedStyle(node);
    let background = style.backgroundColor;
    let current: Element | null = node;
    while (background === "rgba(0, 0, 0, 0)" && current.parentElement) {
      current = current.parentElement;
      background = getComputedStyle(current).backgroundColor;
    }
    return { background, foreground: style.color };
  });
async function select(row: ReturnType<Page["locator"]>, mode: string) {
  await primary(row, mode).click({ position: { x: 140, y: 10 } });
  await expect(row).toHaveAttribute("data-selected", "true");
  await page.mouse.move(1, 1);
}
async function capture(filename: string) {
  let png = "";
  for (let attempt = 0; attempt < 3; attempt++) {
    await page.evaluate(
      () =>
        new Promise<void>((done) =>
          requestAnimationFrame(() => requestAnimationFrame(() => done())),
        ),
    );
    png = await app!.evaluate(async ({ BrowserWindow }) => {
      const window = BrowserWindow.getAllWindows()[0];
      if (window.isVisible())
        throw new Error("Row color verification became visible");
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

for (const theme of ["light", "dark"] as const)
  for (const rowBackground of [true, false])
    test(`selection overrides ${rowBackground ? "background and foreground" : "foreground-only"} highlights and every row hovers in ${theme}`, async () => {
      const workspace = createWorkspace();
      workspace.preferences.theme = theme;
      workspace.tabs[0].view.columns = [
        { path: "@timestamp", width: 210, pinned: true },
        { path: "@level", width: 90, pinned: true },
        { path: "@message", width: 1000 },
      ];
      workspace.preferences.highlightProfiles = [
        {
          id: "row-colors",
          name: "Row colors",
          enabled: true,
          groupPattern: "",
          groupIgnoreCase: false,
          rules: [
            {
              id: "payment",
              enabled: true,
              scope: "text",
              path: "",
              pattern: "Payment provider",
              ignoreCase: false,
              target: "row",
              colors: {
                ...(rowBackground ? { background: "#b5a136" } : {}),
                foreground: "#573057",
              },
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
        const fold = page.getByRole("button", {
          name: "Fold all messages",
          exact: true,
        });
        if (await fold.count()) await fold.click();
        const highlighted = page
          .locator('.virtual-event[data-highlighted="true"]')
          .first();
        await expect(highlighted).toBeVisible();
        const plain = page
          .locator('.virtual-event[data-highlighted="false"]')
          .first();
        const plainId = await plain.getAttribute("data-event-id");
        const highlightId = await highlighted.getAttribute("data-event-id");
        await select(plain, mode);
        const selectedPlain = await paint(plain, mode);
        await select(highlighted, mode);
        const selectedHighlight = await paint(highlighted, mode);
        expect
          .soft(
            selectedHighlight.background,
            `${mode}: selected profile background wins without hover`,
          )
          .toBe(selectedPlain.background);
        expect
          .soft(
            selectedHighlight.foreground,
            `${mode}: selected profile foreground remains readable`,
          )
          .toBe(selectedPlain.foreground);
        expect
          .soft(
            await highlighted.evaluate(
              (node) => getComputedStyle(node).outlineStyle,
            ),
            `${mode}: no selected profile outline`,
          )
          .toBe("none");
        expect
          .soft(
            await highlighted.evaluate(
              (node) => getComputedStyle(node).boxShadow,
            ),
            `${mode}: no partial selection border`,
          )
          .toBe("none");
        await primary(highlighted, mode).hover({ position: { x: 140, y: 10 } });
        expect
          .soft(
            (await paint(highlighted, mode)).background,
            `${mode}: selected row hover changes its color`,
          )
          .not.toBe(selectedHighlight.background);
        if (rowBackground && mode === "Table")
          await capture(`selected-hover-${theme}.png`);
        await select(plain, mode);
        const idleHighlight = await paint(highlighted, mode);
        await primary(highlighted, mode).hover({ position: { x: 140, y: 10 } });
        expect
          .soft(
            (await paint(highlighted, mode)).background,
            `${mode}: regex row hover changes its color`,
          )
          .not.toBe(idleHighlight.background);
        if (rowBackground && mode === "Table")
          await capture(`profile-hover-${theme}.png`);
        await select(highlighted, mode);
        const idlePlain = await paint(plain, mode);
        await primary(plain, mode).hover({ position: { x: 140, y: 10 } });
        expect
          .soft(
            (await paint(plain, mode)).background,
            `${mode}: plain row hover changes its color`,
          )
          .not.toBe(idlePlain.background);
        if (mode !== "JSON") {
          await page.locator(".viewer-scroll").evaluate((node) => {
            node.scrollLeft = 140;
          });
          await expect(
            page.locator(`.virtual-event[data-event-id="${highlightId}"]`),
          ).toBeVisible();
          const cells = highlighted.locator(".log-cell");
          const backgrounds = await cells.evaluateAll((nodes) =>
            nodes.map((node) => getComputedStyle(node).backgroundColor),
          );
          expect
            .soft(
              new Set(backgrounds).size,
              `${mode}: pinned and unpinned cells share selected color after scrolling`,
            )
            .toBe(1);
          expect.soft(backgrounds[0]).toBe(selectedPlain.background);
          if (mode === "Hybrid")
            expect
              .soft(
                await highlighted
                  .locator(".hybrid-gutter")
                  .evaluate((node) => getComputedStyle(node).backgroundColor),
              )
              .toBe(backgrounds[0]);
          await capture(`selected-${theme}-${rowBackground}-${mode}.png`);
          await page.locator(".viewer-scroll").evaluate((node) => {
            node.scrollLeft = 0;
          });
        }
        expect(await plain.getAttribute("data-event-id")).toBe(plainId);
      }
    });
