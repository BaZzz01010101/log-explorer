import { _electron as electron, expect, test, type Locator, type Page } from "@playwright/test";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { join, resolve, sep } from "node:path";
import { desktopExecutablePath } from "./desktop-app";
import { openSettingsWindow } from "./settings-panel";

const root = resolve(".tmp", "recent-scroll-desktop");

/** Scroll position, selected row and one row's viewport offset in the event grid. */
const snapshot = (grid: Locator, id: string) =>
  grid.evaluate((element, id) => {
    const row = element.querySelector(`[data-event-id="${id}"]`);
    const indicator = element.querySelector('[data-loading-position="older"]');
    const top = element.getBoundingClientRect().top;
    return {
      header: element.querySelector(".log-table-header")?.getBoundingClientRect().height ?? 0,
      rows: Number(element.getAttribute("aria-rowcount")),
      scrollTop: element.scrollTop,
      bottom: element.scrollHeight - element.clientHeight,
      current: element.querySelector('[data-current="true"]')?.getAttribute("data-event-id") ?? null,
      rowOffset: row ? row.getBoundingClientRect().top - top : null,
      indicatorTop: indicator ? indicator.getBoundingClientRect().top - top : null,
      indicatorBottom: indicator ? indicator.getBoundingClientRect().bottom - top : null,
    };
  }, id);

async function setMaximumEvents(page: Page, value: string) {
  await openSettingsWindow(page);
  const dialog = page.getByRole("dialog", { name: "Settings", exact: true });
  await dialog.getByRole("tab", { name: "Preferences", exact: true }).click();
  const maximum = dialog.getByLabel("Maximum events per view", { exact: true });
  await maximum.click();
  await page.keyboard.press("ControlOrMeta+A");
  await maximum.pressSequentially(value);
  await page.keyboard.press("Tab");
  await dialog.getByRole("button", { name: "Close settings" }).click();
}

for (const wrap of [false, true])
  test(`Recent${wrap ? " (wrapped rows)" : ""} opens at the newest row and keeps rows steady while older pages load`, async () => {
    test.setTimeout(180000);
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
        // Keeps each page in flight long enough to observe the loading bar.
        EXPLORER_TEST_QUERY_DELAY_MS: "1200",
      },
    });
    try {
      const page = await app.firstWindow();
      await (await page.context().newCDPSession(page)).send("Emulation.setFocusEmulationEnabled", { enabled: true });
      await expect(page.locator('.query-status[data-query-state="complete"]')).toBeAttached();
      // 400 events per view loads Recent pages of 100 rows (events 440–539 first).
      await setMaximumEvents(page, "400");
      if (wrap) await page.getByRole("button", { name: "Toggle line wrap" }).click();
      const grid = page.locator(".viewer-scroll");
      const group = "fixture:/aws/lambda/orders-api";
      await page.getByTestId("run-query").click();
      // The run clears the previous rows while its first page is in flight.
      await expect.poll(async () => (await snapshot(grid, "")).bottom).toBe(0);

      // Initial position: newest event selected, scrolled fully to the bottom, and it stays there.
      await expect
        .poll(async () => {
          const state = await snapshot(grid, "");
          return state.bottom > 0 && state.current;
        }, { timeout: 10000 })
        .toBe(`${group}:539`);
      for (let check = 0; check < 3; check++) {
        const initial = await snapshot(grid, "");
        expect(initial.bottom).toBeGreaterThan(0);
        expect(Math.abs(initial.scrollTop - initial.bottom)).toBeLessThanOrEqual(1);
        expect(initial.current).toBe(`${group}:539`);
        await page.waitForTimeout(250);
      }

      /**
       * A trigger at the top shows the loading bar at once, in view below the
       * header; once the page lands the previously first loaded row is the top
       * visible row.
       */
      const pageFromTop = async (trigger: () => Promise<void>, first: number) => {
        const id = `${group}:${first}`;
        const before = await snapshot(grid, id);
        await trigger();
        await expect.poll(async () => (await snapshot(grid, id)).indicatorTop).not.toBeNull();
        const loading = await snapshot(grid, id);
        expect(loading.scrollTop).toBe(0);
        expect(Math.abs(loading.indicatorTop! - loading.header)).toBeLessThanOrEqual(1);
        await expect.poll(async () => (await snapshot(grid, id)).indicatorTop, { timeout: 10000 }).toBeNull();
        // 400 events per view: beyond it the newest events are released.
        await expect.poll(async () => (await snapshot(grid, id)).rows).toBe(Math.min(before.rows + 100, 400));
        await expect.poll(async () => (await snapshot(grid, id)).rowOffset).not.toBeNull();
        for (let check = 0; check < 4; check++) {
          const settled = await snapshot(grid, id);
          expect(settled.scrollTop).toBeGreaterThan(0);
          expect(Math.abs(settled.rowOffset! - settled.header)).toBeLessThanOrEqual(1);
          await page.waitForTimeout(200);
        }
      };
      await grid.focus();
      // Home.
      await pageFromTop(() => page.keyboard.press("Home"), 440);
      // Scrolling near the top, but not to the very top, does not load.
      await grid.evaluate((element) => { element.scrollTop = 40; });
      await page.waitForTimeout(1500);
      expect((await snapshot(grid, "")).indicatorTop).toBeNull();
      expect((await snapshot(grid, "")).rows).toBe(200);
      // Mouse wheel to the very top.
      await grid.hover();
      await pageFromTop(() => page.mouse.wheel(0, -100000), 340);
      // Up onto the first row only moves the selection; Up on it loads.
      await grid.evaluate((element) => { element.scrollTop = 30; });
      await grid.locator(`[data-event-id="${group}:241"] .log-cell`).first().click();
      await page.keyboard.press("ArrowUp");
      await page.waitForTimeout(800);
      expect((await snapshot(grid, "")).current).toBe(`${group}:240`);
      expect((await snapshot(grid, "")).indicatorTop).toBeNull();
      await pageFromTop(() => page.keyboard.press("ArrowUp"), 240);
      // PageUp with fewer rows above the selection than a page.
      await grid.evaluate((element) => { element.scrollTop = 120; });
      await pageFromTop(async () => {
        await grid.locator(`[data-event-id="${group}:143"] .log-cell`).first().click();
        await page.keyboard.press("PageUp");
        await page.keyboard.press("PageUp");
      }, 140);
    } finally {
      await app.close();
      if (!resolve(directory).startsWith(root + sep + "case-")) throw new Error("Unsafe test cleanup path");
      await rm(directory, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
    }
  });
