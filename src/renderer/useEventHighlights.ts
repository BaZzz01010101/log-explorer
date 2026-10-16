import { createContext, useEffect, useState } from "react";
import type { ColumnConfig, LogEvent, Preferences } from "../shared/contracts";
import type { EventHighlights } from "./highlight-engine";

export const EventHighlightContext = createContext<EventHighlights | undefined>(
  undefined,
);
export function useEventHighlights(
  events: LogEvent[],
  preferences: Preferences,
  columns: ColumnConfig[],
) {
  const config = JSON.stringify([
    preferences.highlightProfiles ?? [],
    preferences.theme,
    preferences.timezone,
    columns.map(({ path, format, hidden }) => ({ path, format, hidden })),
  ]);
  const ids = JSON.stringify(
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
    setState((previous) => ({
      config,
      results:
        previous.config === config
          ? new Map(
              [...previous.results].filter(([id]) =>
                events.some((event) => event.id === id),
              ),
            )
          : new Map(),
    }));
    worker.onmessage = ({ data }) => {
      if (stopped) return;
      if (data.done) {
        stop();
        return;
      }
      deadline(500);
      if (typeof data.id === "string")
        setState((previous) => ({
          config,
          results: new Map(previous.results).set(data.id, data.result),
        }));
    };
    worker.onerror = () =>
      stop("Highlighting is unavailable. Edit a rule to retry.");
    deadline(2000);
    worker.postMessage({
      events: events.map((event) => ({
        ...event,
        message: event.message.slice(0, 200_000),
      })),
      profiles,
      theme: preferences.theme,
      columns,
      timezone: preferences.timezone,
    });
    return () => stop();
    // Serialized keys intentionally avoid restarting for equivalent table/virtualizer arrays.
  }, [config, ids]);
  return state.config === config
    ? state
    : { config, results: new Map<string, EventHighlights>() };
}
