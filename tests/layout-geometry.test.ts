import { describe, expect, it } from "vitest";
import { paneLayoutRect } from "../src/shared/layout-geometry";
import {
  createTab,
  createWorkspace,
  projectWorkspaceDrop,
  restoreWorkspace,
  workspaceReducer,
} from "../src/renderer/workspace";
import type { PaneLayout, Workspace } from "../src/shared/contracts";

const bounds = { left: 100, top: 50, width: 1206, height: 600 };
function views(count = 2): Workspace {
  let state = createWorkspace();
  for (let index = 1; index < count; index++)
    state = workspaceReducer(state, {
      type: "tab/open",
      tab: createTab("offline", [{ logGroup: `/group-${index}` }]),
    });
  return state;
}

describe("combined entry drop geometry", () => {
  it("projects an external normal view into the active destination's full viewport", () => {
    const state = views(),
      source = state.tabs[0].id,
      target = state.panes[0].id;
    const before = JSON.stringify(state);
    const projected = projectWorkspaceDrop(state, source, target, "right")!;
    expect(JSON.stringify(state)).toBe(before);
    expect(
      paneLayoutRect(projected.layout!, projected.activePaneId, bounds),
    ).toEqual({ left: 706, top: 50, width: 600, height: 600 });
    expect(
      workspaceReducer(state, {
        type: "pane/drop-tab",
        tabId: source,
        paneId: target,
        edge: "right",
      }).layout,
    ).toEqual(projected.layout);
  });

  it("keeps the destination's nested proportions when adding a fourth external view", () => {
    let state = views(4);
    const source = state.tabs[3].id;
    state = workspaceReducer(state, {
      type: "pane/show-tabs",
      tabIds: state.tabs.slice(0, 3).map((tab) => tab.id),
    });
    const [one, two, target] = state.panes;
    state.layout = {
      type: "split",
      axis: "horizontal",
      ratio: 0.3,
      first: { type: "leaf", paneId: one.id },
      second: {
        type: "split",
        axis: "vertical",
        ratio: 0.25,
        first: { type: "leaf", paneId: two.id },
        second: { type: "leaf", paneId: target.id },
      },
    };
    state.splitTabs![0].layout = state.layout;
    const projected = projectWorkspaceDrop(state, source, target.id, "left")!;
    expect(
      paneLayoutRect(projected.layout!, projected.activePaneId, bounds),
    ).toEqual({ left: 466, top: 204.5, width: 417, height: 445.5 });
  });

  it.each([
    ["left", { left: 100, top: 50, width: 600, height: 600 }],
    ["right", { left: 706, top: 50, width: 600, height: 600 }],
    ["top", { left: 100, top: 50, width: 1206, height: 297 }],
    ["bottom", { left: 100, top: 353, width: 1206, height: 297 }],
  ] as const)(
    "matches fixed expected viewport coordinates for a %s edge",
    (edge, expected) => {
      const state = views();
      const projected = projectWorkspaceDrop(
        state,
        state.tabs[0].id,
        state.panes[0].id,
        edge,
      )!;
      expect(
        paneLayoutRect(projected.layout!, projected.activePaneId, bounds),
      ).toEqual(expected);
    },
  );

  it("projects both members of a dragged combined entry as one contiguous inserted block", () => {
    let state = views(3);
    const members = state.tabs.slice(0, 2).map((tab) => tab.id),
      destination = state.tabs[2].id;
    state = workspaceReducer(state, {
      type: "pane/show-tabs",
      tabIds: members,
    });
    const source = state.activeTabId!;
    state = workspaceReducer(state, { type: "tab/select", tabId: destination });
    const projected = projectWorkspaceDrop(
      state,
      source,
      state.panes[0].id,
      "left",
    )!;
    const rectangles = projected.panes
      .filter((pane) => members.includes(pane.tabId!))
      .map((pane) => paneLayoutRect(projected.layout!, pane.id, bounds)!);
    expect(rectangles).toEqual([
      { left: 100, top: 50, width: 297, height: 600 },
      { left: 403, top: 50, width: 297, height: 600 },
    ]);
    expect(
      Math.max(...rectangles.map((rect) => rect.left + rect.width)) -
        Math.min(...rectangles.map((rect) => rect.left)),
    ).toBe(600);
  });

  it("projects an external center drop as the default axis merge and a normal self edge as a copy", () => {
    const state = views();
    const projected = projectWorkspaceDrop(
      state,
      state.tabs[0].id,
      state.panes[0].id,
      null,
    )!;
    expect(
      paneLayoutRect(projected.layout!, projected.activePaneId, bounds),
    ).toEqual({ left: 706, top: 50, width: 600, height: 600 });
    const single = createWorkspace();
    const self = projectWorkspaceDrop(
      single,
      single.tabs[0].id,
      single.panes[0].id,
      "bottom",
    )!;
    expect(paneLayoutRect(self.layout!, self.activePaneId, bounds)).toEqual({
      left: 100,
      top: 353,
      width: 1206,
      height: 297,
    });
    expect(single.tabs).toHaveLength(1);
  });

  it("rejects over-capacity merges and unknown targets while keeping safe geometry bounds", () => {
    let state = views(5);
    const source = state.tabs[4].id;
    state = workspaceReducer(state, {
      type: "pane/show-tabs",
      tabIds: state.tabs.slice(0, 4).map((tab) => tab.id),
    });
    expect(
      projectWorkspaceDrop(state, source, state.panes[0].id, "left"),
    ).toBeNull();
    expect(
      projectWorkspaceDrop(state, "missing", state.panes[0].id, null),
    ).toBeNull();
    expect(projectWorkspaceDrop(state, source, "missing", null)).toBeNull();
    expect(
      paneLayoutRect(state.layout!, state.panes[0].id, {
        ...bounds,
        width: NaN,
      }),
    ).toBeUndefined();
  });

  it("calculates migrated legacy layout rectangles and missing leaf lookups", () => {
    const raw = views();
    delete raw.splitTabs;
    delete raw.tabOrder;
    delete raw.activeTabId;
    raw.panes = raw.tabs.map((tab, index) => ({
      id: `legacy-${index}`,
      tabId: tab.id,
    }));
    raw.activePaneId = raw.panes[1].id;
    raw.layout = {
      type: "split",
      axis: "horizontal",
      ratio: 0.5,
      first: { type: "leaf", paneId: raw.panes[0].id },
      second: { type: "leaf", paneId: raw.panes[1].id },
    };
    const state = restoreWorkspace(raw);
    expect(paneLayoutRect(state.layout!, state.activePaneId, bounds)).toEqual({
      left: 706,
      top: 50,
      width: 600,
      height: 600,
    });
    const single: PaneLayout = { type: "leaf", paneId: "one" };
    expect(paneLayoutRect(single, "missing", bounds)).toBeUndefined();
  });
});
