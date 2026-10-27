import { expect, it } from "vitest";
import { captureSettingsPreview } from "../src/renderer/settings-preview";
import { createTab, createWorkspace } from "../src/renderer/workspace";
import type { TabRuntime } from "../src/renderer/useLogJobs";

const event = (id: string) => ({
  id,
  timestamp: 1,
  message: `message ${id}`,
  logGroup: "/aws/lambda/preview",
  logStream: "stream",
});
const runtime = (id: string): TabRuntime => ({
  state: "complete",
  live: false,
  evicted: 0,
  events: [event(id)],
});

it("captures the focused split pane, preserving its loaded events and view", () => {
  const workspace = createWorkspace();
  const second = createTab(workspace.connections[0].id, [
    { logGroup: "/aws/lambda/second" },
  ]);
  second.customTitle = "Focused service";
  workspace.tabs.push(second);
  workspace.panes.push({ id: "second", tabId: second.id });
  workspace.activePaneId = "second";
  const captured = captureSettingsPreview(workspace, {
    [workspace.tabs[0].id]: runtime("first"),
    [second.id]: runtime("second"),
  });
  expect(captured?.tabId).toBe(second.id);
  expect(captured?.label).toBe("Focused service");
  expect(captured?.events.map((event) => event.id)).toEqual(["second"]);
  expect(captured?.view).toEqual(second.view);
});

it("owns independent event, column and source copies so preview editing cannot mutate the tab", () => {
  const workspace = createWorkspace(),
    tab = workspace.tabs[0],
    loaded = runtime("original");
  const originalWidth = tab.view.columns[0].width;
  const captured = captureSettingsPreview(workspace, { [tab.id]: loaded })!;
  loaded.events[0].message = "later LIVE update";
  loaded.events.push(event("new"));
  expect(captured.events).toHaveLength(1);
  expect(captured.events[0].message).toBe("message original");
  captured.view.columns[0].width = 999;
  captured.sourceContext.sources[0].logGroup = "preview only";
  expect(tab.view.columns[0].width).toBe(originalWidth);
  expect(tab.sources[0].logGroup).not.toBe("preview only");
});

it("does not invent events or select another tab when the active pane is empty", () => {
  const workspace = createWorkspace();
  expect(captureSettingsPreview(workspace, {})?.events).toEqual([]);
  workspace.panes[0].tabId = null;
  expect(captureSettingsPreview(workspace, {})).toBeNull();
});

it("uses the sources of displayed results when a newer source selection has not finished querying", () => {
  const workspace = createWorkspace(),
    tab = workspace.tabs[0],
    loaded = runtime("old-query");
  const connection = {
    ...workspace.connections[0],
    id: "previous-connection",
    region: "eu-west-2",
  };
  loaded.request = {
    requestId: "previous",
    connection,
    sources: [{ logGroup: "/previous/results" }],
    startTime: 0,
    endTime: 2,
    kind: "events",
    filterPattern: "",
    query: "",
    limit: 100,
  };
  const captured = captureSettingsPreview(workspace, { [tab.id]: loaded })!;
  expect(captured.sourceContext.connectionId).toBe("previous-connection");
  expect(captured.sourceContext.sources).toEqual([
    { logGroup: "/previous/results" },
  ]);
  expect(captured.sourceContext.connections).toEqual([connection]);
});
