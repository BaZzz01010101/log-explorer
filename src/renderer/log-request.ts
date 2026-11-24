import type { Connection, LogTab, QueryRequest } from "../shared/contracts";
import { compileGcpViewFilter } from "../shared/gcp-server-filter";
import { queryPageLimit } from "../shared/log-query-limits";
import { resolveTimeRange } from "../shared/query-state";
import { compileAwsViewFilter } from "../shared/server-filter";

/** The time fields whose change runs a view again. */
export function timeIdentity(tab: LogTab): string {
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

/** The request for a view's current sources, time range and filter. */
export function newRequest(
  tab: LogTab,
  connection: Connection,
  connections: Connection[],
  options: { live: boolean; maxEvents: number },
): QueryRequest {
  const modes = new Set(
    tab.sources.map(
      (item) =>
        connections.find(
          (candidate) =>
            candidate.id === (item.connectionId ?? tab.connectionId),
        )?.mode,
    ),
  );
  const otherProvider = modes.has("aws") || modes.has("offline");
  const gcpFilter = modes.has("gcp")
    ? compileGcpViewFilter(
        tab.filterPattern,
        tab.filterMode,
        tab.gcpLogType,
        otherProvider,
      )
    : { pattern: "", local: undefined };
  const otherIds = new Set(
    tab.sources
      .map((source) => source.connectionId)
      .filter((id): id is string => !!id && id !== connection.id),
  );
  const recent = tab.timePreset === "clear" && !options.live;
  return {
    requestId: crypto.randomUUID(),
    connection: { ...connection },
    connections: [...otherIds].map((id) => {
      const selected = connections.find((item) => item.id === id);
      if (!selected) throw new Error("A source connection no longer exists.");
      return { ...selected };
    }),
    sources: tab.sources.map((item) => ({
      ...item,
      ...(item.logStreams ? { logStreams: [...item.logStreams] } : {}),
    })),
    ...resolveTimeRange(tab.timePreset, tab.customStart, tab.customEnd),
    kind: "events",
    filterPattern: otherProvider
      ? compileAwsViewFilter(tab.filterPattern, tab.filterMode)
      : "",
    gcpFilterPattern: gcpFilter.pattern,
    ...(gcpFilter.local ? { gcpLocalFilter: gcpFilter.local } : {}),
    query: "",
    ...(recent ? { direction: "older" as const } : {}),
    limit: recent
      ? Math.min(1000, Math.max(1, Math.floor(options.maxEvents / 4)))
      : queryPageLimit(modes, options.maxEvents),
  };
}
