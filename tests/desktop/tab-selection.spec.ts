import { desktopExecutablePath } from "./desktop-app";
import {
  _electron as electron,
  expect,
  test,
  type ElectronApplication,
  type Page,
} from "@playwright/test";
import { execFileSync } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve, sep } from "node:path";

let app: ElectronApplication;
let child: ReturnType<ElectronApplication["process"]>;
let page: Page;
let directory: string;
let errors: string[];
const packaged = process.env.EXPLORER_DESKTOP_PACKAGED === "1";

test.beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), "aws-log-explorer-tab-selection-"));
  const env: Record<string, string> = {};
  for (const name of [
    "PATH",
    "SystemRoot",
    "WINDIR",
    "TEMP",
    "TMP",
    "USERPROFILE",
    "LOCALAPPDATA",
    "APPDATA",
    "COMSPEC",
  ])
    if (process.env[name]) env[name] = process.env[name]!;
  Object.assign(env, {
    EXPLORER_TEST_USER_DATA: directory,
    AWS_CONFIG_FILE: join(directory, "absent-config"),
    AWS_SHARED_CREDENTIALS_FILE: join(directory, "absent-credentials"),
    AWS_EC2_METADATA_DISABLED: "true",
  });
  errors = [];
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
  const session = await page.context().newCDPSession(page);
  await session.send("Emulation.setFocusEmulationEnabled", { enabled: true });
  page.on("pageerror", (error) => errors.push(error.message));
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
      throw new Error(
        "Unexpected native dialog during hidden tab-selection verification",
      );
    };
  });
  await expect(
    page.locator('.query-status[data-query-state="complete"]'),
  ).toBeAttached();
});

test.afterEach(async () => {
  if (child?.exitCode === null) {
    await Promise.race([
      app.close().catch(() => {}),
      new Promise((resolveDelay) => setTimeout(resolveDelay, 4000)),
    ]);
    if (child.exitCode === null) {
      if (process.platform === "win32") {
        try {
          execFileSync("taskkill", ["/PID", String(child.pid), "/T", "/F"], {
            stdio: "ignore",
          });
        } catch {}
      } else child.kill();
    }
  }
  if (
    !resolve(directory).startsWith(
      resolve(tmpdir()) + sep + "aws-log-explorer-tab-selection-",
    )
  )
    throw new Error("Unsafe tab-selection cleanup path");
  await rm(directory, {
    recursive: true,
    force: true,
    maxRetries: 10,
    retryDelay: 100,
  });
  expect(errors).toEqual([]);
});

async function openFourTabs() {
  for (const name of ["payments-worker", "media-pipeline", "notifications"])
    await page
      .getByRole("treeitem", { name: `/aws/lambda/${name}`, exact: true })
      .locator(".resource-label")
      .dblclick();
  await expect(page.locator(".workspace-tab")).toHaveCount(4);
}

test("Shift selects an inclusive anchored range and Ctrl starts with the active tab", async () => {
  await openFourTabs();
  await page.getByRole("tab", { name: "orders-api", exact: true }).click();
  await page
    .getByRole("tab", { name: "media-pipeline", exact: true })
    .click({ modifiers: ["Shift"] });
  await expect(page.locator(".workspace-tab.is-selected")).toHaveCount(3);
  await expect(page.locator(".workspace-tab.is-selected")).toContainText([
    "orders-api",
    "payments-worker",
    "media-pipeline",
  ]);
  await page
    .getByRole("tab", { name: "notifications", exact: true })
    .click({ modifiers: ["Control"] });
  await expect(page.locator(".workspace-tab.is-selected")).toHaveCount(4);
  await page.getByRole("tab", { name: "payments-worker", exact: true }).click();
  await expect(page.locator(".workspace-tab.is-selected")).toHaveCount(0);
  await page
    .getByRole("tab", { name: "notifications", exact: true })
    .click({ modifiers: ["Control"] });
  await expect(page.locator(".workspace-tab.is-selected")).toHaveCount(2);
  await expect(page.locator(".workspace-tab.is-selected")).toContainText([
    "payments-worker",
    "notifications",
  ]);
});

test("duplicating a middle tab inserts its independent copy immediately after the original", async () => {
  await openFourTabs();
  const before = await page
    .locator("[data-tab-id]")
    .evaluateAll((elements) =>
      elements.map((element) => element.getAttribute("data-tab-id")!),
    );
  const original = page.getByRole("tab", {
    name: "payments-worker",
    exact: true,
  });
  const sourceId = await original.locator("..").getAttribute("data-tab-id");
  await original.click({ button: "right" });
  await page
    .getByRole("menuitem", { name: "Duplicate tab", exact: true })
    .click();
  await expect(page.locator(".workspace-tab")).toHaveCount(5);
  const after = await page
    .locator("[data-tab-id]")
    .evaluateAll((elements) =>
      elements.map((element) => element.getAttribute("data-tab-id")!),
    );
  const copiedId = after.find((id) => !before.includes(id))!;
  expect(after.indexOf(copiedId)).toBe(after.indexOf(sourceId!) + 1);
  await expect(
    page.locator(`[data-tab-id="${copiedId}"]`).getByRole("tab"),
  ).toHaveAccessibleName("payments-worker");
  await page.locator(`[data-tab-id="${copiedId}"]`).getByRole("tab").click();
  await page.getByLabel("Local filter loaded events").fill("Payment");
  await page.locator(`[data-tab-id="${sourceId}"]`).getByRole("tab").click();
  await expect(page.getByLabel("Local filter loaded events")).toHaveValue("");
});
