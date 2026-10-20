import { afterEach, expect, it, vi } from "vitest";
import { dragDestination } from "../src/renderer/components/WorkspaceTabs";
import {
  createResourceTabs,
  createWorkspace,
  projectResourceDrop,
  workspaceReducer,
} from "../src/renderer/workspace";

afterEach(() => vi.unstubAllGlobals());

it("previews every selected group and stream in the contiguous final batch area", () => {
  const workspace = createWorkspace();
  const resources = createResourceTabs({
    connectionId: "offline",
    sources: [
      { logGroup: "/one" },
      { logGroup: "/two", logStreams: ["a", "b"] },
      { logGroup: "/three" },
      { logGroup: "/four" },
    ],
  });
  const bounds = {
    left: 100,
    top: 50,
    width: 1206,
    height: 600,
    right: 1306,
    bottom: 650,
  };
  const paneId = workspace.panes[0].id;
  vi.stubGlobal("document", {
    querySelector: (selector: string) =>
      selector === ".pane-layout-root"
        ? { getBoundingClientRect: () => bounds }
        : null,
    querySelectorAll: () => [
      {
        dataset: { paneDropTarget: paneId },
        getBoundingClientRect: () => bounds,
      },
    ],
  });
  const destination = dragDestination(
    workspace,
    resources[0].id,
    { x: 1300, y: 350 },
    false,
    resources,
  );
  expect(destination.placement).toEqual({
    paneId,
    edge: "right",
    rect: { left: 706, top: 50, width: 600, height: 600 },
  });
  const projected = projectResourceDrop(workspace, resources, paneId, "right")!;
  expect(projected.panes).toHaveLength(6);
  const committed = workspaceReducer(workspace, {
    type: "pane/drop-resource",
    tab: resources,
    paneId,
    edge: "right",
  });
  expect(committed.layout).toEqual(projected.layout);
});
