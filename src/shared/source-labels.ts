import type { Connection, LogEvent, LogSource } from "./contracts";

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
  const title =
    sources[0].logGroup.split("/").filter(Boolean).at(-1) ||
    sources[0].logGroup;
  const streams = sources[0].logStreams;
  if (streams?.length === 1) return `${title} Â· ${shortStreamId(streams[0])}`;
  return streams?.length ? `${title} Â· ${streams.length} streams` : title;
}

// Strip complete shared directory segments, never the shared start of a basename.
export function sourceBadges(sources: LogSource[]) {
  const names = [...new Set(sources.map((source) => source.logGroup))];
  let prefix = names[0]?.slice(0, names[0].lastIndexOf("/") + 1) ?? "";
  while (prefix && names.some((name) => !name.startsWith(prefix)))
    prefix = prefix.slice(0, prefix.slice(0, -1).lastIndexOf("/") + 1);
  return sources.flatMap((source, sourceIndex) => {
    const label = source.logGroup.slice(prefix.length) || source.logGroup;
    return source.logStreams?.length
      ? source.logStreams.map((stream) => ({
          sourceIndex,
          stream,
          label: `${label} · ${shortStreamId(stream)}`,
        }))
      : [{ sourceIndex, stream: undefined as string | undefined, label }];
  });
}

export function eventSourceDisplay(
  event: LogEvent,
  sources: LogSource[],
  connections: Connection[],
  defaultConnectionId: string,
): { label: string; detail: string } {
  const connectionId = event.connectionId ?? defaultConnectionId;
  const connection = connections.find((item) => item.id === connectionId);
  const badges = sourceBadges(sources);
  const matches = badges.filter((badge) => {
    const source = sources[badge.sourceIndex];
    return (
      source.logGroup === event.logGroup &&
      (source.connectionId ?? defaultConnectionId) === connectionId &&
      (!badge.stream || badge.stream === event.logStream)
    );
  });
  const badge = matches[0];
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
  return {
    label,
    detail: [event.logGroup, event.logStream, endpoint]
      .filter(Boolean)
      .join("\n"),
  };
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
