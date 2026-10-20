import { useCallback, useEffect, useRef, useState } from "react";
import type {
  LogEvent,
  LiveState,
  LogTab,
  QueryRequest,
  QueryStats,
  QueryUpdate,
  Workspace,
} from "../shared/contracts";
import { sourceIdentity } from "../shared/source-identity";
import {
  mergeEvents,
  requestMatchesTab,
  resolveTimeRange,
} from "./query-state";

export interface TabRuntime {
  events: LogEvent[];
  state: QueryUpdate["state"] | "idle";
  live: boolean;
  liveState?: LiveState;
  liveReceived?: number;
  cursor?: string;
  error?: string;
  stats?: QueryStats;
  sampled?: boolean;
  truncated?: boolean;
  evicted: number;
  request?: QueryRequest;
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
  const operationKinds = useRef(new Map<string, LogTab["kind"]>());
  const operationSources = useRef(new Map<string, string>());
  const observedSources = useRef(new Map<string, string>());
  const observedKinds = useRef(new Map<string, LogTab["kind"]>());
  const requests = useRef(
    new Map<string, { tabId: string; live: boolean; generation: number }>(),
  );
  const current = useRef(new Map<string, string>());
  const latestRequest = useRef(
    new Map<string, { requestId: string; generation: number }>(),
  );
  const autoStarted = useRef(new Set<string>());
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
      operationKinds.current.get(tabId) === tab.kind &&
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
      if (!job || !ownsRequest(job.tabId, job.generation, update.requestId))
        return;
      setRuntimes((previous) => {
        // React may evaluate this updater after another run has taken ownership.
        if (!ownsRequest(job.tabId, job.generation, update.requestId))
          return previous;
        const prior = previous[job.tabId] ?? empty();
        const merged =
          update.replace || update.events?.length
            ? mergeEvents(
                update.replace ? [] : prior.events,
                update.events ?? [],
                workspaceRef.current.preferences.maxEvents,
                undefined,
                prior.request?.kind === "insights",
              )
            : { events: prior.events, evicted: 0 };
        const terminal = ["error", "cancelled", "complete"].includes(
          update.state,
        );
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
            cursor: update.cursor,
            error: update.error,
            stats: update.stats ?? prior.stats,
            sampled: update.sampled ?? prior.sampled,
            truncated: update.truncated ?? prior.truncated,
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
      operationKinds.current.clear();
      operationSources.current.clear();
      observedSources.current.clear();
      observedKinds.current.clear();
      requests.current.clear();
      current.current.clear();
      latestRequest.current.clear();
      autoStarted.current.clear();
      observedTimeRanges.current.clear();
      for (const timer of pendingTimeRefresh.current.values())
        clearTimeout(timer);
      pendingTimeRefresh.current.clear();
      for (const id of ids) void cancelQuietly(id);
    };
  }, [cancelQuietly, ownsRequest]);

  const cancel = useCallback(
    async (tabId: string) => {
      const generation = ++sequence.current;
      const state = workspaceRef.current;
      const tab = state.tabs.find((item) => item.id === tabId);
      operations.current.set(tabId, generation);
      if (!tab || !mounted.current) return;
      operationKinds.current.set(tabId, tab.kind);
      operationSources.current.set(
        tabId,
        sourceIdentity(tab.connectionId, tab.sources, state.connections),
      );
      const id = current.current.get(tabId);
      if (id) latestRequest.current.set(tabId, { requestId: id, generation });
      const job = id ? requests.current.get(id) : undefined;
      // Cancellation updates belong to this operation, and may carry partial-result details.
      if (id && job) requests.current.set(id, { ...job, generation });
      let cancellationError: string | undefined;
      if (id) {
        try {
          await window.explorer.cancel(id);
        } catch (error) {
          cancellationError =
            error instanceof Error ? error.message : "Cancellation failed";
        }
      }
      if (
        !ownsOperation(tabId, generation) ||
        (id && current.current.get(tabId) !== id)
      )
        return;
      if (id && !cancellationError) {
        requests.current.delete(id);
        current.current.delete(tabId);
      }
      setRuntimes((previous) => {
        if (!ownsOperation(tabId, generation) || !previous[tabId])
          return previous;
        const prior = previous[tabId];
        return {
          ...previous,
          [tabId]: {
            ...prior,
            state:
              cancellationError || prior.state === "error"
                ? "error"
                : "cancelled",
            live: false,
            liveState: prior.liveState ? "stopped" : undefined,
            error: cancellationError ?? prior.error,
          },
        };
      });
    },
    [ownsOperation],
  );

  const run = useCallback(
    async (tab: LogTab, live = false, more = false) => {
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
      operationKinds.current.set(tab.id, tab.kind);
      operationSources.current.set(tab.id, source);
      if (!ownsOperation(tab.id, generation)) return;
      const prior = runtimesRef.current[tab.id];
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
      let request: QueryRequest | undefined;
      try {
        const canContinue = Boolean(
          more &&
          !live &&
          prior?.request &&
          prior.cursor &&
          prior.request.kind === tab.kind &&
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
          : {
              requestId: crypto.randomUUID(),
              connection: { ...connection },
              connections: [
                ...new Set(
                  tab.sources
                    .map((source) => source.connectionId)
                    .filter((id): id is string => !!id && id !== connection.id),
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
              kind: tab.kind,
              filterPattern: tab.kind === "events" ? tab.filterPattern : "",
              query: tab.kind === "insights" ? tab.query : "",
              limit: Math.min(
                10000,
                workspaceRef.current.preferences.maxEvents,
              ),
            };
        const retainHistory =
          live &&
          prior?.request &&
          requestMatchesTab(prior.request, tab, connection, state.connections);
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
                  state: "queued",
                  live,
                  liveState: live ? "connecting" : undefined,
                  liveReceived: live ? 0 : undefined,
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
    [cancelQuietly, ownsOperation, ownsRequest],
  );

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
        operationKinds.current.delete(tabId);
        operationSources.current.delete(tabId);
        observedSources.current.delete(tabId);
        observedKinds.current.delete(tabId);
        latestRequest.current.delete(tabId);
        autoStarted.current.delete(tabId);
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
      const previousKind = observedKinds.current.get(tab.id);
      observedSources.current.set(tab.id, source);
      observedKinds.current.set(tab.id, tab.kind);
      if (
        (previousSource !== undefined && previousSource !== source) ||
        (previousKind !== undefined && previousKind !== tab.kind)
      ) {
        const pending = pendingTimeRefresh.current.get(tab.id);
        if (pending) clearTimeout(pending);
        pendingTimeRefresh.current.delete(tab.id);
        // A manual run for the new source/mode can already own the tab.
        if (
          operationSources.current.get(tab.id) !== source ||
          operationKinds.current.get(tab.id) !== tab.kind
        ) {
          refresh.add(tab.id);
          operations.current.set(tab.id, ++sequence.current);
          operationKinds.current.set(tab.id, tab.kind);
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
          prior.request.kind === operationKinds.current.get(tabId) &&
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
        void run(tab);
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
        const merged = mergeEvents(
          runtime.events,
          [],
          limit,
          undefined,
          runtime.request?.kind === "insights",
        );
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
    if (!ready || !workspace.preferences.refreshSeconds) return;
    const timer = setInterval(() => {
      for (const tab of workspaceRef.current.tabs) {
        const runtime = runtimesRef.current[tab.id];
        // A changed source remains idle until explicitly queried.
        if (
          runtime?.request &&
          runtime.state !== "idle" &&
          !runtime.live &&
          !runtime.liveState &&
          !["running", "queued"].includes(runtime.state) &&
          tab.kind === "events"
        )
          void run(tab);
      }
    }, workspace.preferences.refreshSeconds * 1000);
    return () => clearInterval(timer);
  }, [workspace.preferences.refreshSeconds, ready, run]);
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
      )
        void run(tab);
    }
  }, [ready, awsEnabled, run]);
  return { runtimes, run, cancel };
}

function timeIdentity(tab: LogTab): string {
  return JSON.stringify(
    tab.timePreset === "custom"
      ? [tab.timePreset, tab.customStart ?? "", tab.customEnd ?? ""]
      : [tab.timePreset],
  );
}
