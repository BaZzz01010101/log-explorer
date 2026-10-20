import { expect, it } from "vitest";
import {
  createWorkspace,
  projectResourceAction,
  projectResourceDrop,
  createResourceTabs,
  restoreWorkspace,
  workspaceReducer,
} from "../src/renderer/workspace";
import { workspaceEntries } from "../src/renderer/workspace-entries";
import { workspaceSchema } from "../src/main/security";
import { paneLayoutRect } from "../src/shared/layout-geometry";
import {
  layoutPaneIds,
  legacyLayout,
  normalizeLayout,
  isPaneLayout,
} from "../src/shared/pane-layout";

const payload = {
  connectionId: "offline",
  sources: [
    { logGroup: "/one" },
    { logGroup: "/two", logStreams: ["a", "b"] },
    { logGroup: "/three" },
    { logGroup: "/four" },
    { logGroup: "/five" },
  ],
};

it("applies matching presets to every new resource view and retains the active view when adding sources", () => {
  const state = createWorkspace();
  state.presets = [
    {
      id: "preset",
      name: "Selected group",
      logGroup: "/one",
      view: {
        ...structuredClone(state.tabs[0].view),
        mode: "json",
        localSearch: "preset search",
      },
    },
  ];
  const selected = { connectionId: "offline", sources: [{ logGroup: "/one" }] };
  for (const mode of ["new-split", "new-multisource"] as const) {
    const next = projectResourceAction(state, selected, mode).workspace;
    expect(next.tabs.at(-1)?.view.mode).toBe("json");
    expect(next.tabs.at(-1)?.view.localSearch).toBe("preset search");
    expect(next.tabs.at(-1)?.view).not.toBe(state.presets[0].view);
  }
  expect(
    projectResourceAction(state, selected, "add-sources").workspace.tabs[0]
      .view,
  ).toEqual(state.tabs[0].view);
});

it("creates one permanent multisource view or an individual pane per group and stream", () => {
  const original = createWorkspace();
  const mixed = projectResourceAction(original, payload, "new-multisource");
  expect(mixed.error).toBeUndefined();
  expect(mixed.workspace.tabs).toHaveLength(2);
  expect(mixed.workspace.tabs.at(-1)?.sources).toEqual(payload.sources);
  expect(mixed.workspace.tabs.at(-1)?.preview).toBe(false);
  const split = projectResourceAction(original, payload, "new-split");
  expect(split.error).toBeUndefined();
  expect(split.workspace.panes).toHaveLength(6);
  expect(split.workspace.tabs).toHaveLength(7);
  expect(workspaceEntries(split.workspace)).toHaveLength(2);
  expect(split.workspace.tabs.slice(1).map((tab) => tab.sources)).toEqual([
    [{ logGroup: "/one" }],
    [{ logGroup: "/two", logStreams: ["a"] }],
    [{ logGroup: "/two", logStreams: ["b"] }],
    [{ logGroup: "/three" }],
    [{ logGroup: "/four" }],
    [{ logGroup: "/five" }],
  ]);
  expect(original.tabs).toHaveLength(1);
  expect(workspaceSchema.safeParse(split.workspace).success).toBe(true);
});

it("adds sources to the active pane and splits to its combined entry", () => {
  let state = projectResourceAction(
    createWorkspace(),
    payload,
    "new-split",
  ).workspace;
  const active = state.panes.find(
    (pane) => pane.id === state.activePaneId,
  )!.tabId;
  const beforeTabs = state.tabs.length;
  state = projectResourceAction(
    state,
    { connectionId: "offline", sources: [{ logGroup: "/extra" }] },
    "add-sources",
  ).workspace;
  expect(state.tabs).toHaveLength(beforeTabs);
  expect(state.tabs.find((tab) => tab.id === active)?.sources).toContainEqual({
    logGroup: "/extra",
  });
  state = projectResourceAction(state, payload, "add-splits").workspace;
  expect(state.panes).toHaveLength(12);
  expect(workspaceEntries(state)).toHaveLength(2);
  expect(workspaceSchema.safeParse(restoreWorkspace(state)).success).toBe(true);
});

it("preserves regional source identity, deduplicates selections, and applies reducer actions", () => {
  const state = createWorkspace();
  state.connections.push({
    ...state.connections[0],
    id: "east",
    region: "us-east-1",
  });
  const resource = {
    connectionId: "offline",
    sources: [
      { connectionId: "east", logGroup: "/same", logStreams: ["one", "two"] },
      { connectionId: "east", logGroup: "/same", logStreams: ["two"] },
      { logGroup: "/same" },
    ],
  };
  const next = workspaceReducer(state, {
    type: "resources/apply",
    payload: resource,
    mode: "new-split",
  });
  expect(next.panes).toHaveLength(3);
  expect(next.tabs.slice(1).map((tab) => tab.connectionId)).toEqual([
    "east",
    "east",
    "offline",
  ]);
  expect(
    next.recents.some(
      (recent) => recent.connectionId === "east" && recent.logStream === "one",
    ),
  ).toBe(true);
});

it("creates an entry when adding to an empty workspace and rejects the entire over-budget batch", () => {
  let state = createWorkspace();
  state = workspaceReducer(state, {
    type: "tab/close",
    tabId: state.tabs[0].id,
  });
  expect(
    projectResourceAction(state, payload, "add-sources").workspace.tabs,
  ).toHaveLength(1);
  expect(
    projectResourceAction(state, payload, "add-splits").workspace.panes,
  ).toHaveLength(6);
  const full = projectResourceAction(
    createWorkspace(),
    {
      connectionId: "offline",
      sources: [
        {
          logGroup: "/full",
          logStreams: Array.from({ length: 99 }, (_, i) => String(i)),
        },
      ],
    },
    "new-split",
  ).workspace;
  expect(full.tabs).toHaveLength(100);
  const rejected = projectResourceAction(full, payload, "add-splits");
  expect(rejected.workspace).toBe(full);
  expect(rejected.error).toMatch(/100/);
  expect(
    projectResourceAction(
      full,
      { connectionId: "missing", sources: [{ logGroup: "/one" }] },
      "add-sources",
    ).error,
  ).toMatch(/connection/i);
});

it("projects a complete resource batch as a contiguous block with matching committed geometry", () => {
  const state = createWorkspace();
  const drafts = createResourceTabs(payload);
  const projected = projectResourceDrop(
    state,
    drafts,
    state.panes[0].id,
    "right",
  )!;
  expect(projected.panes).toHaveLength(7);
  expect(projected.recents).toEqual(state.recents);
  const rects = projected.panes
    .filter((pane) => drafts.some((tab) => tab.id === pane.tabId))
    .map((pane) =>
      paneLayoutRect(projected.layout!, pane.id, {
        left: 0,
        top: 0,
        width: 1206,
        height: 600,
      })!,
    );
  expect(rects).toHaveLength(6);
  expect(Math.min(...rects.map((rect) => rect.left))).toBe(606);
  expect(Math.max(...rects.map((rect) => rect.left + rect.width))).toBe(1206);
  const committed = workspaceReducer(state, {
    type: "pane/drop-resource",
    tab: drafts,
    paneId: state.panes[0].id,
    edge: "right",
  });
  expect(committed.layout).toEqual(projected.layout);
  expect(committed.recents.length).toBeGreaterThan(0);
});

it("restores, resizes, saves, reopens and dissolves a deep split with more than four panes", () => {
  let state = createWorkspace();
  for (let index = 0; index < 8; index++)
    state = workspaceReducer(state, {
      type: "pane/split",
      paneId: state.activePaneId,
      edge: "right",
    });
  expect(state.panes).toHaveLength(9);
  state = workspaceReducer(state, {
    type: "pane/resize",
    path: "1111111",
    ratio: 0.7,
  });
  const restored = restoreWorkspace(state);
  expect(restored.layout).toEqual(state.layout);
  expect(restored.panes).toHaveLength(9);
  expect(workspaceSchema.safeParse(restored).success).toBe(true);
  state = workspaceReducer(restored, {
    type: "favorites/save",
    tabId: restored.activeTabId!,
  });
  expect(state.favorites[0].tabs).toHaveLength(9);
  state = workspaceReducer(state, {
    type: "favorites/open",
    favoriteId: state.favorites[0].id,
  });
  expect(state.panes).toHaveLength(9);
  expect(workspaceSchema.safeParse(state).success).toBe(true);
  state = workspaceReducer(state, {
    type: "split/exit",
    tabId: state.activeTabId!,
  });
  expect(state.panes).toHaveLength(1);
  expect(workspaceEntries(state)).toHaveLength(10);
});

it("lays out all legacy pane IDs and bounds malformed or cyclic trees", () => {
  const ids = Array.from({ length: 100 }, (_, index) => `pane-${index}`);
  const layout = legacyLayout(ids);
  expect(new Set(layoutPaneIds(layout))).toEqual(new Set(ids));
  expect(normalizeLayout(layout, ids)).toEqual(layout);
  expect(isPaneLayout(layout)).toBe(true);
  const cycle: Record<string, unknown> = {
    type: "split",
    axis: "horizontal",
    ratio: 0.5,
  };
  cycle.first = cycle;
  cycle.second = cycle;
  expect(isPaneLayout(cycle)).toBe(false);
  expect(
    workspaceSchema.safeParse({ ...createWorkspace(), layout: cycle }).success,
  ).toBe(false);
});
