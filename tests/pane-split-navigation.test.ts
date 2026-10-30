import { expect, it } from "vitest";
import {
  createTab,
  createWorkspace,
  restoreWorkspace,
  workspaceReducer,
} from "../src/renderer/workspace";
import { workspaceEntries } from "../src/renderer/workspace-entries";
import { workspaceSchema } from "../src/main/security";

it("duplicates the current pane with independent sources and view settings and leaves neighboring tabs untouched", () => {
  const state = createWorkspace();
  const original = state.tabs[0];
  Object.assign(original, {
    customTitle: "Orders comparison",
    filterPattern: "ERROR",
    filterMode: "pattern",
    timePreset: "custom",
    customStart: "2026-10-27T01:02:03.004Z",
    customEnd: "2026-10-28T01:02:03.004Z",
    pinned: true,
  });
  original.sources[0].logStreams = ["selected-stream"];
  Object.assign(original.view, {
    localSearch: "invoice",
    highlightText: "timeout",
    columns: [{ path: "/order/id", width: 333 }],
  });
  const neighbor = createTab("offline", [{ logGroup: "/unrelated" }]);
  state.tabs.push(neighbor);
  state.tabOrder!.push(neighbor.id);
  const next = workspaceReducer(state, { type: "pane/split" });
  expect(next.tabs).toHaveLength(3);
  const copy = next.tabs.find(
    (tab) => tab.id !== original.id && tab.id !== neighbor.id,
  )!;
  expect(copy).toEqual({ ...original, id: copy.id, preview: false });
  expect(copy.sources).not.toBe(original.sources);
  expect(copy.sources[0].logStreams).not.toBe(original.sources[0].logStreams);
  expect(copy.view).not.toBe(original.view);
  expect(copy.view.columns).not.toBe(original.view.columns);
  expect(next.tabs.find((tab) => tab.id === neighbor.id)).toEqual(neighbor);
  expect(
    workspaceEntries(next).find((entry) => entry.id === neighbor.id)?.kind,
  ).toBe("single");
  expect(next.panes.map((pane) => pane.tabId)).toEqual([original.id, copy.id]);
  expect(workspaceSchema.safeParse(next).success).toBe(true);
});

it("duplicates the requested pane within a split even when another pane and neighboring tab are available", () => {
  let state = createWorkspace();
  const first = state.tabs[0];
  const second = createTab("offline", [
    { logGroup: "/second", logStreams: ["two"] },
  ]);
  const neighbor = createTab("offline", [{ logGroup: "/neighbor" }]);
  state = {
    ...state,
    tabs: [...state.tabs, second, neighbor],
    tabOrder: [...state.tabOrder!, second.id, neighbor.id],
  };
  state = workspaceReducer(state, {
    type: "pane/show-tabs",
    tabIds: [first.id, second.id],
  });
  state = workspaceReducer(state, {
    type: "pane/activate",
    paneId: state.panes[1].id,
  });
  const target = state.panes[0].id;
  const snapshot = structuredClone(state.tabs);
  const next = workspaceReducer(state, { type: "pane/split", paneId: target });
  expect(next.panes).toHaveLength(3);
  expect(next.tabs).toHaveLength(4);
  const copy = next.tabs.find(
    (tab) => !snapshot.some((old) => old.id === tab.id),
  )!;
  expect(copy).toEqual({ ...first, id: copy.id, preview: false });
  for (const existing of snapshot)
    expect(next.tabs.find((tab) => tab.id === existing.id)).toEqual(existing);
  expect(next.panes.some((pane) => pane.tabId === second.id)).toBe(true);
  expect(
    workspaceEntries(next).find((entry) => entry.id === neighbor.id)?.kind,
  ).toBe("single");
  expect(workspaceSchema.safeParse(next).success).toBe(true);
});

it("provides separate defaults for recent-tab switching and visual tab order", () => {
  expect(createWorkspace().preferences.shortcuts).toMatchObject({
    recentTab: "Control+Tab",
    previousRecentTab: "Control+Shift+Tab",
    nextTab: "Control+PageDown",
    previousTab: "Control+PageUp",
  });
});

it("migrates only legacy default next and previous bindings", () => {
  const workspace = createWorkspace();
  const migrated = restoreWorkspace({
    ...workspace,
    preferences: {
      ...workspace.preferences,
      shortcuts: {
        nextTab: "Control+Tab",
        previousTab: "Control+Shift+Tab",
        closeTab: "Alt+W",
      },
    },
  });
  expect(migrated.preferences.shortcuts).toMatchObject({
    recentTab: "Control+Tab",
    previousRecentTab: "Control+Shift+Tab",
    nextTab: "Control+PageDown",
    previousTab: "Control+PageUp",
    closeTab: "Alt+W",
  });
  const custom = restoreWorkspace({
    ...workspace,
    preferences: {
      ...workspace.preferences,
      shortcuts: { nextTab: "Alt+Right", previousTab: "", closeTab: "Alt+W" },
    },
  });
  expect(custom.preferences.shortcuts).toMatchObject({
    nextTab: "Alt+Right",
    previousTab: "",
    closeTab: "Alt+W",
  });
});

it("preserves customized new-format bindings even when they match a former default", () => {
  const workspace = createWorkspace();
  workspace.preferences.shortcuts = {
    ...workspace.preferences.shortcuts,
    nextTab: "Control+Tab",
    previousTab: "Control+Shift+Tab",
    recentTab: "Alt+Q",
    previousRecentTab: "Alt+Shift+Q",
  };
  expect(restoreWorkspace(workspace).preferences.shortcuts).toEqual(
    workspace.preferences.shortcuts,
  );
});
