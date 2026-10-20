import { createContext, useEffect, useRef, useState } from "react";
import type { ColumnConfig, LogEvent, Preferences } from "../shared/contracts";
import type { EventHighlights } from "./highlight-engine";

export const EventHighlightContext = createContext<EventHighlights | undefined>(
  undefined,
);
export function useEventHighlights(
  events: LogEvent[],
  preferences: Preferences,
  columns: ColumnConfig[],
  options?: { overview: true; needle: string },
) {
  const overview = options?.overview ?? false;
  const needle = options?.needle ?? "";
  const stableEvents = useRef(events);
  if (
    events.length !== stableEvents.current.length ||
    events.some((event, index) => {
      const previous = stableEvents.current[index];
      return (
        !previous ||
        event.id !== previous.id ||
        event.message !== previous.message ||
        event.logGroup !== previous.logGroup ||
        event.timestamp !== previous.timestamp ||
        event.logStream !== previous.logStream
      );
    })
  )
    stableEvents.current = events;
  const config = JSON.stringify([
    preferences.highlightProfiles ?? [],
    preferences.theme,
    overview,
    needle,
    preferences.timezone,
    columns.map(({ path, format, hidden }) => ({
      path,
      format,
      hidden,
    })),
  ]);
  const ids = overview
    ? stableEvents.current
    : JSON.stringify(
        events.map((event) => [
          event.id,
          event.logGroup,
          event.message.slice(0, 200_000),
        ]),
      );
  const [state, setState] = useState<{
    config: string;
    results: Map<string, EventHighlights>;
    error?: string;
  }>({ config, results: new Map() });
  useEffect(() => {
    const profiles = preferences.highlightProfiles ?? [];
    if (
      !(overview && needle.length > 0 && needle.length <= 200) &&
      !profiles.some(
        (profile) =>
          profile.enabled &&
          profile.rules.some((rule) => rule.enabled && rule.pattern),
      )
    ) {
      setState({ config, results: new Map() });
      return;
    }
    const worker = new Worker(
      new URL("./highlight.worker.ts", import.meta.url),
      { type: "module" },
    );
    let timer: ReturnType<typeof setTimeout>;
    let stopped = false;
    const stop = (error?: string) => {
      if (stopped) return;
      stopped = true;
      clearTimeout(timer);
      worker.terminate();
      if (error) setState((previous) => ({ ...previous, config, error }));
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
    const eventIds = new Set(events.map((event) => event.id));
    let offset = 0;
    const postBatch = () => {
      const batch = overview ? events.slice(offset, offset + 100) : events;
      offset += batch.length;
      worker.postMessage({
        events: batch.map((event) => ({
          ...event,
          message: event.message.slice(0, 200_000),
        })),
        profiles,
        theme: preferences.theme,
        columns,
        timezone: preferences.timezone,
        overview,
        needle,
      });
    };
    setState((previous) => ({
      config,
      results:
        !overview && previous.config === config
          ? new Map([...previous.results].filter(([id]) => eventIds.has(id)))
          : new Map(),
    }));
    worker.onmessage = ({ data }) => {
      if (stopped) return;
      if (data.done) {
        if (overview && offset < events.length) {
          deadline(500);
          postBatch();
          return;
        }
        stop();
        return;
      }
      deadline(500);
      if (Array.isArray(data.batch)) {
        setState((previous) => ({
          config,
          results: new Map([
            ...previous.results,
            ...data.batch.map(
              ({ id, result }: { id: string; result: EventHighlights }) =>
                [id, result] as const,
            ),
          ]),
        }));
      }
      if (typeof data.id === "string")
        setState((previous) => ({
          config,
          results: new Map(previous.results).set(data.id, data.result),
        }));
    };
    worker.onerror = () =>
      stop("Highlighting is unavailable. Edit a rule to retry.");
    deadline(2000);
    postBatch();
    return () => stop();
    // Serialized keys intentionally avoid restarting for equivalent table/virtualizer arrays.
  }, [config, ids]);
  return state.config === config
    ? state
    : { config, results: new Map<string, EventHighlights>() };
}
