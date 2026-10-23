import { afterEach, expect, it, vi } from "vitest";
import { tabInsertionAt } from "../src/renderer/tab-insertion";
import {
  createWorkspace,
  createTab,
  workspaceReducer,
} from "../src/renderer/workspace";
import { workspaceEntries } from "../src/renderer/workspace-entries";

afterEach(() => vi.unstubAllGlobals());
const rect = (left: number, top = 0, width = 100) => ({
  left,
  right: left + width,
  top,
  bottom: top + 40,
  width,
  height: 40,
});
function setup(separate = false) {
  let state = createWorkspace();
  for (let i = 0; i < 3; i++)
    state = workspaceReducer(state, {
      type: "tab/open",
      tab: createTab("offline", [{ logGroup: String(i) }]),
    });
  const ids = workspaceEntries(state).map((entry) => entry.id);
  for (const id of ids.slice(0, 2))
    state = workspaceReducer(state, {
      type: "tab/pin",
      tabId: id,
      pinned: true,
    });
  state = workspaceReducer(state, {
    type: "preferences/update",
    patch: { pinnedTabsSeparateRow: separate },
  });
  const elements = ids.map((id, i) => ({
    dataset: { tabId: id },
    getBoundingClientRect: () =>
      rect(separate ? (i % 2) * 100 : i * 100, separate && i >= 2 ? 40 : 0),
  }));
  const strips = (separate ? ["pinned", "regular"] : ["shared"]).map(
    (kind, i) => ({
      dataset: { tabStrip: kind },
      getBoundingClientRect: () => rect(0, i * 40, 500),
      querySelectorAll: () =>
        separate ? elements.slice(i * 2, i * 2 + 2) : elements,
    }),
  );
  vi.stubGlobal("document", { querySelectorAll: () => strips });
  return { state, ids };
}
it("shared strips pin only before or between pins, never after the last pin", () => {
  const { state, ids } = setup();
  expect(tabInsertionAt(state, { x: 0, y: 20 })).toMatchObject({
    beforeTabId: ids[0],
    pinned: true,
  });
  expect(tabInsertionAt(state, { x: 90, y: 20 })).toMatchObject({
    beforeTabId: ids[1],
    pinned: true,
  });
  expect(tabInsertionAt(state, { x: 175, y: 20 })).toMatchObject({
    beforeTabId: ids[2],
    pinned: false,
  });
  expect(tabInsertionAt(state, { x: 490, y: 20 })).toMatchObject({
    beforeTabId: null,
    pinned: false,
  });
  expect(tabInsertionAt(state, { x: 10, y: 100 })).toBeNull();
});
it("separate rows accept pinned drops at the end and regular drops at the beginning", () => {
  const { state, ids } = setup(true);
  expect(tabInsertionAt(state, { x: 490, y: 20 })).toMatchObject({
    beforeTabId: ids[2],
    pinned: true,
  });
  expect(tabInsertionAt(state, { x: 0, y: 60 })).toMatchObject({
    beforeTabId: ids[2],
    pinned: false,
  });
  expect(tabInsertionAt(state, { x: 490, y: 60 })).toMatchObject({
    beforeTabId: null,
    pinned: false,
  });
});

it("insertion uses layout slots rather than the dragged tab following the pointer", () => {
  const { state, ids } = setup();
  const strip = {
    dataset: { tabStrip: "shared" },
    scrollLeft: 0,
    scrollTop: 0,
    getBoundingClientRect: () => rect(0, 0, 500),
    querySelectorAll: () => elements,
  };
  const elements = ids.map((id, i) => ({
    dataset: { tabId: id },
    offsetParent: strip,
    offsetLeft: i * 100,
    offsetTop: 0,
    offsetWidth: 100,
    offsetHeight: 40,
    getBoundingClientRect: () => rect(i === 0 ? 150 : i * 100),
  }));
  vi.stubGlobal("document", { querySelectorAll: () => [strip] });
  expect(tabInsertionAt(state, { x: 180, y: 20 })).toMatchObject({
    beforeTabId: ids[2],
  });
});

it("targets a hidden empty pin row at and above the window top edge", () => {
  const state = createWorkspace();
  state.preferences.pinnedTabsSeparateRow = true;
  const strip = {
    dataset: { tabStrip: "regular" },
    getBoundingClientRect: () => rect(200, 0, 400),
    querySelectorAll: () => [],
  };
  vi.stubGlobal("document", { querySelectorAll: () => [strip] });
  for (const y of [0, 4, -1, -80]) {
    expect(tabInsertionAt(state, { x: 300, y })).toMatchObject({
      pinned: true,
      beforeTabId: state.tabs[0].id,
    });
  }
  expect(tabInsertionAt(state, { x: 199, y: -80 })).toBeNull();
  expect(tabInsertionAt(state, { x: 601, y: -80 })).toBeNull();
  expect(tabInsertionAt(state, { x: 300, y: 20 })).toMatchObject({
    pinned: false,
  });
});

it("keeps shared-row pinning opt-in even at the top edge", () => {
  const state = createWorkspace();
  const strip = {
    dataset: { tabStrip: "shared" },
    getBoundingClientRect: () => rect(200, 0, 400),
    querySelectorAll: () => [],
  };
  vi.stubGlobal("document", { querySelectorAll: () => [strip] });
  expect(tabInsertionAt(state, { x: 300, y: 4 })).toMatchObject({
    pinned: false,
  });
  expect(tabInsertionAt(state, { x: 300, y: -80 })).toBeNull();
});
