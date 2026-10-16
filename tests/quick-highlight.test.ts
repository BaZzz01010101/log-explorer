import { expect, it } from "vitest";
import {
  createWorkspace,
  restoreWorkspace,
  workspaceReducer,
} from "../src/renderer/workspace";
import { workspaceSchema } from "../src/main/security";
it("persists quick highlighting per view without changing query or local search", () => {
  const initial = createWorkspace();
  const tab = initial.tabs[0];
  const updated = workspaceReducer(initial, {
    type: "tab/update",
    tabId: tab.id,
    patch: { view: { ...tab.view, highlightText: "Payment" } },
  });
  const restored = restoreWorkspace(workspaceSchema.parse(updated));
  expect(restored.tabs[0].view.highlightText).toBe("Payment");
  expect(restored.tabs[0].view.localSearch).toBe(tab.view.localSearch);
  expect(restored.tabs[0].filterPattern).toBe(tab.filterPattern);
  const cleared = restoreWorkspace({
    ...restored,
    tabs: [
      {
        ...restored.tabs[0],
        view: { ...restored.tabs[0].view, highlightText: "" },
      },
    ],
  });
  expect(cleared.tabs[0].view.highlightText).toBe("");
});
it("retains the legacy fallback for older views and bounds new highlight text", () => {
  const workspace = createWorkspace();
  delete workspace.tabs[0].view.highlightText;
  workspace.preferences.highlightText = "legacy";
  const restored = restoreWorkspace(workspace);
  expect(restored.tabs[0].view.highlightText).toBeUndefined();
  expect(restored.preferences.highlightText).toBe("legacy");
  workspace.tabs[0].view.highlightText = "x".repeat(201);
  expect(workspaceSchema.safeParse(workspace).success).toBe(false);
  expect(restoreWorkspace(workspace).tabs[0].view.highlightText).toHaveLength(
    200,
  );
});
