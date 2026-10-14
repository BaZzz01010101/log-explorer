import { expect, it } from "vitest";
import {
  createTab,
  createWorkspace,
  restoreWorkspace,
  workspaceReducer,
} from "../src/renderer/workspace";

it("reuses the preview position while keeping permanent tabs and promotes a matching resource", () => {
  let state = createWorkspace();
  const first = createTab("offline", [{ logGroup: "/one" }]);
  state = workspaceReducer(state, { type: "tab/preview", tab: first });
  expect(state.tabs).toHaveLength(2);
  expect(state.tabs[1].preview).toBe(true);
  const second = createTab("offline", [{ logGroup: "/two" }]);
  state = workspaceReducer(state, { type: "tab/preview", tab: second });
  expect(state.tabs.map((t) => t.id)).toEqual(["tab-orders", second.id]);
  expect(state.closedTabs).toHaveLength(0);
  state = workspaceReducer(state, {
    type: "tab/open-resource",
    tab: createTab("offline", [{ logGroup: "/two" }]),
  });
  expect(state.tabs).toHaveLength(2);
  expect(state.tabs[1].preview).toBe(false);
  const third = createTab("offline", [{ logGroup: "/three" }]);
  state = workspaceReducer(state, { type: "tab/preview", tab: third });
  expect(state.tabs).toHaveLength(3);
  state = workspaceReducer(state, { type: "tab/promote", tabId: third.id });
  expect(state.tabs[2].preview).toBe(false);
  expect(
    restoreWorkspace(JSON.parse(JSON.stringify(state))).tabs[2].preview,
  ).toBe(false);
});

it("shows two to four selected tabs in distinct panes and promotes their previews", () => {
  let state = createWorkspace();
  for (const name of ["one", "two", "three"])
    state = workspaceReducer(state, {
      type: "tab/open",
      tab: createTab("offline", [{ logGroup: `/${name}` }]),
    });
  const ids = state.tabs.map((t) => t.id);
  state = workspaceReducer(state, { type: "pane/show-tabs", tabIds: ids });
  expect(state.panes.map((p) => p.tabId)).toEqual(ids);
  expect(state.panes).toHaveLength(4);
  expect(
    workspaceReducer(state, { type: "pane/show-tabs", tabIds: ["absent"] }),
  ).toBe(state);
});
