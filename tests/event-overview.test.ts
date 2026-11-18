import { describe, expect, it } from "vitest";
import {
  QUICK_MAP_COLOR,
  SELECTION_MAP_COLOR,
  buildOverviewMarks,
  rowMatchesMark,
} from "../src/renderer/event-overview";
import { highlightEvent } from "../src/renderer/highlight-engine";
import type { HighlightProfile } from "../src/shared/highlights";

const even = (count: number, size = 40) =>
  Array.from({ length: count }, (_, index) => ({
    start: index * size,
    size,
  }));

describe("event scrollbar overview", () => {
  it("scales full event areas and joins three consecutive error rows without false gaps", () => {
    const rows = ["info", "error", "error", "error", "info"].map(
      (level, index) => ({ id: String(index), level, colors: [] }),
    );
    const marks = buildOverviewMarks(rows, even(5), 200, 100);
    expect(marks.highlights).toMatchObject([
      { index: 1, endIndex: 3, top: 20, height: 60, kind: "severity" },
    ]);
    expect(marks.quick).toEqual([]);
  });
  it("gives a taller event its proportional share and preserves real gaps between errors", () => {
    const rows = ["error", "info", "error"].map((level, index) => ({
      id: String(index),
      level,
      colors: [],
    }));
    const marks = buildOverviewMarks(
      rows,
      [
        { start: 0, size: 40 },
        { start: 40, size: 120 },
        { start: 160, size: 40 },
      ],
      200,
      100,
    );
    expect(marks.highlights).toMatchObject([
      { top: 0, height: 20 },
      { top: 80, height: 20 },
    ]);
  });
  it("shows only custom highlight text matches in the left lane", () => {
    const rows = [
      { id: "quick-error", level: "error", colors: [], quick: true },
      { id: "configured", level: "info", colors: ["#111111"] },
      { id: "quick-info", level: "info", colors: [], quick: true },
      { id: "plain", level: "info", colors: [] },
    ];
    const marks = buildOverviewMarks(rows, even(4), 160, 80);
    expect(
      marks.quick.map(({ id, kind, colors }) => ({ id, kind, colors })),
    ).toEqual([
      { id: "quick-error", kind: "quick", colors: [QUICK_MAP_COLOR] },
      { id: "quick-info", kind: "quick", colors: [QUICK_MAP_COLOR] },
    ]);
    expect(
      marks.highlights.map(({ id, kind, colors }) => ({ id, kind, colors })),
    ).toEqual([
      {
        id: "quick-error",
        kind: "severity",
        colors: ["var(--mantine-color-red-6)"],
      },
      { id: "configured", kind: "highlight", colors: ["#111111"] },
    ]);
  });
  it("marks selected rows in light blue beside highlight text matches in the left lane", () => {
    const rows = [
      { id: "selected", level: "info", colors: [], selected: true },
      { id: "both", level: "info", colors: [], quick: true, selected: true },
      { id: "quick", level: "info", colors: [], quick: true },
    ];
    const marks = buildOverviewMarks(rows, even(3), 120, 60);
    expect(
      marks.quick.map(({ id, kind, colors }) => ({ id, kind, colors })),
    ).toEqual([
      { id: "selected", kind: "selection", colors: [SELECTION_MAP_COLOR] },
      {
        id: "both",
        kind: "quick",
        colors: [QUICK_MAP_COLOR, SELECTION_MAP_COLOR],
      },
      { id: "quick", kind: "quick", colors: [QUICK_MAP_COLOR] },
    ]);
    expect(marks.highlights).toEqual([]);
    // On a shared pixel both colors show, and each row matches its own color.
    const shared = buildOverviewMarks(
      [rows[0], rows[2]],
      even(2, 1),
      100,
      1,
    ).quick;
    expect(shared).toMatchObject([
      { kind: "quick", colors: [QUICK_MAP_COLOR, SELECTION_MAP_COLOR] },
    ]);
    expect(
      [rows[0], rows[2]].every((row) => rowMatchesMark(row, shared[0])),
    ).toBe(true);
    expect(
      rowMatchesMark({ id: "plain", level: "info", colors: [] }, shared[0]),
    ).toBe(false);
  });
  it("lets configured highlights override fixed levels on a shared pixel in either order", () => {
    for (const order of [
      ["fatal", "configured"],
      ["configured", "fatal"],
    ]) {
      const rows = order.map((id) =>
        id === "fatal"
          ? { id, level: "fatal", colors: [] }
          : { id, level: "info", colors: ["#222222"] },
      );
      const marks = buildOverviewMarks(rows, even(2, 1), 100, 1);
      expect(marks.highlights, order.join()).toMatchObject([
        { id: "configured", kind: "highlight", colors: ["#222222"] },
      ]);
      const mark = marks.highlights[0];
      expect(rows.filter((row) => rowMatchesMark(row, mark))).toEqual([
        rows.find((row) => row.id === "configured"),
      ]);
    }
  });
  it("maps literal highlights in decoded values and formatted columns as they appear in the viewer", () => {
    const event = {
      id: "e",
      timestamp: Date.parse("2026-02-27T10:00:00Z"),
      logGroup: "orders",
      logStream: "stream",
      message: '{"message":"\\u0068otspot","size":1024}',
    };
    for (const [needle, columns] of [
      ["hotspot", []],
      ["1 KiB", [{ path: "/size", width: 100, format: "bytes" }]],
      ["2026", [{ path: "@timestamp", width: 100, format: "datetime" }]],
    ] as const) {
      const result = highlightEvent(
        event,
        [],
        "light",
        [...columns],
        "utc",
        true,
        needle,
      );
      expect(result.quickMatch, needle).toBe(true);
      // Highlight text has its own lane, so it adds no Settings color.
      expect(result.overview, needle).toEqual([]);
    }
  });
  it("places markers using measured event heights and keeps the most severe collision", () => {
    const rows = [
      { id: "warning", level: "warn", colors: [] },
      { id: "error", level: "error", colors: [] },
      { id: "fatal", level: "fatal", colors: [] },
      { id: "configured", level: "info", colors: ["#123456"] },
      { id: "info", level: "info", colors: [] },
    ];
    const measurements = [
      { start: 0, size: 600 },
      { start: 600, size: 1 },
      { start: 601, size: 1 },
      { start: 700, size: 10 },
      { start: 710, size: 290 },
    ];
    const marks = buildOverviewMarks(rows, measurements, 1000, 100);
    expect(
      marks.highlights.map(({ id, top, colors }) => ({ id, top, colors })),
    ).toEqual([
      { id: "warning", top: 0, colors: ["var(--mantine-color-yellow-6)"] },
      { id: "fatal", top: 60, colors: ["var(--mantine-color-pink-6)"] },
      { id: "configured", top: 70, colors: ["#123456"] },
    ]);
  });
  it("follows the displayed order, clamps the last marker, and handles empty layouts", () => {
    expect(buildOverviewMarks([], [], 0, 0)).toEqual({
      quick: [],
      highlights: [],
    });
    const marks = buildOverviewMarks(
      [{ id: "last", level: "error", colors: ["red"], quick: true }],
      [{ start: 990, size: 10 }],
      1000,
      100,
    );
    for (const lane of [marks.highlights, marks.quick])
      expect(lane[0]).toMatchObject({
        id: "last",
        index: 0,
        top: 99,
        height: 1,
      });
  });
  it("bounds dense marker output to the track and preserves distinct highlight colors", () => {
    const rows = Array.from({ length: 10000 }, (_, i) => ({
      id: String(i),
      level: "error",
      colors: [i % 2 ? "red" : "blue"],
      quick: i % 3 === 0,
    }));
    const marks = buildOverviewMarks(
      rows,
      rows.map((_, i) => ({ start: i, size: 1 })),
      10000,
      90,
    );
    expect(marks.highlights).toHaveLength(1);
    expect(marks.highlights[0]).toMatchObject({
      top: 0,
      height: 90,
      kind: "highlight",
      endIndex: 9999,
    });
    expect(marks.highlights[0].colors).toEqual(["blue", "red"]);
    expect(marks.quick).toHaveLength(1);
    expect(marks.quick[0]).toMatchObject({ top: 0, height: 90 });
  });
  it("summarizes scoped structured/text rules with theme colors without building text spans", () => {
    const profiles: HighlightProfile[] = [
      {
        id: "p",
        name: "p",
        enabled: true,
        groupPattern: "orders$",
        groupIgnoreCase: false,
        rules: [
          {
            id: "r",
            enabled: true,
            scope: "structured",
            path: "/status",
            pattern: "^bad$",
            ignoreCase: false,
            target: "text",
            colors: { background: "#ff0000" },
            separateThemeColors: true,
            darkColors: { foreground: "#00ff00" },
            lightColors: { background: "#0000ff" },
          },
        ],
      },
    ];
    const event = {
      id: "a",
      timestamp: 0,
      logGroup: "orders",
      logStream: "stream",
      message: '{"status":"bad","message":"ok"}',
    };
    expect(highlightEvent(event, profiles, "dark", [], "utc", true)).toEqual({
      row: {},
      text: {},
      overview: ["#00ff00"],
    });
    expect(
      highlightEvent(event, profiles, "light", [], "utc", true).overview,
    ).toEqual(["#0000ff"]);
    expect(
      highlightEvent(
        { ...event, logGroup: "other" },
        profiles,
        "light",
        [],
        "utc",
        true,
      ).overview,
    ).toEqual([]);
    profiles[0].enabled = false;
    expect(
      highlightEvent(event, profiles, "light", [], "utc", true).overview,
    ).toEqual([]);
  });
  it("uses the effective row color when later matching row rules overlap", () => {
    const rule = {
      id: "first",
      enabled: true,
      scope: "text" as const,
      path: "",
      pattern: "error",
      ignoreCase: false,
      target: "row" as const,
      colors: { background: "#aa0000" },
      separateThemeColors: false,
    };
    const profiles: HighlightProfile[] = [
      {
        id: "p",
        name: "p",
        enabled: true,
        groupPattern: "",
        groupIgnoreCase: false,
        rules: [
          rule,
          { ...rule, id: "second", colors: { background: "#00aa00" } },
        ],
      },
    ];
    expect(
      highlightEvent(
        {
          id: "e",
          timestamp: 0,
          logGroup: "g",
          logStream: "s",
          message: "error",
        },
        profiles,
        "dark",
        [],
        "utc",
        true,
      ).overview,
    ).toEqual(["#aa0000"]);
  });
  it("does not mark events for text rules that only match empty strings", () => {
    const profiles: HighlightProfile[] = [
      {
        id: "p",
        name: "p",
        enabled: true,
        groupPattern: "",
        groupIgnoreCase: false,
        rules: [
          {
            id: "r",
            enabled: true,
            scope: "text",
            path: "",
            pattern: "^",
            target: "text",
            ignoreCase: false,
            colors: { foreground: "#abcdef" },
            separateThemeColors: false,
          },
        ],
      },
    ];
    expect(
      highlightEvent(
        {
          id: "e",
          timestamp: 0,
          logGroup: "g",
          logStream: "s",
          message: "text",
        },
        profiles,
        "dark",
        [],
        "utc",
        true,
      ).overview,
    ).toEqual([]);
  });
});
