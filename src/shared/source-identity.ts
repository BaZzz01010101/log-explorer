import type { Connection, LogSource } from "./contracts";

export function sourceIdentity(
  connectionId: string,
  sources: LogSource[],
  connections?: Connection | Connection[],
): string {
  const available = Array.isArray(connections)
    ? connections
    : connections
      ? [connections]
      : [];
  return JSON.stringify(
    sources
      .map((source) => {
        const id = source.connectionId ?? connectionId;
        const connection = available.find((item) => item.id === id);
        return [
          id,
          connection?.profile,
          connection?.region,
          connection?.mode,
          source.logGroup,
          [...(source.logStreams ?? [])].sort(),
        ];
      })
      .sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b))),
  );
}
