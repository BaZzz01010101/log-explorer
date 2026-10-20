import { expect, it } from "vitest";
import {
  createWorkspace,
  workspaceReducer,
  restoreWorkspace,
} from "../src/renderer/workspace";
import { workspaceSchema } from "../src/main/security";
import { workspaceEntries } from "../src/renderer/workspace-entries";

it("names normal and split views after their favorite alias when reopened", () => {
  for (const split of [false, true]) {
    let state = createWorkspace();
    if (split) state = workspaceReducer(state, { type: "pane/split" });
    state = workspaceReducer(state, {
      type: "favorites/save",
      tabId: state.activeTabId!,
    });
    const favoriteId = state.favorites[0].id;
    state = workspaceReducer(state, {
      type: "favorites/rename",
      favoriteId,
      title: "My saved investigation",
    });
    state = workspaceReducer(state, { type: "favorites/open", favoriteId });
    expect(
      workspaceEntries(state).find((entry) => entry.id === state.activeTabId)
        ?.title,
    ).toBe("My saved investigation");
  }
});

it("preserves eight split panes and saved views across restoration and validation", () => {
  let state = createWorkspace();
  for (let index = 1; index < 8; index++)
    state = workspaceReducer(state, { type: "pane/split" });
  expect(state.panes).toHaveLength(8);
  state = workspaceReducer(state, {
    type: "favorites/save",
    tabId: state.activeTabId!,
  });
  state = restoreWorkspace(JSON.parse(JSON.stringify(state)));
  expect(state.panes).toHaveLength(8);
  expect(state.favorites[0].tabs).toHaveLength(8);
  expect(workspaceSchema.safeParse(state).success).toBe(true);
});
