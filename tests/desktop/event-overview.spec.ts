import {
  _electron as electron,
  expect,
  test,
  type ElectronApplication,
  type Page,
} from "@playwright/test";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { join, resolve, sep } from "node:path";
import { desktopExecutablePath } from "./desktop-app";
import { createWorkspace } from "../../src/renderer/workspace";
import type { Workspace } from "../../src/shared/contracts";

test.setTimeout(120000);
const temporaryRoot = resolve(".tmp/desktop-event-overview");
let app: ElectronApplication, page: Page, directory: string, errors: string[];
async function launch() {
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
  page = await app.firstWindow();
  page.setDefaultTimeout(7000);
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
  await app.evaluate(({ dialog }) => {
    dialog.showMessageBox = async () => {
      throw new Error("Unexpected native dialog during Explorer verification");
    };
  });
  await expect(
    page.locator('.query-status[data-query-state="complete"]'),
  ).toBeVisible();
}

test("profile overview follows theme colors, sorting and local filtering without querying", async () => {
  for (const theme of ["dark", "light"] as const) {
    const workspace = createWorkspace();
    workspace.tabs[0].filterPattern = "";
    workspace.tabs[0].view.mode = "table";
    workspace.preferences.theme = theme;
    workspace.preferences.highlightProfiles = [
      {
        id: "overview-profile",
        name: "Request",
        enabled: true,
        groupPattern: "orders-api$",
        groupIgnoreCase: false,
        rules: [
          {
            id: "request",
            enabled: true,
            scope: "structured",
            path: "/request/id",
            pattern: "^req-0001f4$",
            target: "row",
            ignoreCase: false,
            separateThemeColors: true,
            colors: { background: "#ff0000" },
            darkColors: { background: "#cc66ff" },
            lightColors: { foreground: "#0177aa" },
          },
        ],
      },
    ];
    await load(workspace);
    const grid = page.getByRole("grid", { name: "Log events", exact: true });
    const marker = page.locator(".overview-highlights .event-overview-mark");
    await expect(marker).toHaveCount(1);
    const id = (await marker.getAttribute("data-event-id"))!;
    const before = await marker.getAttribute("data-event-index");
    await expect(marker).toHaveCSS(
      "background-color",
      theme === "dark" ? "rgb(204, 102, 255)" : "rgb(1, 119, 170)",
    );
    await page
      .locator('.column-sort[data-tooltip="Sort by Timestamp"]')
      .click();
    await expect(marker).not.toHaveAttribute("data-event-index", before!);
    await marker.click();
    await expect(
      grid.locator(`.virtual-event[data-event-id="${id}"]`),
    ).toBeVisible();
    await page.evaluate(() => {
      const probe = window as unknown as { overviewQueryUpdates: number };
      probe.overviewQueryUpdates = 0;
      window.explorer.onUpdate(() => probe.overviewQueryUpdates++);
    });
    await page
      .getByRole("textbox", { name: "Local filter loaded events", exact: true })
      .fill("req-0001f4");
    await expect(grid).toHaveAttribute("aria-rowcount", "1");
    await expect(marker).toHaveAttribute("data-event-index", "0");
    await expect(
      page.locator(".overview-severity .event-overview-mark"),
    ).toHaveCount(0);
    await capture(`overview-profile-${theme}.png`);
    expect(
      await page.evaluate(
        () =>
          (window as unknown as { overviewQueryUpdates: number })
            .overviewQueryUpdates,
      ),
    ).toBe(0);
  }
});
async function close() {
  if (app && app.process().exitCode === null) {
    const closed = app.waitForEvent("close");
    await app.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()[0].close(),
    );
    await closed;
  }
}
async function load(workspace: Workspace) {
  await close();
  await writeFile(join(directory, "workspace.json"), JSON.stringify(workspace));
  await launch();
}
test.beforeEach(async () => {
  errors = [];
  await mkdir(temporaryRoot, { recursive: true });
  directory = await mkdtemp(join(temporaryRoot, "case-"));
  const workspace = createWorkspace();
  workspace.tabs[0].filterPattern = "";
  await writeFile(join(directory, "workspace.json"), JSON.stringify(workspace));
  await launch();
});
test.afterEach(async () => {
  await close();
  expect(errors).toEqual([]);
  if (!resolve(directory).startsWith(temporaryRoot + sep + "case-"))
    throw new Error("Unsafe Explorer verification cleanup");
  await rm(directory, {
    recursive: true,
    force: true,
    maxRetries: 10,
    retryDelay: 100,
  });
});
async function capture(filename: string) {
  let png = "";
  for (let frame = 0; frame < 3; frame++) {
    await page.evaluate(
      () =>
        new Promise<void>((done) =>
          requestAnimationFrame(() => requestAnimationFrame(() => done())),
        ),
    );
    png = await app.evaluate(async ({ BrowserWindow }) => {
      const window = BrowserWindow.getAllWindows()[0];
      if (window.isVisible()) throw new Error("Verification became visible");
      const image = await window.webContents.capturePage(undefined, {
        stayHidden: true,
        stayAwake: true,
      });
      return image.toPNG().toString("base64");
    });
  }
  await mkdir(test.info().outputDir, { recursive: true });
  await writeFile(test.info().outputPath(filename), Buffer.from(png, "base64"));
}

for (const mode of ["json", "table", "hybrid"] as const) {
  test(`scrollbar overview maps offscreen severity and highlights and preserves native scrolling in ${mode}`, async () => {
    const workspace = createWorkspace();
    workspace.tabs[0].filterPattern = "";
    workspace.tabs[0].view.mode = mode;
    await load(workspace);
    const grid = page.getByRole("grid", { name: "Log events", exact: true });
    const overview = page.getByRole("group", {
      name: "Event scrollbar overview",
      exact: true,
    });
    const severity = overview.locator(
      ".overview-severity .event-overview-mark",
    );
    const highlights = overview.locator(
      ".overview-highlights .event-overview-mark",
    );
    await expect(severity.first()).toBeVisible();
    await expect(highlights).toHaveCount(0);
    const railBox = (await overview.boundingBox())!;
    expect(railBox.width).toBeLessThanOrEqual(22);
    const width = await grid.evaluate(
      (el) => (el as HTMLElement).offsetWidth - el.clientWidth,
    );
    expect(width).toBe(20);
    expect(await severity.locator('[data-level="info"]').count()).toBe(0);
    const highlightInput = page.getByRole("textbox", {
      name: "Highlight text in loaded events",
      exact: true,
    });
    await highlightInput.fill("Payment");
    await expect(highlights.first()).toBeVisible();
    const leftBox = (await severity.first().boundingBox())!,
      rightBox = (await highlights.first().boundingBox())!;
    expect(rightBox.x).toBeGreaterThan(leftBox.x);
    const last = highlights.last();
    const id = (await last.getAttribute("data-event-id"))!;
    await expect(grid.locator(`[data-event-id="${id}"]`)).toHaveCount(0);
    await last.click();
    const target = grid.locator(`.virtual-event[data-event-id="${id}"]`);
    await expect(target).toBeVisible();
    await expect(target).toHaveAttribute("aria-selected", "true");
    await expect(target.locator("mark").first()).toBeVisible();
    await target.dblclick();
    await expect(page.locator(".event-inspector")).toBeVisible();
    expect((await overview.boundingBox())!.x).toBeLessThan(
      (await page.locator(".event-inspector").boundingBox())!.x,
    );
    await page
      .getByRole("button", { name: "Hide inspector", exact: true })
      .click();
    await grid.focus();
    await page.keyboard.press("Home");
    await expect.poll(() => grid.evaluate((el) => el.scrollTop)).toBe(0);
    const rect = (await grid.boundingBox())!;
    await page.mouse.move(rect.x + rect.width - 10, rect.y + 14);
    await page.mouse.down();
    await page.mouse.move(
      rect.x + rect.width - 10,
      rect.y + rect.height * 0.65,
      { steps: 15 },
    );
    await page.mouse.up();
    await expect
      .poll(() => grid.evaluate((el) => el.scrollTop))
      .toBeGreaterThan(100);
    await capture(`overview-${mode}.png`);
    await page
      .getByRole("button", { name: "Clear text highlight", exact: true })
      .click();
    await expect(highlights).toHaveCount(0);
    await page
      .getByRole("textbox", { name: "Local filter loaded events", exact: true })
      .fill("no-such-event-overview-xyz");
    await expect(grid).toHaveAttribute("aria-rowcount", "0");
    await expect(severity).toHaveCount(0);
  });
}

test("the full highlight lane stays visible and clickable beside the open inspector", async () => {
  await page
    .getByRole("textbox", {
      name: "Highlight text in loaded events",
      exact: true,
    })
    .fill("Payment");
  await page.locator(".virtual-event.level-error").first().dblclick();
  await expect(page.locator(".event-inspector")).toBeVisible();
  const marker = page
    .locator(".overview-highlights .event-overview-mark")
    .last();
  await expect(marker).toBeVisible();
  const exposed = await marker.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    return [rect.left + 0.5, rect.right - 0.5].map(
      (x) =>
        document
          .elementFromPoint(x, rect.top + rect.height / 2)
          ?.closest(".event-overview-mark") === element,
    );
  });
  expect(exposed).toEqual([true, true]);
});
