import type { LogEvent } from "./contracts";

/** GCP records can differ within one millisecond; AWS timestamps have millisecond precision. */
export function compareLogTime(a: LogEvent, b: LogEvent): number {
  return (
    a.timestamp - b.timestamp ||
    (a.timestampSubMillis ?? 0) - (b.timestampSubMillis ?? 0)
  );
}
