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
import { desktopExecutablePath } from "./desktop-app";
import {
  createWorkspace,
  restoreWorkspace,
} from "../../src/renderer/workspace";
import type { Workspace } from "../../src/shared/contracts";

test.setTimeout(120000);
const temporaryRoot = resolve(".tmp/desktop-explorer-accounts");
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
const region = (id: string) =>
  page.locator(`[data-node-kind="region"][data-connection-id="${id}"]`);
const groups = (id: string) =>
  page.locator(`[data-node-kind="group"][data-connection-id="${id}"]`);
const tree = () =>
  page.getByRole("tree", { name: "Log groups and streams", exact: true });
async function activeKind() {
  return tree().evaluate((element) =>
    document
      .getElementById(element.getAttribute("aria-activedescendant")!)
      ?.getAttribute("data-node-kind"),
  );
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

test("profile and region dropdowns show only groups and streams for the selected connection", async () => {
  const workspace = createWorkspace(),
    first = workspace.connections[0];
  first.id = "constructor";
  first.profile = "production";
  first.region = "us-east-1";
  workspace.tabs[0].connectionId = first.id;
  workspace.tabs[0].filterPattern = "";
  workspace.activeConnectionId = first.id;
  workspace.connections.push(
    { ...first, id: "west", region: "eu-west-1", name: "West" },
    {
      ...first,
      id: "development",
      profile: "development",
      name: "Development",
    },
  );
  await load(workspace);
  await expect(groups(first.id)).toHaveCount(9);
  await expect(groups("west")).toHaveCount(0);
  await expect(groups("development")).toHaveCount(0);
  await expect(
    page.locator('[data-node-kind="account"], [data-node-kind="region"]'),
  ).toHaveCount(0);
  await expect(
    page.getByRole("textbox", { name: "Filter loaded streams", exact: true }),
  ).toHaveCount(0);
  await page
    .getByRole("combobox", { name: "Explorer region", exact: true })
    .click();
  await page.getByRole("option", { name: "eu-west-1", exact: true }).click();
  await expect(groups("west")).toHaveCount(9);
  await expect(groups(first.id)).toHaveCount(0);
  await tree().focus();
  await page.keyboard.press("Home");
  expect(await activeKind()).toBe("group");
  await page.keyboard.press("ArrowRight");
  await expect(page.locator('[data-node-kind="stream"]')).toHaveCount(4);
  await page.keyboard.press("ArrowRight");
  expect(await activeKind()).toBe("stream");
  await page.keyboard.press("ArrowLeft");
  expect(await activeKind()).toBe("group");
  await page.keyboard.press("ArrowLeft");
  await groups("west")
    .getByRole("button", { name: "/aws/lambda/orders-api", exact: true })
    .click();
  await expect
    .poll(
      async () =>
        restoreWorkspace(
          (await page.evaluate(() => window.explorer.loadWorkspace()))
            .workspace,
        ).tabs.find((tab) => tab.preview)?.connectionId,
    )
    .toBe("west");
  await page
    .getByRole("combobox", { name: "Explorer profile", exact: true })
    .click();
  await page
    .getByRole("option", {
      name: "Offline fixtures · development",
      exact: true,
    })
    .click();
  await expect(groups("development")).toHaveCount(9);
  await expect(groups("west")).toHaveCount(0);
  await page
    .getByRole("textbox", { name: "Search log groups", exact: true })
    .fill("payments");
  await expect(groups("development")).toHaveCount(1);
  await expect(groups("development")).toContainText("payments-worker");
  await capture("flat-explorer-selectors.png");
});

test("settings adds and removes profiles and regions without listing every known choice or losing tabs", async () => {
  const workspace = createWorkspace(),
    first = workspace.connections[0];
  first.enabled = false;
  workspace.connections.push(
    {
      ...first,
      id: "prod-europe",
      enabled: true,
      profile: "constructor",
      mode: "aws",
      name: "Production Europe",
    },
    {
      ...first,
      id: "dev-east",
      enabled: true,
      profile: "development",
      mode: "aws",
      region: "us-east-1",
      name: "Development East",
    },
  );
  await load(workspace);
  await openSettingsWindow(page);
  const settings = page.getByRole("dialog", { name: "Settings" });
  await expect(settings.locator("[data-profile]")).toHaveCount(2);
  await expect(settings.locator(".profile-region-options")).toHaveCount(0);
  await settings
    .getByRole("button", { name: "Remove profile constructor", exact: true })
    .click();
  await expect(settings.locator("[data-profile]")).toHaveCount(1);
  await settings.locator(".mantine-Modal-close").click();
  await expect(
    page.getByRole("combobox", { name: "Explorer profile", exact: true }),
  ).toHaveValue("development");
  await openSettingsWindow(page);
  await settings
    .getByRole("combobox", { name: "Known profile to add", exact: true })
    .click();
  await page.getByRole("option", { name: "constructor", exact: true }).click();
  await settings
    .getByRole("button", { name: "Add profile", exact: true })
    .click();
  await expect(settings.locator("[data-profile]")).toHaveCount(2);
  await settings
    .getByRole("button", {
      name: "Remove constructor region eu-west-1",
      exact: true,
    })
    .click();
  await settings
    .getByRole("combobox", { name: "Add region for constructor", exact: true })
    .fill("N. Virginia");
  await page
    .getByRole("option", {
      name: "US East (N. Virginia) · us-east-1",
      exact: true,
    })
    .click();
  await settings
    .getByRole("button", {
      name: "Confirm add region for constructor",
      exact: true,
    })
    .click();
  await expect(
    settings.getByRole("button", {
      name: "Remove constructor region us-east-1",
      exact: true,
    }),
  ).toBeVisible();
  await capture("added-profiles-regions.png");
  await settings.locator(".mantine-Modal-close").click();
  await close();
  await launch();
  const stored = restoreWorkspace(
    (await page.evaluate(() => window.explorer.loadWorkspace())).workspace,
  );
  expect(stored.tabs).toHaveLength(1);
  expect(stored.tabs[0].connectionId).toBe(first.id);
  expect(
    stored.connections.find((connection) => connection.id === "prod-europe")
      ?.enabled,
  ).toBe(false);
  expect(
    stored.connections.some(
      (connection) =>
        connection.profile === "constructor" &&
        connection.region === "us-east-1" &&
        connection.enabled,
    ),
  ).toBe(true);
  expect(stored.preferences.profileVisibility?.constructor).toBe(true);
  expect(await page.evaluate(() => window.explorer.profiles())).toEqual([]);
});

for (const mode of ["json", "table", "hybrid"] as const) {
  test(
    mode +
      " quick text highlighting stays beside search, marks inspector content and preserves loaded events",
    async () => {
      const workspace = createWorkspace();
      workspace.tabs[0].view.mode = mode;
      workspace.tabs[0].filterPattern = "";
      await load(workspace);
      const input = page.getByRole("textbox", {
        name: "Highlight text in loaded events",
        exact: true,
      });
      const search = page.getByRole("textbox", {
        name: "Local filter loaded events",
        exact: true,
      });
      const grid = page.getByRole("grid", { name: "Log events", exact: true });
      const before = await grid.getAttribute("aria-rowcount");
      const searchBox = (await search.boundingBox())!,
        highlightBox = (await input.boundingBox())!;
      expect(Math.abs(searchBox.y - highlightBox.y)).toBeLessThan(2);
      expect(highlightBox.x).toBeGreaterThan(searchBox.x);
      await page.evaluate(() => {
        const probe = window as unknown as { quickHighlightUpdates: number };
        probe.quickHighlightUpdates = 0;
        window.explorer.onUpdate(() => probe.quickHighlightUpdates++);
      });
      await input.fill("Payment");
      await expect(grid.locator("mark").first()).toBeVisible();
      await expect(grid).toHaveAttribute("aria-rowcount", before!);
      await expect(search).toHaveValue("");
      await grid
        .locator(".virtual-event")
        .filter({ has: page.locator("mark") })
        .first()
        .dblclick();
      await expect(page.locator(".event-inspector mark").first()).toBeVisible();
      await page
        .getByRole("button", { name: "Clear text highlight", exact: true })
        .click();
      await expect(grid.locator("mark")).toHaveCount(0);
      await expect(page.locator(".event-inspector mark")).toHaveCount(0);
      await input.fill("Payment");
      await page.waitForTimeout(400);
      expect(
        await page.evaluate(
          () =>
            (window as unknown as { quickHighlightUpdates: number })
              .quickHighlightUpdates,
        ),
      ).toBe(0);
      await capture("quick-highlight-" + mode + ".png");
      if (mode === "hybrid") {
        await close();
        await launch();
        const restoredInput = page.getByRole("textbox", {
          name: "Highlight text in loaded events",
          exact: true,
        });
        await expect(restoredInput).toHaveValue("Payment");
        await expect(
          page
            .getByRole("grid", { name: "Log events", exact: true })
            .locator("mark")
            .first(),
        ).toBeVisible();
        await page
          .getByRole("button", {
            name: "/aws/lambda/payments-worker",
            exact: true,
          })
          .click();
        await expect(restoredInput).toHaveValue("");
        await page
          .locator(".workspace-tab")
          .filter({ hasText: "orders-api" })
          .click();
        await expect(restoredInput).toHaveValue("Payment");
      }
    },
  );
}
