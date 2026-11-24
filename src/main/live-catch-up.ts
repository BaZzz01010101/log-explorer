import { createHash } from "node:crypto";
import type { LogEvent, QueryUpdate } from "../shared/contracts";
import { eventContentKey, LIVE_OVERLAP_MS } from "../shared/live-catch-up";
import { delay, throwIfAborted } from "./async";

/** New events become searchable a few seconds after Live delivers them. */
export const LIVE_SETTLE_MS = 10_000;
/** Includes events stamped ahead of the local clock. */
const CLOCK_AHEAD_MS = 300_000;

export interface LiveCatchUpOptions {
  requestId: string;
  /** Start of the period that may have been missed. */
  from: number;
  /** Newest events to load; a full view discards older ones anyway. */
  limit: number;
  /** One page of history, newest first. */
  load(
    range: { startTime: number; endTime: number },
    cursor: string | undefined,
  ): Promise<QueryUpdate>;
  errorMessage(error: unknown): string;
  emit(update: QueryUpdate): void;
}

/**
 * Loads the events a resumed Live view missed. History is read at once and
 * again after the stream connects, so that the connection period has no gap.
 */
export function createLiveCatchUp(options: LiveCatchUpOptions) {
  const { requestId } = options;
  const loaded = new Set<string>();
  const history = new Map<string, number>();
  const live = new Map<string, number>();
  let newest = -Infinity;
  let until = Infinity;
  let connect!: () => void;
  const connected = new Promise<void>((resolve) => {
    connect = resolve;
  });

  function occurrence(counts: Map<string, number>, event: LogEvent) {
    const key = createHash("sha1")
      .update(eventContentKey(event))
      .digest("base64");
    const count = (counts.get(key) ?? 0) + 1;
    counts.set(key, count);
    return count;
  }
  function finish(update: QueryUpdate["catchUp"]) {
    // Live can still deliver events that history already returned.
    until = newest;
    loaded.clear();
    history.clear();
    options.emit({
      requestId,
      state: "running",
      replace: false,
      catchUp: update,
    });
  }
  async function pass(startTime: number, signal: AbortSignal) {
    const range = { startTime, endTime: Date.now() + CLOCK_AHEAD_MS };
    let cursor: string | undefined;
    let count = 0;
    do {
      throwIfAborted(signal);
      const page = await options.load(range, cursor);
      throwIfAborted(signal);
      const found = page.events ?? [];
      count += found.length;
      const events = found.filter((event) => !loaded.has(event.id));
      for (const event of events) {
        loaded.add(event.id);
        newest = Math.max(newest, event.timestamp);
      }
      if (events.length)
        options.emit({
          requestId,
          state: "running",
          replace: false,
          events,
          occurrences: events.map((event) => occurrence(history, event)),
        });
      cursor = page.cursor;
    } while (cursor && count < options.limit);
  }

  return {
    /** Every stream has connected or failed. */
    connected: () => connect(),
    /** Numbers Live events that history may also return. */
    track(update: QueryUpdate): QueryUpdate {
      if (!update.events?.some((event) => event.timestamp <= until))
        return update;
      return {
        ...update,
        occurrences: update.events.map((event) => occurrence(live, event)),
      };
    },
    async run(signal: AbortSignal): Promise<void> {
      try {
        const started = Date.now();
        await pass(options.from, signal);
        await connected;
        await delay(LIVE_SETTLE_MS, signal);
        await pass(Math.max(options.from, started - LIVE_OVERLAP_MS), signal);
        finish({ state: "complete" });
      } catch (error) {
        if (!signal.aborted)
          finish({ state: "error", error: options.errorMessage(error) });
      }
    },
  };
}
