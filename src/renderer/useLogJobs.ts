import { useCallback, useEffect, useRef, useState } from "react";
import type {
  LogEvent,
  LiveCatchUp,
  LiveFailure,
  LiveState,
  LogTab,
  QueryRequest,
  QueryStats,
  QueryUpdate,
  Workspace,
} from "../shared/contracts";
import { sourceIdentity } from "../shared/source-identity";
import { LIVE_OVERLAP_MS, withoutShownEvents } from "../shared/live-catch-up";
import { compileAwsViewFilter } from "../shared/server-filter";
import { compileGcpViewFilter } from "../shared/gcp-server-filter";
import { queryPageLimit } from "../shared/log-query-limits";
import {
  mergeEvents,
  requestMatchesTab,
  resolveTimeRange,
} from "../shared/query-state";

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
const BEAT_MS = 10_000;
/** Hidden windows run timers once a minute; a longer pause is a suspend. */
const SUSPEND_MS = 150_000;

function missedFrom(
  runtime: TabRuntime,
  receiving: number,
): number | undefined {
  if (runtime.liveSince === undefined) return runtime.missedSince;
  return Math.min(
    runtime.missedSince ?? Infinity,
    Math.max(runtime.liveSince, receiving - LIVE_OVERLAP_MS),
  );
}
const empty = (): TabRuntime => ({
  events: [],
  state: "idle",
  live: false,
  evicted: 0,
});

export function useLogJobs(
  workspace: Workspace,
  ready: boolean,
  onCleanupError?: (message: string) => void,
  awsEnabled = false,
  liveAsleep = false,
) {
  const previousAccess = useRef({ ready, awsEnabled });
  const workspaceRef = useRef(workspace);
  workspaceRef.current = workspace;
  const cleanupErrorRef = useRef(onCleanupError);
  cleanupErrorRef.current = onCleanupError;
  const [runtimes, setRuntimes] = useState<Record<string, TabRuntime>>({});
  const runtimesRef = useRef(runtimes);
  runtimesRef.current = runtimes;
  const mounted = useRef(true);
  const sequence = useRef(0);
  const operations = useRef(new Map<string, number>());
  const operationSources = useRef(new Map<string, string>());
  const observedSources = useRef(new Map<string, string>());
  const requests = useRef(
    new Map<
      string,
      { tabId: string; live: boolean; generation: number; stopping?: boolean }
    >(),
  );
  const reloadRecent = useRef<(tab: LogTab) => Promise<void>>(async () => {});
  const current = useRef(new Map<string, string>());
  const latestRequest = useRef(
    new Map<string, { requestId: string; generation: number }>(),
  );
  const autoStarted = useRef(new Set<string>());
  const sleepingLive = useRef(new Set<string>());
  // Hidden tabs defer their automatic run until they are first shown.
  const staleHidden = useRef(new Set<string>());
  const isVisible = useCallback(
    (tabId: string) =>
      workspaceRef.current.panes.some((pane) => pane.tabId === tabId),
    [],
  );
  const liveAsleepRef = useRef(liveAsleep);
  liveAsleepRef.current = liveAsleep;
  const canStream = useCallback(
    (tabId: string) => isVisible(tabId) && !liveAsleepRef.current,
    [isVisible],
  );
  /** Last time the app was certainly running, unlike a suspended computer. */
  const lastBeat = useRef(Date.now());
  const observedTimeRanges = useRef(new Map<string, string>());
  const pendingTimeRefresh = useRef(
    new Map<string, ReturnType<typeof setTimeout>>(),
  );

  const ownsOperation = useCallback((tabId: string, generation: number) => {
    if (!mounted.current || operations.current.get(tabId) !== generation)
      return false;
    const state = workspaceRef.current;
    const tab = state.tabs.find((item) => item.id === tabId);
    return Boolean(
      tab &&
      operationSources.current.get(tabId) ===
        sourceIdentity(tab.connectionId, tab.sources, state.connections),
    );
  }, []);
  const ownsRequest = useCallback(
    (tabId: string, generation: number, requestId: string) =>
      ownsOperation(tabId, generation) &&
      latestRequest.current.get(tabId)?.generation === generation &&
      latestRequest.current.get(tabId)?.requestId === requestId,
    [ownsOperation],
  );
  const cancelQuietly = useCallback(async (requestId: string) => {
    try {
      await window.explorer.cancel(requestId);
    } catch (error) {
      // Retired operations cannot update a tab, but cleanup failures must remain visible.
      cleanupErrorRef.current?.(
        error instanceof Error
          ? error.message
          : "Could not stop the previous query. The server query may still be running.",
      );
    }
  }, []);

  useEffect(() => {
    mounted.current = true;
    const unsubscribe = window.explorer.onUpdate((update) => {
      const job = requests.current.get(update.requestId);
      const now = Date.now();
      const beat = lastBeat.current;
      if (
        !job ||
        (job.live && !canStream(job.tabId)) ||
        !ownsRequest(job.tabId, job.generation, update.requestId)
      )
        return;
      setRuntimes((previous) => {
        // React may evaluate this updater after another run has taken ownership.
        if (
          (job.live && !canStream(job.tabId)) ||
          !ownsRequest(job.tabId, job.generation, update.requestId)
        )
          return previous;
        const prior = previous[job.tabId] ?? empty();
        const merged =
          update.replace || update.events?.length
            ? mergeEvents(
                update.replace ? [] : prior.events,
                update.occurrences
                  ? withoutShownEvents(
                      prior.events,
                      update.events ?? [],
                      update.occurrences,
                    )
                  : (update.events ?? []),
                workspaceRef.current.preferences.maxEvents,
                undefined,
                false,
                !job.live &&
                  prior.request?.direction === "older" &&
                  prior.request.cursor
                  ? "newest"
                  : "oldest",
              )
            : { events: prior.events, evicted: 0 };
        const terminal = ["error", "cancelled", "complete"].includes(
          update.state,
        );
        const failures = update.liveFailures ?? prior.liveFailures;
        const interrupted =
          terminal ||
          (failures?.length ?? 0) > (prior.liveFailures?.length ?? 0);
        const missedSince =
          !job.live || job.stopping
            ? undefined
            : interrupted
              ? missedFrom(prior, beat)
              : update.catchUp?.state === "complete" && !failures?.length
                ? undefined
                : prior.missedSince;
        return {
          ...previous,
          [job.tabId]: {
            ...prior,
            events: merged.events,
            state: update.state,
            live:
              job.live &&
              !["error", "cancelled", "complete"].includes(update.state),
            liveState: job.live
              ? terminal
                ? "stopped"
                : (update.liveState ?? prior.liveState ?? "connecting")
              : undefined,
            liveReceived: job.live
              ? (prior.liveReceived ?? 0) +
                Math.max(
                  0,
                  merged.events.length +
                    merged.evicted -
                    (update.replace ? 0 : prior.events.length),
                )
              : undefined,
            liveFailures: job.live && !terminal ? failures : undefined,
            liveSince: job.live
              ? (prior.liveSince ??
                (update.liveState === "streaming" ? now : undefined))
              : undefined,
            missedSince,
            catchUp:
              job.live && !terminal
                ? (update.catchUp ?? prior.catchUp)
                : undefined,
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
          },
        };
      });
      if (
        ["complete", "error", "cancelled"].includes(update.state) &&
        requests.current.get(update.requestId) === job
      )
        requests.current.delete(update.requestId);
    });
    return () => {
      mounted.current = false;
      unsubscribe();
      const ids = new Set([
        ...requests.current.keys(),
        ...current.current.values(),
      ]);
      operations.current.clear();
      operationSources.current.clear();
      observedSources.current.clear();
      requests.current.clear();
      current.current.clear();
      latestRequest.current.clear();
      autoStarted.current.clear();
      sleepingLive.current.clear();
      observedTimeRanges.current.clear();
      for (const timer of pendingTimeRefresh.current.values())
        clearTimeout(timer);
      pendingTimeRefresh.current.clear();
      for (const id of ids) void cancelQuietly(id);
    };
  }, [cancelQuietly, ownsRequest, canStream]);

  const cancel = useCallback(
    async (tabId: string, pause = false) => {
      if (pause) sleepingLive.current.add(tabId);
      else sleepingLive.current.delete(tabId);
      const generation = ++sequence.current;
      const state = workspaceRef.current;
      const tab = state.tabs.find((item) => item.id === tabId);
      operations.current.set(tabId, generation);
      if (!tab || !mounted.current) return;
      operationSources.current.set(
        tabId,
        sourceIdentity(tab.connectionId, tab.sources, state.connections),
      );
      const id = current.current.get(tabId);
      if (id) latestRequest.current.set(tabId, { requestId: id, generation });
      const job = id ? requests.current.get(id) : undefined;
      // Cancellation updates belong to this operation, and may carry partial-result details.
      if (id && job)
        requests.current.set(id, { ...job, generation, stopping: !pause });
      const beat = lastBeat.current;
      if (pause)
        setRuntimes((previous) =>
          ownsOperation(tabId, generation) && previous[tabId]
            ? {
                ...previous,
                [tabId]: {
                  ...previous[tabId],
                  state: "idle",
                  live: true,
                  livePaused: true,
                  missedSince: missedFrom(previous[tabId], beat),
                  catchUp: undefined,
                },
              }
            : previous,
        );
      let cancellationError: string | undefined;
      if (id) {
        try {
          await window.explorer.cancel(id);
        } catch (error) {
          cancellationError =
            error instanceof Error ? error.message : "Cancellation failed";
        }
      }
      if (pause && cancellationError)
        cleanupErrorRef.current?.(cancellationError);
      if (
        !ownsOperation(tabId, generation) ||
        (id && current.current.get(tabId) !== id)
      )
        return;
      if (id && !cancellationError) {
        requests.current.delete(id);
        current.current.delete(tabId);
      }
      const needsRecentReload =
        !pause &&
        !cancellationError &&
        Boolean(
          runtimesRef.current[tabId]?.recentHistory &&
          runtimesRef.current[tabId]!.evicted !==
            runtimesRef.current[tabId]!.recentHistory!.evicted,
        );
      setRuntimes((previous) => {
        if (!ownsOperation(tabId, generation) || !previous[tabId])
          return previous;
        const prior = previous[tabId];
        const history =
          !pause &&
          !cancellationError &&
          prior.recentHistory &&
          prior.evicted === prior.recentHistory.evicted
            ? prior.recentHistory
            : undefined;
        return {
          ...previous,
          [tabId]: {
            ...prior,
            state:
              cancellationError || prior.state === "error"
                ? "error"
                : pause
                  ? "idle"
                  : history
                    ? "complete"
                    : "cancelled",
            live: pause && !cancellationError,
            livePaused: pause || undefined,
            ...(pause ? {} : { missedSince: undefined, catchUp: undefined }),
            liveState: pause
              ? prior.liveState
              : prior.liveState
                ? "stopped"
                : undefined,
            error: cancellationError ?? prior.error,
            ...(history && id
              ? {
                  request: { ...history.request, requestId: id },
                  cursor: history.cursor,
                  recentHistory: undefined,
                }
              : {}),
          },
        };
      });
      if (needsRecentReload && ownsOperation(tabId, generation))
        await reloadRecent.current(tab);
    },
    [ownsOperation],
  );

  const run = useCallback(
    async (
      tab: LogTab,
      live = false,
      more = false,
      resume = false,
      missed?: number,
    ) => {
      const prior = runtimesRef.current[tab.id];
      // Pagination callbacks can outlive the historical result that scheduled them.
      // Never let one take ownership from a newer Run, Live start, or cancellation.
      if (
        more &&
        (live ||
          !prior?.request ||
          !prior.cursor ||
          prior.state !== "complete" ||
          prior.live ||
          (prior.liveState !== undefined && prior.liveState !== "stopped") ||
          !ownsRequest(
            tab.id,
            operations.current.get(tab.id)!,
            prior.request.requestId,
          ) ||
          !requestMatchesTab(
            prior.request,
            tab,
            workspaceRef.current.connections.find(
              (item) => item.id === tab.connectionId,
            ),
            workspaceRef.current.connections,
          ))
      )
        return;
      sleepingLive.current.delete(tab.id);
      const pending = pendingTimeRefresh.current.get(tab.id);
      if (pending) clearTimeout(pending);
      pendingTimeRefresh.current.delete(tab.id);
      // Allocate before every await: an older cancellation cannot resume over a newer action.
      const generation = ++sequence.current;
      const state = workspaceRef.current;
      const connection = state.connections.find(
        (item) => item.id === tab.connectionId,
      );
      const source = sourceIdentity(
        tab.connectionId,
        tab.sources,
        state.connections,
      );
      operations.current.set(tab.id, generation);
      operationSources.current.set(tab.id, source);
      if (!ownsOperation(tab.id, generation)) return;
      const old = current.current.get(tab.id);
      current.current.delete(tab.id);
      if (old) {
        requests.current.delete(old);
        await cancelQuietly(old);
      }
      if (!ownsOperation(tab.id, generation)) return;
      if (!connection || !tab.sources.length) {
        setRuntimes((previous) =>
          ownsOperation(tab.id, generation)
            ? { ...previous, [tab.id]: empty() }
            : previous,
        );
        return;
      }
      if (live && !canStream(tab.id)) {
        sleepingLive.current.add(tab.id);
        setRuntimes((previous) =>
          ownsOperation(tab.id, generation)
            ? {
                ...previous,
                [tab.id]: {
                  ...(previous[tab.id] ?? empty()),
                  state: "idle",
                  live: true,
                  livePaused: true,
                  liveState: "connecting",
                  cursor: undefined,
                  error: undefined,
                },
              }
            : previous,
        );
        return;
      }
      let request: QueryRequest | undefined;
      try {
        // Waking continues what was streaming, not an edited filter.
        const resumed =
          resume &&
          prior?.request &&
          sourceIdentity(prior.request.connection.id, prior.request.sources, [
            prior.request.connection,
            ...(prior.request.connections ?? []),
          ]) === source
            ? prior.request
            : undefined;
        const modes = new Set(
          tab.sources.map(
            (item) =>
              state.connections.find(
                (candidate) =>
                  candidate.id === (item.connectionId ?? tab.connectionId),
              )?.mode,
          ),
        );
        const mixed =
          modes.has("gcp") && (modes.has("aws") || modes.has("offline"));
        const gcpFilter =
          modes.has("gcp") && !resumed
            ? compileGcpViewFilter(
                tab.filterPattern,
                tab.filterMode,
                tab.gcpLogType,
                mixed,
              )
            : { pattern: "", local: undefined };
        const canContinue = Boolean(
          more &&
          !live &&
          prior?.request &&
          prior.cursor &&
          prior.request.kind === "events" &&
          sourceIdentity(prior.request.connection.id, prior.request.sources, [
            prior.request.connection,
            ...(prior.request.connections ?? []),
          ]) === source,
        );
        request = canContinue
          ? {
              ...prior!.request!,
              requestId: crypto.randomUUID(),
              cursor: prior!.cursor,
            }
          : resumed
            ? {
                ...resumed,
                requestId: crypto.randomUUID(),
                direction: undefined,
                cursor: undefined,
                catchUp: undefined,
              }
            : {
                requestId: crypto.randomUUID(),
                connection: { ...connection },
                connections: [
                  ...new Set(
                    tab.sources
                      .map((source) => source.connectionId)
                      .filter(
                        (id): id is string => !!id && id !== connection.id,
                      ),
                  ),
                ].map((id) => {
                  const selected = state.connections.find(
                    (item) => item.id === id,
                  );
                  if (!selected)
                    throw new Error("A source connection no longer exists.");
                  return { ...selected };
                }),
                sources: tab.sources.map((item) => ({
                  ...item,
                  ...(item.logStreams
                    ? { logStreams: [...item.logStreams] }
                    : {}),
                })),
                ...resolveTimeRange(
                  tab.timePreset,
                  tab.customStart,
                  tab.customEnd,
                ),
                kind: "events",
                filterPattern:
                  modes.has("aws") || modes.has("offline")
                    ? compileAwsViewFilter(tab.filterPattern, tab.filterMode)
                    : "",
                gcpFilterPattern: gcpFilter.pattern,
                ...(gcpFilter.local ? { gcpLocalFilter: gcpFilter.local } : {}),
                query: "",
                ...(tab.timePreset === "clear" && !live
                  ? { direction: "older" as const }
                  : {}),
                limit:
                  tab.timePreset === "clear" && !live
                    ? Math.min(
                        1000,
                        Math.max(
                          1,
                          Math.floor(
                            workspaceRef.current.preferences.maxEvents / 4,
                          ),
                        ),
                      )
                    : queryPageLimit(
                        modes,
                        workspaceRef.current.preferences.maxEvents,
                      ),
              };
        const retainHistory =
          live &&
          prior?.request &&
          (resumed ||
            requestMatchesTab(
              prior.request,
              tab,
              connection,
              state.connections,
            ));
        // Kept events continue without a gap.
        const missedSince = retainHistory
          ? (missed ?? prior.missedSince)
          : undefined;
        if (missedSince !== undefined)
          request.catchUp = {
            from: Math.max(0, Math.floor(missedSince)),
            limit: workspaceRef.current.preferences.maxEvents,
          };
        const dispatched = request;
        current.current.set(tab.id, dispatched.requestId);
        latestRequest.current.set(tab.id, {
          requestId: dispatched.requestId,
          generation,
        });
        requests.current.set(dispatched.requestId, {
          tabId: tab.id,
          live,
          generation,
        });
        setRuntimes((previous) =>
          ownsRequest(tab.id, generation, dispatched.requestId)
            ? {
                ...previous,
                [tab.id]: {
                  ...(canContinue ? (previous[tab.id] ?? empty()) : empty()),
                  ...(retainHistory
                    ? { events: prior.events, evicted: prior.evicted }
                    : {}),
                  ...(live &&
                  retainHistory &&
                  prior.request?.direction === "older" &&
                  prior.cursor
                    ? {
                        recentHistory: {
                          request: prior.request,
                          cursor: prior.cursor,
                          evicted: prior.evicted,
                        },
                      }
                    : live && prior?.recentHistory
                      ? { recentHistory: prior.recentHistory }
                      : {}),
                  state: "queued",
                  live,
                  liveState: live ? "connecting" : undefined,
                  livePaused: false,
                  liveReceived: live
                    ? resume && retainHistory
                      ? (prior?.liveReceived ?? 0)
                      : 0
                    : undefined,
                  ...(missedSince !== undefined
                    ? {
                        liveSince: prior!.liveSince,
                        missedSince,
                        catchUp: { state: "loading" as const },
                      }
                    : {}),
                  error: undefined,
                  cursor: undefined,
                  request: dispatched,
                },
              }
            : previous,
        );
        await (live
          ? window.explorer.live(dispatched)
          : window.explorer.query(dispatched));
        // A close/cancel may have reached the main process before a delayed dispatch started.
        if (!ownsRequest(tab.id, generation, dispatched.requestId)) {
          requests.current.delete(dispatched.requestId);
          await cancelQuietly(dispatched.requestId);
        }
      } catch (error) {
        const requestId = request?.requestId;
        if (
          !ownsOperation(tab.id, generation) ||
          (requestId && current.current.get(tab.id) !== requestId)
        ) {
          if (requestId) {
            requests.current.delete(requestId);
            await cancelQuietly(requestId);
          }
          return;
        }
        if (requestId) {
          requests.current.delete(requestId);
          if (current.current.get(tab.id) === requestId)
            current.current.delete(tab.id);
        }
        setRuntimes((previous) => {
          if (!ownsOperation(tab.id, generation)) return previous;
          const priorRuntime = previous[tab.id] ?? empty();
          if (requestId && priorRuntime.request?.requestId !== requestId)
            return previous;
          return {
            ...previous,
            [tab.id]: {
              ...priorRuntime,
              state: "error",
              live: false,
              liveState: live ? "stopped" : undefined,
              cursor: undefined,
              error: error instanceof Error ? error.message : "Request failed",
            },
          };
        });
      }
    },
    [cancelQuietly, ownsOperation, ownsRequest, canStream],
  );

  reloadRecent.current = (tab) => run(tab);

  useEffect(() => {
    if (!ready) return;
    const ids = new Set(workspace.tabs.map((tab) => tab.id));
    const reset = new Map<string, number>();
    const refresh = new Set<string>();
    for (const tabId of new Set([
      ...observedSources.current.keys(),
      ...operations.current.keys(),
      ...current.current.keys(),
    ])) {
      if (!ids.has(tabId)) {
        operations.current.delete(tabId);
        operationSources.current.delete(tabId);
        observedSources.current.delete(tabId);
        latestRequest.current.delete(tabId);
        autoStarted.current.delete(tabId);
        sleepingLive.current.delete(tabId);
        observedTimeRanges.current.delete(tabId);
        const pending = pendingTimeRefresh.current.get(tabId);
        if (pending) clearTimeout(pending);
        pendingTimeRefresh.current.delete(tabId);
        const id = current.current.get(tabId);
        if (id) {
          requests.current.delete(id);
          current.current.delete(tabId);
          void cancelQuietly(id);
        }
      }
    }
    for (const tab of workspace.tabs) {
      const source = sourceIdentity(
        tab.connectionId,
        tab.sources,
        workspace.connections,
      );
      const previousSource = observedSources.current.get(tab.id);
      const sourceChanged =
        previousSource !== undefined && previousSource !== source;
      observedSources.current.set(tab.id, source);
      if (sourceChanged) {
        const pending = pendingTimeRefresh.current.get(tab.id);
        if (pending) clearTimeout(pending);
        pendingTimeRefresh.current.delete(tab.id);
        // A manual run for the new source can already own the tab.
        if (operationSources.current.get(tab.id) !== source) {
          sleepingLive.current.delete(tab.id);
          refresh.add(tab.id);
          operations.current.set(tab.id, ++sequence.current);
          operationSources.current.set(tab.id, source);
          latestRequest.current.delete(tab.id);
          const id = current.current.get(tab.id);
          if (id) {
            requests.current.delete(id);
            current.current.delete(tab.id);
            void cancelQuietly(id);
          }
        }
        reset.set(tab.id, operations.current.get(tab.id)!);
      }
    }
    setRuntimes((previous) => {
      if (!mounted.current) return previous;
      let next = previous;
      const existing = new Set(workspaceRef.current.tabs.map((tab) => tab.id));
      if (Object.keys(previous).some((id) => !existing.has(id)))
        next = Object.fromEntries(
          Object.entries(previous).filter(([id]) => existing.has(id)),
        );
      for (const [tabId, generation] of reset) {
        if (!ownsOperation(tabId, generation)) continue;
        const prior = next[tabId];
        if (
          prior?.request &&
          prior.request.kind === "events" &&
          sourceIdentity(prior.request.connection.id, prior.request.sources, [
            prior.request.connection,
            ...(prior.request.connections ?? []),
          ]) === operationSources.current.get(tabId)
        )
          continue;
        next = { ...next, [tabId]: empty() };
      }
      return next;
    });
    for (const tab of workspace.tabs) {
      if (!autoStarted.current.has(tab.id) || refresh.has(tab.id)) {
        autoStarted.current.add(tab.id);
        // This run already applies the current time fields; the date effect
        // must not issue a second query for the same workspace update.
        observedTimeRanges.current.set(tab.id, timeIdentity(tab));
        if (isVisible(tab.id)) {
          staleHidden.current.delete(tab.id);
          void run(tab);
        } else staleHidden.current.add(tab.id);
      }
    }
  }, [
    workspace.tabs,
    workspace.connections,
    ready,
    run,
    cancelQuietly,
    ownsOperation,
  ]);

  useEffect(() => {
    if (!ready) return;
    for (const tab of workspace.tabs) {
      const identity = timeIdentity(tab);
      const previous = observedTimeRanges.current.get(tab.id);
      observedTimeRanges.current.set(tab.id, identity);
      // Startup/restoration and layout changes must not launch another request.
      if (previous === undefined || previous === identity) continue;
      const pending = pendingTimeRefresh.current.get(tab.id);
      if (pending) clearTimeout(pending);
      pendingTimeRefresh.current.delete(tab.id);
      if (tab.timePreset === "custom") {
        const runtime = runtimesRef.current[tab.id];
        if (
          runtime?.live ||
          runtime?.state === "running" ||
          runtime?.state === "queued"
        )
          void cancel(tab.id);
      }
      try {
        resolveTimeRange(tab.timePreset, tab.customStart, tab.customEnd);
      } catch {
        // A partially edited, impossible, or reversed custom range is a draft.
        continue;
      }
      if (tab.timePreset !== "custom") {
        void run(tab);
        continue;
      }
      const source = sourceIdentity(
        tab.connectionId,
        tab.sources,
        workspace.connections,
      );
      pendingTimeRefresh.current.set(
        tab.id,
        setTimeout(() => {
          pendingTimeRefresh.current.delete(tab.id);
          const state = workspaceRef.current;
          const latest = state.tabs.find((item) => item.id === tab.id);
          if (
            !mounted.current ||
            !latest ||
            timeIdentity(latest) !== identity ||
            sourceIdentity(
              latest.connectionId,
              latest.sources,
              state.connections,
            ) !== source
          )
            return;
          void run(latest);
        }, 400),
      );
    }
  }, [workspace.tabs, workspace.connections, ready, run, cancel]);

  useEffect(() => {
    const limit = workspace.preferences.maxEvents;
    setRuntimes((previous) => {
      if (!mounted.current) return previous;
      let next = previous;
      for (const [tabId, runtime] of Object.entries(previous)) {
        if (runtime.events.length <= limit) continue;
        const merged = mergeEvents(runtime.events, [], limit, undefined);
        next = {
          ...next,
          [tabId]: {
            ...runtime,
            events: merged.events,
            evicted: runtime.evicted + merged.evicted,
          },
        };
      }
      return next;
    });
  }, [workspace.preferences.maxEvents]);

  useEffect(() => {
    if (!ready) return;
    for (const tab of workspace.tabs) {
      if (isVisible(tab.id)) {
        if (sleepingLive.current.has(tab.id)) {
          if (!liveAsleep) void run(tab, true, false, true);
        } else if (staleHidden.current.delete(tab.id)) {
          observedTimeRanges.current.set(tab.id, timeIdentity(tab));
          void run(tab);
        }
      }
      if (!canStream(tab.id)) {
        const id = current.current.get(tab.id);
        if (
          id &&
          requests.current.get(id)?.live &&
          !requests.current.get(id)?.stopping &&
          !sleepingLive.current.has(tab.id)
        )
          void cancel(tab.id, true);
      }
    }
  }, [
    workspace.panes,
    workspace.tabs,
    ready,
    runtimes,
    run,
    cancel,
    isVisible,
    canStream,
    liveAsleep,
  ]);
  useEffect(() => {
    if (!ready) return;
    lastBeat.current = Date.now();
    const timer = setInterval(() => {
      const beat = lastBeat.current;
      lastBeat.current = Date.now();
      if (lastBeat.current - beat < SUSPEND_MS) return;
      // The computer slept: a stream may be dead, or resume without events.
      for (const { tabId, live, stopping } of [...requests.current.values()]) {
        const tab = workspaceRef.current.tabs.find((item) => item.id === tabId);
        const runtime = runtimesRef.current[tabId];
        if (
          tab &&
          runtime &&
          live &&
          !stopping &&
          canStream(tabId) &&
          !sleepingLive.current.has(tabId)
        )
          void run(tab, true, false, true, missedFrom(runtime, beat));
      }
    }, BEAT_MS);
    return () => clearInterval(timer);
  }, [ready, run, canStream]);
  useEffect(() => {
    const previous = previousAccess.current;
    previousAccess.current = { ready, awsEnabled };
    if (!ready || !previous.ready || !awsEnabled || previous.awsEnabled) return;
    for (const tab of workspaceRef.current.tabs) {
      const ids = new Set(
        tab.sources.map((source) => source.connectionId ?? tab.connectionId),
      );
      if (
        workspaceRef.current.connections.some(
          (connection) => ids.has(connection.id) && connection.mode === "aws",
        )
      ) {
        if (isVisible(tab.id)) void run(tab);
        else staleHidden.current.add(tab.id);
      }
    }
  }, [ready, awsEnabled, run]);
  return { runtimes, run, cancel };
}

function timeIdentity(tab: LogTab): string {
  return JSON.stringify(
    tab.timePreset === "custom"
      ? [
          tab.timePreset,
          tab.customStart ?? "",
          tab.customEnd ?? "",
          tab.gcpLogType ?? "all",
        ]
      : [tab.timePreset, tab.gcpLogType ?? "all"],
  );
}
