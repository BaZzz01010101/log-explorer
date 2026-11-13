import {
  _electron as electron,
  expect,
  test,
  type ElectronApplication,
  type Locator,
  type Page,
} from "@playwright/test";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { join, resolve, sep } from "node:path";
import { desktopExecutablePath } from "./desktop-app";
import { createWorkspace } from "../../src/renderer/workspace";

const root = resolve(".tmp", "explorer-resource-drag");

async function launch(): Promise<{ app: ElectronApplication; page: Page; directory: string }> {
  await mkdir(root, { recursive: true });
  const directory = await mkdtemp(join(root, "case-"));
  await writeFile(join(directory, "workspace.json"), JSON.stringify(createWorkspace()));
  const env: Record<string, string> = {};
  for (const key of ["PATH", "SystemRoot", "WINDIR", "TEMP", "TMP", "COMSPEC"])
    if (process.env[key]) env[key] = process.env[key]!;
  Object.assign(env, {
    EXPLORER_TEST_USER_DATA: directory,
    USERPROFILE: directory,
    APPDATA: directory,
    LOCALAPPDATA: directory,
    AWS_CONFIG_FILE: join(directory, "missing"),
    AWS_SHARED_CREDENTIALS_FILE: join(directory, "missing"),
    AWS_EC2_METADATA_DISABLED: "true",
  });
  const packaged = process.env.EXPLORER_DESKTOP_PACKAGED === "1";
  const app = await electron.launch({
    executablePath: packaged ? desktopExecutablePath() : undefined,
    args: [
      ...(packaged ? [] : [process.cwd()]),
      "--offline-verification",
      "--background-verification",
      "--disable-background-networking",
    ],
    env,
  });
  const page = await app.firstWindow();
  await (await page.context().newCDPSession(page)).send("Emulation.setFocusEmulationEnabled", { enabled: true });
  return { app, page, directory };
}

async function cleanup(app: ElectronApplication, directory: string) {
  await app.close();
  if (!resolve(directory).startsWith(root + sep + "case-")) throw new Error("Unsafe test cleanup path");
  await rm(directory, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
}

/** Explorer resources use a captured pointer gesture: press, pass the 6px threshold, move, release. */
async function startDrag(page: Page, source: Locator) {
  const from = (await source.boundingBox())!;
  await page.mouse.move(from.x + 20, from.y + from.height / 2);
  await page.mouse.down();
  await page.mouse.move(from.x + 35, from.y + from.height / 2, { steps: 3 });
  await expect(page.locator(".resource-drag-preview")).toBeVisible();
}
async function moveTo(page: Page, target: Locator, x = 0.5, y = 0.5) {
  const box = (await target.boundingBox())!;
  await page.mouse.move(box.x + box.width * x, box.y + box.height * y, { steps: 6 });
}
async function dropOnFavorites(page: Page, source: Locator, favorites: Locator) {
  await startDrag(page, source);
  await moveTo(page, favorites);
  await expect(favorites).toHaveClass(/is-drop-target/);
  await page.mouse.up();
  await expect(page.locator(".resource-drag-preview")).toHaveCount(0);
  await expect(favorites).not.toHaveClass(/is-drop-target/);
}

test("AWS Explorer log groups drop onto Favorites as saved views", async () => {
  const { app, page, directory } = await launch();
  try {
    await expect(page.locator('.query-status[data-query-state="complete"]').first()).toBeAttached();
    const explorer = page.getByRole("complementary", { name: "AWS resources" });
    const favorites = explorer.getByLabel("Favorite views");
    await expect(favorites).toContainText("Drag a tab or log source here");
    const tabs = await page.locator(".workspace-tab").count();
    const group = explorer.getByRole("button", { name: "/aws/lambda/payments-worker", exact: true });
    await dropOnFavorites(page, group, favorites);
    await expect(favorites.locator(".saved-view-favorite")).toHaveCount(1);
    await expect(favorites.locator(".saved-view-favorite")).toContainText("payments-worker");
    // Saving is not opening, and the same selection is saved only once.
    await expect(page.locator(".workspace-tab")).toHaveCount(tabs);
    await dropOnFavorites(page, group, favorites);
    await expect(favorites.locator(".saved-view-favorite")).toHaveCount(1);
    await favorites.locator(".saved-view-favorite").click();
    await expect(page.locator(".workspace-tab")).toHaveCount(tabs + 1);
    await expect(page.getByRole("tab", { selected: true })).toContainText("payments-worker");
  } finally {
    await cleanup(app, directory);
  }
});

test("Google Cloud sources drag into tabs, view sources, splits and Favorites", async () => {
  test.setTimeout(240000);
  const { app, page, directory } = await launch();
  try {
    await app.evaluate(({ ipcMain }) => {
      for (const channel of ["gcp:profiles", "gcp:signin", "gcp:projects", "gcp:logs", "gcp:functions", "gcp:contexts", "gcp:clusters", "gcp:workloads", "explorer:query"])
        ipcMain.removeHandler(channel);
      const state = globalThis as typeof globalThis & { __gcpSources?: string[] };
      state.__gcpSources = [];
      ipcMain.handle("explorer:query", async (event, request) => {
        if (!request.sources.some((source: { gcp?: unknown }) => source.gcp)) return;
        state.__gcpSources!.push(...request.sources.map((source: { logGroup: string }) => source.logGroup));
        setTimeout(() => event.sender.send("explorer:update", {
          requestId: request.requestId,
          state: "complete",
          replace: true,
          events: request.sources.map((source: { logGroup: string }, index: number) => ({
            id: `${source.logGroup}-${index}`,
            timestamp: 2000 + index,
            message: `Google event from ${source.logGroup}`,
            logGroup: source.logGroup,
            logStream: "example",
            connectionId: request.connection.id,
          })),
        }), 20);
      });
      ipcMain.handle("gcp:profiles", async () => ({
        configurations: [{ name: "work", active: true, account: "user@example.com", project: "demo-123" }],
        accounts: ["user@example.com"],
      }));
      ipcMain.handle("gcp:signin", async () => undefined);
      ipcMain.handle("gcp:projects", async () => ({ items: [{ id: "demo-123", name: "Demo" }] }));
      ipcMain.handle("gcp:logs", async () => ({ items: [] }));
      ipcMain.handle("gcp:functions", async (_event, _identity, project, generation) => ({
        items: generation === "v2" ? [] : ["orders", "billing"].map((name) => ({
          name: `function:${name}`,
          label: `/gcp/functions/${name}`,
          kind: "function",
          generation: "v1",
          project,
          region: "eu-west2",
        })),
      }));
      ipcMain.handle("gcp:contexts", async () => []);
      ipcMain.handle("gcp:clusters", async () => []);
      ipcMain.handle("gcp:workloads", async () => ({ items: [] }));
    });
    await page.getByRole("button", { name: "Google Cloud logs explorer" }).click();
    const explorer = page.getByRole("complementary", { name: "Google Cloud resources" });
    const signIn = explorer.getByRole("button", { name: "Sign in" });
    if (await signIn.isVisible().catch(() => false)) await signIn.click();
    await explorer.getByLabel("Google Cloud project", { exact: true }).click();
    await page.getByRole("option", { name: "Demo (demo-123)" }).click();
    const orders = explorer.getByRole("option", { name: "/gcp/functions/orders" });
    const billing = explorer.getByRole("option", { name: "/gcp/functions/billing" });
    await expect(orders).toBeVisible();
    const tabs = page.locator(".workspace-tab");
    const initialTabs = await tabs.count();

    // Favorites: saved without opening a view.
    const favorites = explorer.getByLabel("Favorite views");
    await dropOnFavorites(page, orders, favorites);
    await expect(favorites.locator(".saved-view-favorite")).toHaveCount(1);
    await expect(tabs).toHaveCount(initialTabs);

    // Tab strip: a new tab at the end of the strip.
    await startDrag(page, orders);
    await moveTo(page, page.locator(".workspace-tab-list").first(), 0.98);
    await expect(page.locator("[data-resource-tab-insertion]")).toBeVisible();
    await page.mouse.up();
    await expect(tabs).toHaveCount(initialTabs + 1);
    await expect(page.getByRole("tab", { selected: true })).toContainText("orders");
    await expect(page.getByText("Google event from /gcp/functions/orders").first()).toBeVisible();

    // View sources: the strip appears during the drag and accepts the source.
    await startDrag(page, billing);
    const strip = page.locator(".source-badges").first();
    await expect(strip).toBeVisible();
    await moveTo(page, strip);
    await expect(strip).toHaveClass(/source-drop-active/);
    await page.mouse.up();
    await expect(page.getByRole("group", { name: "Log sources" }).first()).toContainText("2 Sources");
    await expect(tabs).toHaveCount(initialTabs + 1);

    // Split: dropping near a pane edge opens a split pane.
    await expect(page.locator(".workspace-pane")).toHaveCount(1);
    await startDrag(page, billing);
    await moveTo(page, page.locator("[data-pane-drop-target]").first(), 0.5, 0.97);
    await expect(page.locator('[data-resource-split-preview="bottom"]')).toBeVisible();
    await page.mouse.up();
    await expect(page.locator(".workspace-pane")).toHaveCount(2);
    await expect(page.locator(".pane-drop-overlay,.resource-drag-preview")).toHaveCount(0);
    await expect.poll(() => app.evaluate(() => (globalThis as typeof globalThis & { __gcpSources?: string[] }).__gcpSources!.filter((name) => name === "/gcp/functions/billing").length)).toBeGreaterThan(1);
  } finally {
    await cleanup(app, directory);
  }
});
