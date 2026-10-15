import { describe, expect, it } from "vitest";
import { workspaceSchema } from "../src/main/security";
import {
  createTab,
  createWorkspace,
  projectWorkspaceDrop,
  workspaceReducer,
} from "../src/renderer/workspace";
import { workspaceEntries } from "../src/renderer/workspace-entries";
import { paneLayoutRect } from "../src/shared/layout-geometry";
import {
  layoutPaneIds,
  removeLayoutPane,
  splitLayout,
} from "../src/shared/pane-layout";
import type { SplitEdge, Workspace } from "../src/shared/contracts";

function views(count: number): Workspace {
  let state = createWorkspace();
  for (let index = 1; index < count; index++)
    state = workspaceReducer(state, {
      type: "tab/open",
      tab: createTab("offline", [{ logGroup: `/group-${index}` }]),
    });
  return state;
}

function combine(state: Workspace, ids = state.tabs.map((tab) => tab.id)) {
  return workspaceReducer(state, { type: "pane/show-tabs", tabIds: ids });
}

function valid(state: Workspace) {
  expect(workspaceSchema.safeParse(state).success).toBe(true);
  const entries = workspaceEntries(state);
  expect(entries.map((entry) => entry.id)).toEqual(state.tabOrder);
  const ids = entries.flatMap((entry) => entry.tabIds);
  expect(ids).toHaveLength(state.tabs.length);
  expect(new Set(ids).size).toBe(state.tabs.length);
}

describe("split panel drag projection", () => {
  it("projects a side-by-side panel swap into the entire final half", () => {
    const state = combine(views(2));
    const [source, target] = state.panes;
    const before = structuredClone(state);
    const projected = projectWorkspaceDrop(
      state,
      source.tabId!,
      target.id,
      "right",
    )!;
    expect(projected).not.toBeNull();
    expect(
      paneLayoutRect(projected.layout!, projected.activePaneId, {
        left: 100,
        top: 40,
        width: 1206,
        height: 600,
      }),
    ).toEqual({ left: 706, top: 40, width: 600, height: 600 });
    expect(layoutPaneIds(projected.layout!)).toEqual([target.id, source.id]);
    expect(projected.tabs).toEqual(state.tabs);
    expect(state).toEqual(before);
    expect(
      workspaceReducer(state, {
        type: "pane/drop-tab",
        tabId: source.tabId!,
        paneId: target.id,
        edge: "right",
      }),
    ).toEqual(projected);
    valid(projected);
  });

  it.each([2, 3, 4])(
    "moves every panel to every edge after removing its old space in a %i-panel layout",
    (count) => {
      const state = combine(views(count));
      const before = structuredClone(state);
      for (const source of state.panes)
        for (const target of state.panes) {
          if (source.id === target.id) continue;
          for (const edge of [
            "left",
            "right",
            "top",
            "bottom",
          ] as SplitEdge[]) {
            const projected = projectWorkspaceDrop(
              state,
              source.tabId!,
              target.id,
              edge,
            )!;
            expect(projected).not.toBeNull();
            expect(projected.layout).toEqual(
              splitLayout(
                removeLayoutPane(state.layout!, source.id)!,
                target.id,
                source.id,
                edge,
              ),
            );
            expect(projected.panes).toEqual(state.panes);
            expect(projected.activePaneId).toBe(source.id);
            expect(projected.splitTabs![0].id).toBe(state.activeTabId);
            valid(projected);
          }
        }
      expect(state).toEqual(before);
    },
  );

  it("keeps center swaps and ignores dropping a panel on itself", () => {
    const state = combine(views(3));
    const [source, target] = state.panes;
    const projected = projectWorkspaceDrop(
      state,
      source.tabId!,
      target.id,
      null,
    )!;
    expect(projected.layout).toEqual(state.layout);
    expect(projected.panes.find((pane) => pane.id === target.id)?.tabId).toBe(
      source.tabId,
    );
    expect(projected.panes.find((pane) => pane.id === source.id)?.tabId).toBe(
      target.tabId,
    );
    expect(projected.activePaneId).toBe(target.id);
    for (const edge of [null, "left", "right", "top", "bottom"] as const)
      expect(
        projectWorkspaceDrop(state, source.tabId!, source.id, edge),
      ).toBeNull();
    valid(projected);
  });

  it.each([2, 3, 4])(
    "extracts only the dragged member from an inactive %i-panel split into a normal tab",
    (count) => {
      let state = views(count + 1);
      const destination = state.tabs[count].id;
      state = combine(
        state,
        state.tabs.slice(0, count).map((tab) => tab.id),
      );
      const sourceSplit = state.splitTabs![0];
      const source = sourceSplit.panes[0].tabId!;
      state = workspaceReducer(state, {
        type: "tab/select",
        tabId: destination,
      });
      const before = structuredClone(state);
      const projected = projectWorkspaceDrop(
        state,
        source,
        state.activePaneId,
        "bottom",
      )!;
      expect(projected).not.toBeNull();
      expect(projected.panes.map((pane) => pane.tabId).sort()).toEqual(
        [source, destination].sort(),
      );
      expect(projected.tabs).toEqual(state.tabs);
      expect(projected.closedTabs).toEqual(state.closedTabs);
      const remaining = projected.splitTabs!.find(
        (split) => split.id === sourceSplit.id,
      );
      if (count === 2) {
        expect(projected.splitTabs).toHaveLength(1);
        expect(
          workspaceEntries(projected).some(
            (entry) => entry.id === sourceSplit.panes[1].tabId,
          ),
        ).toBe(true);
      } else expect(remaining?.panes).toHaveLength(count - 1);
      expect(state).toEqual(before);
      valid(projected);
    },
  );

  it("moves a panel between splits whose pane IDs overlap", () => {
    let state = views(5);
    const ids = state.tabs.map((tab) => tab.id);
    state = combine(state, ids.slice(0, 3));
    const sourceSplit = state.splitTabs![0];
    state = combine(state, ids.slice(3));
    const destination = state.activeTabId;
    const projected = projectWorkspaceDrop(
      state,
      sourceSplit.panes[0].tabId!,
      state.panes[1].id,
      "left",
    )!;
    expect(projected).not.toBeNull();
    expect(projected.panes).toHaveLength(3);
    expect(projected.activeTabId).toBe(destination);
    expect(
      projected.splitTabs!.find((split) => split.id === sourceSplit.id)?.panes,
    ).toHaveLength(2);
    expect(projected.tabs).toEqual(state.tabs);
    valid(projected);
  });

  it("projects a nested target after the source's old half collapses", () => {
    const state = combine(views(3));
    const [source, target] = state.panes;
    const projected = projectWorkspaceDrop(
      state,
      source.tabId!,
      target.id,
      "bottom",
    )!;
    expect(projected).not.toBeNull();
    expect(
      paneLayoutRect(projected.layout!, projected.activePaneId, {
        left: 100,
        top: 40,
        width: 1206,
        height: 600,
      }),
    ).toEqual({ left: 100, top: 191.5, width: 1206, height: 145.5 });
    valid(projected);
  });

  it("preserves view configuration and split names when transferring one member", () => {
    let state = views(7);
    const ids = state.tabs.map((tab) => tab.id);
    state = workspaceReducer(state, {
      type: "tab/update",
      tabId: ids[0],
      patch: {
        customTitle: "Pinned source",
        filterPattern: "ERROR",
        timePreset: "custom",
        customStart: "2026-10-12T00:00:00",
        customEnd: "2026-10-13T00:00:00",
      },
    });
    state = combine(state, ids.slice(0, 4));
    const sourceId = state.activeTabId!;
    state = workspaceReducer(state, {
      type: "tab/rename",
      tabId: sourceId,
      title: "Source split",
    });
    state = combine(state, ids.slice(4));
    state = workspaceReducer(state, {
      type: "tab/rename",
      tabId: state.activeTabId!,
      title: "Destination split",
    });
    const originalViews = structuredClone(state.tabs);
    const projected = projectWorkspaceDrop(
      state,
      ids[0],
      state.activePaneId,
      "right",
    )!;
    expect(projected).not.toBeNull();
    expect(projected.panes).toHaveLength(4);
    expect(
      projected.splitTabs!.find((split) => split.id === sourceId)?.panes,
    ).toHaveLength(3);
    expect(
      projected.splitTabs!.find((split) => split.id === sourceId)?.title,
    ).toBe("Source split");
    expect(
      projected.splitTabs!.find((split) => split.id === projected.activeTabId)
        ?.title,
    ).toBe("Destination split");
    expect(projected.tabs).toEqual(originalViews);
    expect(projected.closedTabs).toEqual(state.closedTabs);
    valid(projected);
  });

  it("rejects an over-capacity cross-split move without extracting the source", () => {
    let state = views(6);
    const ids = state.tabs.map((tab) => tab.id);
    state = combine(state, ids.slice(0, 2));
    const source = state.panes[0].tabId!;
    state = combine(state, ids.slice(2));
    const before = structuredClone(state);
    expect(
      projectWorkspaceDrop(state, source, state.activePaneId, "left"),
    ).toBeNull();
    expect(
      workspaceReducer(state, {
        type: "pane/drop-tab",
        tabId: source,
        paneId: state.activePaneId,
        edge: "left",
      }),
    ).toEqual(state);
    expect(state).toEqual(before);
    valid(state);
  });
});

describe("detaching a split panel to the tab strip", () => {
  it.each([2, 3, 4])(
    "detaches a panel at a chosen position and repairs a %i-panel source",
    (count) => {
      let state = views(count + 2);
      const ids = state.tabs.map((tab) => tab.id);
      state = workspaceReducer(state, {
        type: "tab/rename",
        tabId: ids[0],
        title: "My investigation",
      });
      state = workspaceReducer(state, {
        type: "tab/update",
        tabId: ids[0],
        patch: {
          filterPattern: "ERROR",
          timePreset: "custom",
          customStart: "2026-10-12T00:00:00",
          customEnd: "2026-10-13T00:00:00",
        },
      });
      state = combine(state, ids.slice(0, count));
      const splitId = state.activeTabId!;
      state = workspaceReducer(state, {
        type: "tab/rename",
        tabId: splitId,
        title: "Combined investigation",
      });
      const before = structuredClone(state);
      const detached = workspaceReducer(state, {
        type: "pane/detach",
        tabId: ids[0],
        beforeTabId: ids[count + 1],
      });
      expect(detached.activeTabId).toBe(ids[0]);
      expect(detached.panes).toHaveLength(1);
      expect(detached.panes[0].tabId).toBe(ids[0]);
      expect(detached.tabOrder).toEqual([
        count === 2 ? ids[1] : splitId,
        ids[count],
        ids[0],
        ids[count + 1],
      ]);
      expect(detached.tabs.find((tab) => tab.id === ids[0])).toEqual(
        state.tabs.find((tab) => tab.id === ids[0]),
      );
      expect(detached.closedTabs).toEqual(state.closedTabs);
      if (count === 2) expect(detached.splitTabs).toEqual([]);
      else {
        expect(detached.splitTabs![0].panes).toHaveLength(count - 1);
        expect(detached.splitTabs![0].title).toBe("Combined investigation");
      }
      expect(state).toEqual(before);
      valid(detached);
    },
  );

  it.each(["before source", "end"])(
    "dissolves a two-panel split when detaching %s",
    (position) => {
      const state = combine(views(2));
      const [source, remaining] = state.panes;
      const detached = workspaceReducer(state, {
        type: "pane/detach",
        tabId: source.tabId!,
        beforeTabId: position === "end" ? null : state.activeTabId!,
      });
      expect(detached.tabOrder).toEqual(
        position === "end"
          ? [remaining.tabId, source.tabId]
          : [source.tabId, remaining.tabId],
      );
      expect(detached.splitTabs).toEqual([]);
      valid(detached);
    },
  );

  it("preserves groups and all view state through repeated detaches until dissolution", () => {
    let state = views(4);
    const viewsBefore = structuredClone(state.tabs);
    const ids = state.tabs.map((tab) => tab.id);
    state = workspaceReducer(state, {
      type: "group/add",
      group: { id: "investigation", name: "Investigation", color: "blue" },
    });
    state = workspaceReducer(state, {
      type: "tab/group",
      tabIds: ids,
      groupId: "investigation",
    });
    state = combine(state);
    for (const id of ids.slice(0, 3)) {
      state = workspaceReducer(state, {
        type: "pane/detach",
        tabId: id,
        beforeTabId: null,
      });
      valid(state);
      expect(state.tabs.find((tab) => tab.id === id)?.groupId).toBe(
        "investigation",
      );
    }
    expect(state.splitTabs).toEqual([]);
    expect(state.tabOrder).toEqual([ids[3], ids[0], ids[1], ids[2]]);
    expect(
      state.tabs
        .map(({ groupId: _group, preview: _preview, ...tab }) => tab)
        .sort((a, b) => a.id.localeCompare(b.id)),
    ).toEqual(
      viewsBefore
        .map(({ groupId: _group, preview: _preview, ...tab }) => tab)
        .sort((a, b) => a.id.localeCompare(b.id)),
    );
    expect(state.closedTabs).toEqual([]);
  });

  it("rejects stale sources and insertion targets without changing the workspace", () => {
    const state = combine(views(2));
    const before = structuredClone(state);
    for (const action of [
      { type: "pane/detach", tabId: "missing", beforeTabId: null },
      { type: "pane/detach", tabId: state.tabs[0].id, beforeTabId: "missing" },
      { type: "pane/detach", tabId: state.activeTabId!, beforeTabId: null },
    ] as const)
      expect(workspaceReducer(state, action)).toEqual(state);
    expect(state).toEqual(before);
  });
});
