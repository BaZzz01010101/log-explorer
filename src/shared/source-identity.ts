import type {
  Connection,
  GcpLogSource,
  LogSource,
  QueryRequest,
} from "./contracts";

/**
 * A Google Cloud source in one key order, for comparing as JSON. Validated
 * copies list their fields in schema order, freshly opened sources do not.
 */
export function comparableGcp(
  source: GcpLogSource | undefined,
): GcpLogSource | null {
  return source
    ? {
        kind: source.kind,
        project: source.project,
        region: source.region,
        functionName: source.functionName,
        generation: source.generation,
        service: source.service,
        cluster: source.cluster,
        namespace: source.namespace,
        container: source.container,
      }
    : null;
}

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
          connection?.gcpIdentity ?? null,
          source.logGroup,
          comparableGcp(source.gcp),
          [...(source.logStreams ?? [])].sort(),
        ];
      })
      .sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b))),
  );
}

/** The sources and connections a request reads. */
export function requestSource(request: QueryRequest): string {
  return sourceIdentity(request.connection.id, request.sources, [
    request.connection,
    ...(request.connections ?? []),
  ]);
}
