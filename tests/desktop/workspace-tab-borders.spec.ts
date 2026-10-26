import {
  _electron as electron,
  expect,
  test,
  type ElectronApplication,
  type Page,
} from "@playwright/test";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { join, resolve, sep } from "node:path";
import {
  createTab,
  createWorkspace,
  workspaceReducer,
} from "../../src/renderer/workspace";
import { desktopExecutablePath } from "./desktop-app";

const root = resolve(".tmp/desktop-workspace-tab-borders");
let directory: string;
let app: ElectronApplication | undefined;
let page: Page;
let errors: string[];

test.beforeEach(async () => {
  await mkdir(root, { recursive: true });
  directory = await mkdtemp(join(root, "case-"));
  app = undefined;
  errors = [];
});

test.afterEach(async () => {
  if (app && app.process().exitCode === null) {
    const child = app.process();
    expect(
      await app.evaluate(({ BrowserWindow }) =>
        BrowserWindow.getAllWindows().every((window) => !window.isVisible()),
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
  if (!resolve(directory).startsWith(root + sep + "case-"))
    throw new Error("Unsafe workspace-tab border cleanup path");
  await rm(directory, { recursive: true, force: true, maxRetries: 10 });
});

async function launch(theme: "light" | "dark", separate: boolean) {
  let workspace = createWorkspace();
  workspace.preferences.theme = theme;
  workspace.preferences.pinnedTabsSeparateRow = separate;
  workspace.preferences.tabBarLayout = separate ? "scroll" : "wrap";
  workspace.sidebarVisible = false;
  workspace.tabs[0].customTitle =
    "A long application service name for tab zero";
  workspace.tabs[0].filterPattern = "";
  for (let index = 1; index < 5; index++) {
    const tab = createTab("offline", [
      { logGroup: "/aws/lambda/payments-worker" },
    ]);
    tab.id = `border-tab-${index}`;
    tab.customTitle =
      index === 4 ? "Last" : `A long application service name for tab ${index}`;
    tab.filterPattern = "";
    workspace = workspaceReducer(workspace, { type: "tab/open", tab });
  }
  if (separate)
    for (const tab of workspace.tabs.slice(0, 2))
      workspace = workspaceReducer(workspace, {
        type: "tab/pin",
        tabId: tab.id,
        pinned: true,
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
  page = await app.firstWindow();
  page.on("pageerror", (error) => errors.push(error.message));
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Emulation.setFocusEmulationEnabled", { enabled: true });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await app.evaluate(({ BrowserWindow, dialog }) => {
    const window = BrowserWindow.getAllWindows()[0];
    window.setContentSize(1200, 850);
    window.webContents.setBackgroundThrottling(false);
    dialog.showMessageBox = async () => {
      throw new Error("Unexpected workspace-tab verification dialog");
    };
  });
  expect(
    (await page.evaluate(() => window.explorer.environment())).canEnableAws,
  ).toBe(false);
  await expect(page.locator(".workspace-tab")).toHaveCount(5);
  await expect(page.locator("html")).toHaveAttribute(
    "data-mantine-color-scheme",
    theme,
  );
}

async function geometry() {
  return page.locator(".workspace-tab").evaluateAll((elements) =>
    elements.map((element) => {
      const rect = element.getBoundingClientRect();
      const style = getComputedStyle(element);
      const context = document.createElement("canvas").getContext("2d")!;
      context.fillStyle = style.borderRightColor;
      context.fillRect(0, 0, 1, 1);
      return {
        id: element.getAttribute("data-tab-id")!,
        x: rect.x,
        y: rect.y,
        width: rect.width,
        height: rect.height,
        topWidth: style.borderTopWidth,
        topStyle: style.borderTopStyle,
        topColor: style.borderTopColor,
        rightColor: style.borderRightColor,
        bottomWidth: style.borderBottomWidth,
        border: [...context.getImageData(0, 0, 1, 1).data].slice(0, 3),
      };
    }),
  );
}

async function expectTopBorders(name: string) {
  const boxes = await geometry();
  for (const box of boxes) {
    expect(parseFloat(box.topWidth), box.id).toBeGreaterThan(0);
    expect(parseFloat(box.topWidth), box.id).toBeLessThanOrEqual(1);
    expect(box.topStyle, box.id).toBe("solid");
    expect(box.topColor, box.id).toBe(box.rightColor);
    expect(box.bottomWidth, box.id).toBe("0px");
  }
  const viewport = await page.evaluate(() => ({
    width: innerWidth,
    height: innerHeight,
  }));
  const paint = async () =>
    app!.evaluate(
      async ({ BrowserWindow, nativeImage }, { boxes, viewport }) => {
        const window = BrowserWindow.getAllWindows()[0];
        if (window.isVisible())
          throw new Error("Verification must stay hidden");
        await window.webContents.capturePage(undefined, {
          stayHidden: true,
          stayAwake: true,
        });
        const capture = await window.webContents.capturePage(undefined, {
          stayHidden: true,
          stayAwake: true,
        });
        // Decode PNG bytes so size and bitmap coordinates both use native pixels.
        const image = nativeImage.createFromBuffer(capture.toPNG());
        const size = image.getSize();
        const data = image.toBitmap();
        const sx = size.width / viewport.width;
        const sy = size.height / viewport.height;
        const samples = boxes.map((box) => ({
          id: box.id,
          distances: [0.2, 0.5, 0.9].map((fraction) => {
            const x = Math.round((box.x + box.width * fraction) * sx);
            let distance = Infinity;
            for (
              let y = Math.floor(box.y * sy);
              y < Math.ceil((box.y + parseFloat(box.topWidth)) * sy);
              y++
            ) {
              const offset = (y * size.width + x) * 4;
              const pixel = [data[offset + 2], data[offset + 1], data[offset]];
              distance = Math.min(
                distance,
                Math.max(
                  ...pixel.map((value, i) => Math.abs(value - box.border[i])),
                ),
              );
            }
            return distance;
          }),
        }));
        return { samples, png: image.toPNG().toString("base64") };
      },
      { boxes: await geometry(), viewport },
    );
  // Native hidden-window compositing can lag the DOM after a drag commits.
  // Wait for the painted border, rather than sampling an intermediate frame.
  let capture = await paint();
  await expect
    .poll(async () => {
      capture = await paint();
      return Math.max(...capture.samples.flatMap((sample) => sample.distances));
    })
    .toBeLessThanOrEqual(5);
  await test.info().attach(`${name}.png`, {
    body: Buffer.from(capture.png, "base64"),
    contentType: "image/png",
  });
  for (const sample of capture.samples)
    for (const distance of sample.distances)
      expect(distance, `${sample.id} painted top border`).toBeLessThanOrEqual(
        5,
      );
}

for (const theme of ["light", "dark"] as const) {
  test(`${theme} unpinned tabs have top borders below the separate pinned row`, async () => {
    await launch(theme, true);
    const pinned = page.locator('[data-tab-strip="pinned"] .workspace-tab');
    const regular = page.locator('[data-tab-strip="regular"] .workspace-tab');
    await expect(pinned).toHaveCount(2);
    await expect(regular).toHaveCount(3);
    const pin = (await pinned.first().boundingBox())!;
    const unpinned = (await regular.first().boundingBox())!;
    expect(unpinned.y).toBeCloseTo(pin.y + pin.height, 1);
    await expectTopBorders("separate-pins");
    await regular.first().getByRole("tab").click();
    await expect(regular.first().getByRole("tab")).toHaveAttribute(
      "aria-selected",
      "true",
    );
    await expectTopBorders("selected-unpinned");
  });

  test(`${theme} ragged wrapped rows retain every top border after reordering`, async () => {
    await launch(theme, false);
    const initial = await geometry();
    const strip = (await page.locator("[data-tab-strip]").boundingBox())!;
    // Fit the last three tabs while forcing the third tab onto the next row.
    const capacity = initial.slice(2).reduce((sum, box) => sum + box.width, 20);
    const width = Math.ceil(
      (await page.evaluate(() => innerWidth)) - strip.width + capacity,
    );
    await app!.evaluate(
      ({ BrowserWindow }, width) =>
        BrowserWindow.getAllWindows()[0].setContentSize(width, 850),
      width,
    );
    await expect.poll(() => page.evaluate(() => innerWidth)).toBe(width);
    const boxes = await geometry();
    expect(boxes[1].y).toBe(boxes[0].y);
    expect(boxes[2].y).toBeGreaterThan(boxes[0].y);
    expect(boxes[4].y).toBe(boxes[2].y);
    expect(boxes[4].x + boxes[4].width).toBeGreaterThan(
      boxes[1].x + boxes[1].width + 20,
    );
    await expectTopBorders("ragged-wrap");
    const source = boxes[0];
    const target = boxes[4];
    await page.mouse.move(source.x + 30, source.y + source.height / 2);
    await page.mouse.down();
    await page.mouse.move(source.x + 42, source.y + source.height / 2, {
      steps: 3,
    });
    await page.mouse.move(
      target.x + target.width - 4,
      target.y + target.height / 2,
      { steps: 10 },
    );
    await page.mouse.up();
    await expect(page.locator(".workspace-tab").last()).toHaveAttribute(
      "data-tab-id",
      source.id,
    );
    await expectTopBorders("reordered-wrap");
  });
}
