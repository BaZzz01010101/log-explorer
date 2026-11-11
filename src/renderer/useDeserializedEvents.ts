import { useCallback, useMemo, useRef, useState } from "react";
import type { LogEvent } from "../shared/contracts";
import { inferLevel } from "../shared/log-data";
import type { EventRow } from "./components/EventMessage";
import {
  deserializeJsonField,
  type FieldDecoding,
} from "./json-deserialization";

// View-only projections use weak event identities: original records remain
// untouched and evicted/replaced events cannot retain stale decoded content.
export function useDeserializedEvents(
  events: LogEvent[],
  prepare: (event: LogEvent) => EventRow,
) {
  const projections = useRef(
    new WeakMap<
      LogEvent,
      {
        row: EventRow;
        paths: ReadonlySet<string>;
        labels: ReadonlyMap<string, string>;
      }
    >(),
  );
  const [revision, setRevision] = useState(0);
  const rows = useMemo(
    () =>
      events.map(
        (event) => projections.current.get(event)?.row ?? prepare(event),
      ),
    [events, revision, prepare],
  );
  const deserialize = useCallback(
    (event: LogEvent, path: string, encoding?: FieldDecoding) => {
      const previous = projections.current.get(event);
      const original = previous?.row ?? prepare(event);
      if (original.parsed.kind !== "json") return;
      const result = deserializeJsonField(
        original.parsed.value!,
        path,
        encoding,
      );
      if (!result) return;
      const parsed = { kind: "json" as const, value: result.value };
      const labels = new Map(previous?.labels);
      labels.set(
        path,
        encoding === "url"
          ? "URL decoded"
          : encoding === "base64"
            ? "Base64 decoded"
            : "deserialized",
      );
      projections.current.set(event, {
        row: { ...original, parsed, level: inferLevel(parsed, event.message, event.severity) },
        paths: new Set([...(previous?.paths ?? []), path]),
        labels,
      });
      setRevision((value) => value + 1);
    },
    [prepare],
  );
  const pathsFor = useCallback(
    (event: LogEvent) => projections.current.get(event)?.paths,
    [],
  );
  const labelsFor = useCallback(
    (event: LogEvent) => projections.current.get(event)?.labels,
    [],
  );
  const parsedFor = useCallback(
    (event: LogEvent) =>
      (projections.current.get(event)?.row ?? prepare(event)).parsed,
    [prepare],
  );
  return { rows, deserialize, pathsFor, labelsFor, parsedFor };
}
