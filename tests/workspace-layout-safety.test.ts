import { describe, expect, it } from "vitest";
import { workspaceSchema } from "../src/main/security";
import {
  createTab,
  createWorkspace,
  restoreWorkspace,
  workspaceReducer,
} from "../src/renderer/workspace";
import { layoutPaneIds } from "../src/shared/pane-layout";
import type { PaneLayout, Workspace } from "../src/shared/contracts";

const leaf = (paneId: string): PaneLayout => ({ type: "leaf", paneId });
const split = (first: PaneLayout, second: PaneLayout): PaneLayout => ({
  type: "split",
  axis: "horizontal",
  ratio: 0.6,
  first,
  second,
});
function twoPanes() {
  let state = createWorkspace();
  const second = createTab("offline", [{ logGroup: "/second" }]);
  state = workspaceReducer(state, { type: "tab/open", tab: second });
  return workspaceReducer(state, {
    type: "pane/show-tabs",
    tabIds: [state.tabs[0].id, second.id],
  });
}
function valid(state: Workspace) {
  expect(workspaceSchema.safeParse(state).success).toBe(true);
  if (state.layout)
    expect(layoutPaneIds(state.layout).sort()).toEqual(
      state.panes.map((pane) => pane.id).sort(),
    );
  expect(new Set(state.tabs.map((tab) => tab.id)).size).toBe(state.tabs.length);
  const assigned = state.panes.map((pane) => pane.tabId).filter(Boolean);
  expect(new Set(assigned).size).toBe(assigned.length);
}

describe("persisted pane layout trust boundary", () => {
  it("round-trips preview flags and nested layout ratios without retaining extra fields", () => {
    const state = twoPanes();
    state.tabs[0].preview = true;
    const layout = split(leaf(state.panes[1].id), leaf(state.panes[0].id));
    state.splitTabs![0].layout = layout;
    const parsed = workspaceSchema.parse({
      ...state,
      layout: { ...layout, accessKey: "discard" },
    });
    expect(parsed.tabs[0].preview).toBe(true);
    expect(parsed.layout).toEqual(layout);
    expect(restoreWorkspace(parsed).layout).toEqual(layout);
    expect(restoreWorkspace(parsed).tabs[0].preview).toBe(true);
  });
  it.each([
    {
      name: "duplicate",
      make: (ids: string[]) => split(leaf(ids[0]), leaf(ids[0])),
    },
    { name: "missing", make: (ids: string[]) => leaf(ids[0]) },
    {
      name: "unknown",
      make: (ids: string[]) => split(leaf(ids[0]), leaf("missing-pane")),
    },
    {
      name: "invalid ratio",
      make: (ids: string[]) => ({
        ...split(leaf(ids[0]), leaf(ids[1])),
        ratio: 0.99,
      }),
    },
    {
      name: "invalid axis",
      make: (ids: string[]) => ({
        ...split(leaf(ids[0]), leaf(ids[1])),
        axis: "diagonal",
      }),
    },
  ])("rejects $name layout nodes", ({ make }) => {
    const state = twoPanes();
    expect(
      workspaceSchema.safeParse({
        ...state,
        layout: make(state.panes.map((pane) => pane.id)),
      }).success,
    ).toBe(false);
  });
  it("rejects deeply nested layouts, duplicate pane IDs, missing active panes and invalid assignments", () => {
    const state = twoPanes();
    let layout = leaf(state.panes[0].id);
    for (let index = 0; index < 20; index++)
      layout = split(layout, leaf(state.panes[1].id));
    expect(workspaceSchema.safeParse({ ...state, layout }).success).toBe(false);
    expect(
      workspaceSchema.safeParse({
        ...state,
        panes: [state.panes[0], state.panes[0]],
      }).success,
    ).toBe(false);
    expect(
      workspaceSchema.safeParse({ ...state, activePaneId: "absent" }).success,
    ).toBe(false);
    expect(
      workspaceSchema.safeParse({
        ...state,
        panes: state.panes.map((pane) => ({ ...pane, tabId: "absent" })),
      }).success,
    ).toBe(false);
  });
});

describe("pane and preview model safety", () => {
  it("clones the current tab when the default split has no unshown tab available", () => {
    const state = createWorkspace();
    const next = workspaceReducer(state, { type: "pane/split" });
    expect(next.panes).toHaveLength(2);
    expect(next.tabs).toHaveLength(2);
    expect(next.tabs[1].sources).toEqual(state.tabs[0].sources);
    expect(next.tabs[1].sources).not.toBe(state.tabs[0].sources);
    expect(next.panes[1].tabId).toBe(next.tabs[1].id);
    expect(next.layout?.type).toBe("split");
    if (next.layout?.type === "split")
      expect(next.layout.axis).toBe("horizontal");
    valid(next);
  });
  it("prefers an unshown existing tab over cloning when splitting", () => {
    let state = createWorkspace();
    const extra = createTab("offline", [{ logGroup: "/extra" }]);
    state = { ...state, tabs: [...state.tabs, extra] };
    const next = workspaceReducer(state, { type: "pane/split" });
    expect(next.tabs).toHaveLength(2);
    expect(next.panes[1].tabId).toBe(extra.id);
    valid(next);
  });
  it.each([
    { key: "filterPattern", value: "timeout" },
    { key: "query", value: "fields @message | limit 10" },
    { key: "sources", value: [{ logGroup: "/changed" }] },
    { key: "kind", value: "insights" },
    { key: "connectionId", value: "secondary" },
  ])(
    "keeps edited preview $key configuration when another resource opens",
    ({ key, value }) => {
      let state = createWorkspace();
      state = {
        ...state,
        connections: [
          ...state.connections,
          { ...state.connections[0], id: "secondary" },
        ],
      };
      const preview = createTab("offline", [{ logGroup: "/preview" }]);
      state = workspaceReducer(state, { type: "tab/preview", tab: preview });
      state = workspaceReducer(state, {
        type: "tab/update",
        tabId: preview.id,
        patch: { [key]: value },
      });
      expect(state.tabs.find((tab) => tab.id === preview.id)?.preview).toBe(
        false,
      );
      state = workspaceReducer(state, {
        type: "tab/preview",
        tab: createTab("offline", [{ logGroup: "/next" }]),
      });
      expect(state.tabs.find((tab) => tab.id === preview.id)).toMatchObject({
        [key]: value,
        preview: false,
      });
      valid(state);
    },
  );
  it("keeps unchanged query patches and date/view-only changes in preview mode", () => {
    let state = createWorkspace();
    const preview = createTab("offline", [{ logGroup: "/preview" }]);
    state = workspaceReducer(state, { type: "tab/preview", tab: preview });
    for (const patch of [
      {
        query: preview.query,
        sources: structuredClone(preview.sources),
        connectionId: preview.connectionId,
        kind: preview.kind,
        filterPattern: preview.filterPattern,
      },
      { timePreset: "5m" },
      { view: { ...preview.view, mode: "json" as const } },
    ])
      state = workspaceReducer(state, {
        type: "tab/update",
        tabId: preview.id,
        patch,
      });
    expect(state.tabs.find((tab) => tab.id === preview.id)?.preview).toBe(true);
    valid(state);
  });
  it("ignores invalid split targets and unknown tabs without creating unreachable panes", () => {
    const state = twoPanes();
    expect(
      workspaceReducer(state, { type: "pane/split", paneId: "absent" }),
    ).toBe(state);
    expect(
      workspaceReducer(state, { type: "pane/split", tabId: "absent" }),
    ).toBe(state);
  });
  it("splits a self edge-drop into an independent permanent tab and leaves a self assignment unchanged", () => {
    const state = createWorkspace();
    const next = workspaceReducer(state, {
      type: "pane/drop-tab",
      paneId: state.panes[0].id,
      tabId: state.panes[0].tabId!,
      edge: "right",
    });
    expect(next.panes).toHaveLength(2);
    expect(next.tabs).toHaveLength(2);
    const copy = next.tabs[1];
    expect(copy.id).not.toBe(state.tabs[0].id);
    expect(copy.sources).toEqual(state.tabs[0].sources);
    expect(copy.sources).not.toBe(state.tabs[0].sources);
    expect(copy.view).not.toBe(state.tabs[0].view);
    expect(copy.preview).toBe(false);
    expect(
      workspaceReducer(state, {
        type: "pane/assign",
        paneId: state.activePaneId,
        tabId: state.panes[0].tabId,
      }),
    ).toBe(state);
    valid(next);
  });
  it("preserves preview and pane assignments if a resource target no longer exists", () => {
    let state = createWorkspace();
    state = workspaceReducer(state, {
      type: "tab/preview",
      tab: createTab("offline", [{ logGroup: "/preview" }]),
    });
    const tab = createTab("offline", [{ logGroup: "/another" }]);
    expect(
      workspaceReducer(state, { type: "tab/preview", tab, paneId: "removed" }),
    ).toBe(state);
    expect(
      workspaceReducer(state, {
        type: "tab/open-resource",
        tab,
        paneId: "removed",
      }),
    ).toBe(state);
    expect(
      workspaceReducer(state, { type: "tab/open", tab, paneId: "removed" }),
    ).toBe(state);
  });
  it("uses an explicit target pane when opening an already-open resource", () => {
    const state = twoPanes();
    const tab = createTab("offline", state.tabs[0].sources);
    const next = workspaceReducer(state, {
      type: "tab/open-resource",
      tab,
      paneId: state.panes[1].id,
    });
    expect(next.panes[1].tabId).toBe(state.tabs[0].id);
    expect(next.panes[0].tabId).toBe(state.panes[1].tabId);
    expect(next.tabs).toHaveLength(2);
    valid(next);
  });
  it("keeps IDs unique when replacing a preview with a reused input ID", () => {
    let state = createWorkspace();
    state = workspaceReducer(state, {
      type: "tab/preview",
      tab: createTab("offline", [{ logGroup: "/preview" }]),
    });
    const tab = {
      ...createTab("offline", [{ logGroup: "/different" }]),
      id: state.tabs[0].id,
    };
    const next = workspaceReducer(state, { type: "tab/preview", tab });
    expect(next.tabs).toHaveLength(2);
    valid(next);
  });
  it("swaps a displayed member at pane capacity and closes only that moved member", () => {
    let state = twoPanes();
    state = workspaceReducer(state, { type: "pane/split" });
    state = workspaceReducer(state, { type: "pane/split" });
    const source = state.panes[0].tabId!;
    const target = state.panes[1].id;
    const moved = workspaceReducer(state, {
      type: "pane/assign",
      paneId: target,
      tabId: source,
    });
    expect(moved.panes).toHaveLength(4);
    expect(moved.tabs).toHaveLength(state.tabs.length);
    expect(moved.panes.filter((pane) => pane.tabId === source)).toHaveLength(1);
    valid(moved);
    const closed = workspaceReducer(moved, {
      type: "pane/close",
      paneId: target,
    });
    expect(closed.panes).toHaveLength(3);
    expect(closed.tabs.some((tab) => tab.id === source)).toBe(false);
    expect(closed.closedTabs[0].id).toBe(source);
    valid(closed);
  });
  it("adds a fifth unshown view without removing existing panes", () => {
    let state = twoPanes();
    state = workspaceReducer(state, { type: "pane/split" });
    state = workspaceReducer(state, { type: "pane/split" });
    const tab = createTab("offline", [{ logGroup: "/unshown" }]);
    state = {
      ...state,
      tabs: [...state.tabs, tab],
      tabOrder: [...state.tabOrder!, tab.id],
    };
    const next = workspaceReducer(state, {
      type: "pane/drop-tab",
      paneId: state.panes[0].id,
      tabId: tab.id,
      edge: "left",
    });
    expect(next.panes).toHaveLength(5);
    expect(next.tabs).toHaveLength(state.tabs.length);
    valid(next);
  });
  it("makes an unshown preview permanent when opening it in a split", () => {
    let state = createWorkspace();
    const preview = {
      ...createTab("offline", [{ logGroup: "/preview" }]),
      preview: true,
    };
    state = { ...state, tabs: [...state.tabs, preview] };
    const next = workspaceReducer(state, {
      type: "pane/split",
      tabId: preview.id,
    });
    expect(next.tabs.find((tab) => tab.id === preview.id)?.preview).toBe(false);
    expect(next.panes[1].tabId).toBe(preview.id);
    valid(next);
  });
  it("rejects invalid resize paths and non-finite proportions", () => {
    const state = twoPanes();
    expect(
      workspaceReducer(state, {
        type: "pane/resize",
        path: "invalid",
        ratio: 0.7,
      }),
    ).toBe(state);
    expect(
      workspaceReducer(state, { type: "pane/resize", path: "", ratio: NaN }),
    ).toBe(state);
    expect(
      workspaceReducer(state, {
        type: "pane/resize",
        path: "",
        ratio: Infinity,
      }),
    ).toBe(state);
  });
});
