import type {
  LiveFailure,
  LiveState,
  LogEvent,
  QueryUpdate,
} from "../shared/contracts";
import { compareLogTime } from "../shared/log-order";

/** How long an event waits for earlier events from slower sources. */
export const LIVE_HOLD_MS = 3000;
/** Longest wait for every source to connect before events are shown. */
export const LIVE_CONNECT_MS = 5000;
const BATCH_MS = 250;
const MAX_EVENTS = 20000;
const MAX_CHARACTERS = 16_000_000;

/**
 * Holds events for a fixed time after arrival, then releases each together
 * with every buffered event that precedes it. Waiting is measured from arrival,
 * so it does not depend on the local and provider clocks agreeing.
 */
export function createLiveReorder(release: (events: LogEvent[]) => void) {
  let items: Array<{ event: LogEvent; due: number }> = [];
  let characters = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let gateUntil = Date.now() + LIVE_CONNECT_MS;
  let lastRelease = -Infinity;
  let closed = false;

  /** Releases the first `count` items in time order. */
  function take(count: number) {
    if (!count) return;
    const released = items.splice(0, count).map((item) => item.event);
    for (const event of released) characters -= event.message.length;
    lastRelease = Date.now();
    release(released);
  }
  function schedule() {
    clearTimeout(timer);
    timer = undefined;
    if (closed || !items.length) return;
    const due = items.reduce((min, item) => Math.min(min, item.due), Infinity);
    const at = Math.max(due, gateUntil, lastRelease + BATCH_MS);
    timer = setTimeout(tick, Math.max(0, at - Date.now()));
  }
  function tick() {
    const now = Date.now();
    let count = 0;
    // Items are in time order: everything up to the last due item goes.
    items.forEach((item, index) => {
      if (item.due <= now) count = index + 1;
    });
    take(count);
    schedule();
  }
  return {
    push(events: LogEvent[]) {
      if (closed || !events.length) return;
      const due = Date.now() + LIVE_HOLD_MS;
      for (const event of events) {
        items.push({ event, due });
        characters += event.message.length;
      }
      // Stable: events with equal times keep their arrival order.
      items.sort((a, b) => compareLogTime(a.event, b.event));
      let count = 0;
      for (
        let excess = characters;
        items.length - count > MAX_EVENTS || excess > MAX_CHARACTERS;
        count++
      )
        excess -= items[count].event.message.length;
      take(count);
      schedule();
    },
    /** Every source has connected or failed. */
    ready() {
      gateUntil = 0;
      schedule();
    },
    flush() {
      take(items.length);
      schedule();
    },
    close() {
      closed = true;
      clearTimeout(timer);
      items = [];
    },
  };
}

export interface LiveStream {
  connectionId: string;
  name: string;
  /** Resolves when the provider ends the stream. */
  run(signal: AbortSignal, emit: (update: QueryUpdate) => void): Promise<void>;
  errorMessage(error: unknown): string;
}

/** Runs one Live stream per connection as a single time-ordered view. */
export async function runMergedLive(
  requestId: string,
  streams: LiveStream[],
  signal: AbortSignal,
  emit: (update: QueryUpdate) => void,
  onFlush: (flush: () => void) => void,
): Promise<void> {
  const stop = new AbortController();
  const active = AbortSignal.any([signal, stop.signal]);
  const states = streams.map(() => ({
    live: "connecting" as LiveState,
    sampled: false,
    settled: false,
  }));
  const failures: LiveFailure[] = [];
  let errors = 0;
  let reported = "";
  const status = () => ({
    liveState: states.some((state) => state.live === "streaming")
      ? ("streaming" as const)
      : ("connecting" as const),
    sampled: states.some((state) => state.sampled),
    liveFailures: [...failures],
  });
  const send = (events: LogEvent[]) => {
    const current = status();
    reported = JSON.stringify(current);
    emit({ requestId, state: "running", replace: false, events, ...current });
  };
  const reorder = createLiveReorder(send);
  onFlush(reorder.flush);
  const report = () => {
    if (states.every((state) => state.settled)) reorder.ready();
    // The last source to stop is reported as the job's own end or error.
    if (
      failures.length < streams.length &&
      JSON.stringify(status()) !== reported
    )
      send([]);
  };
  report();
  try {
    await Promise.all(
      streams.map(async (stream, index) => {
        const state = states[index];
        let message: string | undefined;
        try {
          await stream.run(active, (update) => {
            if (active.aborted) return;
            if (update.state === "error")
              message = update.error ?? "Live stream failed.";
            if (update.state !== "running") return;
            if (update.liveState) state.live = update.liveState;
            if (update.sampled !== undefined) state.sampled = update.sampled;
            if (state.live === "streaming") state.settled = true;
            reorder.push(update.events ?? []);
            report();
          });
        } catch (error) {
          if (active.aborted) return;
          message = stream.errorMessage(error);
        }
        if (active.aborted) return;
        if (message !== undefined) errors++;
        state.live = "stopped";
        state.settled = true;
        failures.push({
          connectionId: stream.connectionId,
          name: stream.name,
          error: message ?? "Live stream ended.",
        });
        report();
      }),
    );
    if (signal.aborted) return;
    reorder.flush();
    if (errors)
      throw new Error(
        failures.map((item) => `${item.name}: ${item.error}`).join("\n"),
      );
  } finally {
    stop.abort();
    reorder.close();
  }
}
