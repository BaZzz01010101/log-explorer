import { _electron as electron, expect, test, type Locator } from "@playwright/test";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { join, resolve, sep } from "node:path";
import { desktopExecutablePath } from "./desktop-app";

const root = resolve(".tmp", "row-navigation-reveal");

/** Puts row `index` so that `clip` pixels of it are cut by the bottom (or hidden under the header). */
const clipRow = (grid: Locator, index: number, edge: "bottom" | "top", clip: number) =>
  grid.evaluate(
    (scroll, [index, edge, clip]) => {
      const row = scroll.querySelector<HTMLElement>(`.virtual-event[data-index="${index}"]`)!;
      const header = scroll.querySelector<HTMLElement>(".log-table-header")!.getBoundingClientRect().height;
      const bounds = row.getBoundingClientRect(), top = scroll.getBoundingClientRect().top;
      scroll.scrollTop +=
        edge === "bottom"
          ? bounds.bottom - top - (scroll.clientHeight + (clip as number))
          : bounds.top - top - (header - (clip as number));
    },
    [index, edge, clip] as const,
  );
const rowBounds = (grid: Locator, index: number) =>
  grid.evaluate((scroll, index) => {
    const row = scroll.querySelector<HTMLElement>(`.virtual-event[data-index="${index}"]`)!;
    const bounds = row.getBoundingClientRect(), top = scroll.getBoundingClientRect().top;
    return {
      top: bounds.top - top,
      bottom: bounds.bottom - top,
      header: scroll.querySelector<HTMLElement>(".log-table-header")!.getBoundingClientRect().height,
      viewport: scroll.clientHeight,
      current: row.dataset.current === "true",
    };
  }, index);

test("arrow keys scroll a partially clipped row fully into view at the bottom and below the header", async () => {
  await mkdir(root, { recursive: true });
  const directory = await mkdtemp(join(root, "case-"));
  const environment: Record<string, string> = {};
  for (const name of ["PATH", "SystemRoot", "WINDIR", "TEMP", "TMP", "COMSPEC"])
    if (process.env[name]) environment[name] = process.env[name]!;
  const packaged = process.env.EXPLORER_DESKTOP_PACKAGED === "1";
  const app = await electron.launch({
    executablePath: packaged ? desktopExecutablePath() : undefined,
    args: [...(packaged ? [] : [process.cwd()]), "--offline-verification", "--background-verification", "--disable-background-networking"],
    env: {
      ...environment,
      EXPLORER_TEST_USER_DATA: directory,
      USERPROFILE: directory,
      LOCALAPPDATA: directory,
      APPDATA: directory,
      AWS_CONFIG_FILE: join(directory, "missing"),
      AWS_SHARED_CREDENTIALS_FILE: join(directory, "missing"),
      AWS_EC2_METADATA_DISABLED: "true",
    },
  });
  try {
    const page = await app.firstWindow();
    await (await page.context().newCDPSession(page)).send("Emulation.setFocusEmulationEnabled", { enabled: true });
    await expect(page.locator('.query-status[data-query-state="complete"]')).toBeAttached();
    const grid = page.locator(".viewer-scroll");
    await expect(grid.locator(".virtual-event").first()).toBeVisible();
    await grid.click({ position: { x: 300, y: 200 } });
    // Work in the middle of the list so both directions have room to scroll.
    await grid.evaluate((scroll) => { scroll.scrollTop = scroll.scrollHeight / 2; });
    const pick = async () => {
      // A row rendered in the middle of the viewport, with rendered neighbours.
      let index = -1;
      await expect
        .poll(async () => {
          index = await grid.evaluate((scroll) => {
            const bounds = scroll.getBoundingClientRect();
            const row = document.elementFromPoint(bounds.left + 200, bounds.top + scroll.clientHeight / 2)?.closest<HTMLElement>(".virtual-event[data-index]");
            return row ? Number(row.dataset.index) : -1;
          });
          return index;
        })
        .toBeGreaterThan(10);
      return index;
    };
    for (const clip of [8, 20]) {
      // Down: the clipped row below the selection becomes the last fully visible row.
      const target = await pick();
      expect(await grid.evaluate((scroll) => scroll.scrollTop)).toBeGreaterThan(1000);
      await clipRow(grid, target, "bottom", clip);
      await expect.poll(async () => (await rowBounds(grid, target)).bottom).toBeGreaterThan((await rowBounds(grid, target)).viewport);
      await grid.locator(`.virtual-event[data-index="${target - 1}"] .log-cell`).first().click();
      await expect.poll(async () => (await rowBounds(grid, target - 1)).current).toBe(true);
      await page.keyboard.press("ArrowDown");
      await expect.poll(async () => (await rowBounds(grid, target)).current).toBe(true);
      const down = await rowBounds(grid, target);
      expect(down.bottom).toBeLessThanOrEqual(down.viewport + 1);
      expect(down.bottom).toBeGreaterThanOrEqual(down.viewport - 1);

      // Up: a row partly hidden under the sticky header becomes the first fully visible row.
      const above = target - 6;
      await clipRow(grid, above, "top", clip);
      await grid.locator(`.virtual-event[data-index="${above + 1}"] .log-cell`).first().click();
      await expect.poll(async () => (await rowBounds(grid, above + 1)).current).toBe(true);
      await page.keyboard.press("ArrowUp");
      await expect.poll(async () => (await rowBounds(grid, above)).current).toBe(true);
      const up = await rowBounds(grid, above);
      expect(Math.abs(up.top - up.header)).toBeLessThanOrEqual(1);
    }
  } finally {
    await app.close();
    if (!resolve(directory).startsWith(root + sep + "case-")) throw new Error("Unsafe test cleanup path");
    await rm(directory, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
  }
});
