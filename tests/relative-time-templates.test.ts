import { expect, it } from "vitest";
import {
  normalizeRelativeTimeTemplates,
  updateRelativeTimeSlot,
} from "../src/shared/relative-time-templates";

it("migrates arbitrary templates to sorted fixed slots by scale", () => {
  const templates = normalizeRelativeTimeTemplates({
    quick: [],
    dropdown: [
      {
        id: "long",
        label: "Two weeks",
        duration: 2,
        unit: "w",
        ignored: true,
      },
      { id: "short", label: "Break", duration: 20, unit: "m" },
    ],
  });
  expect(
    templates.dropdown
      .filter((entry) => entry.unit === "m")
      .map((entry) => entry.duration),
  ).toEqual([5, 10, 15, 20, 30]);
  expect(templates.dropdown.map((entry) => entry.unit).join("")).toBe(
    "mmmmmhhhhhhddddddwwww",
  );
  expect(
    templates.quick.map((entry) => `${entry.duration}${entry.unit}`),
  ).toEqual(["1m", "5m", "30m", "1h", "12h", "1d"]);
  expect(templates.dropdown.find((entry) => entry.duration === 20)?.label).toBe(
    "Last 20 minutes",
  );
});

it("rejects invalid durations, units and duplicate IDs while retaining valid templates", () => {
  const valid = { id: "good", label: "Shift", duration: 8, unit: "h" };
  const value = normalizeRelativeTimeTemplates({
    quick: [
      valid,
      { ...valid, label: "Duplicate" },
      { ...valid, id: "zero", duration: 0 },
      { ...valid, id: "fraction", duration: 1.5 },
      { ...valid, id: "too-long", duration: 10000 },
      { ...valid, id: "bad-unit", unit: "months" },
      { ...valid, id: "array-unit", unit: ["m"] },
    ],
    dropdown: [],
  });
  expect(
    value.quick
      .filter((entry) => entry.unit === "h")
      .map((entry) => entry.duration),
  ).toEqual([1, 8]);
  expect(value.quick).toHaveLength(6);
  expect(value.dropdown).toHaveLength(21);
});

it("uses independent default copies for missing template sections", () => {
  const first = normalizeRelativeTimeTemplates(undefined);
  first.quick[0].label = "Changed";
  const next = normalizeRelativeTimeTemplates({ dropdown: [] });
  expect(next.quick[0]).toEqual({
    id: "quick-1m",
    label: "1m",
    duration: 1,
    unit: "m",
  });
  expect(next.dropdown).toHaveLength(21);
});

it("retains configured values before filling missing slots and trims extras", () => {
  const value = normalizeRelativeTimeTemplates({
    dropdown: [50, 10, 40, 20, 60, 30].map((duration) => ({
      id: String(duration),
      label: "Old",
      duration,
      unit: "m",
    })),
  });
  expect(value.dropdown.slice(0, 5).map((entry) => entry.duration)).toEqual([
    10, 20, 30, 40, 50,
  ]);
  expect(normalizeRelativeTimeTemplates(value)).toEqual(value);
});

it.each([
  [1, 40, [5, 40, 41, 42, 45]],
  [3, 2, [1, 2, 3, 4, 45]],
  [1, 9999, [5, 9996, 9997, 9998, 9999]],
  [3, -10, [1, 2, 3, 4, 45]],
])(
  "anchors edited slot %s at %s and pushes only colliding neighbors",
  (index, duration, expected) => {
    const before = normalizeRelativeTimeTemplates(undefined);
    const after = updateRelativeTimeSlot(
      before,
      "dropdown",
      "m",
      index,
      duration,
    );
    expect(after.dropdown.slice(0, 5).map((entry) => entry.duration)).toEqual(
      expected,
    );
    expect(after.dropdown.slice(5)).toEqual(before.dropdown.slice(5));
    expect(after.quick).toEqual(before.quick);
    expect(before.dropdown.slice(0, 5).map((entry) => entry.duration)).toEqual([
      5, 10, 15, 30, 45,
    ]);
  },
);
