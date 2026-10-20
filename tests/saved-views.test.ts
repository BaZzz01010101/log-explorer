import { expect, it } from "vitest";
import {
  createTab,
  createWorkspace,
  restoreWorkspace,
  workspaceReducer,
  projectFavoriteSave,
  projectFavoriteOpen,
} from "../src/renderer/workspace";
import { workspaceSchema } from "../src/main/security";
import { parseWorkspaceInput } from "../src/main/workspace-input";
import { workspaceEntries } from "../src/renderer/workspace-entries";

it("saves an entire combined view and reopens an independent copy after restart", () => {
  let state = createWorkspace();
  const first = state.tabs[0];
  first.customTitle = "Requests";
  first.timePreset = "custom";
  first.customStart = "2026-10-01T01:02:03.004Z";
  first.customEnd = "2026-10-02T04:05:06.007Z";
  first.filterPattern = "ERROR";
  first.view = {
    ...first.view,
    mode: "table",
    wrap: true,
    localSearch: "invoice",
    highlightText: "timeout",
    columns: [{ path: "/id", width: 333, pinned: true }],
    sort: { path: "/id", desc: true },
  };
  const second = createTab("offline", [
    { logGroup: "/other", logStreams: ["one", "two"] },
  ]);
  second.timePreset = "15m";
  second.kind = "insights";
  second.query = "fields @message | limit 5";
  state = workspaceReducer(state, { type: "tab/open", tab: second });
  state = workspaceReducer(state, {
    type: "pane/show-tabs",
    tabIds: [first.id, second.id],
  });
  state = workspaceReducer(state, {
    type: "tab/rename",
    tabId: state.activeTabId!,
    title: "Investigation",
  });
  state = workspaceReducer(state, {
    type: "pane/resize",
    path: "",
    ratio: 0.65,
  });
  const savedTabs = structuredClone(state.tabs);
  const layout = structuredClone(state.layout);
  state = workspaceReducer(state, {
    type: "favorites/save",
    tabId: state.activeTabId!,
  });
  expect(state.favorites).toHaveLength(1);
  const favorite = state.favorites[0];
  expect(favorite.title).toBe("Investigation");
  expect(favorite.tabs).toEqual(savedTabs);
  expect(favorite.split?.layout).toEqual(layout);
  state = restoreWorkspace(JSON.parse(JSON.stringify(state)));
  expect(workspaceSchema.safeParse(state).success).toBe(true);
  state = workspaceReducer(state, {
    type: "tab/close",
    tabId: state.activeTabId!,
  });
  state = workspaceReducer(state, {
    type: "favorites/open",
    favoriteId: favorite.id,
  });
  expect(workspaceEntries(state)[0].title).toBe("Investigation");
  expect(state.panes).toHaveLength(2);
  expect(
    state.tabs
      .map((tab) => tab.id)
      .every((id) => !savedTabs.some((tab) => tab.id === id)),
  ).toBe(true);
  expect(state.tabs.map(({ id, ...tab }) => tab)).toEqual(
    savedTabs.map(({ id, ...tab }) => ({ ...tab, preview: false })),
  );
  expect(state.layout?.type === "split" && state.layout.ratio).toBe(0.65);
  state.tabs[0].view.localSearch = "changed";
  expect(state.favorites[0].tabs[0].view.localSearch).toBe("invoice");
});

it("renames a favorite without changing its snapshot and retains the alias across restore", () => {
  let state = createWorkspace();
  state = workspaceReducer(state, {
    type: "favorites/save",
    tabId: state.activeTabId!,
  });
  const snapshot = structuredClone(state.favorites[0]);
  state = workspaceReducer(state, {
    type: "favorites/rename",
    favoriteId: snapshot.id,
    title: "  Production errors  ",
  });
  expect(state.favorites[0].title).toBe("Production errors");
  expect(state.favorites[0].tabs).toEqual(snapshot.tabs);
  state = restoreWorkspace(JSON.parse(JSON.stringify(state)));
  expect(state.favorites[0].title).toBe("Production errors");
  state = workspaceReducer(state, {
    type: "favorites/save",
    tabId: state.activeTabId!,
  });
  expect(state.favorites).toHaveLength(1);
  const renamed = state;
  expect(
    workspaceReducer(state, {
      type: "favorites/rename",
      favoriteId: snapshot.id,
      title: "   ",
    }),
  ).toEqual(renamed);
});

it("migrates group and stream favorites into saved views and removes them by ID", () => {
  const legacy = {
    ...createWorkspace(),
    favorites: [
      {
        connectionId: "offline",
        logGroup: "/aws/lambda/orders-api",
        logStream: "stream",
      },
    ],
  };
  let state = restoreWorkspace(parseWorkspaceInput(legacy));
  expect(state.favorites[0].tabs[0].sources).toEqual([
    { logGroup: "/aws/lambda/orders-api", logStreams: ["stream"] },
  ]);
  state = workspaceReducer(state, {
    type: "favorites/remove",
    favoriteId: state.favorites[0].id,
  });
  expect(state.favorites).toEqual([]);
});

it("restores saved connection identity after the original connection is edited", () => {
  let state = createWorkspace();
  state = workspaceReducer(state, {
    type: "favorites/save",
    tabId: state.activeTabId!,
  });
  state = workspaceReducer(state, {
    type: "connections/set",
    connections: [{ ...state.connections[0], region: "us-east-1" }],
  });
  state = workspaceReducer(state, {
    type: "favorites/open",
    favoriteId: state.favorites[0].id,
  });
  const opened = state.tabs.find((tab) => tab.id === state.panes[0].tabId)!;
  expect(
    state.connections.find(
      (connection) => connection.id === opened.connectionId,
    )?.region,
  ).toBe("eu-west-1");
  expect(workspaceSchema.safeParse(state).success).toBe(true);
});

it("reopens a saved split after its original tab group is removed", () => {
  let state = createWorkspace();
  state = workspaceReducer(state, { type: "pane/split" });
  const splitId = state.activeTabId!;
  state = workspaceReducer(state, {
    type: "group/add",
    group: { id: "old-group", name: "Old", color: "blue" },
  });
  state = workspaceReducer(state, {
    type: "tab/group",
    tabIds: [splitId],
    groupId: "old-group",
  });
  state = workspaceReducer(state, { type: "favorites/save", tabId: splitId });
  state = workspaceReducer(state, {
    type: "group/remove",
    groupId: "old-group",
  });
  state = workspaceReducer(state, {
    type: "favorites/open",
    favoriteId: state.favorites[0].id,
  });
  expect(workspaceSchema.safeParse(state).success).toBe(true);
  expect(
    state.splitTabs?.find((split) => split.id === state.activeTabId)?.groupId,
  ).toBeUndefined();
});

it("refuses a snapshot that would exceed the workspace file budget without losing saved favorites", () => {
  let state = createWorkspace();
  state.tabs[0].view.columns = Array.from({ length: 100 }, (_, index) => ({
    path: "/" + index + "x".repeat(2000),
    width: 200,
  }));
  for (let index = 0; index < 3; index++)
    state = workspaceReducer(state, { type: "pane/split" });
  let rejected = false;
  for (let index = 0; index < 10; index++) {
    state = workspaceReducer(state, {
      type: "tab/rename",
      tabId: state.activeTabId!,
      title: "Snapshot " + index,
    });
    const result = projectFavoriteSave(state, state.activeTabId!);
    if (result.error) {
      expect(result.workspace).toBe(state);
      expect(result.error).toMatch(/5 MB/);
      rejected = true;
      break;
    }
    state = result.workspace;
  }
  expect(rejected).toBe(true);
  expect(state.favorites.length).toBeGreaterThan(0);
  expect(
    new TextEncoder().encode(JSON.stringify(state, null, 2)).byteLength,
  ).toBeLessThanOrEqual(5_000_000);
});

it("refuses opening a favorite beyond the workspace file budget atomically", () => {
  let state = createWorkspace();
  state.tabs[0].sources = Array.from({ length: 50 }, (_, index) => ({
    logGroup: "/group-" + index,
    logStreams: Array.from(
      { length: 100 },
      (_, stream) => stream + "x".repeat(100),
    ),
  }));
  state = workspaceReducer(state, {
    type: "favorites/save",
    tabId: state.activeTabId!,
  });
  let rejected = false;
  for (let index = 0; index < 10; index++) {
    const result = projectFavoriteOpen(state, state.favorites[0].id);
    if (result.error) {
      expect(result.workspace).toBe(state);
      expect(result.error).toMatch(/5 MB/);
      rejected = true;
      break;
    }
    expect(result.workspace).not.toBe(state);
    state = result.workspace;
  }
  expect(rejected).toBe(true);
  expect(workspaceSchema.safeParse(state).success).toBe(true);
  expect(
    new TextEncoder().encode(JSON.stringify(state, null, 2)).byteLength,
  ).toBeLessThanOrEqual(5_000_000);
});
