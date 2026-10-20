import { describe, expect, it } from "vitest";
import { buildOverviewMarks } from "../src/renderer/event-overview";
import { highlightEvent } from "../src/renderer/highlight-engine";
import type { HighlightProfile } from "../src/shared/highlights";

describe("event scrollbar overview", () => {
  it("scales full event areas and joins three consecutive error rows without false gaps", () => {
    const rows = ["info", "error", "error", "error", "info"].map(
      (level, index) => ({
        id: String(index),
        level,
        colors: index > 0 && index < 4 ? ["#aa00cc"] : [],
      }),
    );
    const marks = buildOverviewMarks(
      rows,
      rows.map((_, index) => ({ start: index * 40, size: 40 })),
      200,
      100,
    );
    expect(marks.severity).toMatchObject([{ index: 1, top: 20, height: 60 }]);
    expect(marks.highlights).toMatchObject([
      { index: 1, top: 20, height: 60, colors: ["#aa00cc"] },
    ]);
    expect(marks.severity).toHaveLength(1);
    expect(marks.highlights).toHaveLength(1);
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
    expect(marks.severity).toMatchObject([
      { top: 0, height: 20 },
      { top: 80, height: 20 },
    ]);
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
      expect(
        highlightEvent(event, [], "light", [...columns], "utc", true, needle)
          .overview,
        needle,
      ).toContain("var(--mantine-color-yellow-5)");
    }
  });
  it("places markers using measured event heights and keeps the most severe collision", () => {
    const rows = [
      { id: "warning", level: "warn", colors: [] },
      { id: "error", level: "error", colors: ["#123456"] },
      { id: "fatal", level: "fatal", colors: ["#abcdef"] },
      { id: "info", level: "info", colors: [] },
    ];
    const measurements = [
      { start: 0, size: 600 },
      { start: 600, size: 1 },
      { start: 601, size: 1 },
      { start: 602, size: 398 },
    ];
    const marks = buildOverviewMarks(rows, measurements, 1000, 100);
    expect(
      marks.severity.map(({ id, top, colors }) => ({ id, top, colors })),
    ).toEqual([
      { id: "warning", top: 0, colors: ["var(--mantine-color-yellow-6)"] },
      { id: "fatal", top: 60, colors: ["var(--mantine-color-pink-6)"] },
    ]);
    expect(marks.highlights).toMatchObject([
      { top: 60, colors: ["#123456", "#abcdef"] },
    ]);
  });
  it("follows the displayed order, clamps the last marker, and handles empty layouts", () => {
    expect(buildOverviewMarks([], [], 0, 0)).toEqual({
      severity: [],
      highlights: [],
    });
    const marks = buildOverviewMarks(
      [{ id: "last", level: "error", colors: ["red"] }],
      [{ start: 990, size: 10 }],
      1000,
      100,
    );
    expect(marks.highlights[0]).toMatchObject({
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
    }));
    const marks = buildOverviewMarks(
      rows,
      rows.map((_, i) => ({ start: i, size: 1 })),
      10000,
      90,
    );
    expect(marks.severity).toHaveLength(1);
    expect(marks.severity[0]).toMatchObject({ top: 0, height: 90 });
    expect(marks.severity[0].endIndex).toBe(9999);
    expect(marks.highlights).toHaveLength(1);
    expect(marks.highlights[0]).toMatchObject({ top: 0, height: 90 });
    expect(marks.highlights[0].colors).toEqual(["blue", "red"]);
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
