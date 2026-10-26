import { describe, expect, it } from "vitest";
import { workspaceSchema } from "../src/main/security";
import {
  createTab,
  createWorkspace,
  restoreWorkspace,
  workspaceReducer,
  type WorkspaceAction,
} from "../src/renderer/workspace";

function workspace() {
  let state = createWorkspace();
  state = workspaceReducer(state, {
    type: "connections/set",
    connections: [
      {
        id: "explorer",
        name: "Explorer AWS",
        mode: "aws",
        profile: "production",
        region: "eu-west-1",
      },
      {
        id: "other-aws",
        name: "Other AWS",
        mode: "aws",
        profile: "development",
        region: "us-east-1",
      },
      ...state.connections,
    ],
  });
  for (const connectionId of ["other-aws", "offline"])
    state = workspaceReducer(state, {
      type: "tab/open",
      tab: createTab(connectionId, [{ logGroup: `/${connectionId}` }]),
    });
  return workspaceReducer(state, {
    type: "connection/select",
    connectionId: "explorer",
  });
}

describe("Explorer connection independence", () => {
  it.each(["other-aws", "offline"])(
    "keeps the Explorer profile and region through %s tab navigation and edits",
    (connectionId) => {
      let state = workspace();
      const tab = state.tabs.find((tab) => tab.connectionId === connectionId)!;
      for (const action of [
        { type: "tab/select", tabId: tab.id },
        { type: "tab/update", tabId: tab.id, patch: { connectionId } },
        {
          type: "tab/update",
          tabId: tab.id,
          patch: {
            connectionId: connectionId === "offline" ? "other-aws" : "offline",
          },
        },
      ] satisfies WorkspaceAction[]) {
        state = workspaceReducer(state, action);
        expect(state.activeConnectionId).toBe("explorer");
        expect(
          state.connections.find(
            (item) => item.id === state.activeConnectionId,
          ),
        ).toMatchObject({ profile: "production", region: "eu-west-1" });
      }
    },
  );

  it.each([
    "open",
    "preview",
    "open existing resource",
    "duplicate",
    "close",
    "reopen",
    "favorite",
    "insert",
    "combine",
    "activate pane",
    "detach pane",
    "split pane",
    "exit split",
    "drop tab",
    "drop resource",
    "assign pane",
  ])("keeps explicit Explorer selection during %s", (operation) => {
    let state = workspace();
    const offline = state.tabs
      .filter((tab) => tab.connectionId === "offline")
      .at(-1)!;
    const other = state.tabs.find((tab) => tab.connectionId === "other-aws")!;
    if (["activate pane", "detach pane", "exit split"].includes(operation))
      state = workspaceReducer(state, {
        type: "pane/show-tabs",
        tabIds: [other.id, offline.id],
      });
    if (operation === "reopen")
      state = workspaceReducer(state, { type: "tab/close", tabId: offline.id });
    if (operation === "favorite")
      state = workspaceReducer(state, {
        type: "favorites/save",
        tabId: offline.id,
      });
    state = workspaceReducer(state, {
      type: "connection/select",
      connectionId: "explorer",
    });
    const incoming = createTab("offline", [{ logGroup: "/incoming" }]);
    const actions: Record<string, WorkspaceAction> = {
      open: { type: "tab/open", tab: incoming },
      preview: { type: "tab/preview", tab: incoming },
      "open existing resource": { type: "tab/open-resource", tab: offline },
      duplicate: { type: "tab/duplicate", tabId: offline.id },
      close: { type: "tab/close", tabId: offline.id },
      reopen: { type: "tab/reopen", tabId: offline.id },
      favorite: {
        type: "favorites/open",
        favoriteId: state.favorites[0]?.id ?? "",
      },
      insert: {
        type: "tabs/insert",
        tabs: [incoming],
        beforeTabId: null,
        pinned: false,
      },
      combine: { type: "pane/show-tabs", tabIds: [other.id, offline.id] },
      "activate pane": {
        type: "pane/activate",
        paneId: state.panes.at(-1)!.id,
      },
      "detach pane": {
        type: "pane/detach",
        tabId: offline.id,
        beforeTabId: null,
      },
      "split pane": { type: "pane/split", tabId: offline.id },
      "exit split": { type: "split/exit", tabId: state.activeTabId! },
      "drop tab": {
        type: "pane/drop-tab",
        tabId: other.id,
        paneId: state.activePaneId,
        edge: "right",
      },
      "drop resource": {
        type: "pane/drop-resource",
        tab: incoming,
        paneId: state.activePaneId,
        edge: "right",
      },
      "assign pane": {
        type: "pane/assign",
        tabId: other.id,
        paneId: state.activePaneId,
      },
    };
    const next = workspaceReducer(state, actions[operation]);
    expect(next).not.toBe(state);
    expect(next.activeConnectionId).toBe("explorer");
    expect(
      restoreWorkspace(workspaceSchema.parse(next)).activeConnectionId,
    ).toBe("explorer");
  });

  it("restores an offline active tab without deriving Explorer selection from it", () => {
    const state = workspace();
    expect(
      restoreWorkspace(workspaceSchema.parse(state)).activeConnectionId,
    ).toBe("explorer");
    expect(
      restoreWorkspace({ ...state, activeConnectionId: "removed" })
        .activeConnectionId,
    ).toBe("explorer");
    const { activeConnectionId: _selection, ...legacy } = state;
    expect(restoreWorkspace(legacy).activeConnectionId).toBe("explorer");
  });

  it("changes Explorer selection only explicitly or when its connection is removed", () => {
    let state = workspace();
    state = workspaceReducer(state, {
      type: "connection/select",
      connectionId: "other-aws",
    });
    expect(state.activeConnectionId).toBe("other-aws");
    state = workspaceReducer(state, {
      type: "connections/set",
      connections: state.connections.map((connection) => ({ ...connection })),
    });
    expect(state.activeConnectionId).toBe("other-aws");
    state = workspaceReducer(state, {
      type: "connections/set",
      connections: state.connections.filter(
        (connection) => connection.id !== "other-aws",
      ),
    });
    expect(state.activeConnectionId).toBe("explorer");
  });
});
