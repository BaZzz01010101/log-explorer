import type {
  LiveCatchUp,
  LiveFailure,
  LiveState,
  LogEvent,
  QueryRequest,
  QueryStats,
  QueryUpdate,
} from "../shared/contracts";
import { LIVE_OVERLAP_MS, withoutShownEvents } from "../shared/live-catch-up";
import { mergeEvents } from "../shared/query-state";

/** The loaded events and query state of one view. */
export interface TabRuntime {
  events: LogEvent[];
  state: QueryUpdate["state"] | "idle";
  live: boolean;
  livePaused?: boolean;
  liveState?: LiveState;
  liveReceived?: number;
  liveFailures?: LiveFailure[];
  /** When this Live session first connected. */
  liveSince?: number;
  /** Start of the period whose events may be missing. */
  missedSince?: number;
  catchUp?: LiveCatchUp;
  cursor?: string;
  error?: string;
  stats?: QueryStats;
  sampled?: boolean;
  truncated?: boolean;
  incomplete?: boolean;
  evicted: number;
  request?: QueryRequest;
  recentHistory?: { request: QueryRequest; cursor: string; evicted: number };
}

export const emptyRuntime = (): TabRuntime => ({
  events: [],
  state: "idle",
  live: false,
  evicted: 0,
});

/** The gap's start when Live stops receiving after `receiving`. */
export function missedFrom(
  runtime: TabRuntime,
  receiving: number,
): number | undefined {
  if (runtime.liveSince === undefined) return runtime.missedSince;
  return Math.min(
    runtime.missedSince ?? Infinity,
    Math.max(runtime.liveSince, receiving - LIVE_OVERLAP_MS),
  );
}

/** A view's runtime after an update of the job that owns it. */
export function updatedRuntime(
  prior: TabRuntime,
  update: QueryUpdate,
  job: {
    live: boolean;
    /** The user stopped Live, so later events are not missed. */
    stopping: boolean;
    now: number;
    /** Last time the app was certainly running. */
    beat: number;
    maxEvents: number;
  },
): TabRuntime {
  const olderPage =
    !job.live && prior.request?.direction === "older" && prior.request.cursor;
  const incoming = update.events ?? [];
  const merged =
    update.replace || incoming.length
      ? mergeEvents(
          update.replace ? [] : prior.events,
          update.occurrences
            ? withoutShownEvents(prior.events, incoming, update.occurrences)
            : incoming,
          job.maxEvents,
          undefined,
          false,
          olderPage ? "newest" : "oldest",
        )
      : { events: prior.events, evicted: 0 };
  const terminal = ["error", "cancelled", "complete"].includes(update.state);
  const failures = update.liveFailures ?? prior.liveFailures;
  const interrupted =
    terminal || (failures?.length ?? 0) > (prior.liveFailures?.length ?? 0);
  const missedSince =
    !job.live || job.stopping
      ? undefined
      : interrupted
        ? missedFrom(prior, job.beat)
        : update.catchUp?.state === "complete" && !failures?.length
          ? undefined
          : prior.missedSince;
  const received = Math.max(
    0,
    merged.events.length +
      merged.evicted -
      (update.replace ? 0 : prior.events.length),
  );
  return {
    ...prior,
    events: merged.events,
    state: update.state,
    live: job.live && !terminal,
    liveState: job.live
      ? terminal
        ? "stopped"
        : (update.liveState ?? prior.liveState ?? "connecting")
      : undefined,
    liveReceived: job.live ? (prior.liveReceived ?? 0) + received : undefined,
    liveFailures: job.live && !terminal ? failures : undefined,
    liveSince: job.live
      ? (prior.liveSince ??
        (update.liveState === "streaming" ? job.now : undefined))
      : undefined,
    missedSince,
    catchUp:
      job.live && !terminal ? (update.catchUp ?? prior.catchUp) : undefined,
    cursor: update.cursor,
    error: update.error,
    stats: update.stats ?? prior.stats,
    sampled: update.sampled ?? prior.sampled,
    truncated: update.truncated ?? prior.truncated,
    incomplete:
      update.state === "complete"
        ? Boolean(update.incomplete)
        : prior.incomplete,
    evicted: prior.evicted + merged.evicted,
  };
}
