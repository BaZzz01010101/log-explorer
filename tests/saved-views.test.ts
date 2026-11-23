import { expect, it } from "vitest";
import {
  createTab,
  createWorkspace,
  restoreWorkspace,
  workspaceReducer,
  projectFavoriteSave,
  projectFavoriteOpen,
} from "../src/shared/workspace";
import { workspaceSchema } from "../src/main/security";
import { parseWorkspaceInput } from "../src/main/workspace-input";
import { workspaceEntries } from "../src/shared/workspace-entries";

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

it("moves a favorite before another one or to the end, and keeps the order after restore", () => {
  let state = createWorkspace();
  state = workspaceReducer(state, { type: "favorites/save", tabId: state.activeTabId! });
  const [base] = state.favorites;
  state = {
    ...state,
    favorites: ["a", "b", "c"].map((id) => ({ ...base!, id, title: id })),
  };
  const order = (value: typeof state) => value.favorites.map((item) => item.id);
  const moved = workspaceReducer(state, { type: "favorites/move", favoriteId: "c", beforeFavoriteId: "a" });
  expect(order(moved)).toEqual(["c", "a", "b"]);
  expect(order(workspaceReducer(moved, { type: "favorites/move", favoriteId: "c", beforeFavoriteId: null }))).toEqual(["a", "b", "c"]);
  expect(order(workspaceReducer(state, { type: "favorites/move", favoriteId: "a", beforeFavoriteId: "c" }))).toEqual(["b", "a", "c"]);
  // Own slot, unknown ids and an unchanged order leave the workspace as it is.
  expect(workspaceReducer(state, { type: "favorites/move", favoriteId: "b", beforeFavoriteId: "b" })).toBe(state);
  expect(workspaceReducer(state, { type: "favorites/move", favoriteId: "a", beforeFavoriteId: "b" })).toBe(state);
  expect(workspaceReducer(state, { type: "favorites/move", favoriteId: "x", beforeFavoriteId: null })).toBe(state);
  expect(workspaceReducer(state, { type: "favorites/move", favoriteId: "a", beforeFavoriteId: "x" })).toBe(state);
  expect(order(restoreWorkspace(JSON.parse(JSON.stringify(moved))))).toEqual(["c", "a", "b"]);
});

/** Two favorites whose views are closed. */
function closedFavorites() {
  let state = createWorkspace();
  const other = createTab("offline", [{ logGroup: "/other" }]);
  state = workspaceReducer(state, { type: "tab/open", tab: other });
  for (const tab of state.tabs)
    state = workspaceReducer(state, { type: "favorites/save", tabId: tab.id });
  for (const tab of state.tabs)
    state = workspaceReducer(state, { type: "tab/close", tabId: tab.id });
  expect(state.tabs).toHaveLength(0);
  return state;
}
const openFavorite = (
  state: ReturnType<typeof createWorkspace>,
  favoriteId: string,
  reuse = true,
) => workspaceReducer(state, { type: "favorites/open", favoriteId, reuse });

it("reuses the preview tab for favorites and shows a favorite that is already open", () => {
  let state = closedFavorites();
  const [first, second] = state.favorites;
  state = openFavorite(state, first!.id);
  expect(state.tabs).toMatchObject([
    { preview: true, favoriteId: first!.id, customTitle: first!.title },
  ]);
  expect(workspaceSchema.safeParse(state).success).toBe(true);
  // Another favorite replaces the preview.
  state = openFavorite(state, second!.id);
  expect(state.tabs).toMatchObject([
    { preview: true, favoriteId: second!.id, sources: second!.tabs[0].sources },
  ]);
  expect(state.tabOrder).toEqual([state.tabs[0].id]);
  // A kept view stays, and its favorite then shows it as it was left.
  const kept = state.tabs[0].id;
  state = workspaceReducer(state, { type: "tab/promote", tabId: kept });
  state = workspaceReducer(state, {
    type: "tab/update",
    tabId: kept,
    patch: { filterPattern: "edited" },
  });
  state = openFavorite(state, first!.id);
  expect(state.tabs).toHaveLength(2);
  expect(state.activeTabId).not.toBe(kept);
  state = restoreWorkspace(JSON.parse(JSON.stringify(state)));
  state = openFavorite(state, second!.id);
  expect(state.tabs).toHaveLength(2);
  expect(state.activeTabId).toBe(kept);
  expect(
    state.tabs.find((tab) => tab.id === kept)!.filterPattern,
  ).toBe("edited");
});

it("opens a separate kept tab from the saved configuration on request", () => {
  let state = closedFavorites();
  const favorite = state.favorites[0]!;
  state = openFavorite(state, favorite.id);
  state = openFavorite(state, favorite.id, false);
  expect(state.tabs.map((tab) => tab.preview)).toEqual([true, false]);
  // The shown one of several is kept in view.
  const active = state.activeTabId;
  expect(active).toBe(state.tabs[1].id);
  expect(openFavorite(state, favorite.id).activeTabId).toBe(active);
});

it("does not count copies, split panes or a deleted favorite's view as its tab", () => {
  let state = closedFavorites();
  const [favorite, second] = state.favorites;
  state = openFavorite(state, favorite!.id, false);
  const original = state.activeTabId!;
  // Saving again stores the view without the link.
  const saved = workspaceReducer(
    workspaceReducer(state, {
      type: "tab/update",
      tabId: original,
      patch: { filterPattern: "saved" },
    }),
    { type: "favorites/save", tabId: original },
  ).favorites.at(-1)!;
  expect(saved.tabs[0]).not.toHaveProperty("favoriteId");
  state = workspaceReducer(state, { type: "tab/duplicate", tabId: original });
  expect(state.activeTabId).not.toBe(original);
  expect(state.tabs.filter((tab) => tab.favoriteId)).toHaveLength(1);
  state = openFavorite(state, favorite!.id);
  expect(state.tabs).toHaveLength(2);
  expect(state.activeTabId).toBe(original);
  let split = openFavorite(state, second!.id, false);
  split = workspaceReducer(split, {
    type: "pane/show-tabs",
    tabIds: [original, split.activeTabId!],
  });
  const shown = openFavorite(split, favorite!.id);
  expect(shown.tabs).toHaveLength(split.tabs.length + 1);
  expect(shown.tabs.find((tab) => tab.id === shown.activeTabId)).toMatchObject({
    preview: true,
    favoriteId: favorite!.id,
  });
  // Deleting the favorite frees its ID for another one.
  state = workspaceReducer(state, {
    type: "favorites/remove",
    favoriteId: favorite!.id,
  });
  expect(state.tabs.some((tab) => tab.favoriteId)).toBe(false);
});

it("shows the view a favorite was saved from while it is open", () => {
  for (const split of [false, true]) {
    let state = createWorkspace();
    if (split) state = workspaceReducer(state, { type: "pane/split" });
    const original = state.activeTabId!;
    const save = () =>
      workspaceReducer(state, { type: "favorites/save", tabId: original });
    state = save();
    const favorite = state.favorites[0]!;
    expect(favorite.split ?? favorite.tabs[0]).not.toHaveProperty("favoriteId");
    const tabs = state.tabs.length;
    state = openFavorite(state, favorite.id);
    expect(state.activeTabId).toBe(original);
    expect(state.tabs).toHaveLength(tabs);
    // A favorite saved before links existed, and saving the same view again.
    state = {
      ...state,
      tabs: state.tabs.map(({ favoriteId: _link, ...tab }) => tab),
      splitTabs: state.splitTabs?.map(({ favoriteId: _link, ...tab }) => tab),
    };
    expect(openFavorite(state, favorite.id).tabs).toHaveLength(tabs);
    state = save();
    expect(state.favorites).toHaveLength(1);
    // Later edits keep the link.
    state = workspaceReducer(state, {
      type: "tab/update",
      tabId: state.tabs[0].id,
      patch: { filterPattern: "edited" },
    });
    state = openFavorite(state, favorite.id);
    expect(state.activeTabId).toBe(original);
    expect(state.tabs).toHaveLength(tabs);
  }
});

it("opens a split favorite once and shows it again", () => {
  let state = createWorkspace();
  state = workspaceReducer(state, { type: "pane/split" });
  state = workspaceReducer(state, {
    type: "favorites/save",
    tabId: state.activeTabId!,
  });
  const favorite = state.favorites[0]!;
  expect(favorite.split).not.toHaveProperty("favoriteId");
  state = workspaceReducer(state, {
    type: "tab/close",
    tabId: state.activeTabId!,
  });
  state = openFavorite(state, favorite.id);
  const opened = state.activeTabId;
  expect(state.splitTabs).toMatchObject([
    { id: opened, favoriteId: favorite.id },
  ]);
  state = workspaceReducer(state, {
    type: "tab/open",
    tab: createTab("offline", [{ logGroup: "/other" }]),
  });
  state = restoreWorkspace(JSON.parse(JSON.stringify(state)));
  state = openFavorite(state, favorite.id);
  expect(state.splitTabs).toHaveLength(1);
  expect(state.activeTabId).toBe(opened);
  expect(openFavorite(state, favorite.id, false).splitTabs).toHaveLength(2);
});

it("opens favorites unpinned and leaves an open pinned tab where it is", () => {
  for (const split of [false, true]) {
    let state = createWorkspace();
    if (split) state = workspaceReducer(state, { type: "pane/split" });
    const original = state.activeTabId!;
    state = workspaceReducer(state, {
      type: "tab/pin",
      tabId: original,
      pinned: true,
    });
    state = workspaceReducer(state, { type: "favorites/save", tabId: original });
    const favorite = state.favorites[0]!;
    for (const view of [...favorite.tabs, favorite.split ?? {}])
      expect(view).not.toHaveProperty("pinned");
    const pinned = (value: typeof state) =>
      workspaceEntries(value).map((entry) => [entry.id, !!entry.pinned]);
    const other = createTab("offline", [{ logGroup: "/other" }]);
    state = workspaceReducer(state, { type: "tab/open", tab: other });
    const before = pinned(state);
    const shown = openFavorite(state, favorite.id);
    expect(shown.activeTabId).toBe(original);
    expect(pinned(shown)).toEqual(before);
    const copied = openFavorite(state, favorite.id, false);
    expect(pinned(copied)).toEqual([...before, [copied.activeTabId, false]]);
    // Favorites saved earlier can hold the pinned state.
    const pin = <T extends object>(view: T) => ({ ...view, pinned: true });
    const older = {
      ...state,
      favorites: [
        {
          ...favorite,
          tabs: favorite.tabs.map(pin),
          ...(favorite.split ? { split: pin(favorite.split) } : {}),
        },
      ],
    };
    const opened = openFavorite(older, favorite.id, false);
    expect(pinned(opened)).toEqual([...before, [opened.activeTabId, false]]);
    expect(
      workspaceReducer(older, { type: "favorites/save", tabId: original })
        .favorites,
    ).toHaveLength(1);
    const closed = workspaceReducer(older, {
      type: "tab/close",
      tabId: original,
      allowPinned: true,
    });
    const reopened = openFavorite(closed, favorite.id);
    expect(
      workspaceEntries(reopened).find(
        (entry) => entry.id === reopened.activeTabId,
      ),
    ).toMatchObject(split ? { kind: "split" } : { preview: true });
    expect(pinned(reopened).every(([, value]) => !value)).toBe(true);
  }
});

it("shows a favorite's tab only while its sources are the same", () => {
  let state = createWorkspace();
  const original = state.activeTabId!;
  const sources = [
    { logGroup: "/one" },
    { logGroup: "/two", logStreams: ["a", "b"] },
  ];
  const set = (value: typeof state, patch: object) =>
    workspaceReducer(value, { type: "tab/update", tabId: original, patch });
  state = set(state, { sources });
  state = workspaceReducer(state, { type: "favorites/save", tabId: original });
  const favorite = state.favorites[0]!;
  const reuses = (value: typeof state) => {
    const next = openFavorite(value, favorite.id);
    if (next.activeTabId === original) {
      expect(next.tabs).toHaveLength(value.tabs.length);
      return true;
    }
    // The changed tab stays as it is beside the saved version.
    expect(next.tabs).toHaveLength(value.tabs.length + 1);
    expect(next.tabs.find((tab) => tab.id === original)).toEqual(
      value.tabs.find((tab) => tab.id === original),
    );
    expect(
      next.tabs.find((tab) => tab.id === next.activeTabId)!.sources,
    ).toEqual(sources);
    return false;
  };
  expect(reuses(state)).toBe(true);
  expect(
    reuses(set(state, { filterPattern: "edited", timePreset: "15m" })),
  ).toBe(true);
  expect(
    reuses(
      set(state, {
        sources: [
          { logGroup: "/two", logStreams: ["b", "a"] },
          { logGroup: "/one" },
        ],
      }),
    ),
  ).toBe(true);
  for (const changed of [
    [{ logGroup: "/other" }],
    [sources[0]],
    [...sources, { logGroup: "/three" }],
    [sources[0], { logGroup: "/two", logStreams: ["a"] }],
  ]) {
    const edited = set(state, { sources: changed });
    expect(reuses(edited)).toBe(false);
    expect(reuses(set(edited, { sources }))).toBe(true);
  }
  // The same names in another region are other sources.
  expect(
    reuses(
      workspaceReducer(state, {
        type: "connections/set",
        connections: [{ ...state.connections[0], region: "us-east-1" }],
      }),
    ),
  ).toBe(false);
});

it("shows a favorite's split while it has the same panes, in any arrangement", () => {
  let state = createWorkspace();
  const tabs = ["/a", "/a", "/b"].map((logGroup) =>
    createTab("offline", [{ logGroup }]),
  );
  for (const tab of tabs)
    state = workspaceReducer(state, { type: "tab/open", tab });
  state = workspaceReducer(state, {
    type: "pane/show-tabs",
    tabIds: tabs.map((tab) => tab.id),
  });
  const split = state.activeTabId!;
  state = workspaceReducer(state, { type: "favorites/save", tabId: split });
  const favorite = state.favorites[0]!;
  const reuses = (value: typeof state) => {
    const next = openFavorite(value, favorite.id);
    expect(next.tabs).toHaveLength(
      value.tabs.length + (next.activeTabId === split ? 0 : 3),
    );
    return next.activeTabId === split;
  };
  const set = (index: number, patch: object) =>
    workspaceReducer(state, {
      type: "tab/update",
      tabId: tabs[index].id,
      patch,
    });
  expect(reuses(state)).toBe(true);
  const [first, , last] = state.panes;
  const swapped = workspaceReducer(state, {
    type: "pane/swap",
    paneId: first.id,
    overPaneId: last.id,
  });
  expect(swapped).not.toEqual(state);
  expect(reuses(swapped)).toBe(true);
  expect(
    reuses(workspaceReducer(state, { type: "pane/resize", path: "", ratio: 0.7 })),
  ).toBe(true);
  expect(reuses(set(1, { filterPattern: "edited" }))).toBe(true);
  // A, B, B; then A+B in one pane.
  expect(reuses(set(1, { sources: [{ logGroup: "/b" }] }))).toBe(false);
  expect(
    reuses(set(1, { sources: [{ logGroup: "/a" }, { logGroup: "/b" }] })),
  ).toBe(false);
  // One of the two identical panes is closed, or a third is added.
  expect(
    reuses(
      workspaceReducer(state, {
        type: "pane/close",
        paneId: state.panes.find((pane) => pane.tabId === tabs[1].id)!.id,
      }),
    ),
  ).toBe(false);
  expect(
    reuses(
      workspaceReducer(state, {
        type: "pane/split",
        tabId: tabs[0].id,
        paneId: first.id,
      }),
    ),
  ).toBe(false);
  // An opened copy matches too, also after a restart.
  state = workspaceReducer(state, {
    type: "favorites/open",
    favoriteId: favorite.id,
  });
  const copy = state.activeTabId;
  state = restoreWorkspace(JSON.parse(JSON.stringify(state)));
  expect(openFavorite(state, favorite.id).activeTabId).toBe(copy);
});
