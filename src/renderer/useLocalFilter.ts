import { useEffect, useMemo, useRef, useState } from "react";
import type { LogEvent } from "../shared/contracts";
import {
  MESSAGE_LIMIT,
  matchesLocalFilter,
  type LocalFilterOptions,
  type ParsedMessage,
} from "../shared/log-data";

type InputRow = { event: LogEvent; parsed: ParsedMessage };
type CachedMatch = { event: LogEvent; matched: boolean };
const sameInput = (left: LogEvent, right?: LogEvent) =>
  Boolean(
    right &&
    left.id === right.id &&
    left.message === right.message &&
    left.logStream === right.logStream,
  );

/** Arbitrary user regexes execute only in a bounded, terminable worker. */
export function useLocalFilter<T extends InputRow>(
  rows: T[],
  query: string,
  level: string | readonly string[],
  options: LocalFilterOptions,
): { rows: T[]; pending: boolean; error?: string } {
  const regex = Boolean(options.regex && query.length);
  const caseSensitive = Boolean(options.caseSensitive);
  const config = JSON.stringify([query, level, regex, caseSensitive]);
  const stableInputs = useRef(new Map<string, LogEvent>());
  if (
    stableInputs.current.size !== rows.length ||
    rows.some(
      (row) => !sameInput(row.event, stableInputs.current.get(row.event.id)),
    )
  )
    stableInputs.current = new Map(
      rows.map((row) => [row.event.id, row.event]),
    );
  const inputs = stableInputs.current;
  const latest = useRef(inputs);
  latest.current = inputs;
  const controller = useRef<{ update(): void } | undefined>(undefined);
  const [state, setState] = useState<{
    config: string;
    matches: Map<string, CachedMatch>;
    pending: boolean;
    error?: string;
  }>({ config, matches: new Map(), pending: regex });
  const plainRows = useMemo(
    () =>
      regex
        ? []
        : rows.filter((row) =>
            matchesLocalFilter(row.event, row.parsed, query, level, {
              caseSensitive,
            }),
          ),
    [rows, config],
  );

  useEffect(() => {
    if (!regex) return;
    let worker: Worker;
    try {
      worker = new Worker(
        new URL("./local-filter.worker.ts", import.meta.url),
        { type: "module" },
      );
    } catch {
      setState({
        config,
        matches: new Map(),
        pending: false,
        error:
          "Local regex filtering is unavailable. Edit the pattern to retry.",
      });
      return;
    }
    const cache = new Map<string, CachedMatch>();
    let source = latest.current;
    let queue: LogEvent[] = [];
    let offset = 0,
      sequence = 0;
    let job: { id: number; events: Map<string, LogEvent> } | undefined;
    let stopped = false,
      ready = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const publish = (error?: string) =>
      setState({
        config,
        matches: new Map(cache),
        pending: !stopped && (Boolean(job) || offset < queue.length),
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
            "Local filtering paused: a regex exceeded the time limit. Edit the pattern or use plain filtering to retry.",
          ),
        ms,
      );
    };
    const schedule = () => {
      if (stopped || job) return;
      const batch = new Map<string, LogEvent>();
      let characters = 0;
      while (offset < queue.length && batch.size < 100) {
        const event = queue[offset]!;
        if (!sameInput(event, source.get(event.id)) || cache.has(event.id)) {
          offset++;
          continue;
        }
        if (event.message.length > MESSAGE_LIMIT) {
          stop(
            `Local filter regex message limit is ${MESSAGE_LIMIT} characters. Use plain filtering for larger messages.`,
          );
          return;
        }
        if (batch.size && characters + event.message.length > 1_000_000) break;
        offset++;
        batch.set(event.id, event);
        characters += event.message.length;
      }
      if (!batch.size && ready) {
        publish();
        return;
      }
      job = { id: ++sequence, events: batch };
      deadline(ready ? 500 : 2000);
      publish();
      worker.postMessage({
        jobId: job.id,
        events: [...batch.values()],
        query,
        level,
        options: { regex: true, caseSensitive },
      });
    };
    const update = () => {
      if (stopped) return;
      source = latest.current;
      for (const [id, match] of cache)
        if (!sameInput(match.event, source.get(id))) cache.delete(id);
      queue = [...source.values()].filter((event) => !cache.has(event.id));
      offset = 0;
      publish();
      schedule();
    };
    worker.onmessage = ({
      data,
    }: MessageEvent<{
      jobId: number;
      ready?: boolean;
      batch?: { id: string; matched: boolean }[];
      done?: boolean;
      error?: string;
    }>) => {
      if (stopped || !job || data.jobId !== job.id) return;
      if (data.error) {
        stop(data.error);
        return;
      }
      if (data.ready) {
        ready = true;
        deadline(500);
      }
      for (const item of data.batch ?? []) {
        const event = job.events.get(item.id);
        if (event && sameInput(event, latest.current.get(item.id)))
          cache.set(item.id, { event, matched: item.matched });
      }
      if (data.done) {
        clearTimeout(timer);
        ready = true;
        job = undefined;
      }
      publish();
      if (data.done) schedule();
    };
    worker.onerror = () =>
      stop("Local regex filtering is unavailable. Edit the pattern to retry.");
    const session = { update };
    controller.current = session;
    update();
    return () => {
      stop();
      if (controller.current === session) controller.current = undefined;
    };
  }, [config]);
  useEffect(() => controller.current?.update(), [config, inputs]);

  const current = state.config === config;
  const filtered = useMemo(() => {
    if (!regex) return plainRows;
    if (!current) return [];
    return rows.filter((row) => {
      const match = state.matches.get(row.event.id);
      return match?.matched && sameInput(match.event, row.event);
    });
  }, [rows, regex, plainRows, current, state.matches]);
  if (!regex) return { rows: filtered, pending: false };
  const matches = state.matches;
  const error = current ? state.error : undefined;
  return {
    rows: filtered,
    pending:
      !error &&
      (!current ||
        state.pending ||
        rows.some((row) => {
          const match = matches.get(row.event.id);
          return !match || !sameInput(match.event, row.event);
        })),
    ...(error ? { error } : {}),
  };
}
