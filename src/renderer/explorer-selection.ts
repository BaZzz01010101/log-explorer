import type { LogSource } from "../shared/contracts";
import type { ResourcePayload } from "./resource-drag";

export interface SelectedResource {
  key: string;
  connectionId: string;
  logGroup: string;
  logStream?: string;
}

export function selectionPayload(
  resources: Iterable<SelectedResource>,
  connectionId: string,
): ResourcePayload {
  const groups = new Map<string, Set<string> | null>();
  for (const resource of resources) {
    if (resource.connectionId !== connectionId) continue;
    if (resource.logStream === undefined) groups.set(resource.logGroup, null);
    else if (groups.get(resource.logGroup) !== null) {
      const streams = groups.get(resource.logGroup) ?? new Set<string>();
      streams.add(resource.logStream);
      groups.set(resource.logGroup, streams);
    }
  }
  const sources: LogSource[] = [...groups].map(([logGroup, streams]) =>
    streams ? { logGroup, logStreams: [...streams] } : { logGroup },
  );
  return { connectionId, sources };
}

export function changeExplorerSelection(
  previous: Map<string, SelectedResource>,
  rows: SelectedResource[],
  resource: SelectedResource,
  anchor: string | null,
  mode: "toggle" | "range" | "add-range" | "context" | "single",
): Map<string, SelectedResource> {
  if (mode === "context" && previous.has(resource.key)) return previous;
  if (mode === "single" || mode === "context")
    return new Map([[resource.key, resource]]);
  const range = mode === "range" || mode === "add-range";
  const next =
    mode === "range" ? new Map<string, SelectedResource>() : new Map(previous);
  const start = rows.findIndex((item) => item.key === anchor);
  const end = rows.findIndex((item) => item.key === resource.key);
  const additions =
    range && start >= 0 && end >= 0
      ? rows.slice(Math.min(start, end), Math.max(start, end) + 1)
      : [resource];
  if (!range && next.has(resource.key)) next.delete(resource.key);
  else
    for (const item of additions) {
      const groups = new Set(
        [...next.values()]
          .filter((value) => value.connectionId === item.connectionId)
          .map((value) => value.logGroup),
      );
      if (groups.has(item.logGroup) || groups.size < 50)
        next.set(item.key, item);
    }
  return next;
}
