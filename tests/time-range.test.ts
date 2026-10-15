import { afterEach, expect, it, vi } from "vitest";
import { absoluteRange, rangeInputValue } from "../src/renderer/time-range";

afterEach(() => vi.unstubAllEnvs());

it("edits UTC wall times as UTC and preserves the same instant when displayed locally", () => {
  vi.stubEnv("TZ", "Europe/Madrid");
  const range = absoluteRange("2026-10-15T10:00", "2026-10-15T11:00", "utc");
  expect(range).toEqual({
    timePreset: "custom",
    customStart: "2026-10-15T10:00:00.000Z",
    customEnd: "2026-10-15T11:00:00.000Z",
  });
  expect(rangeInputValue(range.customStart, "utc")).toBe("2026-10-15T10:00:00");
  expect(rangeInputValue(range.customStart, "local")).toBe(
    "2026-10-15T12:00:00",
  );
  expect(
    absoluteRange("2026-10-15T12:00", "2026-10-15T13:00", "local"),
  ).toEqual(range);
});

it("keeps explicit-offset saved ranges and subsecond precision when switching timezones", () => {
  vi.stubEnv("TZ", "Europe/Madrid");
  expect(rangeInputValue("2026-10-15T10:00:00.123-04:00", "utc")).toBe(
    "2026-10-15T14:00:00.123",
  );
  expect(rangeInputValue("2026-10-15T10:00:00.123-04:00", "local")).toBe(
    "2026-10-15T16:00:00.123",
  );
  expect(rangeInputValue(undefined, "utc")).toBe("");
});

it("rejects incomplete, reversed, impossible and DST-gap ranges before committing", () => {
  vi.stubEnv("TZ", "Europe/Madrid");
  for (const [start, end, zone] of [
    ["", "2026-10-15T11:00", "utc"],
    ["2026-10-15T12:00", "2026-10-15T11:00", "utc"],
    ["2026-02-30T10:00", "2026-03-03T10:00", "utc"],
    ["2026-03-29T02:30", "2026-03-29T04:00", "local"],
  ] as const)
    expect(() => absoluteRange(start, end, zone)).toThrow();
});

it("preserves the untouched instant in a repeated local daylight-saving hour", () => {
  vi.stubEnv("TZ", "Europe/Madrid");
  const previous = {
    customStart: "2026-10-25T01:30:00.000Z",
    customEnd: "2026-10-25T02:30:00.000Z",
  };
  expect(
    absoluteRange(
      "2026-10-25T02:30:00",
      "2026-10-25T03:31:00",
      "local",
      previous,
    ),
  ).toEqual({
    timePreset: "custom",
    customStart: previous.customStart,
    customEnd: "2026-10-25T02:31:00.000Z",
  });
  const same = absoluteRange(
    "2026-10-25T02:30:00",
    "2026-10-25T03:30:00",
    "local",
    previous,
  );
  expect(same.customStart).toBe(previous.customStart);
  expect(same.customEnd).toBe(previous.customEnd);
});
