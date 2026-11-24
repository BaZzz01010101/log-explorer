import {
  createTab,
  createWorkspace,
  workspaceReducer,
} from "../../src/shared/workspace";
import { closeAppNaturally, desktopExecutablePath } from "./desktop-app";
import {
  _electron as electron,
  expect,
  test,
  type ElectronApplication,
  type Page,
} from "@playwright/test";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";

test.setTimeout(240000);
test.describe.configure({ mode: "parallel" });
let app: ElectronApplication;
let page: Page;
let directory: string;
const temporaryRoot = resolve(".tmp", "desktop-dropdown-dismissal");

test.beforeEach(async () => {
  await mkdir(temporaryRoot, { recursive: true });
  directory = await mkdtemp(join(temporaryRoot, "case-"));
  let state = createWorkspace();
  state.preferences.theme = "light";
  state.preferences.pinnedTabsSeparateRow = true;
  const pinned = createTab("offline", [{ logGroup: "/ecs/checkout" }]);
  state = workspaceReducer(state, {
    type: "tab/open",
    tab: { ...pinned, pinned: true },
  });
  state = workspaceReducer(state, {
    type: "favorites/save",
    tabId: pinned.id,
  });
  state = workspaceReducer(state, {
    type: "tab/select",
    tabId: state.tabs[0].id,
  });
  state = workspaceReducer(state, { type: "pane/split" });
  for (const tab of state.tabs) {
    tab.view.mode = "table";
    tab.filterMode = "aws-pattern";
  }
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
  page.setDefaultTimeout(6000);
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Emulation.setFocusEmulationEnabled", { enabled: true });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.addStyleTag({
    content:
      "*, *::before, *::after { transition-duration: 0s !important; animation-duration: 0s !important; animation-delay: 0s !important; }",
  });
  await expect(page.locator(".virtual-event").first()).toBeVisible();
  // Only presses are tested: clicks must not change the workspace.
  await page.evaluate(() => {
    for (const type of ["click", "dblclick", "auxclick", "contextmenu"])
      window.addEventListener(
        type,
        (event) => {
          if (!(window as any).__pressOnly) return;
          event.preventDefault();
          event.stopImmediatePropagation();
        },
        true,
      );
  });
});
test.afterEach(async () => {
  expect(await closeAppNaturally(app)).toBe(0);
  await rm(directory, { recursive: true, force: true });
});

interface Dropdown {
  open(): Promise<void>;
  dropdown: string;
  trigger: string;
}
const dropdowns = {
  select: {
    trigger: ".sidebar-connection input",
    dropdown: ".mantine-Select-dropdown",
    open: () => page.locator(".sidebar-connection input").first().click(),
  },
  popover: {
    trigger: ".level-filter",
    dropdown: '[aria-label="Log levels"]',
    open: () => page.locator(".level-filter").first().click(),
  },
  "time range": {
    trigger: ".time-range-trigger",
    dropdown: ".time-range-popover",
    open: () => page.locator(".time-range-trigger").first().click(),
  },
  menu: {
    trigger: '[aria-label="Application menu"]',
    dropdown: '[role="menu"]',
    open: () =>
      page
        .getByRole("button", { name: "Application menu", exact: true })
        .click(),
  },
  suggestions: {
    // Clearing the text closes the list too.
    trigger: ".server-filter-control",
    dropdown: ".server-filter-suggestions",
    open: async () => {
      const field = page.locator(".server-filter-input").first();
      await field.fill("");
      await field.fill("{ $.level N");
    },
  },
} satisfies Record<string, Dropdown>;

/** One point in each distinct kind of area outside the dropdown. */
const areas = (item: Dropdown) =>
  page.evaluate(
    ({ dropdown, inside }) => {
      const found = new Map<string, { name: string; x: number; y: number }>();
      const describe = (element: Element) =>
        `${element.tagName.toLowerCase()}${
          typeof element.className === "string" && element.className
            ? `.${element.className
                .split(/\s+/)
                .filter((part) => !/^m_|^mantine-(?!.*-)/.test(part))
                .join(".")}`
            : ""
        }`;
      for (let y = 2; y < innerHeight; y += 4)
        for (let x = 2; x < innerWidth; x += 4) {
          const hit = document.elementFromPoint(x, y);
          const element = hit?.closest("button") ?? hit?.closest("svg") ?? hit;
          if (!element || element.closest(`${dropdown}, ${inside}`)) continue;
          const name = [element.parentElement, element]
            .flatMap((item) => (item ? [describe(item)] : []))
            .join(" > ");
          if (!found.has(name)) found.set(name, { name, x, y });
        }
      return [...found.values()];
    },
    { dropdown: item.dropdown, inside: item.trigger },
  );

for (const [name, item] of Object.entries(dropdowns)) {
  // Closes like the other popovers.
  if (name === "time range") continue;
  test(`a press in any area closes an open ${name}`, async () => {
    const dropdown = page.locator(item.dropdown).first();
    const pressOnly = (value: boolean) =>
      page.evaluate((value) => {
        (window as any).__pressOnly = value;
      }, value);
    await item.open();
    await expect(dropdown).toBeVisible();
    const points = await areas(item);
    expect(points.length).toBeGreaterThan(60);
    const failures: string[] = [];
    for (const point of points) {
      if (!(await dropdown.isVisible())) {
        await pressOnly(false);
        await item.open();
        await expect(dropdown).toBeVisible();
      }
      await pressOnly(true);
      await page.mouse.move(point.x, point.y);
      await page.mouse.down();
      await page.mouse.up();
      const closed = await expect(dropdown)
        .toBeHidden({ timeout: 1500 })
        .then(
          () => true,
          () => false,
        );
      if (!closed) failures.push(point.name);
    }
    expect(failures).toEqual([]);
  });
}

test("window drag areas take presses only while a dropdown is open, and window actions close it", async () => {
  // Drag areas send the page no events; every one must be listed in app.css.
  const dragAreas = () =>
    page.evaluate(() => {
      const drag = (element: Element) =>
        getComputedStyle(element).getPropertyValue("-webkit-app-region") ===
        "drag";
      // Children inherit it.
      return [...document.querySelectorAll("body *")]
        .filter((element) => drag(element) && !drag(element.parentElement!))
        .map((element) => element.classList[0]);
    });
  const closed = await dragAreas();
  expect([...new Set(closed)].sort()).toEqual([
    "activity-bar",
    "sidebar-heading",
    "tab-strip-drag-space",
    "window-drag-handle",
  ]);
  for (const item of Object.values(dropdowns)) {
    await item.open();
    const dropdown = page.locator(item.dropdown).first();
    await expect(dropdown).toBeVisible();
    expect(await dragAreas()).toEqual([]);
    await app.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()[0].emit("maximize"),
    );
    await expect(dropdown).toBeHidden();
    await expect.poll(dragAreas).toEqual(closed);
  }
});

test("presses inside a dropdown keep it open", async () => {
  await dropdowns["time range"].open();
  const popover = page.locator(".time-range-popover");
  await popover.getByRole("tab", { name: "Relative" }).click();
  await popover.getByRole("combobox", { name: "Unit of time" }).click();
  await page.getByRole("option", { name: "Weeks", exact: true }).click();
  await expect(popover).toBeVisible();
  await popover.getByText("Unit of time").click();
  await expect(popover).toBeVisible();
  // Its own trigger still toggles it.
  await page.locator(".time-range-trigger").first().click();
  await expect(popover).toBeHidden();
  await dropdowns.popover.open();
  const levels = page.locator(dropdowns.popover.dropdown);
  await expect(levels).toBeVisible();
  await levels.getByLabel("Include ERROR", { exact: true }).click();
  await expect(levels).toBeVisible();
  await page.locator(".level-filter").first().click();
  await expect(levels).toBeHidden();
});
