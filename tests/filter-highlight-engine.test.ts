import { expect, it } from "vitest";
import { highlightEvent } from "../src/renderer/highlight-engine";
import {
  filterHighlightSpans,
  packFilterEvidence,
} from "../src/renderer/filter-highlight-spans";
import type { LogEvent } from "../src/shared/contracts";

const event: LogEvent = {
  id: "match",
  timestamp: 1,
  message: '{"outer":{"status":503,"id":"needle"},"unrelated":"needle"}',
  logGroup: "group",
  logStream: "stream",
};
it("uses local regex and case options for evidence and match revisions without overview marks", () => {
  const filters = {
    server: "",
    local: "NEEDLE",
    localOptions: { regex: true },
  };
  const insensitive = highlightEvent(
    event,
    [],
    "light",
    [],
    "utc",
    false,
    "",
    filters,
  );
  expect(insensitive.filters?.local?.matched).toBe(true);
  const sensitive = highlightEvent(event, [], "light", [], "utc", false, "", {
    ...filters,
    localOptions: { regex: true, caseSensitive: true },
  });
  expect(sensitive.filters?.local?.matched).toBe(false);
  const literal = highlightEvent(event, [], "light", [], "utc", false, "", {
    ...filters,
    localOptions: { regex: false },
  });
  expect(insensitive.matchKey).not.toBe(literal.matchKey);
  expect(
    highlightEvent(event, [], "light", [], "utc", true, "", filters).overview,
  ).toEqual([]);
});
it("tracks field-specific filter evidence without marking every filtered event on the list overview", () => {
  const filters = {
    server: '{ $.outer.status >= 500 && $.outer.id = "needle" }',
    local: '@/outer/id="needle"',
  };
  const result = highlightEvent(
    event,
    [],
    "light",
    [],
    "utc",
    false,
    "needle",
    filters,
  );
  expect(result.paths!["/outer/id"]).toEqual(["server", "local", "manual"]);
  expect(result.paths!["/unrelated"]).toEqual(["manual"]);
  const overview = highlightEvent(
    event,
    [],
    "light",
    [],
    "utc",
    true,
    "",
    filters,
  );
  expect(overview.overview).toEqual([]);
  const manualOverview = highlightEvent(
    event,
    [],
    "light",
    [],
    "utc",
    true,
    "needle",
    filters,
  );
  expect(manualOverview.overview).toEqual(["var(--mantine-color-yellow-5)"]);
  expect(overview.filters).toBeUndefined();
  expect(overview.paths).toBeUndefined();
  expect(overview.matchKey).toBeUndefined();
});
it("maps decoded spans to escaped inspector text and keeps colliding key suffixes separate", () => {
  const raw = 'quoted "needle" text';
  const filters = {
    local: packFilterEvidence({
      supported: true,
      matched: true,
      matches: [{ path: "/value#key", text: raw, start: 7, end: 15 }],
      paths: ["/value#key"],
    }),
  };
  const text = JSON.stringify(raw);
  const spans = filterHighlightSpans(filters, "/value#key", text);
  expect(spans).toHaveLength(1);
  expect(text.slice(spans[0].start, spans[0].end)).toBe('\\"needle\\"');
  expect(filterHighlightSpans(filters, "@key/value", text)).toEqual([]);
});
it("packs repeated target strings once before worker transfer", () => {
  const text = "needle" + "x".repeat(20000);
  const packed = packFilterEvidence({
    supported: true,
    matched: true,
    paths: [],
    matches: Array.from({ length: 1000 }, () => ({
      path: "@message",
      text,
      start: 0,
      end: 6,
    })),
  });
  expect(packed.targets).toHaveLength(1);
  expect(packed.targets[0].ranges).toHaveLength(1000);
  expect(JSON.stringify(packed).length).toBeLessThan(40000);
});
it("never treats a truncated message boundary as an actual regex anchor", () => {
  const filters = { server: "%foo$%", local: "" };
  const message = "x".repeat(199997) + "foo" + "not-the-end";
  for (const overview of [false, true]) {
    const result = highlightEvent(
      { ...event, message },
      [],
      "light",
      [],
      "utc",
      overview,
      "",
      filters,
    );
    expect(result.filters?.server?.matched ?? false).toBe(false);
    expect(result.overview ?? []).not.toContain("var(--filter-match-server)");
    const workerResult = highlightEvent(
      { ...event, message: message.slice(0, 200000) },
      [],
      "light",
      [],
      "utc",
      overview,
      "",
      filters,
      false,
    );
    expect(workerResult.filters?.server?.matched ?? false).toBe(false);
    expect(workerResult.overview ?? []).not.toContain(
      "var(--filter-match-server)",
    );
  }
});
