import { expect, it } from "vitest";
import {
  createWorkspace,
  projectResourceAction,
  workspaceReducer,
} from "../src/shared/workspace";

it("moves a stream into another tab and removes it from the origin", () => {
  let state = createWorkspace();
  const origin = state.tabs[0].id;
  state = workspaceReducer(state, {
    type: "tab/update",
    tabId: origin,
    patch: { sources: [{ logGroup: "/group", logStreams: ["a", "b"] }] },
  });
  state = projectResourceAction(
    state,
    { connectionId: "offline", sources: [{ logGroup: "/target" }] },
    "new-multisource",
  ).workspace;
  const target = state.tabs.at(-1)!.id;
  state = workspaceReducer(state, {
    type: "source/move",
    origin: { tabId: origin, sourceIndex: 0, stream: "a" },
    destination: { kind: "sources", tabId: target },
  });
  expect(state.tabs.find((t) => t.id === origin)!.sources).toEqual([
    { logGroup: "/group", logStreams: ["b"] },
  ]);
  expect(state.tabs.find((t) => t.id === target)!.sources).toEqual([
    { logGroup: "/target" },
    { logGroup: "/group", logStreams: ["a"] },
  ]);
});

it("keeps the origin unchanged when the destination is invalid", () => {
  const state = createWorkspace();
  expect(
    workspaceReducer(state, {
      type: "source/move",
      origin: { tabId: state.tabs[0].id, sourceIndex: 0 },
      destination: { kind: "sources", tabId: "missing" },
    }),
  ).toBe(state);
});

it("merges a tab into another and lets a whole group supersede its streams", () => {
  let state = createWorkspace();
  const origin = state.tabs[0].id;
  state = workspaceReducer(state, {
    type: "tab/update",
    tabId: origin,
    patch: { sources: [{ logGroup: "/group" }] },
  });
  state = projectResourceAction(
    state,
    {
      connectionId: "offline",
      sources: [
        { logGroup: "/group", logStreams: ["a"] },
        { logGroup: "/other" },
      ],
    },
    "new-multisource",
  ).workspace;
  const target = state.tabs.at(-1)!.id;
  state = workspaceReducer(state, {
    type: "tab/merge-sources",
    tabId: origin,
    targetTabId: target,
  });
  expect(state.tabs.some((t) => t.id === origin)).toBe(false);
  expect(state.tabs.find((t) => t.id === target)!.sources).toEqual([
    { logGroup: "/group" },
    { logGroup: "/other" },
  ]);
});

it("drops an already represented stream while keeping its target group", () => {
  let state = createWorkspace();
  const origin = state.tabs[0].id;
  state = workspaceReducer(state, { type: 'tab/update', tabId: origin, patch: { sources: [{ logGroup: '/group', logStreams: ['a', 'b'] }] } });
  state = projectResourceAction(state, { connectionId: 'offline', sources: [{ logGroup: '/group' }] }, 'new-multisource').workspace;
  const target = state.tabs.at(-1)!.id;
  state = workspaceReducer(state, { type: 'source/move', origin: { tabId: origin, sourceIndex: 0, stream: 'a' }, destination: { kind: 'sources', tabId: target } });
  expect(state.tabs.find(t => t.id === origin)!.sources[0].logStreams).toEqual(['b']);
  expect(state.tabs.find(t => t.id === target)!.sources).toEqual([{ logGroup: '/group' }]);
});

it("does not remove the origin when adding would exceed the source limit", () => {
  let state = createWorkspace();
  const origin = state.tabs[0].id;
  state = workspaceReducer(state, { type: 'tab/update', tabId: origin, patch: { sources: [{ logGroup: '/one' }, { logGroup: '/two' }] } });
  state = projectResourceAction(state, { connectionId: 'offline', sources: Array.from({length: 50}, (_, i) => ({logGroup: `/target-${i}`})) }, 'new-multisource').workspace;
  const target = state.tabs.at(-1)!.id;
  const next = workspaceReducer(state, { type: 'source/move', origin: { tabId: origin, sourceIndex: 0 }, destination: { kind: 'sources', tabId: target } });
  expect(next).toBe(state);
});

/** A workspace with three single-source tabs shown together as one split. */
function splitOfThree() {
  let state = createWorkspace();
  const ids = [state.tabs[0].id];
  state = workspaceReducer(state, {
    type: "tab/update",
    tabId: ids[0],
    patch: { sources: [{ logGroup: "/a" }] },
  });
  for (const group of ["/b", "/c", "/outside"]) {
    state = projectResourceAction(
      state,
      { connectionId: "offline", sources: [{ logGroup: group }] },
      "new-multisource",
    ).workspace;
    ids.push(state.tabs.at(-1)!.id);
  }
  state = workspaceReducer(state, {
    type: "pane/show-tabs",
    tabIds: ids.slice(0, 3),
  });
  const split = state.splitTabs!.find((entry) =>
    ids.slice(0, 3).every((id) => entry.panes.some((pane) => pane.tabId === id)),
  )!;
  return { state, ids, split: split.id };
}

it("merges every pane of a dragged split into another tab", () => {
  const { state: initial, ids, split } = splitOfThree();
  const state = workspaceReducer(initial, {
    type: "tab/merge-sources",
    tabId: split,
    targetTabId: ids[3],
  });
  expect(state.tabs.map((tab) => tab.id)).toEqual([ids[3]]);
  expect(state.tabs[0].sources.map((source) => source.logGroup)).toEqual([
    "/outside",
    "/a",
    "/b",
    "/c",
  ]);
  expect(state.splitTabs ?? []).toHaveLength(0);
});

it("merges a split into one of its own panes, leaving that tab with every source", () => {
  const { state: initial, ids, split } = splitOfThree();
  const state = workspaceReducer(initial, {
    type: "tab/merge-sources",
    tabId: split,
    targetTabId: ids[1],
  });
  expect(state.tabs.map((tab) => tab.id).sort()).toEqual([ids[1], ids[3]].sort());
  expect(
    state.tabs.find((tab) => tab.id === ids[1])!.sources.map((s) => s.logGroup),
  ).toEqual(["/b", "/a", "/c"]);
  expect(state.splitTabs ?? []).toHaveLength(0);
  expect(state.activeTabId).toBe(ids[1]);
});

// A source taken into its own view keeps everything its view was set up with.
it("gives a source moved or copied into a new tab or split the origin's settings", () => {
  let state = createWorkspace();
  const origin = state.tabs[0].id;
  state = workspaceReducer(state, {
    type: "tab/update",
    tabId: origin,
    patch: {
      sources: [{ logGroup: "/a" }, { logGroup: "/b" }],
      query: "fields @message",
      filterPattern: "ERROR",
      filterMode: "plain",
      timePreset: "custom",
      customStart: "2026-01-01T00:00:00.000Z",
      customEnd: "2026-01-02T00:00:00.000Z",
      customTitle: "Payments",
      view: {
        ...state.tabs[0].view,
        mode: "table",
        wrap: true,
        localSearch: "timeout",
        highlightText: "order",
        level: "error",
        inspectorExpanded: true,
        inspectorInfoCollapsed: true,
        columns: [{ path: "@message", width: 333, format: "json" }],
        sort: { path: "@timestamp", desc: false },
      },
    },
  });
  const settings = (id: string) => {
    const tab = state.tabs.find((t) => t.id === id)!;
    const { id: _id, title: _t, customTitle: _c, sources: _s, preview: _p, pinned: _pin, ...rest } = tab;
    return rest;
  };
  const expected = settings(origin);
  for (const copy of [false, true])
    for (const destination of [
      { kind: "tab" as const, beforeTabId: null, pinned: false },
      { kind: "split" as const, paneId: state.panes[0].id, edge: "right" as const },
    ]) {
      const next = workspaceReducer(state, {
        type: "source/move",
        origin: { tabId: origin, sourceIndex: 1 },
        destination,
        ...(copy ? { copy } : {}),
      });
      const created = next.tabs.find((t) => !state.tabs.some((o) => o.id === t.id))!;
      expect(created.sources).toEqual([{ logGroup: "/b" }]);
      const { id: _id, title, customTitle, sources: _s, preview: _p, pinned: _pin, ...rest } = created;
      expect(rest).toEqual(expected);
      // The new view is named after its own source, not the origin.
      expect(customTitle).toBeUndefined();
      expect(title).toBe("b");
      expect(next.tabs.find((t) => t.id === origin)!.sources).toEqual(
        copy ? [{ logGroup: "/a" }, { logGroup: "/b" }] : [{ logGroup: "/a" }],
      );
      // Independent copies: editing one view must not change the other.
      expect(created.view).not.toBe(next.tabs.find((t) => t.id === origin)!.view);
    }
});
