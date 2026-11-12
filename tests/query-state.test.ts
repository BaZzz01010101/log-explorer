import { afterEach, expect, it, vi } from "vitest";
import {
  mergeEvents,
  resolveTimeRange,
  requestMatchesTab,
} from "../src/renderer/query-state";
import {
  createTab,
  createWorkspace,
  restoreWorkspace,
} from "../src/renderer/workspace";
const event = (id: string, timestamp = 0) => ({
  id,
  timestamp,
  message: id,
  logGroup: "/a",
  logStream: "s",
});
afterEach(() => vi.unstubAllEnvs());
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

it("keeps older pages when a recent-history window reaches its memory limit", () => {
  expect(mergeEvents([event("3", 3), event("4", 4)], [event("1", 1), event("2", 2)], 3, undefined, false, "newest")).toEqual({ events: [event("1", 1), event("2", 2), event("3", 3)], evicted: 1 });
});

it("keeps interleaved multi-source history, late pages and Live arrivals in timestamp order", () => {
  const sourceEvent = (
    id: string,
    timestamp: number,
    connectionId: string,
    logGroup: string,
  ) => ({ ...event(id, timestamp), connectionId, logGroup });
  const first = mergeEvents(
    [],
    [
      sourceEvent("a", 40, "west", "/one"),
      sourceEvent("b", 20, "east", "/two"),
      sourceEvent("c", 30, "west", "/one"),
    ],
    100,
  );
  expect(first.events.map((row) => row.timestamp)).toEqual([20, 30, 40]);
  const next = mergeEvents(
    first.events,
    [
      sourceEvent("d", 50, "east", "/two"),
      sourceEvent("e", 10, "west", "/one"),
      sourceEvent("c", 30, "west", "/one"),
    ],
    100,
  );
  expect(next.events.map((row) => row.timestamp)).toEqual([10, 20, 30, 40, 50]);
  const live = mergeEvents(
    next.events,
    [
      sourceEvent("f", 35, "east", "/two"),
      sourceEvent("g", 60, "west", "/one"),
    ],
    100,
  );
  expect(live.events.map((row) => row.timestamp)).toEqual([
    10, 20, 30, 35, 40, 50, 60,
  ]);
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
it("starts new tabs with a clear date filter without narrowing available history", () => {
  const tab = createTab("offline", [{ logGroup: "/old-logs" }]);
  expect(tab.timePreset).toBe("clear");
  expect(resolveTimeRange("clear", undefined, undefined, 2_000_000)).toEqual({
    startTime: 0,
    endTime: 2_000_000,
  });
  const saved = createWorkspace();
  saved.tabs[0].timePreset = "clear";
  expect(restoreWorkspace(saved).tabs[0].timePreset).toBe("clear");
  saved.tabs[0].timePreset = "15m";
  expect(restoreWorkspace(saved).tabs[0].timePreset).toBe("15m");
});
it.each([
  ["1m", 60000],
  ["42h", 42 * 3600000],
  ["3d", 3 * 86400000],
  ["2w", 14 * 86400000],
  ["30m", 30 * 60000],
  ["3h", 3 * 3600000],
  ["12h", 12 * 3600000],
])("resolves the restored %s preset", (preset, duration) => {
  const now = 2_000_000_000_000;
  expect(resolveTimeRange(String(preset), undefined, undefined, now)).toEqual({
    startTime: now - Number(duration),
    endTime: now,
  });
});
it("restores arbitrary valid relative ranges and rejects malformed persisted durations", () => {
  const saved = createWorkspace();
  for (const preset of ["1m", "42h", "3d", "9999w"]) {
    saved.tabs[0].timePreset = preset;
    expect(restoreWorkspace(saved).tabs[0].timePreset).toBe(preset);
  }
  for (const preset of ["0m", "10000w", "01h", "NaNm", "1y"]) {
    saved.tabs[0].timePreset = preset;
    expect(restoreWorkspace(saved).tabs[0].timePreset).toBe("1h");
    expect(() => resolveTimeRange(preset)).toThrow(/supported/);
  }
});
it("uses the actual local timezone for custom inputs and preserves explicit offsets", () => {
  vi.stubEnv("TZ", "Europe/Madrid");
  expect(
    resolveTimeRange("custom", "2026-10-14T10:00", "2026-10-14T11:00"),
  ).toEqual({
    startTime: Date.parse("2026-10-14T08:00:00Z"),
    endTime: Date.parse("2026-10-14T09:00:00Z"),
  });
  expect(
    resolveTimeRange(
      "custom",
      "2026-10-14T10:00-04:00",
      "2026-10-14T11:00-04:00",
    ),
  ).toEqual({
    startTime: Date.parse("2026-10-14T14:00:00Z"),
    endTime: Date.parse("2026-10-14T15:00:00Z"),
  });
});
it("rejects calendar dates and local daylight-saving times that JavaScript normalizes silently", () => {
  vi.stubEnv("TZ", "Europe/Madrid");
  expect(() =>
    resolveTimeRange("custom", "2026-02-30T10:00", "2026-03-03T10:00"),
  ).toThrow(/valid/);
  expect(() =>
    resolveTimeRange("custom", "2026-03-29T02:30", "2026-03-29T04:00"),
  ).toThrow(/valid/);
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
