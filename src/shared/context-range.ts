export type ContextDirection = "past" | "future" | "both";

export interface ContextRange {
  direction: ContextDirection;
  durationMs: number;
}

export const CONTEXT_DURATIONS = [
  { label: "1 second", durationMs: 1000 },
  { label: "5 seconds", durationMs: 5000 },
  { label: "10 seconds", durationMs: 10000 },
  { label: "30 seconds", durationMs: 30000 },
  { label: "1 minute", durationMs: 60000 },
  { label: "5 minutes", durationMs: 300000 },
] as const;

// Custom range inputs support four-digit years. Reserve an exclusive end for
// the selected event so every accepted timestamp remains queryable.
const MAX_END_TIME = Date.parse("9999-12-31T23:59:59.999Z");

export function contextTimeRange(
  timestamp: number,
  { direction, durationMs }: ContextRange,
): { startTime: number; endTime: number } {
  if (
    !Number.isSafeInteger(timestamp) ||
    timestamp < 0 ||
    timestamp >= MAX_END_TIME
  )
    throw new RangeError("Choose an event with a valid timestamp");
  if (!Number.isSafeInteger(durationMs) || durationMs <= 0)
    throw new RangeError("Choose a positive context duration in milliseconds");
  if (direction !== "past" && direction !== "future" && direction !== "both")
    throw new RangeError("Choose a supported context direction");

  return {
    startTime:
      direction === "future" ? timestamp : Math.max(0, timestamp - durationMs),
    // CloudWatch FilterLogEvents excludes endTime. Only past ranges need an
    // extra millisecond to retain their anchor event.
    endTime:
      direction === "past"
        ? timestamp + 1
        : Math.min(MAX_END_TIME, timestamp + durationMs),
  };
}

export function contextRangeLabel({
  direction,
  durationMs,
}: ContextRange): string {
  const duration =
    CONTEXT_DURATIONS.find((item) => item.durationMs === durationMs)?.label ??
    `${durationMs} milliseconds`;
  if (direction === "past") return `Previous ${duration}`;
  if (direction === "future") return `Next ${duration}`;
  return `${duration} before and after`;
}
