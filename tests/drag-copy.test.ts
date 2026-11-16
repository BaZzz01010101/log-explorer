import { expect, it } from "vitest";
import {
  createWorkspace,
  projectResourceAction,
  workspaceReducer,
} from "../src/shared/workspace";
import { workspaceEntries } from "../src/shared/workspace-entries";
import { workspaceSchema } from "../src/main/security";
import type { Workspace } from "../src/shared/contracts";

// Ctrl-drops copy instead of move: the original keeps its place and content.

function threeTabs() {
  let state = createWorkspace();
  const ids = [state.tabs[0].id];
  state = workspaceReducer(state, {
    type: "tab/update",
    tabId: ids[0],
    patch: { sources: [{ logGroup: "/a" }] },
  });
  for (const group of ["/b", "/c"]) {
    state = projectResourceAction(
      state,
      { connectionId: "offline", sources: [{ logGroup: group }] },
      "new-multisource",
    ).workspace;
    ids.push(state.tabs.at(-1)!.id);
  }
  return { state, ids };
}
const groups = (state: Workspace, id: string) =>
  state.tabs.find((tab) => tab.id === id)!.sources.map((s) => s.logGroup);
const valid = (state: Workspace) =>
  expect(workspaceSchema.safeParse(state).success).toBe(true);

it("copies a tab to a strip position and keeps the original", () => {
  const { state: initial, ids } = threeTabs();
  for (const action of [
    { type: "tab/move", tabId: ids[2], beforeTabId: ids[0], pinned: false, copy: true },
    { type: "tab/reorder", tabId: ids[2], beforeTabId: ids[0], copy: true },
  ] as const) {
    const state = workspaceReducer(initial, action);
    const entries = workspaceEntries(state);
    expect(entries).toHaveLength(4);
    expect(entries.map((entry) => entry.id).slice(1)).toEqual(ids);
    expect(groups(state, entries[0].id)).toEqual(["/c"]);
    valid(state);
  }
});

it("copies a view's sources into another tab without closing it", () => {
  const { state: initial, ids } = threeTabs();
  const state = workspaceReducer(initial, {
    type: "tab/merge-sources",
    tabId: ids[1],
    targetTabId: ids[0],
    copy: true,
  });
  expect(state.tabs.map((tab) => tab.id)).toEqual(ids);
  expect(groups(state, ids[0])).toEqual(["/a", "/b"]);
  expect(groups(state, ids[1])).toEqual(["/b"]);
  valid(state);
});

it("copies a source badge, including a view's only source", () => {
  const { state: initial, ids } = threeTabs();
  const intoTab = workspaceReducer(initial, {
    type: "source/move",
    origin: { tabId: ids[1], sourceIndex: 0 },
    destination: { kind: "sources", tabId: ids[0] },
    copy: true,
  });
  expect(groups(intoTab, ids[0])).toEqual(["/a", "/b"]);
  expect(groups(intoTab, ids[1])).toEqual(["/b"]);
  const asTab = workspaceReducer(initial, {
    type: "source/move",
    origin: { tabId: ids[1], sourceIndex: 0 },
    destination: { kind: "tab", beforeTabId: null, pinned: false },
    copy: true,
  });
  expect(asTab.tabs).toHaveLength(4);
  expect(groups(asTab, ids[1])).toEqual(["/b"]);
  valid(intoTab);
  valid(asTab);
});

it("copies a split panel out as a tab while the split keeps it", () => {
  const { state: tabs, ids } = threeTabs();
  const split = workspaceReducer(tabs, {
    type: "pane/show-tabs",
    tabIds: [ids[0], ids[1]],
  });
  const splitId = split.splitTabs![0].id;
  const state = workspaceReducer(split, {
    type: "pane/detach",
    tabId: ids[1],
    beforeTabId: null,
    copy: true,
  });
  const kept = state.splitTabs!.find((entry) => entry.id === splitId)!;
  expect(kept.panes.map((pane) => pane.tabId)).toEqual([ids[0], ids[1]]);
  const copy = state.tabs.find((tab) => !ids.includes(tab.id))!;
  expect(copy.sources).toEqual([{ logGroup: "/b" }]);
  expect(state.activeTabId).toBe(copy.id);
  valid(state);
});

it("copies a tab into a split pane and keeps the dragged tab", () => {
  const { state: tabs, ids } = threeTabs();
  const split = workspaceReducer(tabs, {
    type: "pane/show-tabs",
    tabIds: [ids[0], ids[1]],
  });
  const state = workspaceReducer(split, {
    type: "pane/drop-tab",
    tabId: ids[2],
    paneId: split.panes[0].id,
    edge: "right",
    copy: true,
  });
  expect(
    workspaceEntries(state).some(
      (entry) => entry.id === ids[2] && entry.kind === "single",
    ),
  ).toBe(true);
  expect(state.panes).toHaveLength(3);
  const placed = state.tabs.find(
    (tab) => tab.id === state.panes.find((pane) => !ids.includes(pane.tabId!))?.tabId,
  )!;
  expect(placed.sources).toEqual([{ logGroup: "/c" }]);
  valid(state);
});
