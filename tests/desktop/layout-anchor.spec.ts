import {
  _electron as electron,
  expect,
  test,
  type ElectronApplication,
  type Page,
} from "@playwright/test";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { createWorkspace } from "../../src/shared/workspace";
import { closeAppNaturally, desktopExecutablePath } from "./desktop-app";

test.setTimeout(120000);
test.describe.configure({ mode: "parallel" });
let app: ElectronApplication;
let page: Page;
let directory: string;
const temporaryRoot = resolve(".tmp", "desktop-layout-anchor");

test.beforeEach(async () => {
  await mkdir(temporaryRoot, { recursive: true });
  directory = await mkdtemp(join(temporaryRoot, "case-"));
  const state = createWorkspace();
  state.tabs[0].filterPattern = "";
  // Recent holds the newest row; these checks scroll freely.
  state.tabs[0].timePreset = "1h";
  state.tabs[0].view.mode = "table";
  // Narrow enough for wrapping to change row heights.
  state.tabs[0].view.columns.find(
    (column) => column.path === "@message",
  )!.width = 90;
  await writeFile(join(directory, "workspace.json"), JSON.stringify(state));
  const env: Record<string, string> = {};
  for (const name of ["PATH", "SystemRoot", "WINDIR", "TEMP", "TMP", "COMSPEC"])
    if (process.env[name]) env[name] = process.env[name]!;
  Object.assign(env, {
    EXPLORER_TEST_USER_DATA: directory,
    USERPROFILE: directory,
    LOCALAPPDATA: directory,
    APPDATA: directory,
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
  page.setDefaultTimeout(8000);
  await expect(page.locator(".virtual-event").first()).toBeVisible();
  await expect(
    page.locator('.query-status[data-query-state="complete"]'),
  ).toBeAttached();
});
test.afterEach(async () => {
  expect(await closeAppNaturally(app)).toBe(0);
  await rm(directory, { recursive: true, force: true });
});

interface View {
  scrollTop: number;
  bottom: number;
  viewport: number;
  rows: { index: number; top: number; bottom: number }[];
}
/** Rows in the viewport below the header. */
const read = (): Promise<View> =>
  page.locator(".viewer-scroll").evaluate((scroll) => {
    const header =
      scroll.querySelector(".log-table-header")?.getBoundingClientRect()
        .height ?? 0;
    const top = scroll.getBoundingClientRect().top + header;
    const viewport = scroll.clientHeight - header;
    return {
      scrollTop: scroll.scrollTop,
      bottom: scroll.scrollHeight - scroll.clientHeight,
      viewport,
      rows: [...scroll.querySelectorAll<HTMLElement>(".virtual-event")]
        .map((row) => {
          const bounds = row.getBoundingClientRect();
          return {
            index: Number(row.dataset.index),
            top: bounds.top - top,
            bottom: bounds.bottom - top,
          };
        })
        .filter((row) => row.bottom > 0.5 && row.top < viewport - 0.5)
        .sort((a, b) => a.index - b.index),
    };
  });
const row = (view: View, index: number) =>
  view.rows.find((entry) => entry.index === index);
/** The rows after they have stopped moving. */
async function settled(): Promise<View> {
  let previous = JSON.stringify(await read());
  await expect
    .poll(
      async () => {
        const current = JSON.stringify(await read());
        const same = current === previous;
        previous = current;
        return same;
      },
      { intervals: [400], timeout: 8000 },
    )
    .toBe(true);
  return read();
}
const actions = {
  json: () => mode("JSON"),
  table: () => mode("Table"),
  hybrid: () => mode("Hybrid"),
  wrap: () => page.getByRole("button", { name: "Toggle line wrap" }).click(),
  fold: () =>
    page.getByRole("button", { name: /^(Fold|Unfold) all messages$/ }).click(),
};
const mode = (name: string) =>
  page.locator(".viewer-mode-control").getByText(name, { exact: true }).click();
/** Frames in which none of the rows was drawn, or the row was out of view. */
async function change(action: keyof typeof actions, index: number) {
  await page.evaluate((index) => {
    const scroll = document.querySelector(".viewer-scroll")!;
    const state = ((window as any).__frames = {
      missed: 0,
      total: 0,
      on: true,
    });
    const sample = () => {
      if (!state.on) return;
      const box = scroll.getBoundingClientRect();
      const element = scroll.querySelector(
        `.virtual-event[data-index="${index}"]`,
      );
      const bounds = element?.getBoundingClientRect();
      state.total++;
      if (!bounds || bounds.bottom < box.top || bounds.top > box.bottom)
        state.missed++;
      requestAnimationFrame(sample);
    };
    requestAnimationFrame(sample);
  }, index);
  await actions[action]();
  const view = await settled();
  const frames = await page.evaluate(() => {
    (window as any).__frames.on = false;
    return (window as any).__frames as { missed: number; total: number };
  });
  expect(frames.total).toBeGreaterThan(0);
  return { view, missed: frames.missed };
}
const scrollTo = async (top: number) => {
  await page.locator(".viewer-scroll").evaluate((scroll, top) => {
    scroll.scrollTop = top;
  }, top);
  return settled();
};
const select = async (view: View, position: number) => {
  const target = view.rows[position]!;
  await page
    .locator(`.virtual-event[data-index="${target.index}"] .log-cell`)
    .first()
    .click();
  // The pointer must not rest on the rows that change below it.
  await page.mouse.move(2, 2);
  await settled();
  return target.index;
};

test("the first visible row stays at the top in every layout and back", async () => {
  await scrollTo(0);
  // No row is selected in view.
  const start = await scrollTo(34 * 200);
  const first = start.rows.find((entry) => entry.top > -1)!;
  expect(first.index).toBeGreaterThan(150);
  for (const action of [
    "json",
    "fold",
    "wrap",
    "wrap",
    "fold",
    "hybrid",
    "fold",
    "wrap",
    "wrap",
    "fold",
    "table",
    "fold",
    "wrap",
    "fold",
    "wrap",
  ] as const) {
    const { view, missed } = await change(action, first.index);
    const current = row(view, first.index);
    expect(current, action).toBeDefined();
    // A row that became taller than the view starts at its top.
    const fits = current!.bottom - current!.top <= view.viewport;
    expect(
      Math.abs(current!.top - (fits ? first.top : 0)),
      action,
    ).toBeLessThan(fits ? 2 : first.top + 2);
    expect(missed, `${action}: frames without the row`).toBe(0);
  }
  const end = await read();
  expect(end.rows.map((entry) => entry.index)).toEqual(
    start.rows.map((entry) => entry.index),
  );
});

test("the selected row keeps its place, and taller rows move up to fit", async () => {
  const start = await scrollTo(34 * 200);
  const index = await select(start, Math.floor(start.rows.length / 2));
  const before = row(await settled(), index)!;
  for (const action of ["wrap", "wrap", "hybrid", "table"] as const) {
    const { view, missed } = await change(action, index);
    expect(Math.abs(row(view, index)!.top - before.top), action).toBeLessThan(
      2,
    );
    expect(missed, action).toBe(0);
  }
  const json = (await change("json", index)).view;
  const card = row(json, index)!;
  expect(card.top).toBeLessThanOrEqual(before.top + 1);
  expect(card.bottom).toBeLessThanOrEqual(json.viewport + 1);
  const tall = row((await change("fold", index)).view, index)!;
  expect(tall.top).toBeGreaterThan(-1);
  // Back to the original layout: the same rows in the same places.
  await change("fold", index);
  const end = (await change("table", index)).view;
  expect(Math.abs(row(end, index)!.top - before.top)).toBeLessThan(2);
});

test("scrolling between changes starts from the new position", async () => {
  await scrollTo(34 * 100);
  await change("json", 100);
  await scrollTo(0);
  const start = await scrollTo(12000);
  const first =
    start.rows.find(
      (entry) =>
        Math.min(entry.bottom, start.viewport) - Math.max(entry.top, 0) >=
        Math.min(entry.bottom - entry.top, start.viewport) / 2,
    ) ?? start.rows[0]!;
  const { view } = await change("table", first.index);
  expect(row(view, first.index)).toBeDefined();
  expect(view.rows[0]!.index).toBeGreaterThanOrEqual(first.index - 1);
  expect(view.rows[0]!.index).toBeLessThanOrEqual(first.index);
});

test("a list scrolled to its end stays there", async () => {
  await page.locator(".viewer-scroll").focus();
  await page.locator(".viewer-scroll").evaluate((scroll) => {
    scroll.scrollTop = scroll.scrollHeight;
  });
  await settled();
  // The rows near the end are measured only once they are there.
  await page.locator(".viewer-scroll").evaluate((scroll) => {
    scroll.scrollTop = scroll.scrollHeight;
  });
  const start = await settled();
  expect(Math.abs(start.scrollTop - start.bottom)).toBeLessThan(2);
  const last = start.rows.at(-1)!.index;
  for (const action of [
    "json",
    "fold",
    "fold",
    "hybrid",
    "fold",
    "wrap",
    "table",
  ] as const) {
    const { view } = await change(action, last);
    expect(view.rows.at(-1)!.index, action).toBe(last);
    expect(Math.abs(view.scrollTop - view.bottom), action).toBeLessThan(2);
  }
});

test("scrolling during the change is not undone", async () => {
  await scrollTo(34 * 200);
  await actions.json();
  await page.locator(".viewer-scroll").hover();
  await page.mouse.wheel(0, 3000);
  const view = await settled();
  expect(view.rows[0]!.index).toBeGreaterThan(203);
});
