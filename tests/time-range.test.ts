import { afterEach, expect, it, vi } from "vitest";
import {
  absoluteRange,
  absoluteRangeFromFields,
  calendarMonthDays,
  parseRelativePreset,
  rangeInputFields,
  rangeInputValue,
  relativePreset,
  shiftCalendarDay,
  shiftCalendarMonth,
  stepDateTimeSegment,
} from "../src/renderer/time-range";

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

it("parses and validates arbitrary bounded relative durations", () => {
  expect(parseRelativePreset("9999w")).toEqual({ duration: 9999, unit: "w" });
  expect(relativePreset(42, "h")).toBe("42h");
  for (const preset of ["0m", "01h", "10000d", "1.5w", "2y", "custom"])
    expect(parseRelativePreset(preset)).toBeNull();
  for (const duration of [0, 10000, 1.5, NaN])
    expect(() => relativePreset(duration, "m")).toThrow();
});

it("moves calendar days and months using calendar arithmetic through leap years", () => {
  vi.stubEnv("TZ", "Europe/Madrid");
  expect(shiftCalendarDay("2026-03-29", 1)).toBe("2026-03-30");
  expect(shiftCalendarDay("2024-03-01", -1)).toBe("2024-02-29");
  expect(shiftCalendarMonth("2024-01-31", 1)).toBe("2024-02-29");
  expect(shiftCalendarMonth("2026-01-31", 1)).toBe("2026-02-28");
  expect(shiftCalendarMonth("2026-12-31", 1)).toBe("2027-01-31");
  const days = calendarMonthDays("2026-10-15");
  expect(days).toHaveLength(42);
  expect(days[0]).toBe("2026-09-27");
  expect(days[41]).toBe("2026-11-07");
});

it.each(["0001-01-01", "9999-12-01"])(
  "leaves cells outside supported years blank in the %s calendar",
  (day) => {
    const days = calendarMonthDays(day);
    const dates = days.filter(Boolean);
    expect(days).toHaveLength(42);
    expect(new Set(dates).size).toBe(dates.length);
    expect(
      dates.filter((date) => date.slice(0, 7) === day.slice(0, 7)),
    ).toHaveLength(31);
    if (day.startsWith("0001")) {
      expect(days[0]).toBe("");
      expect(days[1]).toBe("0001-01-01");
    } else {
      expect(days.at(-1)).toBe("");
      expect(dates.at(-1)).toBe("9999-12-31");
    }
  },
);

it("steps the selected date segment and clips month-end and leap-day values", () => {
  expect(stepDateTimeSegment("2024/02/29", "date", 1, 1)).toEqual({
    value: "2025/02/28",
    selectionStart: 0,
    selectionEnd: 4,
  });
  expect(stepDateTimeSegment("2026/01/31", "date", 5, 1)).toEqual({
    value: "2026/02/28",
    selectionStart: 5,
    selectionEnd: 7,
  });
  expect(stepDateTimeSegment("2026/12/31", "date", 8, 1)).toEqual({
    value: "2027/01/01",
    selectionStart: 8,
    selectionEnd: 10,
  });
  expect(stepDateTimeSegment("2026/02/30", "date", 8, 1)).toBeNull();
});

it("wraps a selected time segment without carrying into its neighbors", () => {
  expect(stepDateTimeSegment("23:59:59", "time", 0, 1)).toEqual({
    value: "00:59:59",
    selectionStart: 0,
    selectionEnd: 2,
  });
  expect(stepDateTimeSegment("12:59:59", "time", 3, 1)).toEqual({
    value: "12:00:59",
    selectionStart: 3,
    selectionEnd: 5,
  });
  expect(stepDateTimeSegment("12:00:00", "time", 6, -1)).toEqual({
    value: "12:00:59",
    selectionStart: 6,
    selectionEnd: 8,
  });
  expect(stepDateTimeSegment("24:00:00", "time", 0, 1)).toBeNull();
});

it("bounds duration wheel edits and keeps the full number selected", () => {
  expect(stepDateTimeSegment("1", "duration", 0, -1)).toEqual({
    value: "1",
    selectionStart: 0,
    selectionEnd: 1,
  });
  expect(stepDateTimeSegment("9999", "duration", 3, 1)).toEqual({
    value: "9999",
    selectionStart: 0,
    selectionEnd: 4,
  });
  expect(stepDateTimeSegment("9", "duration", 0, 1)).toEqual({
    value: "10",
    selectionStart: 0,
    selectionEnd: 2,
  });
  expect(stepDateTimeSegment("", "duration", 0, 1)).toBeNull();
});

it("assembles inclusive local calendar days across 23-hour and 25-hour days", () => {
  vi.stubEnv("TZ", "Europe/Madrid");
  for (const [date, hours] of [
    ["2026/03/29", 23],
    ["2026/10/25", 25],
  ] as const) {
    const range = absoluteRangeFromFields(
      { date, time: "00:00:00" },
      { date, time: "23:59:59" },
      "local",
      { inclusiveEnd: true },
    );
    expect(
      Date.parse(range.customEnd!) - Date.parse(range.customStart!) + 1,
    ).toBe(hours * 3600000);
    expect(range.customEnd).toMatch(/\.999Z$/);
  }
  expect(
    absoluteRangeFromFields(
      { date: "2026/10/15", time: "00:00:00" },
      { date: "2026/10/15", time: "23:59:59" },
      "utc",
    ).customEnd,
  ).toBe("2026-10-15T23:59:59.000Z");
});

it("retains untouched canonical bounds despite second-only display and repeated local hours", () => {
  vi.stubEnv("TZ", "Europe/Madrid");
  const previous = {
    customStart: "2026-10-25T01:30:00.123Z",
    customEnd: "2026-10-25T02:30:00.456Z",
  };
  const start = rangeInputFields(previous.customStart, "local");
  const end = rangeInputFields(previous.customEnd, "local");
  expect(start).toEqual({ date: "2026/10/25", time: "02:30:00" });
  expect(absoluteRangeFromFields(start, end, "local", { previous })).toEqual({
    timePreset: "custom",
    ...previous,
  });
  expect(
    absoluteRangeFromFields(start, { ...end, time: "03:31:00" }, "local", {
      previous,
    }),
  ).toEqual({
    timePreset: "custom",
    customStart: previous.customStart,
    customEnd: "2026-10-25T02:31:00.000Z",
  });
  expect(() =>
    absoluteRangeFromFields(
      { date: "2026/02/30", time: "10:00:00" },
      end,
      "utc",
    ),
  ).toThrow();
});
