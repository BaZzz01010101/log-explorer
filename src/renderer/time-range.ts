import type { LogTab, Preferences } from "../shared/contracts";
import {
  parseRangeTime,
  parseRelativePreset,
  resolveTimeRange,
  type RelativeUnit,
} from "./query-state";
export { parseRelativePreset, type RelativeUnit } from "./query-state";

export const RELATIVE_RANGES = [
  ["5m", "Last 5 minutes"],
  ["15m", "Last 15 minutes"],
  ["30m", "Last 30 minutes"],
  ["1h", "Last hour"],
  ["3h", "Last 3 hours"],
  ["6h", "Last 6 hours"],
  ["12h", "Last 12 hours"],
  ["24h", "Last 24 hours"],
  ["7d", "Last 7 days"],
] as const;

export function rangeInputValue(
  value: string | undefined,
  timezone: Preferences["timezone"],
): string {
  const instant = parseRangeTime(value);
  if (!Number.isFinite(instant)) return "";
  const date = new Date(instant);
  const fields =
    timezone === "utc"
      ? [
          date.getUTCFullYear(),
          date.getUTCMonth() + 1,
          date.getUTCDate(),
          date.getUTCHours(),
          date.getUTCMinutes(),
          date.getUTCSeconds(),
          date.getUTCMilliseconds(),
        ]
      : [
          date.getFullYear(),
          date.getMonth() + 1,
          date.getDate(),
          date.getHours(),
          date.getMinutes(),
          date.getSeconds(),
          date.getMilliseconds(),
        ];
  const [year, month, day, hour, minute, second, ms] = fields.map(
    (part, index) =>
      String(part).padStart(index === 0 ? 4 : index === 6 ? 3 : 2, "0"),
  );
  return `${year}-${month}-${day}T${hour}:${minute}:${second}${Number(ms) ? `.${ms}` : ""}`;
}

export function absoluteRange(
  start: string,
  end: string,
  timezone: Preferences["timezone"],
  previous?: Pick<LogTab, "customStart" | "customEnd">,
): Pick<LogTab, "timePreset" | "customStart" | "customEnd"> {
  // An unchanged wall time can name either occurrence of a repeated DST hour.
  // Keep its original offset instead of reinterpreting the untouched bound.
  const instant = (value: string, original: string | undefined) =>
    original && value === rangeInputValue(original, timezone)
      ? original
      : value
        ? value + (timezone === "utc" ? "Z" : "")
        : "";
  const range = resolveTimeRange(
    "custom",
    instant(start, previous?.customStart),
    instant(end, previous?.customEnd),
  );
  return {
    timePreset: "custom",
    customStart: new Date(range.startTime).toISOString(),
    customEnd: new Date(range.endTime).toISOString(),
  };
}

export type DateTimeFields = { date: string; time: string };

export function relativePreset(duration: number, unit: RelativeUnit): string {
  const preset = `${duration}${unit}`;
  if (!parseRelativePreset(preset))
    throw new Error("Choose a duration from 1 to 9999");
  return preset;
}

export function rangeInputFields(
  value: string | undefined,
  timezone: Preferences["timezone"],
): DateTimeFields {
  const input = rangeInputValue(value, timezone);
  return {
    date: input.slice(0, 10).replaceAll("-", "/"),
    time: input.slice(11, 19),
  };
}

export function absoluteRangeFromFields(
  start: DateTimeFields,
  end: DateTimeFields,
  timezone: Preferences["timezone"],
  options: {
    previous?: Pick<LogTab, "customStart" | "customEnd">;
    inclusiveEnd?: boolean;
  } = {},
): Pick<LogTab, "timePreset" | "customStart" | "customEnd"> {
  const input = (
    fields: DateTimeFields,
    original: string | undefined,
    inclusive = false,
  ) => {
    if (!/^\d{4}\/\d{2}\/\d{2}$/.test(fields.date) || !validTime(fields.time))
      throw new Error("Choose valid start and end times");
    calendarDate(fields.date.replaceAll("/", "-"));
    const wallTime = `${fields.date.replaceAll("/", "-")}T${fields.time}`;
    if (inclusive && fields.time === "23:59:59") return wallTime + ".999";
    const unchanged = rangeInputFields(original, timezone);
    return original &&
      fields.date === unchanged.date &&
      fields.time === unchanged.time
      ? rangeInputValue(original, timezone)
      : wallTime;
  };
  return absoluteRange(
    input(start, options.previous?.customStart),
    input(end, options.previous?.customEnd, options.inclusiveEnd),
    timezone,
    options.previous,
  );
}

function calendarDate(day: string): Date {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(day);
  if (!match) throw new Error("Choose a valid calendar date");
  const [year, month, date] = match.slice(1).map(Number);
  const value = new Date(0);
  value.setUTCFullYear(year, month - 1, date);
  value.setUTCHours(0, 0, 0, 0);
  if (
    year < 1 ||
    value.getUTCFullYear() !== year ||
    value.getUTCMonth() !== month - 1 ||
    value.getUTCDate() !== date
  )
    throw new Error("Choose a valid calendar date");
  return value;
}

function calendarDay(value: Date): string {
  return value.toISOString().slice(0, 10);
}

export function shiftCalendarDay(day: string, delta: number): string {
  if (!Number.isSafeInteger(delta))
    throw new Error("Choose a valid calendar increment");
  const value = calendarDate(day);
  value.setUTCDate(value.getUTCDate() + delta);
  if (value.getUTCFullYear() < 1) return "0001-01-01";
  if (value.getUTCFullYear() > 9999) return "9999-12-31";
  return calendarDay(value);
}

export function shiftCalendarMonth(day: string, delta: number): string {
  if (!Number.isSafeInteger(delta))
    throw new Error("Choose a valid calendar increment");
  const value = calendarDate(day);
  const month = Math.max(
    12,
    Math.min(119999, value.getUTCFullYear() * 12 + value.getUTCMonth() + delta),
  );
  const year = Math.floor(month / 12);
  const monthIndex = month % 12;
  const monthEnd = new Date(0);
  monthEnd.setUTCFullYear(year, monthIndex + 1, 0);
  value.setUTCFullYear(
    year,
    monthIndex,
    Math.min(value.getUTCDate(), monthEnd.getUTCDate()),
  );
  return calendarDay(value);
}

export function calendarMonthDays(day: string): string[] {
  const month = calendarDate(day);
  month.setUTCDate(1);
  const start = month.getTime() - month.getUTCDay() * 86400000;
  return Array.from({ length: 42 }, (_, index) => {
    const date = new Date(start + index * 86400000);
    return date.getUTCFullYear() < 1 || date.getUTCFullYear() > 9999
      ? ""
      : calendarDay(date);
  });
}

function validTime(value: string): boolean {
  return /^([01]\d|2[0-3]):[0-5]\d:[0-5]\d$/.test(value);
}

export function stepDateTimeSegment(
  value: string,
  kind: "date" | "time" | "duration",
  selectionStart: number,
  delta: number,
): { value: string; selectionStart: number; selectionEnd: number } | null {
  if (!Number.isSafeInteger(delta) || !Number.isFinite(selectionStart))
    return null;
  if (kind === "duration") {
    if (!/^[1-9]\d{0,3}$/.test(value)) return null;
    const next = String(Math.max(1, Math.min(9999, Number(value) + delta)));
    return { value: next, selectionStart: 0, selectionEnd: next.length };
  }
  if (kind === "time") {
    if (!validTime(value)) return null;
    const segment = selectionStart <= 2 ? 0 : selectionStart <= 5 ? 1 : 2;
    const fields = value.split(":").map(Number);
    const maximum = segment === 0 ? 24 : 60;
    fields[segment] =
      (((fields[segment] + delta) % maximum) + maximum) % maximum;
    return {
      value: fields.map((field) => String(field).padStart(2, "0")).join(":"),
      selectionStart: segment * 3,
      selectionEnd: segment * 3 + 2,
    };
  }
  if (!/^\d{4}\/\d{2}\/\d{2}$/.test(value)) return null;
  const day = value.replaceAll("/", "-");
  try {
    calendarDate(day);
    const segment = selectionStart <= 4 ? 0 : selectionStart <= 7 ? 1 : 2;
    const next =
      segment === 2
        ? shiftCalendarDay(day, delta)
        : shiftCalendarMonth(day, segment === 0 ? delta * 12 : delta);
    return {
      value: next.replaceAll("-", "/"),
      selectionStart: [0, 5, 8][segment],
      selectionEnd: [4, 7, 10][segment],
    };
  } catch {
    return null;
  }
}
