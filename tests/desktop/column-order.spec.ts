import {
  _electron as electron,
  expect,
  test,
  type ElectronApplication,
  type Page,
} from "@playwright/test";
import { execFileSync } from "node:child_process";
import { mkdtemp, readFile, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve, sep } from "node:path";
import { createWorkspace } from "../../src/renderer/workspace";

test.setTimeout(60000);
let app: ElectronApplication | undefined;
let child: ReturnType<ElectronApplication["process"]> | undefined;
let page: Page;
let directory: string;
let errors: string[];
const initial = [
  "Timestamp",
  "Level",
  "/service/name",
  "Message",
  "/request/id",
];
const reordered = [
  "Timestamp",
  "/service/name",
  "Level",
  "Message",
  "/request/id",
];

test.beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), "aws-log-explorer-column-order-"));
  errors = [];
  const state = createWorkspace();
  state.tabs[0].view.columns.splice(2, 0, {
    path: "@logGroup",
    width: 240,
    hidden: true,
  });
  await writeFile(join(directory, "workspace.json"), JSON.stringify(state));
  const env: Record<string, string> = {};
  for (const key of [
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
    if (process.env[key]) env[key] = process.env[key]!;
  Object.assign(env, {
    EXPLORER_TEST_USER_DATA: directory,
    AWS_CONFIG_FILE: join(directory, "absent-config"),
    AWS_SHARED_CREDENTIALS_FILE: join(directory, "absent-credentials"),
    AWS_EC2_METADATA_DISABLED: "true",
  });
  const packaged = process.env.EXPLORER_DESKTOP_PACKAGED === "1";
  app = await electron.launch({
    executablePath: packaged
      ? join(process.cwd(), "release/win-unpacked/AWS Log Explorer.exe")
      : undefined,
    args: [
      ...(packaged ? ["--offline-verification"] : [process.cwd()]),
      "--background-verification",
      "--disable-background-networking",
      "--disable-component-update",
    ],
    env,
  });
  child = app.process();
  page = await app.firstWindow();
  page.setDefaultTimeout(6000);
  const input = await page.context().newCDPSession(page);
  await input.send("Emulation.setFocusEmulationEnabled", { enabled: true });
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
      throw new Error("Unexpected native dialog in hidden column-order test");
    };
  });
  await expect(page.locator(".query-status")).toContainText("complete");
  await page.evaluate(() => {
    (window as unknown as { nativeColumnDrags: number }).nativeColumnDrags = 0;
    document.addEventListener(
      "dragstart",
      () =>
        (window as unknown as { nativeColumnDrags: number })
          .nativeColumnDrags++,
    );
  });
});

test.afterEach(async () => {
  if (app && child && child.exitCode === null) {
    try {
      const exit = app.waitForEvent("close", { timeout: 7000 });
      const processExit = new Promise<number | null>((resolveExit) =>
        child!.once("exit", resolveExit),
      );
      await app.evaluate(({ BrowserWindow }) =>
        BrowserWindow.getAllWindows()[0].close(),
      );
      await exit;
      expect(await processExit).toBe(0);
    } finally {
      if (child.exitCode === null) {
        if (process.platform === "win32")
          execFileSync("taskkill", ["/PID", String(child.pid), "/T", "/F"], {
            stdio: "ignore",
          });
        else child.kill();
      }
    }
  }
  expect(errors).toEqual([]);
  if (
    !resolve(directory).startsWith(
      resolve(tmpdir()) + sep + "aws-log-explorer-column-order-",
    )
  )
    throw new Error("Unsafe column-order cleanup path");
  await rm(directory, {
    recursive: true,
    force: true,
    maxRetries: 10,
    retryDelay: 100,
  });
});

async function sequence() {
  return (
    await page.locator(".log-table-header .column-sort").allTextContents()
  ).map((label) => label.trim());
}

for (const mode of ["Table", "Hybrid"]) {
  test(`${mode} supports trusted header dragging, persists order, and still resizes and sorts`, async () => {
    await page
      .locator("label")
      .filter({ hasText: new RegExp(`^${mode}$`) })
      .click();
    expect(await sequence()).toEqual(initial);
    const source = page.locator('.column-sort[title="Sort by Level"]');
    const destination = page.locator(
      '.column-sort[title="Sort by /service/name"]',
    );
    const from = (await source.boundingBox())!,
      to = (await destination.boundingBox())!;
    await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
    await page.mouse.down();
    try {
      await page.mouse.move(
        from.x + from.width / 2 + 10,
        from.y + from.height / 2,
        { steps: 3 },
      );
      await page.mouse.move(to.x + to.width * 0.8, to.y + to.height / 2, {
        steps: 12,
      });
    } finally {
      await page.mouse.up();
    }
    await expect.poll(sequence).toEqual(reordered);
    await expect(
      page.getByRole("columnheader").filter({ has: source }),
    ).toHaveAttribute("aria-sort", "none");
    expect(await page.evaluate(() => window.getSelection()?.toString())).toBe(
      "",
    );
    expect(
      await page.evaluate(
        () =>
          (window as unknown as { nativeColumnDrags: number })
            .nativeColumnDrags,
      ),
    ).toBe(0);
    await expect
      .poll(async () => {
        const stored = JSON.parse(
          await readFile(join(directory, "workspace.json"), "utf8"),
        );
        return stored.tabs[0].view.columns.map(
          (column: { path: string }) => column.path,
        );
      })
      .toEqual([
        "@timestamp",
        "/service/name",
        "@logGroup",
        "@level",
        "@message",
        "/request/id",
      ]);
    const handle = page.getByRole("separator", {
      name: "Resize Level",
      exact: true,
    });
    const header = page.getByRole("columnheader").filter({ has: source });
    const oldWidth = (await header.boundingBox())!.width,
      edge = (await handle.boundingBox())!;
    await page.mouse.move(edge.x + edge.width / 2, edge.y + edge.height / 2);
    await page.mouse.down();
    try {
      await page.mouse.move(
        edge.x + edge.width / 2 + 45,
        edge.y + edge.height / 2 + 25,
        { steps: 10 },
      );
      await expect
        .poll(async () => (await header.boundingBox())!.width)
        .toBeGreaterThan(oldWidth + 35);
    } finally {
      await page.mouse.up();
    }
    expect(await sequence()).toEqual(reordered);
    await expect(
      page.getByRole("columnheader").filter({ has: destination }),
    ).toHaveAttribute("aria-sort", "none");
    await destination.click();
    const sortedHeader = page
      .getByRole("columnheader")
      .filter({ has: destination });
    await expect(sortedHeader).not.toHaveAttribute("aria-sort", "none");
    const direction = await sortedHeader.getAttribute("aria-sort");
    await destination.click();
    await expect(sortedHeader).toHaveAttribute(
      "aria-sort",
      direction === "ascending" ? "descending" : "ascending",
    );

    // Exercise pointer hit testing after horizontal scrolling, where the sticky
    // pinned header covers part of the unpinned header row.
    await app!.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()[0].setSize(1100, 800),
    );
    await page.locator(".viewer-scroll").hover();
    await page.mouse.wheel(700, 0);
    await expect
      .poll(() =>
        page
          .locator(".viewer-scroll")
          .evaluate((element) => element.scrollLeft),
      )
      .toBeGreaterThan(0);
    const request = page.locator('.column-sort[title="Sort by /request/id"]');
    const message = page.locator('.column-sort[title="Sort by Message"]');
    const requestBox = (await request.boundingBox())!,
      messageBox = (await message.boundingBox())!;
    const pinnedBox = (await page
      .getByRole("columnheader")
      .first()
      .boundingBox())!;
    const dropX = Math.max(
      messageBox.x + messageBox.width * 0.25,
      pinnedBox.x + pinnedBox.width + 15,
    );
    await page.mouse.move(
      requestBox.x + requestBox.width / 2,
      requestBox.y + requestBox.height / 2,
    );
    await page.mouse.down();
    try {
      await page.mouse.move(
        requestBox.x + requestBox.width / 2 - 10,
        requestBox.y + requestBox.height / 2,
        { steps: 3 },
      );
      await page.mouse.move(dropX, messageBox.y + messageBox.height / 2, {
        steps: 12,
      });
    } finally {
      await page.mouse.up();
    }
    await expect
      .poll(sequence)
      .toEqual([
        "Timestamp",
        "/service/name",
        "Level",
        "/request/id",
        "Message",
      ]);
    await expect(page.getByRole("columnheader").first()).toHaveClass(/pinned/);
  });
}
