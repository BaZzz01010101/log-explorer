import { expect, it } from "vitest";
import { workspaceSchema } from "../src/main/security";
import {
  createWorkspace,
  workspaceReducer,
  restoreWorkspace,
} from "../src/renderer/workspace";

it("keeps inspector and log wrapping independent across validation and restart", () => {
  const initial = createWorkspace();
  const state = workspaceReducer(initial, {
    type: "tab/update",
    tabId: initial.tabs[0].id,
    patch: {
      view: { ...initial.tabs[0].view, wrap: true, inspectorWrap: false },
    },
  });
  const restored = restoreWorkspace(workspaceSchema.parse(state));
  expect(restored.tabs[0].view.wrap).toBe(true);
  expect(restored.tabs[0].view.inspectorWrap).toBe(false);
  expect(restoreWorkspace({ ...initial }).tabs[0].view.inspectorWrap).toBe(
    true,
  );
});

it("persists a separate inspector folding choice for each tab", () => {
  const initial = createWorkspace();
  const second = {
    ...initial.tabs[0],
    id: "second",
    view: { ...initial.tabs[0].view, inspectorExpanded: false },
  };
  const state = {
    ...initial,
    tabOrder: [...initial.tabOrder!, second.id],
    tabs: [
      {
        ...initial.tabs[0],
        view: { ...initial.tabs[0].view, inspectorExpanded: true },
      },
      second,
    ],
  };
  const restored = restoreWorkspace(workspaceSchema.parse(state));
  expect(restored.tabs[0].view.inspectorExpanded).toBe(true);
  expect(restored.tabs[1].view.inspectorExpanded).toBe(false);
  expect(
    restoreWorkspace(initial).tabs[0].view.inspectorExpanded,
  ).toBeUndefined();
});
