import type { LogEvent } from "./contracts";

/** Default minutes without input before Live sleeps. */
export const LIVE_SLEEP_BACKGROUND_MINUTES = 5;
export const LIVE_SLEEP_IDLE_MINUTES = 15;
export const MAX_LIVE_SLEEP_MINUTES = 1440;

/** Repeated around a gap: providers deliver and index events late. */
export const LIVE_OVERLAP_MS = 120_000;

/** Live Tail and history give the same CloudWatch event different IDs. */
export function eventContentKey(event: LogEvent): string {
  return JSON.stringify([
    event.connectionId,
    event.logGroup,
    event.logStream,
    event.timestamp,
    event.timestampSubMillis ?? 0,
    event.message.trimEnd(),
  ]);
}

/**
 * Leaves out events the view already shows under another ID. `occurrences`
 * numbers identical events, so genuine repeats are kept.
 */
export function withoutShownEvents(
  shown: LogEvent[],
  incoming: LogEvent[],
  occurrences: number[],
): LogEvent[] {
  const times = new Set(incoming.map((event) => event.timestamp));
  const ids = new Set<string>();
  const counts = new Map<string, number>();
  for (const event of shown) {
    if (!times.has(event.timestamp)) continue;
    ids.add(event.id);
    const key = eventContentKey(event);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return incoming.filter((event, index) => {
    const key = eventContentKey(event);
    const count = counts.get(key) ?? 0;
    if (ids.has(event.id) || (occurrences[index] ?? Infinity) <= count)
      return false;
    ids.add(event.id);
    counts.set(key, count + 1);
    return true;
  });
}
