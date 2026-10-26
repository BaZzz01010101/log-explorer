import { expect, it } from "vitest";
import {
  createTab,
  createWorkspace,
  projectResourceDrop,
  workspaceReducer,
} from "../src/renderer/workspace";
import {
  workspaceEntries,
  logTabLabel,
} from "../src/renderer/workspace-entries";
import { workspaceSchema } from "../src/main/security";

it("counts individual streams in generated mixed labels and totals all split panes", () => {
  let state = createWorkspace();
  const primary = state.tabs[0];
  state = workspaceReducer(state, {
    type: "tab/update",
    tabId: primary.id,
    patch: { sources: [{ logGroup: "/same", logStreams: ["one", "two"] }] },
  });
  expect(logTabLabel(state.tabs[0])).toBe("Mixed Sources");
  const second = createTab("offline", [{ logGroup: "/other" }]);
  state = workspaceReducer(state, { type: "tab/open", tab: second });
  state = workspaceReducer(state, {
    type: "pane/show-tabs",
    tabIds: [primary.id, second.id],
  });
  expect(workspaceEntries(state)[0].title).toBe("Mixed Sources");
  state = workspaceReducer(state, {
    type: "tab/rename",
    tabId: state.activeTabId!,
    title: "Investigation",
  });
  expect(workspaceEntries(state)[0].title).toBe("Investigation");
});

it("hover projection reveals a cross-region target without switching the Explorer drag owner", () => {
  let state = createWorkspace();
  state.connections.push({
    ...state.connections[0],
    id: "east",
    region: "us-east-1",
  });
  const origin = state.activeTabId!;
  const target = createTab("east", [{ logGroup: "/east" }]);
  state = workspaceReducer(state, { type: "tab/open", tab: target });
  state = workspaceReducer(state, { type: "tab/select", tabId: origin });
  state = workspaceReducer(state, {
    type: "tab/select",
    tabId: target.id,
    preserveConnection: true,
  });
  expect(state.panes[0].tabId).toBe(target.id);
  expect(state.activeConnectionId).toBe("offline");
});

it("projects a regional stream into the final area without mutating workspace or committing recents", () => {
  const state = createWorkspace();
  state.connections.push({
    ...state.connections[0],
    id: "east",
    region: "us-east-1",
  });
  const before = structuredClone(state);
  const tab = createTab("east", [
    { logGroup: "/same", logStreams: ["stream"] },
  ]);
  const projected = projectResourceDrop(state, tab, state.panes[0].id, "left")!;
  expect(state).toEqual(before);
  expect(projected.panes).toHaveLength(2);
  expect(
    projected.tabs.find((value) => value.id === tab.id)?.connectionId,
  ).toBe("east");
  expect(projected.tabs.find((value) => value.id === tab.id)?.sources).toEqual(
    tab.sources,
  );
  expect(projected.recents).toEqual(state.recents);
  expect(workspaceSchema.safeParse(projected).success).toBe(true);
});

it("drops an Explorer source into a pane atomically without changing existing view state", () => {
  let state = createWorkspace();
  state.tabs[0].view.localSearch = "keep";
  state.tabs[0].timePreset = "5m";
  const original = structuredClone(state.tabs[0]);
  const tab = createTab("offline", [
    { logGroup: "/aws/lambda/payments-worker" },
  ]);
  state = workspaceReducer(state, {
    type: "pane/drop-resource",
    tab,
    paneId: state.panes[0].id,
    edge: "bottom",
  });
  expect(state.panes).toHaveLength(2);
  expect(state.tabs.find((tab) => tab.id === original.id)).toEqual({
    ...original,
    preview: false,
  });
  expect(workspaceEntries(state)[0].title).toBe("Mixed Sources");
  expect(state.layout?.type === "split" && state.layout.axis).toBe("vertical");
  expect(workspaceSchema.safeParse(state).success).toBe(true);
  expect(
    state.recents.some(
      (recent) => recent.logGroup === "/aws/lambda/payments-worker",
    ),
  ).toBe(true);
});

it("adds a fifth resource pane with a valid owned view", () => {
  let state = createWorkspace();
  for (let index = 0; index < 3; index++)
    state = workspaceReducer(state, { type: "pane/split" });
  expect(state.panes).toHaveLength(4);
  state = workspaceReducer(state, {
    type: "pane/drop-resource",
    tab: createTab("offline", [{ logGroup: "/extra" }]),
    paneId: state.panes[0].id,
    edge: "right",
  });
  expect(state.panes).toHaveLength(5);
  expect(workspaceSchema.safeParse(state).success).toBe(true);
});
