import { describe, expect, it } from "vitest";
import {
  createTab,
  createWorkspace,
  restoreWorkspace,
  workspaceReducer,
} from "../src/renderer/workspace";
import type { Workspace } from "../src/shared/contracts";
import { eventColumnValue, parseLogMessage } from "../src/shared/log-data";
import { workspaceSchema } from "../src/main/security";
import { MAX_SPLIT_PANES } from "../src/shared/pane-layout";

function expectValid(state: Workspace) {
  const tabs = new Set(state.tabs.map((tab) => tab.id));
  const groups = new Set(state.groups.map((group) => group.id));
  const connections = new Set(
    state.connections.map((connection) => connection.id),
  );
  expect(tabs.size).toBe(state.tabs.length);
  expect(state.panes.length).toBeGreaterThanOrEqual(1);
  expect(state.panes.length).toBeLessThanOrEqual(MAX_SPLIT_PANES);
  expect(state.panes.some((pane) => pane.id === state.activePaneId)).toBe(true);
  expect(
    new Set(state.panes.filter((pane) => pane.tabId).map((pane) => pane.tabId))
      .size,
  ).toBe(state.panes.filter((pane) => pane.tabId).length);
  for (const pane of state.panes)
    expect(pane.tabId === null || tabs.has(pane.tabId)).toBe(true);
  for (const tab of [...state.tabs, ...state.closedTabs]) {
    expect(connections.has(tab.connectionId)).toBe(true);
    expect(!tab.groupId || groups.has(tab.groupId)).toBe(true);
  }
}

describe("workspace state", () => {
  it("starts with an available offline fixture source", () => {
    const state = createWorkspace();
    expect(state.connections[0]).toMatchObject({
      id: "offline",
      mode: "offline",
      region: "eu-west-1",
    });
    expect(state.tabs[0].sources).toEqual([
      { logGroup: "/aws/lambda/orders-api" },
    ]);
    expectValid(state);
  });

  it("creates independent duplicate tab configuration", () => {
    const source = [{ logGroup: "group", logStreams: ["stream"] }];
    const one = createTab("offline", source);
    const two = createTab("offline", source);
    expect(one.id).not.toBe(two.id);
    one.sources[0].logStreams!.push("other");
    one.view.columns[0].width = 999;
    expect(two.sources[0].logStreams).toEqual(["stream"]);
    expect(two.view.columns[0].width).not.toBe(999);
    expect(source[0].logStreams).toEqual(["stream"]);
  });

  it("closes an active tab into history and selects the nearest remaining tab", () => {
    let state = createWorkspace();
    const original = state.tabs[0];
    const second = createTab("offline", [{ logGroup: "second" }]);
    const third = createTab("offline", [{ logGroup: "third" }]);
    state = workspaceReducer(state, { type: "tab/open", tab: second });
    state = workspaceReducer(state, { type: "tab/open", tab: third });
    state = workspaceReducer(state, { type: "tab/select", tabId: second.id });
    const snapshot = JSON.stringify(state);
    const next = workspaceReducer(state, {
      type: "tab/close",
      tabId: second.id,
    });
    expect(next.panes[0].tabId).toBe(third.id);
    expect(next.closedTabs[0].id).toBe(second.id);
    expect(JSON.stringify(state)).toBe(snapshot);
    state = workspaceReducer(next, { type: "tab/reopen" });
    expect(state.panes[0].tabId).toBe(second.id);
    expect(state.tabs.map((tab) => tab.id)).toEqual([
      original.id,
      third.id,
      second.id,
    ]);
    expectValid(state);
  });

  it("keeps an empty pane after closing the final tab and can reopen it", () => {
    let state = createWorkspace();
    state = workspaceReducer(state, {
      type: "tab/close",
      tabId: state.tabs[0].id,
    });
    expect(state.tabs).toEqual([]);
    expect(state.panes[0].tabId).toBeNull();
    expectValid(state);
    state = workspaceReducer(state, { type: "tab/reopen" });
    expect(state.tabs).toHaveLength(1);
    expectValid(state);
  });

  it("supports six splits, swaps internal views, and closes a member with its pane", () => {
    let state = createWorkspace();
    for (let index = 0; index < 5; index++)
      state = workspaceReducer(state, { type: "pane/split" });
    expect(state.panes).toHaveLength(6);
    const tabId = state.tabs[0].id;
    const target = state.panes[2].id;
    const previous = state.panes[2].tabId;
    state = workspaceReducer(state, {
      type: "pane/assign",
      paneId: target,
      tabId,
    });
    expect(state.panes[0].tabId).toBe(previous);
    expect(state.panes[2].tabId).toBe(tabId);
    state = workspaceReducer(state, { type: "pane/close", paneId: target });
    expect(state.tabs.some((tab) => tab.id === tabId)).toBe(false);
    expect(state.closedTabs[0].id).toBe(tabId);
    expectValid(state);
  });

  it("reorders tabs and removes group links from closed and open tabs", () => {
    let state = createWorkspace();
    const first = state.tabs[0];
    const second = createTab("offline", [{ logGroup: "second" }]);
    state = workspaceReducer(state, { type: "tab/open", tab: second });
    state = workspaceReducer(state, {
      type: "tab/reorder",
      tabId: second.id,
      beforeTabId: first.id,
    });
    expect(state.tabs.map((tab) => tab.id)).toEqual([second.id, first.id]);
    state = workspaceReducer(state, {
      type: "group/add",
      group: { id: "incident", name: "Incident", color: "red" },
    });
    state = workspaceReducer(state, {
      type: "tab/group",
      tabIds: [first.id, second.id],
      groupId: "incident",
    });
    state = workspaceReducer(state, { type: "tab/close", tabId: first.id });
    state = workspaceReducer(state, {
      type: "group/remove",
      groupId: "incident",
    });
    expect(
      [...state.tabs, ...state.closedTabs].every((tab) => !tab.groupId),
    ).toBe(true);
    expectValid(state);
  });

  it("restores and migrates configs while repairing orphan and duplicate links", () => {
    const seed = createWorkspace();
    const saved = {
      ...seed,
      version: 0,
      connections: [
        { ...seed.connections[0], mode: "aws", accessKeyId: "secret" },
      ],
      tabs: [
        {
          ...seed.tabs[0],
          groupId: "missing",
          events: [{ message: "secret log" }],
        },
        seed.tabs[0],
      ],
      panes: [
        { id: "one", tabId: seed.tabs[0].id },
        { id: "two", tabId: seed.tabs[0].id },
        { id: "bad", tabId: "missing" },
      ],
      activePaneId: "missing",
      token: "secret",
      preferences: { ...seed.preferences, maxEvents: Infinity, fontSize: -5 },
    };
    const restored = restoreWorkspace(saved);
    expect(restored.version).toBe(1);
    expect(restored.connections[0].mode).toBe("aws");
    expect(restored.tabs).toHaveLength(1);
    expect(JSON.stringify(restored)).not.toContain("secret");
    expect(restored.preferences.maxEvents).toBeGreaterThan(0);
    expect(restored.preferences.fontSize).toBeGreaterThan(0);
    expectValid(restored);
  });

  it("falls back safely for corrupt or future formats and roundtrips valid empty sessions", () => {
    for (const value of [
      null,
      "text",
      [],
      { version: 99 },
      { connections: "broken" },
    ])
      expectValid(restoreWorkspace(value));
    let empty = createWorkspace();
    empty = workspaceReducer(empty, {
      type: "tab/close",
      tabId: empty.tabs[0].id,
    });
    expect(restoreWorkspace(JSON.parse(JSON.stringify(empty)))).toEqual(empty);
  });

  it("bounds histories, saves and removes favorite views, and cleans up removed connections", () => {
    let state = createWorkspace();
    state = workspaceReducer(state, {
      type: "favorites/save",
      tabId: state.tabs[0].id,
    });
    expect(state.favorites).toHaveLength(1);
    state = workspaceReducer(state, {
      type: "favorites/remove",
      favoriteId: state.favorites[0].id,
    });
    expect(state.favorites).toEqual([]);
    for (let i = 0; i < 120; i++)
      state = workspaceReducer(state, {
        type: "history/add",
        query: {
          id: String(i),
          name: String(i),
          kind: "events",
          text: String(i),
        },
      });
    expect(state.history).toHaveLength(100);
    state = workspaceReducer(state, {
      type: "connections/set",
      connections: [
        {
          id: "other",
          name: "Other",
          profile: "default",
          region: "eu-west-1",
          mode: "offline",
        },
      ],
    });
    expect(state.tabs).toEqual([]);
    expect(state.closedTabs).toEqual([]);
    expectValid(state);
  });

  it("reorders named groups and panes without changing visible view assignments", () => {
    let state = createWorkspace();
    for (const id of ["one", "two"])
      state = workspaceReducer(state, {
        type: "group/add",
        group: { id, name: id, color: "blue" },
      });
    state = workspaceReducer(state, {
      type: "group/reorder",
      groupId: "two",
      beforeGroupId: "one",
    });
    expect(state.groups.map((group) => group.id)).toEqual(["two", "one"]);
    state = workspaceReducer(state, { type: "pane/split" });
    const viewPane = state.panes[0];
    const emptyPane = state.panes[1];
    state = workspaceReducer(state, {
      type: "pane/reorder",
      paneId: emptyPane.id,
      beforePaneId: viewPane.id,
    });
    expect(state.panes).toEqual([emptyPane, viewPane]);
    expectValid(state);
  });

  it("keeps query history identities unique while accepting a reused identifier", () => {
    let state = createWorkspace();
    state = workspaceReducer(state, {
      type: "history/add",
      query: { id: "recent", name: "One", kind: "events", text: "one" },
    });
    state = workspaceReducer(state, {
      type: "history/add",
      query: { id: "recent", name: "Two", kind: "events", text: "two" },
    });
    expect(state.history).toEqual([
      { id: "recent", name: "Two", kind: "events", text: "two" },
    ]);
  });

  it("restores only supported shortcut identifiers", () => {
    const state = restoreWorkspace({
      ...createWorkspace(),
      preferences: { shortcuts: { constructor: "unsafe", closeTab: "Alt+W" } },
    });
    expect(Object.hasOwn(state.preferences.shortcuts, "constructor")).toBe(
      false,
    );
    expect(state.preferences.shortcuts.closeTab).toBe("Alt+W");
  });

  it("allows disabling automatic refresh and preserves it after restoration", () => {
    const state = workspaceReducer(createWorkspace(), {
      type: "preferences/update",
      patch: { refreshSeconds: 0 },
    });
    expect(state.preferences.refreshSeconds).toBe(0);
    expect(
      restoreWorkspace(JSON.parse(JSON.stringify(state))).preferences
        .refreshSeconds,
    ).toBe(0);
    const tooFrequent = workspaceReducer(state, {
      type: "preferences/update",
      patch: { refreshSeconds: 1 },
    });
    expect(tooFrequent.preferences.refreshSeconds).toBe(5);
  });

  it("shows event time and nested request details in a new view", () => {
    const event = {
      id: "test",
      timestamp: 1700000000000,
      logGroup: "/aws/lambda/orders-api",
      logStream: "stream",
      message: JSON.stringify({
        level: "ERROR",
        service: { name: "orders-api" },
        message: "Payment failed",
        request: { id: "req-42" },
      }),
    };
    const parsed = parseLogMessage(event.message);
    const columns = createWorkspace().tabs[0].view.columns;
    expect(
      columns.map((column) => eventColumnValue(event, parsed, column.path)),
    ).toEqual([1700000000000, "error", "orders-api", event.message, "req-42"]);
    expect(columns[0].pinned).toBe(true);
  });

  it("restores every column the viewer supports instead of silently dropping columns", () => {
    const state = createWorkspace();
    state.tabs[0].view.columns = Array.from({ length: 80 }, (_, index) => ({
      path: "/field" + index,
      width: 100,
    }));
    const restored = restoreWorkspace(JSON.parse(JSON.stringify(state)));
    expect(restored.tabs[0].view.columns).toHaveLength(80);
    expect(restored.tabs[0].view.columns[79]).toEqual({
      path: "/field79",
      width: 100,
    });
  });

  it("normalizes hostile restored values into a workspace accepted by the persistence boundary", () => {
    const long = "x".repeat(12000);
    const seed = createWorkspace();
    const hostile = {
      ...seed,
      version: 1,
      name: long,
      connections: [
        {
          id: long,
          name: "",
          profile: "",
          region: "not-a-region",
          mode: "aws",
          accessKeyId: "discarded-secret",
        },
      ],
      tabs: [
        {
          ...seed.tabs[0],
          id: long,
          title: long,
          connectionId: long,
          query: long,
          sources: [{ logGroup: long, logStreams: ["", long, null] }],
          groupId: long,
        },
      ],
      closedTabs: [
        { ...seed.tabs[0], id: "closed", connectionId: long, query: long },
      ],
      groups: [{ id: long, name: long, color: "bogus" }],
      panes: [{ id: long, tabId: long }],
      activePaneId: long,
      savedQueries: [{ id: long, name: long, kind: "insights", text: long }],
      presets: [
        { id: long, name: long, logGroup: long, view: seed.tabs[0].view },
      ],
      preferences: { ...seed.preferences, shortcuts: { closeTab: long } },
    };
    const restored = restoreWorkspace(hostile);
    expect(workspaceSchema.safeParse(restored).success).toBe(true);
    expect(restored.connections[0]).toMatchObject({
      name: "Connection",
      profile: "default",
      region: "eu-west-1",
      mode: "aws",
    });
    expect(restored.tabs[0].sources[0].logStreams).toHaveLength(1);
    expect(JSON.stringify(restored)).not.toContain("discarded-secret");
    expectValid(restored);
  });

  it("preserves valid configuration values up to the persistence schema bounds", () => {
    const state = createWorkspace();
    state.name = "x".repeat(120);
    state.connections[0].name = "n".repeat(120);
    state.connections[0].profile = "p".repeat(256);
    state.tabs[0].title = "t".repeat(512);
    state.tabs[0].view.columns = [
      { path: "/" + "p".repeat(2047), width: 2000 },
    ];
    state.groups = Array.from({ length: 100 }, (_, index) => ({
      id: "group-" + index,
      name: "g".repeat(120),
      color: "blue",
    }));
    state.closedTabs = Array.from({ length: 30 }, (_, index) => ({
      ...state.tabs[0],
      id: "closed-" + index,
    }));
    state.favorites = Array.from({ length: 500 }, (_, index) => ({
      id: "favorite-" + index,
      title: "View " + index,
      connections: [state.connections[0]],
      tabs: [state.tabs[0]],
      timezone: "local",
    }));
    state.recents = Array.from({ length: 100 }, (_, index) => ({
      connectionId: "offline",
      logGroup: "group-" + index,
    }));
    state.savedQueries = Array.from({ length: 500 }, (_, index) => ({
      id: "query-" + index,
      name: "q".repeat(256),
      kind: "events",
      text: "pattern",
    }));
    state.presets = Array.from({ length: 500 }, (_, index) => ({
      id: "preset-" + index,
      name: "v".repeat(120),
      view: state.tabs[0].view,
    }));
    expect(workspaceSchema.safeParse(state).success).toBe(true);
    const restored = restoreWorkspace(JSON.parse(JSON.stringify(state)));
    expect(restored.name).toBe(state.name);
    expect(restored.connections[0]).toEqual(state.connections[0]);
    expect(restored.tabs[0].title).toBe(state.tabs[0].title);
    expect(restored.tabs[0].view.columns).toEqual(state.tabs[0].view.columns);
    expect(restored.groups).toHaveLength(100);
    expect(restored.groups[99].name).toBe("g".repeat(120));
    expect(restored.closedTabs).toHaveLength(30);
    expect(restored.favorites).toHaveLength(500);
    expect(restored.recents).toHaveLength(100);
    expect(restored.savedQueries).toHaveLength(500);
    expect(restored.savedQueries[499].name).toBe("q".repeat(256));
    expect(restored.presets).toHaveLength(500);
    expect(restored.presets[499].name).toBe("v".repeat(120));
  });

  it.each(["us-west-2", "us-gov-west-1", "cn-north-1"])(
    "preserves valid connection region %s",
    (region) => {
      const state = createWorkspace();
      state.connections[0].region = region;
      const restored = restoreWorkspace(state);
      expect(restored.connections[0].region).toBe(region);
      expect(workspaceSchema.safeParse(restored).success).toBe(true);
    },
  );

  it("persists bounded split proportions and restores defaults for older sessions", () => {
    const initial = createWorkspace();
    expect(initial.splitSizes).toEqual({ horizontal: 0.5, vertical: 0.5 });
    const resized = workspaceReducer(initial, {
      type: "workspace/update",
      patch: { splitSizes: { horizontal: 0.67, vertical: 0.38 } },
    });
    expect(resized.splitSizes).toEqual({ horizontal: 0.67, vertical: 0.38 });
    expect(
      restoreWorkspace(JSON.parse(JSON.stringify(resized))).splitSizes,
    ).toEqual({ horizontal: 0.67, vertical: 0.38 });
    expect(initial.splitSizes).toEqual({ horizontal: 0.5, vertical: 0.5 });
    const legacy = { ...initial, version: 0, splitSizes: undefined };
    expect(restoreWorkspace(legacy).splitSizes).toEqual({
      horizontal: 0.5,
      vertical: 0.5,
    });
  });

  it("repairs invalid and extreme split proportions without accepting extra persisted fields", () => {
    const seed = createWorkspace();
    const clamped = restoreWorkspace({
      ...seed,
      splitSizes: { horizontal: -1, vertical: 1, token: "discarded" },
    });
    expect(clamped.splitSizes).toEqual({ horizontal: 0.2, vertical: 0.8 });
    const invalid = restoreWorkspace({
      ...seed,
      splitSizes: { horizontal: Infinity, vertical: "0.4" },
    });
    expect(invalid.splitSizes).toEqual({ horizontal: 0.5, vertical: 0.5 });
    const updated = workspaceReducer(seed, {
      type: "workspace/update",
      patch: { splitSizes: { horizontal: -100, vertical: 100 } },
    });
    expect(updated.splitSizes).toEqual({ horizontal: 0.2, vertical: 0.8 });
    expect(workspaceSchema.safeParse(clamped).success).toBe(true);
    expectValid(updated);
  });
});
