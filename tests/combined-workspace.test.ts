import { describe, expect, it } from "vitest";
import { workspaceSchema } from "../src/main/security";
import {
  createTab,
  createWorkspace,
  restoreWorkspace,
  workspaceReducer,
  projectWorkspaceDrop,
} from "../src/renderer/workspace";
import {
  activeEntryId,
  workspaceEntries,
} from "../src/renderer/workspace-entries";
import type { Workspace } from "../src/shared/contracts";

function views(count = 3) {
  let state = createWorkspace();
  for (let index = 1; index < count; index++)
    state = workspaceReducer(state, {
      type: "tab/open",
      tab: createTab("offline", [{ logGroup: `/group-${index}` }]),
    });
  return state;
}
function combine(
  state: Workspace,
  ids = state.tabs.slice(0, 2).map((tab) => tab.id),
) {
  return workspaceReducer(state, { type: "pane/show-tabs", tabIds: ids });
}
function valid(state: Workspace) {
  expect(workspaceSchema.safeParse(state).success).toBe(true);
  const entries = workspaceEntries(state);
  const members = entries.flatMap((entry) => entry.tabIds);
  expect(new Set(members).size).toBe(state.tabs.length);
  expect(members.length).toBe(state.tabs.length);
  expect(entries.map((entry) => entry.id)).toEqual(state.tabOrder);
}

describe("combined split workspace entries", () => {
  it.each([
    "duplicate split",
    "duplicate normal",
    "open",
    "preview",
    "reopen",
    "split normal",
    "project normal",
  ])("reserves a restored combined tab ID during %s", (operation) => {
    let state = combine(views(3));
    const originalSplit = state.splitTabs![0].id;
    state = {
      ...state,
      splitTabs: state.splitTabs!.map((split) => ({ ...split, id: "tab-1" })),
      tabOrder: state.tabOrder!.map((id) =>
        id === originalSplit ? "tab-1" : id,
      ),
      activeTabId: "tab-1",
    };
    state = restoreWorkspace(workspaceSchema.parse(state));
    const members = state.splitTabs![0].panes.map((pane) => pane.tabId);
    const normal = workspaceEntries(state).find(
      (entry) => entry.kind === "single",
    )!;
    if (operation === "duplicate split")
      state = workspaceReducer(state, {
        type: "tab/duplicate",
        tabId: "tab-1",
      });
    if (operation === "duplicate normal")
      state = workspaceReducer(state, {
        type: "tab/duplicate",
        tabId: normal.id,
      });
    if (operation === "open" || operation === "preview")
      state = workspaceReducer(state, {
        type: operation === "open" ? "tab/open" : "tab/preview",
        tab: {
          ...createTab("offline", [{ logGroup: "/incoming" }]),
          id: "tab-1",
        },
      });
    if (operation === "reopen") {
      state = {
        ...state,
        closedTabs: [
          { ...createTab("offline", [{ logGroup: "/closed" }]), id: "tab-1" },
        ],
      };
      expect(workspaceSchema.safeParse(state).success).toBe(true);
      state = workspaceReducer(state, { type: "tab/reopen" });
    }
    if (operation === "split normal" || operation === "project normal") {
      state = workspaceReducer(state, { type: "tab/select", tabId: normal.id });
      state =
        operation === "split normal"
          ? workspaceReducer(state, { type: "pane/split", tabId: normal.id })
          : projectWorkspaceDrop(
              state,
              normal.id,
              state.activePaneId,
              "right",
            )!;
    }
    expect(
      state
        .splitTabs!.find((split) => split.id === "tab-1")
        ?.panes.map((pane) => pane.tabId),
    ).toEqual(members);
    expect(state.tabs.some((tab) => tab.id === "tab-1")).toBe(false);
    expect(state.tabs).toHaveLength(operation === "duplicate split" ? 5 : 4);
    valid(state);
  });

  it.each(["combine", "project", "duplicate", "legacy restore"])(
    "reserves closed view IDs when allocating a combined entry through %s",
    (operation) => {
      let state = views(2);
      state.closedTabs = [
        { ...createTab("offline", [{ logGroup: "/history" }]), id: "split-1" },
      ];
      if (operation === "combine") state = combine(state);
      if (operation === "project")
        state = projectWorkspaceDrop(
          state,
          state.tabs[0].id,
          state.activePaneId,
          "left",
        )!;
      if (operation === "duplicate") {
        state = combine(state);
        state = workspaceReducer(state, {
          type: "tab/duplicate",
          tabId: state.activeTabId!,
        });
      }
      if (operation === "legacy restore") {
        delete state.splitTabs;
        delete state.tabOrder;
        delete state.activeTabId;
        state.panes = state.tabs.map((tab, index) => ({
          id: `legacy-${index}`,
          tabId: tab.id,
        }));
        state.activePaneId = state.panes[0].id;
        state.layout = {
          type: "split",
          axis: "horizontal",
          ratio: 0.5,
          first: { type: "leaf", paneId: state.panes[0].id },
          second: { type: "leaf", paneId: state.panes[1].id },
        };
        state = restoreWorkspace(state);
      }
      expect(state.splitTabs!.every((split) => split.id !== "split-1")).toBe(
        true,
      );
      expect(state.closedTabs[0].id).toBe("split-1");
      valid(state);
    },
  );
  it("does not resurrect member groups when an ungrouped combined entry exits split mode", () => {
    let state = views(2);
    state = workspaceReducer(state, {
      type: "group/add",
      group: { id: "old", name: "Old group", color: "blue" },
    });
    state = workspaceReducer(state, {
      type: "tab/group",
      tabIds: state.tabs.map((tab) => tab.id),
      groupId: "old",
    });
    state = combine(state);
    const splitId = state.activeTabId!;
    state = workspaceReducer(state, { type: "tab/group", tabIds: [splitId] });
    expect(state.splitTabs![0].groupId).toBeUndefined();
    state = workspaceReducer(state, { type: "split/exit", tabId: splitId });
    expect(state.tabs.every((tab) => tab.groupId === undefined)).toBe(true);
    expect(
      workspaceEntries(state).every((entry) => entry.groupId === undefined),
    ).toBe(true);
    valid(state);
  });

  it("follows an active view's edited connection without letting inactive or unchanged edits override explorer selection", () => {
    let state = combine(views(2));
    state = workspaceReducer(state, {
      type: "connections/set",
      connections: [
        ...state.connections,
        { ...state.connections[0], id: "other", name: "Other" },
      ],
    });
    const activeView = state.panes.find(
      (pane) => pane.id === state.activePaneId,
    )!.tabId!;
    const inactiveView = state.tabs.find((tab) => tab.id !== activeView)!.id;
    state = workspaceReducer(state, {
      type: "tab/update",
      tabId: inactiveView,
      patch: { connectionId: "other" },
    });
    expect(state.activeConnectionId).toBe("offline");
    state = workspaceReducer(state, {
      type: "tab/update",
      tabId: activeView,
      patch: { connectionId: "other" },
    });
    expect(state.activeConnectionId).toBe("other");
    state = workspaceReducer(state, {
      type: "connection/select",
      connectionId: "offline",
    });
    state = workspaceReducer(state, {
      type: "tab/update",
      tabId: activeView,
      patch: { connectionId: "other", filterPattern: "error" },
    });
    expect(state.activeConnectionId).toBe("offline");
    valid(state);
  });
  it("stores a split as one top-level entry and restores its layout after activating a full-size normal view", () => {
    let state = combine(views());
    const combined = workspaceEntries(state).find(
      (entry) => entry.kind === "split",
    )!;
    const single = workspaceEntries(state).find(
      (entry) => entry.kind === "single",
    )!;
    expect(workspaceEntries(state)).toHaveLength(2);
    expect(combined.tabIds).toHaveLength(2);
    state = workspaceReducer(state, {
      type: "pane/resize",
      path: "",
      ratio: 0.63,
    });
    const layout = structuredClone(state.layout);
    state = workspaceReducer(state, { type: "tab/select", tabId: single.id });
    expect(state.panes).toHaveLength(1);
    expect(state.panes[0].tabId).toBe(single.id);
    state = workspaceReducer(state, { type: "tab/select", tabId: combined.id });
    expect(activeEntryId(state)).toBe(combined.id);
    expect(state.panes).toHaveLength(2);
    expect(state.layout).toEqual(layout);
    valid(state);
  });

  it("duplicates a combined entry immediately adjacent with independent member configurations", () => {
    let state = combine(views(4));
    const split = workspaceEntries(state).find(
      (entry) => entry.kind === "split",
    )!;
    state = workspaceReducer(state, { type: "tab/duplicate", tabId: split.id });
    const entries = workspaceEntries(state);
    const originalIndex = entries.findIndex((entry) => entry.id === split.id);
    const duplicate = entries[originalIndex + 1];
    expect(duplicate.kind).toBe("split");
    expect(duplicate.tabIds.every((id) => !split.tabIds.includes(id))).toBe(
      true,
    );
    const original = state.tabs.find((tab) => tab.id === split.tabIds[0])!;
    const copied = state.tabs.find((tab) => tab.id === duplicate.tabIds[0])!;
    expect(copied.sources).toEqual(original.sources);
    expect(copied.sources).not.toBe(original.sources);
    copied.view.columns[0].width = 999;
    expect(original.view.columns[0].width).not.toBe(999);
    valid(state);
  });

  it("duplicates a normal view adjacent and retains its renamed title through later edits", () => {
    let state = views();
    const id = state.tabs[0].id;
    state = workspaceReducer(state, {
      type: "tab/rename",
      tabId: id,
      title: "Payment investigation",
    });
    state = workspaceReducer(state, {
      type: "tab/update",
      tabId: id,
      patch: { filterPattern: "error" },
    });
    expect(state.tabs.find((tab) => tab.id === id)?.customTitle).toBe(
      "Payment investigation",
    );
    state = workspaceReducer(state, { type: "tab/duplicate", tabId: id });
    expect(workspaceEntries(state)[1].id).toBe(state.activeTabId);
    expect(workspaceEntries(state)[1].title).toContain("Payment investigation");
    valid(state);
  });

  it("retains a split's custom title through member edits and drops it on exit", () => {
    let state = combine(views());
    const split = workspaceEntries(state).find(
      (entry) => entry.kind === "split",
    )!;
    state = workspaceReducer(state, {
      type: "tab/rename",
      tabId: split.id,
      title: "Incident 42",
    });
    state = workspaceReducer(state, {
      type: "tab/update",
      tabId: split.tabIds[0],
      patch: { filterPattern: "error" },
    });
    state = workspaceReducer(state, {
      type: "pane/resize",
      path: "",
      ratio: 0.7,
    });
    expect(
      workspaceEntries(state).find((entry) => entry.id === split.id)?.title,
    ).toBe("Incident 42");
    expect(
      restoreWorkspace(workspaceSchema.parse(state)).splitTabs?.[0].title,
    ).toBe("Incident 42");
    state = workspaceReducer(state, { type: "split/exit", tabId: split.id });
    expect(state.splitTabs).toEqual([]);
    expect(
      workspaceEntries(state)
        .map((entry) => entry.id)
        .slice(0, 2),
    ).toEqual(split.tabIds);
    expect(
      workspaceEntries(state).some((entry) => entry.title === "Incident 42"),
    ).toBe(false);
    valid(state);
  });

  it("closes all members with a combined tab and preserves the selected connection when the last tab closes", () => {
    let state = views(2);
    state = workspaceReducer(state, {
      type: "connections/set",
      connections: [
        ...state.connections,
        { ...state.connections[0], id: "second", name: "Second" },
      ],
    });
    state = combine(state);
    state = workspaceReducer(state, {
      type: "connection/select",
      connectionId: "second",
    });
    const split = workspaceEntries(state)[0];
    state = workspaceReducer(state, { type: "tab/close", tabId: split.id });
    expect(state.tabs).toEqual([]);
    expect(state.closedTabs).toHaveLength(2);
    expect(workspaceEntries(state)).toEqual([]);
    expect(state.activeTabId).toBeNull();
    expect(state.activeConnectionId).toBe("second");
    expect(restoreWorkspace(state).activeConnectionId).toBe("second");
    valid(state);
  });

  it("closes a pane's member view and dissolves a two-member split to the remaining normal view", () => {
    let state = combine(views());
    const closed = state.panes[0].tabId!;
    const remaining = state.panes[1].tabId!;
    state = workspaceReducer(state, {
      type: "pane/close",
      paneId: state.panes[0].id,
    });
    expect(state.tabs.some((tab) => tab.id === closed)).toBe(false);
    expect(state.closedTabs[0].id).toBe(closed);
    expect(state.splitTabs).toEqual([]);
    expect(state.activeTabId).toBe(remaining);
    expect(state.panes).toHaveLength(1);
    valid(state);
  });

  it("merges an entire dragged combined entry into another destination and preserves all members", () => {
    let state = combine(views(4));
    const dragged = workspaceEntries(state).find(
      (entry) => entry.kind === "split",
    )!;
    const otherIds = state.tabs
      .filter((tab) => !dragged.tabIds.includes(tab.id))
      .map((tab) => tab.id);
    state = combine(state, otherIds);
    const destination = activeEntryId(state)!;
    const before = JSON.stringify(state);
    const projection = projectWorkspaceDrop(
      state,
      dragged.id,
      state.panes[0].id,
      "left",
    );
    expect(JSON.stringify(state)).toBe(before);
    expect(projection?.panes).toHaveLength(4);
    state = workspaceReducer(state, {
      type: "pane/drop-tab",
      tabId: dragged.id,
      paneId: state.panes[0].id,
      edge: "left",
    });
    expect(state.activeTabId).toBe(destination);
    expect(workspaceEntries(state)).toHaveLength(1);
    expect(state.tabs).toHaveLength(4);
    expect(state.layout).toEqual(projection!.layout);
    valid(state);
  });

  it("merges five panes without losing either entry's views", () => {
    let state = combine(views(5), []);
    const ids = state.tabs.map((tab) => tab.id);
    state = combine(state, ids.slice(0, 3));
    const dragged = activeEntryId(state)!;
    state = combine(state, ids.slice(3));
    expect(
      projectWorkspaceDrop(state, dragged, state.panes[0].id, "top")?.panes,
    ).toHaveLength(5);
    const merged = workspaceReducer(state, {
      type: "pane/drop-tab",
      tabId: dragged,
      paneId: state.panes[0].id,
      edge: "top",
    });
    expect(merged.panes).toHaveLength(5);
    expect(merged.tabs.map((tab) => tab.id)).toEqual(
      state.tabs.map((tab) => tab.id),
    );
    valid(merged);
  });

  it("swaps pane positions without changing layout proportions, membership or query state", () => {
    let state = combine(views());
    const [one, two] = state.panes;
    const layout = state.layout;
    state = workspaceReducer(state, {
      type: "pane/swap",
      paneId: one.id,
      overPaneId: two.id,
    });
    expect(state.panes.map((pane) => pane.tabId)).toEqual([
      two.tabId,
      one.tabId,
    ]);
    expect(state.layout).toEqual(layout);
    valid(state);
  });

  it("opens resource previews outside a split without replacing its member views", () => {
    let state = combine(views(2));
    const split = activeEntryId(state)!;
    const originalIds = state.tabs.map((tab) => tab.id);
    state = workspaceReducer(state, {
      type: "tab/preview",
      tab: createTab("offline", [{ logGroup: "/next" }]),
    });
    expect(state.panes).toHaveLength(1);
    expect(state.splitTabs?.[0].id).toBe(split);
    expect(
      originalIds.every((id) => state.tabs.some((tab) => tab.id === id)),
    ).toBe(true);
    valid(state);
  });

  it("migrates global split panes to one combined entry while preserving unassigned normal views", () => {
    const raw = views(3);
    const ids = raw.tabs.map((tab) => tab.id);
    delete raw.splitTabs;
    delete raw.tabOrder;
    delete raw.activeTabId;
    raw.panes = [
      { id: "one", tabId: ids[0] },
      { id: "two", tabId: ids[1] },
    ];
    raw.layout = {
      type: "split",
      axis: "vertical",
      ratio: 0.68,
      first: { type: "leaf", paneId: "one" },
      second: { type: "leaf", paneId: "two" },
    };
    raw.activePaneId = "two";
    const state = restoreWorkspace(raw);
    expect(state.splitTabs).toHaveLength(1);
    expect(workspaceEntries(state)).toHaveLength(2);
    expect(state.panes).toHaveLength(2);
    expect(state.layout).toEqual(raw.layout);
    valid(state);
  });

  it("dissolves corrupt combined entries without dropping valid member log views", () => {
    const state = combine(views(3));
    const corrupt = {
      ...state,
      splitTabs: [
        { ...state.splitTabs![0], layout: { type: "leaf", paneId: "missing" } },
      ],
    };
    expect(workspaceSchema.safeParse(corrupt).success).toBe(false);
    const restored = restoreWorkspace(corrupt);
    expect(restored.tabs).toHaveLength(3);
    expect(restored.splitTabs).toEqual([]);
    expect(workspaceEntries(restored)).toHaveLength(3);
    valid(restored);
  });
  it("clears a regular rename on close and reopen while retaining the original source title", () => {
    let state = views(2);
    const original = state.tabs[0];
    state = workspaceReducer(state, {
      type: "tab/rename",
      tabId: original.id,
      title: "Temporary alias",
    });
    state = workspaceReducer(state, { type: "tab/close", tabId: original.id });
    expect(state.closedTabs[0]).not.toHaveProperty("customTitle");
    state = workspaceReducer(state, { type: "tab/reopen" });
    expect(
      workspaceEntries(state).find((entry) => entry.id === original.id)?.title,
    ).toBe(original.title);
    valid(state);
  });
  it("keeps a manually selected connection through query, layout and history changes", () => {
    let state = combine(views(2));
    state = workspaceReducer(state, {
      type: "connections/set",
      connections: [
        ...state.connections,
        { ...state.connections[0], id: "chosen" },
      ],
    });
    state = workspaceReducer(state, {
      type: "connection/select",
      connectionId: "chosen",
    });
    state = workspaceReducer(state, {
      type: "tab/update",
      tabId: state.tabs[0].id,
      patch: { query: "fields @message" },
    });
    state = workspaceReducer(state, {
      type: "pane/resize",
      path: "",
      ratio: 0.61,
    });
    state = workspaceReducer(state, {
      type: "history/add",
      query: { id: "history", name: "History", kind: "events", text: "test" },
    });
    expect(state.activeConnectionId).toBe("chosen");
    expect(
      restoreWorkspace(workspaceSchema.parse(state)).activeConnectionId,
    ).toBe("chosen");
    state = workspaceReducer(state, {
      type: "tab/select",
      tabId: state.activeTabId!,
    });
    expect(state.activeConnectionId).toBe("offline");
    valid(state);
  });
  it("repairs combined membership when a connection is removed without retaining orphan views", () => {
    let state = views(2);
    state = workspaceReducer(state, {
      type: "connections/set",
      connections: [
        ...state.connections,
        { ...state.connections[0], id: "remove" },
      ],
    });
    const other = createTab("remove", [{ logGroup: "/other" }]);
    state = workspaceReducer(state, { type: "tab/open", tab: other });
    state = combine(state, [state.tabs[0].id, other.id]);
    state = workspaceReducer(state, {
      type: "connections/set",
      connections: state.connections.filter(
        (connection) => connection.id !== "remove",
      ),
    });
    expect(state.tabs.some((tab) => tab.id === other.id)).toBe(false);
    expect(state.closedTabs.some((tab) => tab.connectionId === "remove")).toBe(
      false,
    );
    expect(state.splitTabs).toEqual([]);
    expect(state.activeConnectionId).toBe("offline");
    valid(state);
  });
  it("reorders and groups a combined entry without changing its member ownership", () => {
    let state = combine(views(4));
    const split = workspaceEntries(state).find(
        (entry) => entry.kind === "split",
      )!,
      last = workspaceEntries(state).at(-1)!;
    state = workspaceReducer(state, {
      type: "tab/reorder",
      tabId: split.id,
      beforeTabId: null,
    });
    expect(workspaceEntries(state).at(-1)?.id).toBe(split.id);
    state = workspaceReducer(state, {
      type: "group/add",
      group: { id: "incident", name: "Incident", color: "red" },
    });
    state = workspaceReducer(state, {
      type: "tab/group",
      tabIds: [split.id, last.id],
      groupId: "incident",
    });
    expect(
      workspaceEntries(state).find((entry) => entry.id === split.id)?.groupId,
    ).toBe("incident");
    expect(state.splitTabs![0].panes.map((pane) => pane.tabId)).toEqual(
      split.tabIds,
    );
    state = workspaceReducer(state, {
      type: "group/remove",
      groupId: "incident",
    });
    expect(state.splitTabs![0]).not.toHaveProperty("groupId");
    valid(state);
  });
  it.each([
    "duplicate member",
    "unknown member",
    "duplicate order",
    "missing order",
    "unknown active",
    "wrong projection",
  ])("rejects persisted %s references", (kind) => {
    const state = combine(views(3));
    const raw = structuredClone(state);
    if (kind === "duplicate member")
      raw.splitTabs![0].panes[1].tabId = raw.splitTabs![0].panes[0].tabId;
    if (kind === "unknown member") raw.splitTabs![0].panes[0].tabId = "missing";
    if (kind === "duplicate order") raw.tabOrder!.push(raw.tabOrder![0]);
    if (kind === "missing order") raw.tabOrder!.pop();
    if (kind === "unknown active") raw.activeTabId = "missing";
    if (kind === "wrong projection") raw.activePaneId = raw.panes[1].id;
    expect(workspaceSchema.safeParse(raw).success).toBe(false);
    const restored = restoreWorkspace(raw);
    expect(restored.tabs).toHaveLength(3);
    valid(restored);
  });
});
