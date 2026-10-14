import { expect, it } from "vitest";
import {
  mergeEvents,
  resolveTimeRange,
  requestMatchesTab,
} from "../src/renderer/query-state";
import { createWorkspace } from "../src/renderer/workspace";
const event = (id: string, timestamp = 0) => ({
  id,
  timestamp,
  message: id,
  logGroup: "/a",
  logStream: "s",
});
it("bounds raw text memory even when event count is below its limit", () => {
  const events = ["1", "2", "3"].map((id) => ({
    ...event(id),
    message: "x".repeat(40),
  }));
  expect(mergeEvents([], events, 1000, 100)).toEqual({
    events: events.slice(1),
    evicted: 1,
  });
});
it("deduplicates overlapping pages and bounds live memory", () => {
  expect(
    mergeEvents([event("1"), event("2")], [event("2"), event("3")], 2),
  ).toEqual({ events: [event("2"), event("3")], evicted: 1 });
});
it("never silently accepts an invalid custom time range", () => {
  expect(() =>
    resolveTimeRange("custom", "2026-10-13T10:00", "2026-10-12T10:00"),
  ).toThrow(/after/);
  expect(() => resolveTimeRange("custom", "", "")).toThrow(/valid/);
});
it("derives relative ranges at execution time", () => {
  expect(resolveTimeRange("15m", undefined, undefined, 2_000_000)).toEqual({
    startTime: 1_100_000,
    endTime: 2_000_000,
  });
});
it("marks changed server filters and time ranges stale without including local view settings", () => {
  const workspace = createWorkspace();
  const tab = workspace.tabs[0];
  const connection = workspace.connections[0];
  const request = {
    requestId: "q",
    connection,
    sources: tab.sources,
    ...resolveTimeRange(tab.timePreset),
    kind: tab.kind,
    filterPattern: tab.filterPattern,
    query: tab.query,
    limit: 1000,
  };
  expect(
    requestMatchesTab(
      request,
      { ...tab, view: { ...tab.view, localSearch: "error" } },
      connection,
    ),
  ).toBe(true);
  expect(
    requestMatchesTab(request, { ...tab, filterPattern: "error" }, connection),
  ).toBe(false);
  expect(
    requestMatchesTab(request, { ...tab, timePreset: "7d" }, connection),
  ).toBe(false);
  expect(
    requestMatchesTab(request, tab, { ...connection, region: "us-east-1" }),
  ).toBe(false);
});
