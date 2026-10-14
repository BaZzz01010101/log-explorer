import { describe, expect, it } from "vitest";
import { paneLayoutRect, projectPaneDrop } from "../src/shared/layout-geometry";
import {
  createTab,
  createWorkspace,
  workspaceReducer,
} from "../src/renderer/workspace";
import type { PaneLayout, Workspace } from "../src/shared/contracts";

const bounds = { left: 100, top: 50, width: 1206, height: 600 };
function panes(count = 2): Workspace {
  let state = createWorkspace();
  for (let index = 1; index < count; index++)
    state = workspaceReducer(state, {
      type: "tab/open",
      tab: createTab("offline", [{ logGroup: `/group-${index}` }]),
    });
  return workspaceReducer(state, {
    type: "pane/show-tabs",
    tabIds: state.tabs.map((tab) => tab.id),
  });
}

describe("projected pane drop geometry", () => {
  it("projects a moved tab after its source pane collapses instead of using the current target half", () => {
    const state = panes();
    const source = state.panes[0],
      target = state.panes[1];
    expect(paneLayoutRect(state.layout!, target.id, bounds)).toEqual({
      left: 706,
      top: 50,
      width: 600,
      height: 600,
    });
    expect(
      projectPaneDrop(state, source.tabId!, target.id, "right", bounds),
    ).toEqual({
      kind: "split",
      rect: { left: 706, top: 50, width: 600, height: 600 },
    });
    const applied = workspaceReducer(state, {
      type: "pane/drop-tab",
      tabId: source.tabId!,
      paneId: target.id,
      edge: "right",
    });
    expect(
      paneLayoutRect(applied.layout!, applied.activePaneId, bounds),
    ).toEqual(
      projectPaneDrop(state, source.tabId!, target.id, "right", bounds)!.rect,
    );
  });

  it("preserves ancestor ratios after removing a source outside the target subtree", () => {
    const state = panes(3);
    const [source, above, target] = state.panes;
    state.layout = {
      type: "split",
      axis: "horizontal",
      ratio: 0.3,
      first: { type: "leaf", paneId: source.id },
      second: {
        type: "split",
        axis: "vertical",
        ratio: 0.25,
        first: { type: "leaf", paneId: above.id },
        second: { type: "leaf", paneId: target.id },
      },
    };
    const root = { left: 10, top: 20, width: 1206, height: 806 };
    expect(
      projectPaneDrop(state, source.tabId!, target.id, "left", root),
    ).toEqual({
      kind: "split",
      rect: { left: 10, top: 226, width: 600, height: 600 },
    });
  });

  it.each(["left", "right", "top", "bottom"] as const)(
    "matches the applied layout for a %s edge move in a four-pane workspace",
    (edge) => {
      const state = panes(4);
      const source = state.panes[0],
        target = state.panes[3];
      const projected = projectPaneDrop(
        state,
        source.tabId!,
        target.id,
        edge,
        bounds,
      );
      const applied = workspaceReducer(state, {
        type: "pane/drop-tab",
        tabId: source.tabId!,
        paneId: target.id,
        edge,
      });
      expect(projected?.kind).toBe("split");
      expect(projected?.rect).toEqual(
        paneLayoutRect(applied.layout!, applied.activePaneId, bounds),
      );
      expect(applied.panes).toHaveLength(4);
    },
  );

  it("shows the whole existing target for center placement and an empty target edge", () => {
    const state = panes();
    const source = state.panes[0],
      target = state.panes[1];
    const expected = {
      kind: "assign",
      rect: { left: 706, top: 50, width: 600, height: 600 },
    };
    expect(
      projectPaneDrop(state, source.tabId!, target.id, null, bounds),
    ).toEqual(expected);
    state.panes[1] = { ...target, tabId: null };
    expect(
      projectPaneDrop(state, source.tabId!, target.id, "left", bounds),
    ).toEqual(expected);
  });

  it("projects self splitting without collapsing its source pane", () => {
    const state = createWorkspace();
    expect(
      projectPaneDrop(
        state,
        state.tabs[0].id,
        state.panes[0].id,
        "bottom",
        bounds,
      ),
    ).toEqual({
      kind: "split",
      rect: { left: 100, top: 353, width: 1206, height: 297 },
    });
  });

  it("rejects impossible splits, invalid resources and invalid root bounds", () => {
    const full = panes(4);
    const extra = createTab("offline", [{ logGroup: "/unshown" }]);
    full.tabs.push(extra);
    expect(
      projectPaneDrop(full, extra.id, full.panes[0].id, "right", bounds),
    ).toBeNull();
    const hundred = createWorkspace();
    for (let index = 1; index < 100; index++)
      hundred.tabs.push(
        createTab("offline", [{ logGroup: `/other-${index}` }]),
      );
    expect(
      projectPaneDrop(
        hundred,
        hundred.tabs[0].id,
        hundred.panes[0].id,
        "right",
        bounds,
      ),
    ).toBeNull();
    expect(
      projectPaneDrop(full, "missing", full.panes[0].id, null, bounds),
    ).toBeNull();
    expect(projectPaneDrop(full, extra.id, "missing", null, bounds)).toBeNull();
    expect(
      projectPaneDrop(full, extra.id, full.panes[0].id, null, {
        ...bounds,
        width: NaN,
      }),
    ).toBeNull();
  });

  it("supports legacy saved arrangements and missing leaf lookups", () => {
    const state = panes();
    delete state.layout;
    expect(
      projectPaneDrop(
        state,
        state.panes[0].tabId!,
        state.panes[1].id,
        "right",
        bounds,
      )?.rect,
    ).toEqual({ left: 706, top: 50, width: 600, height: 600 });
    const single: PaneLayout = { type: "leaf", paneId: "one" };
    expect(paneLayoutRect(single, "missing", bounds)).toBeUndefined();
  });
});
