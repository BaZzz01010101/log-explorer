import { createContext, useEffect, useMemo, useRef, useState } from "react";
import type { ColumnConfig, LogEvent, Preferences } from "../shared/contracts";
import type { EventHighlights, HighlightFilters } from "./highlight-engine";
import type { QuickHighlightOptions } from "../shared/quick-highlight";

export const EventHighlightContext = createContext<EventHighlights | undefined>(
  undefined,
);
export const QuickHighlightContext = createContext<QuickHighlightOptions>({});
const sameHighlightEvent = (left?: LogEvent, right?: LogEvent) =>
  left === right ||
  Boolean(
    left &&
    right &&
    left.id === right.id &&
    left.message === right.message &&
    left.logGroup === right.logGroup &&
    left.logStream === right.logStream &&
    left.timestamp === right.timestamp &&
    left.ingestionTime === right.ingestionTime &&
    left.connectionId === right.connectionId,
  );
export function useEventHighlights(
  events: LogEvent[],
  preferences: Preferences,
  columns: ColumnConfig[],
  options?: {
    overview?: boolean;
    needle?: string;
    quick?: QuickHighlightOptions;
    priority?: string[];
    filters?: HighlightFilters;
  },
) {
  const overview = options?.overview ?? false;
  const needle = options?.needle ?? "";
  const quick: QuickHighlightOptions = {
    regex: Boolean(options?.quick?.regex),
    caseSensitive: Boolean(options?.quick?.caseSensitive),
  };
  const filters = options?.filters;
  const profiles = preferences.highlightProfiles ?? [];
  const active =
    (needle.length > 0 && needle.length <= 200) ||
    Boolean(
      filters?.server.trim() ||
      (filters?.localOptions?.regex
        ? filters.local.length
        : filters?.local.trim()),
    ) ||
    profiles.some(
      (profile) =>
        profile.enabled &&
        profile.rules.some((rule) => rule.enabled && rule.pattern),
    );
  const stableEvents = useRef(events);
  if (
    events !== stableEvents.current &&
    (events.length !== stableEvents.current.length ||
      events.some(
        (event, index) =>
          !sameHighlightEvent(event, stableEvents.current[index]),
      ))
  )
    stableEvents.current = events;
  const inputs = useMemo(
    () => new Map(stableEvents.current.map((event) => [event.id, event])),
    [stableEvents.current],
  );
  const config = JSON.stringify([
    profiles,
    preferences.theme,
    overview,
    needle,
    quick.regex,
    quick.caseSensitive,
    filters?.server ?? "",
    filters?.local ?? "",
    Boolean(filters?.localOptions?.regex),
    Boolean(filters?.localOptions?.caseSensitive),
    preferences.timezone,
    columns.map(({ path, format, hidden }) => ({ path, format, hidden })),
  ]);
  const priority =
    options?.priority ?? (overview ? [] : events.map((event) => event.id));
  const priorityKey = JSON.stringify(priority.slice(0, 1000));
  const latest = useRef({ inputs, priority });
  latest.current = { inputs, priority };
  const [state, setState] = useState<{
    config: string;
    inputs: Map<string, LogEvent>;
    results: Map<string, EventHighlights>;
    error?: string;
  }>({ config, inputs, results: new Map() });
  const controller = useRef<{ update: () => void } | undefined>(undefined);

  useEffect(() => {
    if (!active) {
      setState({ config, inputs: latest.current.inputs, results: new Map() });
      return;
    }
    const worker = new Worker(
      new URL("./highlight.worker.ts", import.meta.url),
      { type: "module" },
    );
    const cache = new Map<
      string,
      { event: LogEvent; result: EventHighlights; bytes: number }
    >();
    const completed = new Set<string>();
    let source = latest.current.inputs;
    let background: LogEvent[] = [];
    let offset = 0;
    let bytes = 0;
    let job: Map<string, LogEvent> | undefined;
    let stopped = false;
    let ready = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const publish = (error?: string) =>
      setState({
        config,
        inputs: source,
        results: new Map([...cache].map(([id, entry]) => [id, entry.result])),
        error,
      });
    const stop = (error?: string) => {
      if (stopped) return;
      stopped = true;
      clearTimeout(timer);
      worker.terminate();
      if (error) publish(error);
    };
    const deadline = (ms: number) => {
      clearTimeout(timer);
      timer = setTimeout(
        () =>
          stop(
            "Highlighting paused: a regex exceeded the time limit. Edit or disable the rule to retry.",
          ),
        ms,
      );
    };
    const remove = (id: string) => {
      const entry = cache.get(id);
      if (!entry) return;
      bytes -= entry.bytes;
      cache.delete(id);
    };
    const limits = { entries: 10_000, bytes: 32 * 1024 * 1024 };
    const schedule = () => {
      if (stopped || job) return;
      const batch = new Map<string, LogEvent>();
      for (const id of latest.current.priority.slice(0, 1000)) {
        const event = source.get(id);
        if (event && !cache.has(id)) batch.set(id, event);
        if (batch.size >= 100) break;
      }
      while (
        batch.size < 100 &&
        offset < background.length &&
        (overview ||
          (cache.size + batch.size < limits.entries &&
            bytes < limits.bytes * 0.8))
      ) {
        const event = background[offset++]!;
        if (!completed.has(event.id) && !cache.has(event.id))
          batch.set(event.id, event);
      }
      if (!batch.size) return;
      job = batch;
      deadline(ready ? 500 : 2000);
      worker.postMessage({
        events: [...batch.values()].map((event) => ({
          ...event,
          message: event.message.slice(0, 200_000),
          messageComplete: event.message.length <= 200_000,
        })),
        profiles,
        theme: preferences.theme,
        columns,
        timezone: preferences.timezone,
        overview,
        needle,
        quick,
        filters,
      });
    };
    const update = () => {
      if (stopped) return;
      const next = latest.current.inputs;
      if (next !== source || !background.length) {
        for (const id of completed)
          if (!sameHighlightEvent(source.get(id), next.get(id)))
            completed.delete(id);
        for (const [id, entry] of cache)
          if (!sameHighlightEvent(entry.event, next.get(id))) remove(id);
        source = next;
        background = [...source.values()];
        offset = 0;
        publish();
      }
      // Recently read rows survive background prefetch and distant scrolling.
      for (const id of latest.current.priority.slice(0, 1000)) {
        const entry = cache.get(id);
        if (entry) {
          cache.delete(id);
          cache.set(id, entry);
        }
      }
      schedule();
    };
    worker.onmessage = ({ data }) => {
      if (stopped || !job) return;
      ready = true;
      deadline(500);
      const batch: { id: string; result: EventHighlights }[] = Array.isArray(
        data.batch,
      )
        ? data.batch
        : typeof data.id === "string"
          ? [data]
          : [];
      let changed = false;
      for (const { id, result } of batch) {
        const event = job.get(id);
        if (!event || !sameHighlightEvent(event, latest.current.inputs.get(id)))
          continue;
        remove(id);
        const cost =
          128 +
          (result.matchKey?.length ?? 0) * 2 +
          Object.values(result.filters ?? {}).reduce(
            (sum, evidence) =>
              sum +
              evidence.paths.reduce((n, path) => n + path.length * 2, 0) +
              evidence.targets.reduce(
                (n, target) =>
                  n +
                  (target.path.length + target.text.length) * 2 +
                  target.ranges.length * 24,
                0,
              ),
            0,
          ) +
          Object.keys(result.paths ?? {}).reduce(
            (sum, path) => sum + path.length * 2 + 32,
            0,
          ) +
          Object.entries(result.text).reduce(
            (sum, [key, spans]) => sum + key.length * 2 + spans.length * 96,
            0,
          ) +
          Object.entries(result.manual ?? {}).reduce(
            (sum, [key, spans]) => sum + key.length * 2 + spans.length * 24,
            0,
          );
        cache.set(id, { event, result, bytes: cost });
        bytes += cost;
        changed = true;
      }
      if (!overview && (cache.size > limits.entries || bytes > limits.bytes)) {
        const protectedIds = new Set(latest.current.priority.slice(0, 1000));
        for (const id of cache.keys()) {
          if (cache.size <= limits.entries && bytes <= limits.bytes) break;
          if (!protectedIds.has(id)) remove(id);
        }
        if (cache.size > limits.entries || bytes > limits.bytes) {
          for (const id of cache.keys()) {
            if (cache.size <= limits.entries && bytes <= limits.bytes) break;
            remove(id);
          }
          stop(
            "Highlighting paused: visible highlights exceed the cache limit. Reduce the displayed columns or simplify highlight rules.",
          );
          return;
        }
      }
      if (changed) publish();
      if (data.done) {
        clearTimeout(timer);
        for (const [id, event] of job)
          if (sameHighlightEvent(event, latest.current.inputs.get(id)))
            completed.add(id);
        job = undefined;
        schedule();
      }
    };
    worker.onerror = () =>
      stop("Highlighting is unavailable. Edit a rule to retry.");
    const session = { update };
    controller.current = session;
    update();
    return () => {
      stop();
      if (controller.current === session) controller.current = undefined;
    };
    // The worker belongs to the rule configuration, not the moving viewport.
  }, [config, active]);
  useEffect(() => controller.current?.update(), [config, inputs, priorityKey]);

  const results = useMemo(() => {
    if (state.config !== config) return new Map<string, EventHighlights>();
    if (state.inputs === inputs) return state.results;
    return new Map(
      [...state.results].filter(([id]) =>
        sameHighlightEvent(state.inputs.get(id), inputs.get(id)),
      ),
    );
  }, [state, config, inputs]);
  return {
    config,
    active,
    results,
    error: state.config === config ? state.error : undefined,
  };
}
