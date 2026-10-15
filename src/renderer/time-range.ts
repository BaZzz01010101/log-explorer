import type { LogTab, Preferences } from "../shared/contracts";
import { parseRangeTime, resolveTimeRange } from "./query-state";

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
