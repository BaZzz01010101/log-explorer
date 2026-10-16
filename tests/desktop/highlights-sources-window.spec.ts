import {
  _electron as electron,
  expect,
  test,
  type ElectronApplication,
  type Page,
} from "@playwright/test";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join, resolve, sep } from "node:path";
import { desktopExecutablePath } from "./desktop-app";
import { createWorkspace } from "../../src/renderer/workspace";

test.setTimeout(90000);
let app: ElectronApplication;
let page: Page;
let directory: string;
let errors: string[];
const temporaryRoot = resolve(".tmp/desktop-highlights-sources-window");
async function launch() {
  const env: Record<string, string> = {};
  for (const name of ["PATH", "SystemRoot", "WINDIR", "TEMP", "TMP", "COMSPEC"])
    if (process.env[name]) env[name] = process.env[name]!;
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
  page.setDefaultTimeout(6000);
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
      throw new Error("Unexpected native dialog");
    };
  });
  await expect(
    page.locator('.query-status[data-query-state="complete"]'),
  ).toBeVisible();
}
async function close() {
  if (!app || app.process().exitCode !== null) return;
  const exited = app.waitForEvent("close");
  await app.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows()[0].close(),
  );
  await exited;
}
test.beforeEach(async () => {
  errors = [];
  await mkdir(temporaryRoot, { recursive: true });
  directory = await mkdtemp(join(temporaryRoot, "case-"));
  const workspace = createWorkspace();
  workspace.connections.push({
    ...workspace.connections[0],
    id: "other-fixtures",
    name: "Other fixtures",
    region: "us-east-1",
  });
  workspace.tabs[0].view.mode = "table";
  workspace.tabs[0].filterPattern = "";
  await writeFile(join(directory, "workspace.json"), JSON.stringify(workspace));
  await launch();
});
test.afterEach(async () => {
  await close();
  expect(errors).toEqual([]);
  if (!resolve(directory).startsWith(temporaryRoot + sep + "case-"))
    throw new Error("Unsafe verification cleanup");
  await rm(directory, {
    recursive: true,
    force: true,
    maxRetries: 10,
    retryDelay: 100,
  });
});
async function settings() {
  await page
    .getByRole("button", { name: "Workspace settings", exact: true })
    .click();
  await page.getByRole("tab", { name: "Highlights", exact: true }).click();
}
const dialog = () => page.getByRole("dialog", { name: "Workspace settings" });
async function capture(filename: string) {
  let image = "";
  for (let i = 0; i < 3; i++) {
    await page.evaluate(
      () =>
        new Promise<void>((done) =>
          requestAnimationFrame(() => requestAnimationFrame(() => done())),
        ),
    );
    image = await app.evaluate(async ({ BrowserWindow }) => {
      const window = BrowserWindow.getAllWindows()[0];
      if (window.isVisible()) throw new Error("Verification became visible");
      const image = await window.webContents.capturePage(undefined, {
        stayHidden: true,
        stayAwake: true,
      });
      if (window.isVisible()) throw new Error("Capture changed visibility");
      return image.toPNG().toString("base64");
    });
  }
  await mkdir(test.info().outputDir, { recursive: true });
  await writeFile(
    test.info().outputPath(filename),
    Buffer.from(image, "base64"),
  );
}
async function dragResource(source: ReturnType<Page["locator"]>) {
  const start = (await source.boundingBox())!,
    end = (await page.locator(".viewer-toolbar").boundingBox())!;
  await page.mouse.move(start.x + start.width / 2, start.y + start.height / 2);
  await page.mouse.down();
  await page.mouse.move(
    start.x + start.width / 2 + 15,
    start.y + start.height / 2,
    { steps: 3 },
  );
  await page.mouse.move(end.x + end.width / 2, end.y + end.height / 2, {
    steps: 12,
  });
  await expect(page.locator(".resource-drag-preview")).toBeVisible();
  await expect(page.locator(".source-drop-message")).toBeVisible();
  await page.mouse.up();
  await expect(page.locator(".resource-drag-preview")).toHaveCount(0);
  await expect(page.locator(".source-drop-message")).toHaveCount(0);
  expect(await page.evaluate(() => getSelection()?.toString())).toBe("");
}
test("highlight profiles edit, scope, color rows and structured text, and persist across restart", async () => {
  await settings();
  await dialog()
    .getByRole("button", { name: "Add profile", exact: true })
    .click();
  await dialog()
    .getByLabel("Profile name", { exact: true })
    .fill("Payment investigation");
  await dialog()
    .getByLabel("Log group regex", { exact: true })
    .fill("orders-api$");
  await dialog().getByLabel("Match regex", { exact: true }).fill("ERROR");
  await dialog()
    .getByLabel("Shared background", { exact: true })
    .fill("#552211");
  await dialog().getByLabel("Shared background", { exact: true }).press("Tab");
  await dialog().locator(".mantine-Modal-close").click();
  const errorRow = page.locator(".virtual-event.level-error").first(),
    infoRow = page.locator(".virtual-event.level-info").first();
  await expect(errorRow).toHaveAttribute("data-highlighted", "true");
  await expect(infoRow).toHaveAttribute("data-highlighted", "false");
  await expect(errorRow.locator(".log-cell").first()).toHaveCSS(
    "background-color",
    "rgb(85, 34, 17)",
  );
  await errorRow.locator(".inspect-cell").first().click();
  await expect(errorRow).toHaveCSS("outline-width", "2px");
  await settings();
  await dialog()
    .getByRole("combobox", { name: "Search in", exact: true })
    .click();
  await page
    .getByRole("option", { name: "Structured property", exact: true })
    .click();
  await dialog()
    .getByLabel("JSON Pointer path", { exact: true })
    .fill("/level");
  await dialog()
    .getByRole("combobox", { name: "Highlight", exact: true })
    .click();
  await page
    .getByRole("option", { name: "Matching text", exact: true })
    .click();
  await dialog()
    .getByLabel("Separate light and dark colors", { exact: true })
    .check();
  await dialog().getByLabel("Dark background", { exact: true }).fill("#772222");
  await dialog().getByLabel("Dark background", { exact: true }).press("Tab");
  await dialog()
    .getByLabel("Light background", { exact: true })
    .fill("#ffdddd");
  await dialog().getByLabel("Light background", { exact: true }).press("Tab");
  await dialog().locator(".mantine-Modal-close").click();
  await page
    .locator("label")
    .filter({ hasText: /^Hybrid$/ })
    .click();
  await errorRow
    .getByRole("button", { name: "Expand event details", exact: true })
    .click();
  await expect(
    errorRow.locator(".json-value .profile-highlight-text"),
  ).toHaveText("ERROR");
  await expect(
    errorRow.locator(".json-value .profile-highlight-text"),
  ).toHaveCSS("background-color", "rgb(119, 34, 34)");
  await capture("structured-highlight-dark.png");
  await settings();
  await dialog().getByRole("tab", { name: "Preferences", exact: true }).click();
  await dialog().getByRole("combobox", { name: "Theme", exact: true }).click();
  await page.getByRole("option", { name: "light", exact: true }).click();
  await dialog().locator(".mantine-Modal-close").click();
  await expect(
    errorRow.locator(".json-value .profile-highlight-text"),
  ).toHaveCSS("background-color", "rgb(255, 221, 221)");
  await capture("structured-highlight-light.png");
  await close();
  await launch();
  await settings();
  await expect(
    dialog().getByLabel("Profile name", { exact: true }),
  ).toHaveValue("Payment investigation");
  await expect(
    dialog().getByLabel("JSON Pointer path", { exact: true }),
  ).toHaveValue("/level");
  await dialog().getByLabel("Profile enabled", { exact: true }).uncheck();
  await dialog().locator(".mantine-Modal-close").click();
  await expect(page.locator(".profile-highlight-text")).toHaveCount(0);
});
test("catastrophic preview regex times out in the worker and leaves controls responsive", async () => {
  await settings();
  await dialog()
    .getByRole("button", { name: "Add profile", exact: true })
    .click();
  await dialog().getByLabel("Match regex", { exact: true }).fill("(a+)+$");
  await dialog()
    .getByLabel("Preview event", { exact: true })
    .fill("a".repeat(200) + "!");
  await expect(
    dialog().getByText(/Highlighting paused: a regex exceeded/),
  ).toBeVisible({ timeout: 10000 });
  await dialog().getByLabel("Match regex", { exact: true }).fill("ERROR");
  await dialog()
    .getByLabel("Preview event", { exact: true })
    .fill("ERROR recovered");
  await expect(dialog().getByLabel("Highlight preview")).toHaveCSS(
    "background-color",
    "rgb(113, 63, 18)",
  );
  await dialog().locator(".mantine-Modal-close").click();
  await page
    .getByRole("textbox", { name: "Local filter loaded events", exact: true })
    .fill("Payment");
  await expect(page.locator(".query-status")).toContainText("shown");
});
test("Explorer groups and streams drag into sources and the staged editor preserves selections", async () => {
  const group = page.getByRole("button", {
    name: "/aws/lambda/payments-worker",
    exact: true,
  });
  await dragResource(group);
  await expect(
    page.getByRole("button", { name: "2 sources", exact: true }),
  ).toBeVisible();
  await dragResource(group);
  await expect(
    page.getByRole("button", { name: "2 sources", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", {
      name: "Expand /aws/lambda/media-pipeline",
      exact: true,
    })
    .click();
  const stream = page.locator(".stream-row .resource-label").first();
  const streamName = await stream.innerText();
  await dragResource(stream);
  await page.getByRole("button", { name: "3 sources", exact: true }).click();
  await page
    .getByRole("menuitem", { name: "Edit sources", exact: true })
    .click();
  const sources = page.getByRole("dialog", {
    name: "Log sources",
    exact: true,
  });
  await sources
    .getByRole("button", {
      name: "Choose streams for /aws/lambda/media-pipeline",
      exact: true,
    })
    .click();
  await expect(
    sources.getByLabel("Include all streams", { exact: true }),
  ).not.toBeChecked();
  await expect(
    sources.getByRole("button", {
      name: `Remove stream ${streamName.trim()}`,
      exact: true,
    }),
  ).toBeVisible();
  await sources
    .getByLabel("Find or enter a log stream", { exact: true })
    .fill("manual-stream");
  await sources
    .getByRole("button", { name: "Add stream", exact: true })
    .click();
  await expect(
    sources.getByRole("button", {
      name: "Remove stream manual-stream",
      exact: true,
    }),
  ).toBeVisible();
  await capture("source-editor.png");
  await sources
    .getByRole("button", { name: "Apply sources", exact: true })
    .click();
  await page.getByRole("button", { name: "3 sources", exact: true }).click();
  await page
    .getByRole("menuitem", { name: "Edit sources", exact: true })
    .click();
  await sources
    .getByRole("button", {
      name: "Choose streams for /aws/lambda/media-pipeline",
      exact: true,
    })
    .click();
  await expect(
    sources.getByRole("button", {
      name: "Remove stream manual-stream",
      exact: true,
    }),
  ).toBeVisible();
  await sources
    .getByRole("button", {
      name: "Remove group /aws/lambda/payments-worker",
      exact: true,
    })
    .click();
  await sources.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "3 sources", exact: true }),
  ).toBeVisible();
  await expect(page.getByLabel("CloudWatch filter pattern")).toHaveValue("");
});
test("resource dragging cancels with Escape and rejects another connection without changing sources", async () => {
  const group = page.getByRole("button", {
    name: "/aws/lambda/payments-worker",
    exact: true,
  });
  const start = (await group.boundingBox())!,
    target = (await page.locator(".viewer-toolbar").boundingBox())!;
  await page.mouse.move(start.x + 40, start.y + 10);
  await page.mouse.down();
  await page.mouse.move(target.x + 100, target.y + 15, { steps: 15 });
  await expect(page.locator(".resource-drag-preview")).toBeVisible();
  await page.keyboard.press("Escape");
  await page.mouse.up();
  await expect(page.locator(".resource-drag-preview")).toHaveCount(0);
  await expect(page.locator(".source-drop-message")).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "1 source", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("combobox", { name: "Explorer region", exact: true })
    .click();
  await page.getByRole("option", { name: "us-east-1", exact: true }).click();
  const otherGroup = page
    .locator('[data-node-kind="group"][data-connection-id="other-fixtures"]')
    .getByRole("button", { name: "/aws/lambda/payments-worker", exact: true });
  await expect(otherGroup).toBeVisible();
  await dragResource(otherGroup);
  await expect(
    page.getByText(
      "Sources must use the same connection and region. Change the tab connection in Edit sources first.",
      { exact: true },
    ),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "1 source", exact: true }),
  ).toBeVisible();
});
test("maximized state is saved before an immediate minimize without showing verification windows", async () => {
  await app.evaluate(({ BrowserWindow }) => {
    const window = BrowserWindow.getAllWindows()[0];
    // Emulate state accessors rather than physically maximizing/minimizing a
    // hidden window, which can show it on Windows. The real main listeners run.
    window.isMaximized = () => true;
    window.emit("maximize");
    window.isMinimized = () => true;
    window.emit("minimize");
  });
  await expect
    .poll(async () => {
      try {
        return JSON.parse(
          await readFile(join(directory, "window-state.json"), "utf8"),
        ).maximized;
      } catch {
        return undefined;
      }
    })
    .toBe(true);
  expect(
    await app.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()[0].isVisible(),
    ),
  ).toBe(false);
});
test("main window saves normal geometry and restores it on a hidden restart", async () => {
  const bounds = await app.evaluate(({ BrowserWindow, screen }) => {
    const window = BrowserWindow.getAllWindows()[0],
      area = screen.getPrimaryDisplay().workArea;
    const bounds = { x: area.x + 30, y: area.y + 30, width: 1000, height: 720 };
    window.setBounds(bounds);
    return window.getNormalBounds();
  });
  await close();
  const saved = JSON.parse(
    await readFile(join(directory, "window-state.json"), "utf8"),
  );
  expect(saved.bounds).toEqual(bounds);
  expect(saved.maximized).toBe(false);
  await launch();
  expect(
    await app.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()[0].getNormalBounds(),
    ),
  ).toEqual(bounds);
  expect(
    await app.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()[0].isVisible(),
    ),
  ).toBe(false);
});
