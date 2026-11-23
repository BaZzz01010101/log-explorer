import type { Connection, LogEvent, LogSource } from "./contracts";
import { formatSourceName, type SourceNameFormats } from "./display-rules";

export const sourceCount = (sources: LogSource[]): number =>
  sources.reduce(
    (count, source) => count + (source.logStreams?.length || 1),
    0,
  );

export function shortStreamId(name: string): string {
  const tail = name.split("/").filter(Boolean).at(-1) || name;
  return (
    tail.includes("]") ? tail.slice(tail.lastIndexOf("]") + 1) || tail : tail
  ).slice(0, 6);
}

export function tabTitle(sources: LogSource[]): string {
  const count = sourceCount(sources);
  if (count > 1) return "Mixed Sources";
  if (!sources.length) return "Log view";
  if (sources[0].gcp?.kind === "function") return sources[0].gcp.functionName ?? "Function";
  if (sources[0].gcp?.kind === "kubernetes") return `${sources[0].gcp.container ?? "Container"} · ${sources[0].gcp.cluster ?? "Cluster"}`;
  const title =
    sources[0].logGroup.split("/").filter(Boolean).at(-1) ||
    sources[0].logGroup;
  const streams = sources[0].logStreams;
  if (streams?.length === 1) return `${title} · ${shortStreamId(streams[0])}`;
  return streams?.length ? `${title} · ${streams.length} streams` : title;
}

/** Google Cloud sources name themselves; their paths only repeat the kind. */
function gcpLabel(source: LogSource): string | undefined {
  const gcp = source.gcp;
  if (gcp?.kind === "function") return gcp.functionName;
  if (gcp?.kind === "kubernetes")
    return [gcp.container, gcp.cluster].filter(Boolean).join(" · ") || undefined;
  return undefined;
}

const sourceFormat = (source: LogSource, formats?: SourceNameFormats) =>
  (source.gcp ? formats?.gcp : formats?.aws)?.trim() || undefined;

/** Values for the `{PLACEHOLDER}`s of a source name format. */
function sourceNameValues(
  source: LogSource,
  name: string,
  stream: string | undefined,
  connection: Connection | undefined,
  event?: LogEvent,
): Record<string, string | undefined> {
  const gcp = source.gcp;
  if (gcp)
    return {
      NAME: gcp.container ?? gcp.functionName,
      FULL_NAME: source.logGroup,
      CLUSTER: gcp.cluster,
      NAMESPACE: event?.gcpSource?.namespace ?? gcp.namespace,
      REGION: event?.gcpSource?.region ?? gcp.region ?? connection?.region,
      PROJECT: gcp.project,
    };
  return {
    NAME: name,
    FULL_NAME: source.logGroup,
    STREAM: stream ? shortStreamId(stream) : undefined,
    FULL_STREAM: stream,
    REGION: connection?.region,
    PROFILE: connection?.profile,
  };
}

/** Full, unformatted source details, one `Field: value` per line. */
export function sourceDetails(
  source: LogSource,
  stream: string | undefined,
  connection: Connection | undefined,
): string {
  const gcp = source.gcp;
  const lines: [string, string | undefined][] = gcp
    ? [
        gcp.kind === "kubernetes"
          ? ["Container", gcp.container]
          : ["Function", gcp.functionName],
        ["Cluster", gcp.cluster],
        ["Namespace", gcp.namespace],
        ["Project", gcp.project],
        ["Region", gcp.region || connection?.region],
        ["Account", connection?.gcpIdentity?.account],
        ["Source", source.logGroup],
      ]
    : [
        ["Log group", source.logGroup],
        ["Log stream", stream],
        ["Profile", connection?.profile],
        ["Region", connection?.region],
      ];
  return lines
    .filter((line): line is [string, string] => Boolean(line[1]))
    .map(([field, value]) => `${field}: ${value}`)
    .join("\n");
}

export interface SourceLabelOptions {
  formats?: SourceNameFormats;
  connections?: Connection[];
  connectionId?: string;
}

// Strip complete shared directory segments, never the shared start of a basename.
export function sourceBadges(
  sources: LogSource[],
  options: SourceLabelOptions = {},
) {
  const names = [
    ...new Set(
      sources.filter((source) => !gcpLabel(source)).map((source) => source.logGroup),
    ),
  ];
  let prefix = names[0]?.slice(0, names[0].lastIndexOf("/") + 1) ?? "";
  while (prefix && names.some((name) => !name.startsWith(prefix)))
    prefix = prefix.slice(0, prefix.slice(0, -1).lastIndexOf("/") + 1);
  return sources.flatMap((source, sourceIndex) => {
    const name = source.logGroup.slice(prefix.length) || source.logGroup;
    const label = gcpLabel(source) ?? name;
    const format = sourceFormat(source, options.formats);
    const connection = options.connections?.find(
      (item) => item.id === (source.connectionId ?? options.connectionId),
    );
    const badge = (stream: string | undefined, automatic: string) => {
      const formatted =
        format &&
        formatSourceName(
          format,
          sourceNameValues(source, name, stream, connection),
        );
      return {
        sourceIndex,
        stream,
        name,
        label: formatted || automatic,
        formatted: Boolean(formatted),
      };
    };
    return source.logStreams?.length
      ? source.logStreams.map((stream) =>
          badge(stream, `${label} · ${shortStreamId(stream)}`),
        )
      : [badge(undefined, label)];
  });
}

export function eventSourceDisplay(
  event: LogEvent,
  sources: LogSource[],
  connections: Connection[],
  defaultConnectionId: string,
  formats?: SourceNameFormats,
): { label: string; detail: string } {
  const connectionId = event.connectionId ?? defaultConnectionId;
  const connection = connections.find((item) => item.id === connectionId);
  const badges = sourceBadges(sources);
  const matches = badges.filter((badge) =>
    eventInSourceBadge(
      event,
      sources[badge.sourceIndex],
      badge.stream,
      defaultConnectionId,
    ),
  );
  const badge = matches[0];
  const detail = [
    event.logGroup,
    event.gcpSource?.namespace,
    event.logStream,
    connection ? connection.profile + " / " + connection.region : connectionId,
  ]
    .filter(Boolean)
    .join("\n");
  const format = badge && sourceFormat(sources[badge.sourceIndex], formats);
  const formatted =
    format &&
    formatSourceName(
      format,
      sourceNameValues(
        sources[badge.sourceIndex],
        badge.name,
        event.logStream || badge.stream,
        connection,
        event,
      ),
    );
  if (formatted) return { label: formatted, detail };
  let label = badge?.label ?? (event.logGroup || "—");
  if (
    badge?.stream &&
    badges.some(
      (other) =>
        other !== badge &&
        other.label === badge.label &&
        other.stream !== badge.stream &&
        (sources[other.sourceIndex].connectionId ?? defaultConnectionId) ===
          connectionId,
    )
  )
    label = label.slice(0, label.lastIndexOf(" · ")) + " · " + event.logStream;
  const multipleConnections =
    new Set(sources.map((source) => source.connectionId ?? defaultConnectionId))
      .size > 1;
  const endpoint = connection
    ? connection.profile + " / " + connection.region
    : connectionId;
  if (multipleConnections) label += " · " + endpoint;
  return { label, detail };
}

export function removeSource(
  sources: LogSource[],
  index: number,
  stream?: string,
): LogSource[] {
  return sources.flatMap((source, position) => {
    if (position !== index) return [source];
    if (!stream) return [];
    const logStreams =
      source.logStreams?.filter((name) => name !== stream) ?? [];
    return logStreams.length ? [{ ...source, logStreams }] : [];
  });
}

/** Identifies one source badge (a group, or one stream of it) across renders and saves. */
export function sourceBadgeKey(
  source: LogSource,
  stream: string | undefined,
  defaultConnectionId: string,
): string {
  return JSON.stringify([
    source.connectionId ?? defaultConnectionId,
    source.logGroup,
    source.gcp ?? null,
    stream ?? null,
  ]);
}

/** True when an event was returned for this source badge. */
export function eventInSourceBadge(
  event: LogEvent,
  source: LogSource,
  stream: string | undefined,
  defaultConnectionId: string,
): boolean {
  return (
    source.logGroup === event.logGroup &&
    (event.connectionId ?? defaultConnectionId) ===
      (source.connectionId ?? defaultConnectionId) &&
    (!event.gcpSource ||
      JSON.stringify(source.gcp) === JSON.stringify(event.gcpSource)) &&
    (!stream || stream === event.logStream)
  );
}

/**
 * Builds a predicate for events of hidden source badges, or undefined when no
 * current badge is hidden. Hiding is local: the sources are still queried.
 */
export function hiddenSourcePredicate(
  sources: LogSource[],
  hidden: readonly string[] | undefined,
  defaultConnectionId: string,
): ((event: LogEvent) => boolean) | undefined {
  if (!hidden?.length) return undefined;
  const keys = new Set(hidden);
  const badges = sourceBadges(sources).filter(({ sourceIndex, stream }) =>
    keys.has(sourceBadgeKey(sources[sourceIndex], stream, defaultConnectionId)),
  );
  if (!badges.length) return undefined;
  return (event) =>
    badges.some(({ sourceIndex, stream }) =>
      eventInSourceBadge(event, sources[sourceIndex], stream, defaultConnectionId),
    );
}

/** Keeps only hidden keys that still name a badge of `sources`. */
export function pruneHiddenSources(
  sources: LogSource[],
  hidden: readonly string[] | undefined,
  defaultConnectionId: string,
): string[] {
  const current = new Set(
    sourceBadges(sources).map(({ sourceIndex, stream }) =>
      sourceBadgeKey(sources[sourceIndex], stream, defaultConnectionId),
    ),
  );
  return (hidden ?? []).filter((key) => current.has(key));
}
