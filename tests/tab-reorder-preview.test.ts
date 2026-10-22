import { afterEach, expect, it, vi } from "vitest";
import {
  projectTabSlots,
  tabReorderPreview,
} from "../src/renderer/tab-reorder-preview";
import {
  createWorkspace,
  createTab,
  workspaceReducer,
} from "../src/renderer/workspace";
import { workspaceEntries } from "../src/renderer/workspace-entries";

afterEach(() => vi.unstubAllGlobals());

const items = [
  { id: "a", width: 300, height: 40 },
  { id: "b", width: 130, height: 40 },
  { id: "c", width: 210, height: 40 },
];
it("packs unequal tab widths into the proposed order without stretching or overlap", () => {
  expect(projectTabSlots([items[1], items[2], items[0]], 1000, false)).toEqual({
    height: 40,
    slots: new Map([
      ["b", { x: 0, y: 0 }],
      ["c", { x: 130, y: 0 }],
      ["a", { x: 340, y: 0 }],
    ]),
  });
});
it("previews reverse movement and a return to the original slot symmetrically", () => {
  expect(
    projectTabSlots([items[2], items[0], items[1]], 1000, false).slots.get("c"),
  ).toEqual({ x: 0, y: 0 });
  expect(projectTabSlots(items, 1000, false).slots.get("c")).toEqual({
    x: 430,
    y: 0,
  });
});
it("wraps using the final widths and the full occupied height of each visual row", () => {
  expect(
    projectTabSlots(
      [{ ...items[1], height: 42 }, items[2], items[0]],
      450,
      true,
    ),
  ).toEqual({
    height: 82,
    slots: new Map([
      ["b", { x: 0, y: 0 }],
      ["c", { x: 130, y: 0 }],
      ["a", { x: 0, y: 42 }],
    ]),
  });
  expect(projectTabSlots(items, 450, true).slots.get("c")).toEqual({
    x: 0,
    y: 40,
  });
});
it("retains fractional widths and accepts empty pin sections", () => {
  expect(
    projectTabSlots(
      [
        { id: "a", width: 130.5, height: 40 },
        { id: "b", width: 130.5, height: 40 },
      ],
      261,
      true,
    ).slots.get("b"),
  ).toEqual({ x: 130.5, y: 0 });
  expect(projectTabSlots([], 500, true)).toEqual({
    height: 0,
    slots: new Map(),
  });
});

function measuredWorkspace(separate = false) {
  let workspace = createWorkspace();
  for (const name of ["payments", "media"])
    workspace = workspaceReducer(workspace, {
      type: "tab/open",
      tab: createTab("offline", [{ logGroup: name }]),
    });
  const ids = workspaceEntries(workspace).map((entry) => entry.id);
  workspace = workspaceReducer(workspace, {
    type: "tab/pin",
    tabId: ids[0],
    pinned: true,
  });
  const elements = ids.map((id, index) => ({
    dataset: { tabId: id },
    getBoundingClientRect: () => ({
      left:
        separate && index > 0
          ? items.slice(1, index).reduce((n, item) => n + item.width, 10)
          : items.slice(0, index).reduce((n, item) => n + item.width, 10),
      top: separate && index > 0 ? 80 : 40,
      width: items[index].width,
      height: 40,
    }),
  }));
  const strips = (separate ? ["pinned", "regular"] : ["shared"]).map(
    (kind, index) => ({
      dataset: { tabStrip: kind },
      clientLeft: 0,
      clientTop: 0,
      scrollLeft: 0,
      scrollTop: 0,
      clientWidth: 1000,
      offsetHeight: 40,
      clientHeight: 40,
      classList: { contains: (): boolean => false },
      getBoundingClientRect: () => ({
        left: 10,
        top: 40 + index * 40,
        width: 1000,
        height: 40,
      }),
      querySelectorAll: () =>
        separate
          ? index
            ? elements.slice(1)
            : elements.slice(0, 1)
          : elements,
    }),
  );
  vi.stubGlobal("document", { querySelectorAll: () => strips });
  return { workspace, ids, strips };
}
it("projects the actual drop order using each tab's own width", () => {
  const { workspace, ids } = measuredWorkspace();
  const result = tabReorderPreview(workspace, ids[0], {
    beforeTabId: null,
    pinned: false,
  })!;
  expect(result.translations[ids[0]]).toEqual({
    x: 340,
    y: 0,
    scaleX: 1,
    scaleY: 1,
  });
  expect(result.translations[ids[1]].x).toBe(-300);
  expect(result.translations[ids[2]].x).toBe(-300);
  expect(result.marker).toEqual({ left: 349, top: 40, width: 3, height: 40 });
  expect(result.crossingSource).toBeUndefined();
});
it("exposes an unclipped source preview when moving between separate pin rows", () => {
  const { workspace, ids } = measuredWorkspace(true);
  const result = tabReorderPreview(workspace, ids[2], {
    beforeTabId: ids[0],
    pinned: true,
  })!;
  expect(result.crossingSource).toEqual({
    id: ids[2],
    rect: { left: 10, top: 40, width: 210, height: 40 },
  });
  expect(result.translations[ids[0]].x).toBe(210);
  expect(result.translations[ids[1]].x).toBe(0);
  expect(
    tabReorderPreview(workspace, "missing", {
      beforeTabId: null,
      pinned: false,
    }),
  ).toBeNull();
});

it("reserves border-box height and retains taller natural strip content", () => {
  const { workspace, ids, strips } = measuredWorkspace();
  const strip = strips[0];
  strip.classList.contains = () => true;
  strip.offsetHeight = 42;
  expect(
    tabReorderPreview(workspace, ids[0], { beforeTabId: null, pinned: false })!
      .heights.shared,
  ).toBe(42);
  strip.offsetHeight = strip.clientHeight = 60;
  strip.getBoundingClientRect = () => ({
    left: 10,
    top: 40,
    width: 1000,
    height: 60,
  });
  expect(
    tabReorderPreview(workspace, ids[0], { beforeTabId: null, pinned: false })!
      .heights.shared,
  ).toBe(60);
});
