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
  createTab,
  workspaceReducer,
  restoreWorkspace,
} from "../../src/renderer/workspace";
import { desktopExecutablePath } from "./desktop-app";

// Every process, fixture and result stays within the checkout. Background mode
// prevents native windows and the offline flag prevents AWS credential access.
const temporaryRoot = resolve(".tmp/desktop-pinned-tabs");
let app: ElectronApplication, page: Page, directory: string, errors: string[];
test.beforeEach(async ({}, info) => {
  errors = [];
  await mkdir(temporaryRoot, { recursive: true });
  directory = await mkdtemp(join(temporaryRoot, "case-"));
  let workspace = createWorkspace();
  workspace.preferences.theme = "light";
  for (const [id, name] of [
    ["tab-payments", "payments-worker"],
    ["tab-media", "media-pipeline"],
  ]) {
    const tab = createTab("offline", [{ logGroup: "/aws/lambda/" + name }]);
    tab.id = id;
    tab.filterPattern = "";
    workspace = workspaceReducer(workspace, { type: "tab/open", tab });
  }
  workspace = workspaceReducer(workspace, {
    type: "tab/select",
    tabId: "tab-orders",
  });
  workspace.tabs[0].filterPattern = "";
  if (info.title.includes("drag motion wrapped")) {
    for (let index = 0; index < 5; index++) {
      const tab = createTab("offline", [
        { logGroup: "/aws/lambda/notifications" },
      ]);
      tab.id = `tab-extra-${index}`;
      tab.customTitle = `Another long service name for wrapped row ${index}`;
      workspace = workspaceReducer(workspace, { type: "tab/open", tab });
    }
  }
  if (
    info.title.includes("drag painting") ||
    info.title.includes("drag motion")
  ) {
    const labels = [
      "ugc-manager-se1-processUGCJobs-with-long-label",
      "Jobs",
      "Mixed Sources (10)",
    ];
    workspace.tabs.forEach((tab, index) => {
      tab.customTitle = labels[index] ?? tab.customTitle;
    });
    workspace.preferences.theme = info.title.includes("dark")
      ? "dark"
      : "light";
    workspace.preferences.pinnedTabsSeparateRow =
      info.title.includes("separate");
    workspace.preferences.tabBarLayout = info.title.includes("wrapped")
      ? "wrap"
      : "scroll";
    for (const tab of workspace.tabs)
      workspace = workspaceReducer(workspace, {
        type: "tab/pin",
        tabId: tab.id,
        pinned: true,
      });
  }
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

test.setTimeout(180000);
const tab = (id: string) => page.locator(`.workspace-tab[data-tab-id="${id}"]`);
async function expectVisualOrder(ids: string[]) {
  await expect
    .poll(async () => {
      const positions = await page
        .locator("[data-tab-id]")
        .evaluateAll((elements) =>
          elements.map((element) => {
            const rect = element.getBoundingClientRect();
            return {
              id: (element as HTMLElement).dataset.tabId!,
              x: rect.left,
              y: rect.top,
              width: rect.width,
              height: rect.height,
            };
          }),
        );
      for (let i = 0; i < positions.length; i++)
        for (let j = i + 1; j < positions.length; j++) {
          const a = positions[i],
            b = positions[j];
          if (
            Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x) > 1 &&
            Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y) > 1
          )
            return ["overlap"];
        }
      return positions
        .sort((a, b) => (Math.abs(a.y - b.y) > 1 ? a.y - b.y : a.x - b.x))
        .map((item) => item.id);
    })
    .toEqual(ids);
}
async function pinTab(id: string) {
  await tab(id).click({ button: "right" });
  await page.getByRole("menuitem", { name: "Pin tab", exact: true }).click();
  await expect(tab(id)).toHaveAttribute("data-pinned", "true");
}
async function settings() {
  await page
    .getByRole("button", { name: "Workspace settings", exact: true })
    .click();
  await page.getByRole("tab", { name: "Preferences", exact: true }).click();
}
async function separateRows(value = true) {
  await settings();
  await page
    .getByRole("checkbox", {
      name: "Put pinned tabs on a separate row",
      exact: true,
    })
    .setChecked(value);
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toBeHidden();
}
async function startDrag(locator: ReturnType<Page["locator"]>) {
  const rect = (await locator.boundingBox())!;
  await page.mouse.move(rect.x + 30, rect.y + rect.height / 2);
  await page.mouse.down();
  await page.mouse.move(rect.x + 42, rect.y + rect.height / 2, { steps: 3 });
}
async function moveTo(
  locator: ReturnType<Page["locator"]>,
  offset: number | "end" = 2,
) {
  const rect = (await locator.boundingBox())!;
  await page.mouse.move(
    offset === "end" ? rect.x + rect.width - 5 : rect.x + offset,
    rect.y + rect.height / 2,
    { steps: 6 },
  );
}

async function capture(name: string) {
  const png = await app.evaluate(async ({ BrowserWindow }) => {
    const window = BrowserWindow.getAllWindows()[0];
    if (window.isVisible()) throw new Error("Verification became visible");
    await window.webContents.capturePage(undefined, {
      stayHidden: true,
      stayAwake: true,
    });
    return (
      await window.webContents.capturePage(undefined, {
        stayHidden: true,
        stayAwake: true,
      })
    )
      .toPNG()
      .toString("base64");
  });
  await test.info().attach(name, {
    body: Buffer.from(png, "base64"),
    contentType: "image/png",
  });
}

test("pinned tabs protect ordinary closing, persist both row layouts, and font edits update before blur", async () => {
  await pinTab("tab-media");
  await expect(page.locator(".workspace-tab").first()).toHaveAttribute(
    "data-tab-id",
    "tab-media",
  );
  await expect(
    tab("tab-media").getByRole("button", {
      name: "Unpin media-pipeline",
      exact: true,
    }),
  ).toBeVisible();
  await tab("tab-media").click({ button: "middle" });
  await expect(tab("tab-media")).toBeVisible();
  await tab("tab-media").getByRole("tab").click();
  await page.keyboard.press("Control+w");
  await expect(tab("tab-media")).toBeVisible();
  await page.keyboard.press("Delete");
  await expect(tab("tab-media")).toBeVisible();
  await settings();
  const input = page.getByRole("textbox", {
    name: "Log font size",
    exact: true,
  });
  await input.fill("14");
  await expect(input).toBeFocused();
  await expect(page.locator(".log-viewer")).toHaveCSS(
    "--log-font-size",
    "14px",
  );
  await input.fill("1");
  await expect(page.locator(".log-viewer")).toHaveCSS(
    "--log-font-size",
    "14px",
  );
  await input.fill("16");
  await expect(page.locator(".log-viewer")).toHaveCSS(
    "--log-font-size",
    "16px",
  );
  await expect(input).toBeFocused();
  await page
    .getByRole("checkbox", {
      name: "Put pinned tabs on a separate row",
      exact: true,
    })
    .check();
  await page.keyboard.press("Escape");
  await expect(tab("tab-media").locator("..")).toHaveAttribute(
    "data-tab-strip",
    "pinned",
  );
  await expect
    .poll(async () => (await stored()).preferences.pinnedTabsSeparateRow)
    .toBe(true);
  await page.reload();
  await expect(tab("tab-media")).toHaveAttribute("data-pinned", "true");
  await expect(
    page.locator('[data-tab-strip="pinned"] .workspace-tab'),
  ).toHaveCount(1);
  await capture("pinned-tab-row.png");
  await tab("tab-media")
    .getByRole("button", { name: "Unpin media-pipeline", exact: true })
    .click();
  await expect(tab("tab-media")).toHaveAttribute("data-pinned", "false");
  await pinTab("tab-media");
  await tab("tab-media").click({ button: "right" });
  await page.getByRole("menuitem", { name: "Close tab", exact: true }).click();
  await expect(tab("tab-media")).toHaveCount(0);
});

test("tab drags pin in an empty separate row and only before or between pins in a shared row", async () => {
  await separateRows();
  await settings();
  await page.getByRole("combobox", { name: "Tab layout", exact: true }).click();
  await page
    .getByRole("option", { name: "Multiple rows", exact: true })
    .click();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toBeHidden();
  await startDrag(tab("tab-media").getByRole("tab"));
  await moveTo(page.locator('[data-tab-strip="pinned"]'), "end");
  await expect(page.locator(".workspace-tab-insertion")).toBeVisible();
  await page.mouse.up();
  await expect(tab("tab-media")).toHaveAttribute("data-pinned", "true");
  await pinTab("tab-orders");
  await separateRows(false);
  await startDrag(tab("tab-payments").getByRole("tab"));
  await moveTo(tab("tab-orders"), 3);
  await expect(page.locator(".workspace-tab-insertion")).toBeVisible();
  await page.mouse.up();
  await expect(tab("tab-payments")).toHaveAttribute("data-pinned", "true");
  await tab("tab-payments")
    .getByRole("button", { name: "Unpin payments-worker", exact: true })
    .click();
  await startDrag(tab("tab-payments").getByRole("tab"));
  const lastPin = tab("tab-orders");
  const rect = (await lastPin.boundingBox())!;
  await page.mouse.move(rect.x + rect.width - 3, rect.y + rect.height / 2, {
    steps: 6,
  });
  await page.mouse.up();
  await expect(tab("tab-payments")).toHaveAttribute("data-pinned", "false");
});

test("selected Explorer groups insert separate tabs at a boundary and pinned-row drops pin automatically", async () => {
  for (const name of [
    "/aws/lambda/payments-worker",
    "/aws/lambda/notifications",
  ])
    await row(name).getByRole("checkbox").check();
  await startDrag(
    row("/aws/lambda/payments-worker").getByRole("button", {
      name: "/aws/lambda/payments-worker",
      exact: true,
    }),
  );
  await moveTo(tab("tab-media"), 3);
  await expect(page.locator("[data-resource-tab-insertion]")).toHaveAttribute(
    "data-resource-tab-insertion",
    "tab-media",
  );
  await page.mouse.up();
  await expect(page.locator(".workspace-tab")).toHaveCount(5);
  let views = await page
    .locator(".workspace-tab-label > span:first-of-type")
    .allTextContents();
  expect(views).toEqual([
    "orders-api",
    "payments-worker",
    "payments-worker",
    "notifications",
    "media-pipeline",
  ]);
  await separateRows();
  await startDrag(
    row("/ecs/checkout").getByRole("button", {
      name: "/ecs/checkout",
      exact: true,
    }),
  );
  await moveTo(page.locator('[data-tab-strip="pinned"]'), "end");
  await expect(page.locator("[data-resource-tab-insertion]")).toHaveAttribute(
    "data-pin-drop",
    "true",
  );
  await page.mouse.up();
  await expect(
    page.locator('[data-tab-strip="pinned"] .workspace-tab'),
  ).toHaveCount(1);
  await expect(page.locator('[data-tab-strip="pinned"]')).toContainText(
    "checkout",
  );
  await separateRows(false);
  await startDrag(
    row("/aws/lambda/orders-api").getByRole("button", {
      name: "/aws/lambda/orders-api",
      exact: true,
    }),
  );
  await moveTo(page.locator('.workspace-tab[data-pinned="true"]').first(), 3);
  await expect(page.locator("[data-resource-tab-insertion]")).toHaveAttribute(
    "data-pin-drop",
    "true",
  );
  await page.mouse.up();
  await expect(page.locator('.workspace-tab[data-pinned="true"]')).toHaveCount(
    2,
  );
  await startDrag(
    row("/aws/lambda/media-pipeline").getByRole("button", {
      name: "/aws/lambda/media-pipeline",
      exact: true,
    }),
  );
  await moveTo(
    page.locator('.workspace-tab[data-pinned="true"]').last(),
    "end",
  );
  await expect(page.locator("[data-resource-tab-insertion]")).toHaveAttribute(
    "data-pin-drop",
    "false",
  );
  await page.mouse.up();
  await expect(page.locator('.workspace-tab[data-pinned="true"]')).toHaveCount(
    2,
  );
  await expect(page.locator(".workspace-tab")).toHaveCount(8);
});

test("Explorer hover still activates a target tab before a split drop and cancellation restores the original", async () => {
  const resource = row("/aws/lambda/notifications").getByRole("button", {
    name: "/aws/lambda/notifications",
    exact: true,
  });
  await startDrag(resource);
  await moveTo(tab("tab-payments"), 65);
  await expect(tab("tab-payments").getByRole("tab")).toHaveAttribute(
    "aria-selected",
    "true",
  );
  await page.keyboard.press("Escape");
  await page.mouse.up();
  await expect(tab("tab-orders").getByRole("tab")).toHaveAttribute(
    "aria-selected",
    "true",
  );
  await startDrag(resource);
  await moveTo(tab("tab-payments"), 65);
  await expect(tab("tab-payments").getByRole("tab")).toHaveAttribute(
    "aria-selected",
    "true",
  );
  const pane = (await page.locator("[data-pane-drop-target]").boundingBox())!;
  await page.mouse.move(pane.x + pane.width - 15, pane.y + pane.height / 2, {
    steps: 5,
  });
  await expect(
    page.locator('[data-resource-split-preview="right"]'),
  ).toBeVisible();
  await page.mouse.up();
  await expect(page.locator(".query-pane")).toHaveCount(2);
});

test("left-quarter tab pickup reorders across later tabs in shared and separate layouts", async () => {
  for (const separate of [false, true]) {
    if (separate) await separateRows();
    const first = page.locator(".workspace-tab").first();
    const id = await first.getAttribute("data-tab-id");
    const rect = (await first.boundingBox())!;
    const last = (await page.locator(".workspace-tab").last().boundingBox())!;
    await page.mouse.move(rect.x + 25, rect.y + rect.height / 2);
    await page.mouse.down();
    await page.mouse.move(rect.x + 40, rect.y + rect.height / 2, { steps: 3 });
    await page.mouse.move(last.x + last.width + 25, last.y + last.height / 2, {
      steps: 10,
    });
    await expect(page.locator(".workspace-tab-insertion")).toHaveAttribute(
      "data-tab-insertion-before",
      "__end__",
    );
    await page.mouse.up();
    await expect(page.locator(".workspace-tab").last()).toHaveAttribute(
      "data-tab-id",
      id!,
    );
  }
});

test("inactive tab text remains distinct and hovering changes only its background in both themes", async () => {
  for (const theme of ["light", "dark"]) {
    await settings();
    await page.getByRole("combobox", { name: "Theme", exact: true }).click();
    await page.getByRole("option", { name: theme, exact: true }).click();
    await expect(page.locator("html")).toHaveAttribute(
      "data-mantine-color-scheme",
      theme,
    );
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toBeHidden();
    const active = page.locator(".workspace-tab.is-active");
    const inactive = page.locator(".workspace-tab:not(.is-active)").first();
    const style = (element: Element) => ({
      color: getComputedStyle(element).color,
      background: getComputedStyle(element).backgroundColor,
    });
    await active.hover();
    const before = await inactive.evaluate(style);
    const activeBefore = await active.evaluate(style);
    expect(before.color).not.toBe(activeBefore.color);
    await inactive.hover();
    expect((await inactive.evaluate(style)).background).not.toBe(
      before.background,
    );
    expect((await active.evaluate(style)).background).toBe(
      activeBefore.background,
    );
    await capture("inactive-tabs-" + theme + ".png");
  }
});

for (const sourceId of ["tab-orders", "tab-payments", "tab-media"])
  test(`drag motion reverses through original slot from ${sourceId}`, async () => {
    await page.emulateMedia({ reducedMotion: "no-preference" });
    const ids = ["tab-orders", "tab-payments", "tab-media"];
    const slots = await Promise.all(
      ids.map(async (id) => ({ id, rect: (await tab(id).boundingBox())! })),
    );
    await startDrag(tab(sourceId).getByRole("tab"));
    for (const target of [2, 0, 1, 2, 0]) {
      const rect = slots[target].rect;
      const atEnd = target === 2;
      const before = atEnd ? null : ids[target];
      await page.mouse.move(
        atEnd ? rect.x + rect.width - 4 : rect.x + 4,
        rect.y + rect.height / 2,
        { steps: 8 },
      );
      await expect(page.locator(".workspace-tab-insertion")).toHaveAttribute(
        "data-tab-insertion-before",
        before ?? "__end__",
      );
      const expected = ids.filter((id) => id !== sourceId);
      if (before === sourceId)
        expected.splice(ids.indexOf(sourceId), 0, sourceId);
      else
        expected.splice(
          before ? expected.indexOf(before) : expected.length,
          0,
          sourceId,
        );
      await expectVisualOrder(expected);
    }
    await capture(`reversed-${sourceId}.png`);
    await page.keyboard.press("Escape");
    await page.mouse.up();
    await expectVisualOrder(ids);
    await expect(page.locator("[data-tab-row-preview]")).toHaveCount(0);
  });

test("drag motion wrapped rows pack the proposed order without overlap in either direction", async () => {
  const ids = await page
    .locator("[data-tab-id]")
    .evaluateAll((elements) =>
      elements.map((element) => (element as HTMLElement).dataset.tabId!),
    );
  const first = (await tab(ids[0]).boundingBox())!;
  const last = (await tab(ids.at(-1)!).boundingBox())!;
  expect(last.y).toBeGreaterThan(first.y + first.height / 2);
  await startDrag(tab(ids[0]).getByRole("tab"));
  await page.mouse.move(last.x + last.width - 4, last.y + last.height / 2, {
    steps: 12,
  });
  await expectVisualOrder([...ids.slice(1), ids[0]]);
  await capture("wrapped-proposed-order.png");
  await page.mouse.move(first.x + 4, first.y + first.height / 2, { steps: 12 });
  await expectVisualOrder(ids);
  await page.mouse.move(last.x + last.width - 4, last.y + last.height / 2, {
    steps: 12,
  });
  await expectVisualOrder([...ids.slice(1), ids[0]]);
  await page.mouse.up();
  await expect(page.locator(".workspace-tab").last()).toHaveAttribute(
    "data-tab-id",
    ids[0],
  );
  await expectVisualOrder([...ids.slice(1), ids[0]]);
});

test("dragging between pin rows keeps the source visible and clears its preview on cancellation", async () => {
  await separateRows();
  await pinTab("tab-orders");
  const source = tab("tab-media");
  await startDrag(source.getByRole("tab"));
  await moveTo(tab("tab-orders"), 3);
  const preview = page.locator('[data-tab-row-preview="tab-media"]');
  await expect(preview).toBeVisible();
  const pin = (await page.locator('[data-tab-strip="pinned"]').boundingBox())!;
  await expect
    .poll(async () => {
      const rect = (await preview.boundingBox())!;
      return Math.abs(rect.y - pin.y);
    })
    .toBeLessThan(2);
  await expect
    .poll(async () => Math.abs((await preview.boundingBox())!.x - pin.x))
    .toBeLessThan(1);
  await expect
    .poll(async () => {
      const rect = (await preview.boundingBox())!;
      return rect.x + rect.width - (await tab("tab-orders").boundingBox())!.x;
    })
    .toBeLessThan(1);
  await expect(source).toHaveCSS("visibility", "hidden");
  expect(await preview.locator("[data-tab-id], [id]").count()).toBe(0);
  const painted = await preview.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    return document
      .elementsFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2)
      .some((item) => item === element || element.contains(item));
  });
  // Preview deliberately ignores hit testing; verify its compositor output too.
  expect(painted).toBe(false);
  await capture("crossing-pin-row-preview.png");
  await page.keyboard.press("Escape");
  await page.mouse.up();
  await expect(preview).toHaveCount(0);
  await expect(source).toHaveCSS("visibility", "visible");
  await startDrag(source.getByRole("tab"));
  await moveTo(tab("tab-orders"), 3);
  await expect(preview).toBeVisible();
  await page.mouse.up();
  await expect(source).toHaveAttribute("data-pinned", "true");
  await expect(preview).toHaveCount(0);
  await expect(source).toHaveCSS("visibility", "visible");
});

for (const theme of ["light", "dark"])
  for (const layout of ["shared", "separate", "separate wrapped"])
    test(`drag painting preserves unequal tab labels and opaque surfaces in ${theme} ${layout}`, async () => {
      const source = tab("tab-orders");
      const initial = (await source.boundingBox())!;
      const neighbours = await page
        .locator('.workspace-tab:not([data-tab-id="tab-orders"])')
        .evaluateAll((elements) =>
          elements.map((element) => ({
            id: (element as HTMLElement).dataset.tabId,
            left: element.getBoundingClientRect().left,
            width: element.getBoundingClientRect().width,
          })),
        );
      const target = (await tab("tab-media").boundingBox())!;
      await page.mouse.move(initial.x + 30, initial.y + initial.height / 2);
      await page.mouse.down();
      await page.mouse.move(initial.x + 42, initial.y + initial.height / 2, {
        steps: 3,
      });
      await page.mouse.move(
        target.x + target.width - 5,
        target.y + target.height / 2,
        { steps: 8 },
      );
      await expect(source).toHaveClass(/is-dragging/);
      await expectVisualOrder(["tab-payments", "tab-media", "tab-orders"]);
      if (layout.includes("wrapped"))
        expect(
          await page
            .locator("[data-tab-strip]")
            .evaluateAll((elements) =>
              elements.every(
                (element) => element.scrollHeight <= element.clientHeight + 1,
              ),
            ),
        ).toBe(true);
      await capture(
        `drag-painting-${theme}-${layout.replaceAll(" ", "-")}.png`,
      );
      const painted = await source.evaluate((element) => {
        const style = getComputedStyle(element),
          matrix = new DOMMatrixReadOnly(style.transform);
        const context = document.createElement("canvas").getContext("2d")!;
        context.fillStyle = style.backgroundColor;
        context.fillRect(0, 0, 1, 1);
        return {
          width: element.getBoundingClientRect().width,
          height: element.getBoundingClientRect().height,
          scaleX: matrix.a,
          scaleY: matrix.d,
          opacity: Number(style.opacity),
          alpha: context.getImageData(0, 0, 1, 1).data[3],
        };
      });
      expect(painted.scaleX).toBeCloseTo(1, 5);
      expect(painted.scaleY).toBeCloseTo(1, 5);
      expect(painted.width).toBeCloseTo(initial.width, 1);
      expect(painted.height).toBeCloseTo(initial.height, 1);
      expect(painted.opacity).toBe(1);
      expect(painted.alpha).toBe(255);
      const ordered = ["tab-payments", "tab-media", "tab-orders"];
      for (let index = 0; index < ordered.length; index++) {
        const bounds = (await tab(ordered[index]).boundingBox())!;
        const previous = index
          ? (await tab(ordered[index - 1]).boundingBox())!
          : null;
        if (previous)
          expect(bounds.x).toBeGreaterThanOrEqual(
            previous.x + previous.width - 1,
          );
        const neighbour = neighbours.find((item) => item.id === ordered[index]);
        if (neighbour) {
          expect(bounds.width).toBeCloseTo(neighbour.width, 1);
          expect(bounds.x).toBeLessThan(neighbour.left - 20);
        }
      }
      await expect(page.locator(".workspace-drag-preview")).toHaveCount(0);
      await page.mouse.up();
      await expect(page.locator(".workspace-tab").last()).toHaveAttribute(
        "data-tab-id",
        "tab-orders",
      );
    });
