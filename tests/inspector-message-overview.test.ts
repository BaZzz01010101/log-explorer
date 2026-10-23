import { expect, it } from "vitest";
import {
  buildInspectorMessageMarks,
  nearestInspectorMessageMatch,
} from "../src/renderer/inspector-message-overview";

it("projects rendered fragment offsets against full scroll height in separate origin lanes", () => {
  const marks = buildInspectorMessageMarks(
    [
      { origin: "server", start: 200, end: 220, color: "blue" },
      { origin: "manual", start: 220, end: 240, color: "gold" },
      { origin: "profile", start: 800, end: 840, color: "pink" },
    ],
    1000,
    100,
  );
  expect(
    marks.map(({ origin, top, height }) => ({ origin, top, height })),
  ).toEqual([
    { origin: "server", top: 20, height: 2 },
    { origin: "manual", top: 22, height: 2 },
    { origin: "profile", top: 80, height: 4 },
  ]);
});

it("bounds dense map output by track pixels and retains overlapping profile colors", () => {
  const matches = Array.from({ length: 20000 }, (_, index) => ({
    origin: "profile" as const,
    start: index,
    end: index + 1,
    color: index % 2 ? "red" : "blue",
  }));
  const marks = buildInspectorMessageMarks(matches, 20000, 300);
  expect(marks.length).toBeLessThanOrEqual(300);
  expect(
    marks.every(
      (mark) => mark.colors.includes("red") && mark.colors.includes("blue"),
    ),
  ).toBe(true);
  expect(marks[0].contentStart).toBe(0);
  expect(marks.at(-1)?.contentEnd).toBe(20000);
});

it("ignores hidden or invalid fragments and clamps visible fragments to the track", () => {
  const marks = buildInspectorMessageMarks(
    [
      { origin: "local", start: 100, end: 100, color: "green" },
      { origin: "local", start: NaN, end: 120, color: "green" },
      { origin: "local", start: -20, end: 10, color: "green" },
      { origin: "manual", start: 990, end: 1020, color: "gold" },
    ],
    1000,
    100,
  );
  expect(marks.map(({ top, height }) => ({ top, height }))).toEqual([
    { top: 0, height: 1 },
    { top: 99, height: 1 },
  ]);
  expect(buildInspectorMessageMarks([], 0, 100)).toEqual([]);
});

it("navigates to the nearest actual rendered fragment within the selected origin", () => {
  const matches = [
    { origin: "server" as const, start: 100, end: 120, color: "blue" },
    { origin: "local" as const, start: 700, end: 720, color: "green" },
    { origin: "server" as const, start: 800, end: 820, color: "blue" },
  ];
  expect(
    nearestInspectorMessageMatch(matches, "server", 73, 1000, 100)?.start,
  ).toBe(800);
  expect(
    nearestInspectorMessageMatch(matches, "server", 11, 1000, 100)?.start,
  ).toBe(100);
  expect(
    nearestInspectorMessageMatch(matches, "manual", 11, 1000, 100),
  ).toBeUndefined();
});
