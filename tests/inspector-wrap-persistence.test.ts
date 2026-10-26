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
