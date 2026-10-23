import { expect, it } from "vitest";
import { createWorkspace, restoreWorkspace } from "../src/renderer/workspace";
import { workspaceSchema } from "../src/main/security";

it("defaults inspector information to expanded for new and older views", () => {
  const state = createWorkspace();
  expect(state.tabs[0].view).toHaveProperty("inspectorInfoCollapsed", false);
  const older = JSON.parse(JSON.stringify(state));
  delete older.tabs[0].view.inspectorInfoCollapsed;
  expect(restoreWorkspace(older).tabs[0].view).toHaveProperty(
    "inspectorInfoCollapsed",
    false,
  );
});

it("preserves inspector information folding through workspace validation and restore", () => {
  const state = createWorkspace();
  Object.assign(state.tabs[0].view, { inspectorInfoCollapsed: true });
  const saved = workspaceSchema.parse(state);
  expect(saved.tabs[0].view).toHaveProperty("inspectorInfoCollapsed", true);
  expect(
    restoreWorkspace(JSON.parse(JSON.stringify(saved))).tabs[0].view,
  ).toHaveProperty("inspectorInfoCollapsed", true);
});

it("rejects malformed folding state at the workspace boundary", () => {
  const state = createWorkspace();
  Object.assign(state.tabs[0].view, { inspectorInfoCollapsed: "yes" });
  expect(workspaceSchema.safeParse(state).success).toBe(false);
  expect(restoreWorkspace(state).tabs[0].view).toHaveProperty(
    "inspectorInfoCollapsed",
    false,
  );
});
