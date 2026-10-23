import { expect, it } from "vitest";
import { workspaceSchema } from "../src/main/security";
import {
  createTab,
  createWorkspace,
  restoreWorkspace,
  workspaceReducer,
} from "../src/renderer/workspace";
import { workspaceEntries } from "../src/renderer/workspace-entries";

function legacyWorkspace() {
  let state = createWorkspace();
  for (const logGroup of ["/orders", "/payments", "/closed"])
    state = workspaceReducer(state, {
      type: "tab/open",
      tab: createTab("offline", [{ logGroup, logStreams: ["one"] }]),
    });
  state = workspaceReducer(state, {
    type: "tab/close",
    tabId: state.tabs.at(-1)!.id,
  });
  state = workspaceReducer(state, {
    type: "pane/show-tabs",
    tabIds: state.tabs.slice(0, 2).map((tab) => tab.id),
  });
  state = workspaceReducer(state, {
    type: "favorites/save",
    tabId: state.activeTabId!,
  });
  return {
    ...structuredClone(state),
    groups: [{ id: "incident", name: "Incident", collapsed: true }],
    tabs: state.tabs.map((tab) => ({ ...tab, groupId: "incident" })),
    closedTabs: state.closedTabs.map((tab) => ({
      ...tab,
      groupId: "incident",
    })),
    splitTabs: state.splitTabs!.map((split) => ({
      ...split,
      groupId: "incident",
    })),
    favorites: state.favorites.map((favorite) => ({
      ...favorite,
      tabs: favorite.tabs.map((tab) => ({ ...tab, groupId: "incident" })),
      split: { ...favorite.split!, groupId: "incident" },
    })),
  };
}

it("restores every legacy grouped entry and split while discarding tab group metadata", () => {
  const legacy = legacyWorkspace();
  const restored = restoreWorkspace(JSON.parse(JSON.stringify(legacy)));
  expect(restored).not.toHaveProperty("groups");
  expect(restored.tabOrder).toEqual(legacy.tabOrder);
  expect(restored.activeTabId).toBe(legacy.activeTabId);
  expect(restored.tabs.map((tab) => tab.sources)).toEqual(
    legacy.tabs.map((tab) => tab.sources),
  );
  expect(restored.closedTabs.map((tab) => tab.sources)).toEqual(
    legacy.closedTabs.map((tab) => tab.sources),
  );
  expect(restored.splitTabs![0].panes).toEqual(legacy.splitTabs[0].panes);
  expect(restored.splitTabs![0].layout).toEqual(legacy.splitTabs[0].layout);
  expect(workspaceEntries(restored).map((entry) => entry.id)).toEqual(
    legacy.tabOrder,
  );
  for (const entry of [
    ...restored.tabs,
    ...restored.closedTabs,
    ...restored.splitTabs!,
    ...workspaceEntries(restored),
  ])
    expect(entry).not.toHaveProperty("groupId");
  expect(workspaceSchema.safeParse(restored).success).toBe(true);
});

it("strips obsolete metadata at the persistence boundary without validating its shape", () => {
  const legacy = legacyWorkspace();
  const parsed = workspaceSchema.parse({
    ...legacy,
    groups: "obsolete",
    tabs: legacy.tabs.map((tab) => ({ ...tab, groupId: { obsolete: true } })),
    splitTabs: legacy.splitTabs.map((split) => ({ ...split, groupId: 42 })),
  });
  expect(parsed).not.toHaveProperty("groups");
  for (const entry of [
    ...parsed.tabs,
    ...parsed.closedTabs,
    ...parsed.splitTabs!,
    ...parsed.favorites.flatMap((favorite) => [
      ...favorite.tabs,
      favorite.split!,
    ]),
  ])
    expect(entry).not.toHaveProperty("groupId");
  expect(parsed.tabOrder).toEqual(legacy.tabOrder);
});

it("reopens a migrated favorite with its split and sources intact", () => {
  const legacy = legacyWorkspace();
  let restored = restoreWorkspace(legacy);
  const favorite = restored.favorites[0];
  expect(favorite.split).not.toHaveProperty("groupId");
  expect(favorite.tabs.every((tab) => !("groupId" in tab))).toBe(true);
  restored = workspaceReducer(restored, {
    type: "favorites/open",
    favoriteId: favorite.id,
  });
  const opened = restored.splitTabs!.find(
    (split) => split.id === restored.activeTabId,
  )!;
  expect(opened.layout).toEqual(favorite.split!.layout);
  expect(
    opened.panes.map(
      (pane) => restored.tabs.find((tab) => tab.id === pane.tabId)!.sources,
    ),
  ).toEqual(favorite.tabs.map((tab) => tab.sources));
  expect(opened).not.toHaveProperty("groupId");
  expect(workspaceSchema.safeParse(restored).success).toBe(true);
});
