import { expect, it } from "vitest";
import { createWorkspace, restoreWorkspace } from "../src/renderer/workspace";
import { workspaceSchema } from "../src/main/security";

it("preserves per-column formatting through workspace and preset restoration", () => {
  const workspace = createWorkspace();
  workspace.tabs[0].view.columns[0].format = "datetime";
  workspace.presets = [
    {
      id: "preset",
      name: "Latency",
      view: {
        ...workspace.tabs[0].view,
        columns: [{ path: "/duration", width: 120, format: "milliseconds" }],
      },
    },
  ];
  const restored = restoreWorkspace(JSON.parse(JSON.stringify(workspace)));
  expect(restored.tabs[0].view.columns[0].format).toBe("datetime");
  expect(restored.presets[0].view.columns[0].format).toBe("milliseconds");
  expect(workspaceSchema.safeParse(restored).success).toBe(true);
});
