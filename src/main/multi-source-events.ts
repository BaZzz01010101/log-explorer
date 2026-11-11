import { createHash, randomUUID } from "node:crypto";
import type {
  Connection,
  LogEvent,
  QueryRequest,
  QueryUpdate,
} from "../shared/contracts";
import { throwIfAborted, type LogAdapter } from "./aws-adapter";

export function scopedQueries(request: QueryRequest): QueryRequest[] {
  const connections = [request.connection, ...(request.connections ?? [])];
  if (
    new Set(connections.map((connection) => connection.id)).size !==
    connections.length
  )
    throw new Error("Source connection IDs must be unique.");
  const groups = new Map<string, QueryRequest>();
  for (const source of request.sources) {
    const id = source.connectionId ?? request.connection.id;
    const connection = connections.find((connection) => connection.id === id);
    if (!connection) throw new Error("A source connection no longer exists.");
    let scoped = groups.get(id);
    if (!scoped) {
      scoped = { ...request, connection, connections: undefined, sources: [] };
      groups.set(id, scoped);
    }
    scoped.sources.push({
      logGroup: source.logGroup,
      ...(source.logStreams?.length ? { logStreams: source.logStreams } : {}),
      ...(source.gcp ? { gcp: { ...source.gcp } } : {}),
    });
  }
  return [...groups.values()];
}

interface Partition {
  cursor?: string;
  done: boolean;
  events: LogEvent[];
}
interface Continuation {
  signature: string;
  expires: number;
  partitions: Partition[];
  characters: number;
}

// The existing adapters own service tokens. This bounded merge owns only the
// small unread heads needed to preserve ordering across connections and pages.
export function createMultiSourceEvents(
  adapterFor: (connection: Connection) => LogAdapter,
) {
  const continuations = new Map<string, Continuation>();
  return {
    clear: () => continuations.clear(),
    async events(
      request: QueryRequest,
      signal: AbortSignal,
      onProgress?: (update: QueryUpdate) => void,
    ): Promise<QueryUpdate> {
      try {
        const started = Date.now();
        for (const [key, value] of continuations)
          if (value.expires <= started) continuations.delete(key);
        const signature = createHash("sha256")
          .update(
            JSON.stringify({
              ...request,
              requestId: undefined,
              cursor: undefined,
            }),
          )
          .digest("hex");
        const saved = request.cursor
          ? continuations.get(request.cursor)
          : undefined;
        if (request.cursor && (!saved || saved.signature !== signature))
          throw new Error(
            "Continuation expired or belongs to a different query. Run the query again.",
          );
        const queries = scopedQueries(request).flatMap((query) =>
          query.sources.map((source) => ({ ...query, sources: [source] })),
        );
        const partitions: Partition[] = saved
          ? structuredClone(saved.partitions)
          : queries.map(() => ({ done: false, events: [] }));
        const chunk = Math.max(
          1,
          Math.min(256, Math.ceil(request.limit / queries.length)),
        );
        const events: LogEvent[] = [];
        let truncated = false;
        let messageCharacters = 0;
        let reads = 0;
        let published = 0;
        while (events.length < request.limit) {
          throwIfAborted(signal);
          // Fetch independent heads concurrently, bounded under the parent query slot.
          let unresolved = false;
          const needed = queries.map((_, index) => index).filter((index) => !partitions[index].done && !partitions[index].events.length);
          for (let offset = 0; offset < needed.length; offset += 4) {
            const batch = needed.slice(offset, offset + Math.min(4, 128 - reads));
            if (!batch.length) { unresolved = true; break; }
            reads += batch.length;
            const results = await Promise.allSettled(batch.map((index) => {
              const query = queries[index];
              return adapterFor(query.connection).events({ ...query, cursor: partitions[index].cursor, limit: chunk }, signal);
            }));
            throwIfAborted(signal);
            const failure = results.find((result) => result.status === "rejected");
            if (failure?.status === "rejected") throw failure.reason;
            for (let position = 0; position < batch.length; position++) {
            const index = batch[position], partition = partitions[index], query = queries[index];
            const result = (results[position] as PromiseFulfilledResult<QueryUpdate>).value;
            if (result.state === "error")
              throw new Error(result.error ?? "A source query failed.");
            partition.events = (result.events ?? [])
              .map((event) => ({
                ...event,
                connectionId: query.connection.id,
                id: JSON.stringify([query.connection.id, event.id]),
              }))
              .sort(
                (a, b) => a.timestamp - b.timestamp || a.id.localeCompare(b.id),
              );
            partition.done = !result.cursor;
            partition.cursor = result.cursor;
            truncated ||= !!result.truncated;
            if (!partition.done && !partition.events.length) unresolved = true;
            }
            if (batch.length < 4 && offset + batch.length < needed.length) { unresolved = true; break; }
          }
          // An adapter may pause a sparse scan with an empty continuation. Do not
          // emit another region's later events until that head becomes known.
          if (unresolved) break;
          let selected = -1;
          for (let index = 0; index < partitions.length; index++) {
            const head = partitions[index].events[0];
            if (!head) continue;
            const prior =
              selected < 0 ? undefined : partitions[selected].events[0];
            if (
              !prior ||
              head.timestamp < prior.timestamp ||
              (head.timestamp === prior.timestamp && head.id < prior.id)
            )
              selected = index;
          }
          if (selected < 0) break;
          const head = partitions[selected].events[0];
          if (messageCharacters + head.message.length > 16_000_000) {
            if (!events.length)
              throw new Error(
                "An event exceeds the source merge message limit. Narrow the query and retry.",
              );
            break;
          }
          messageCharacters += head.message.length;
          events.push(partitions[selected].events.shift()!);
          if (onProgress && events.length - published >= 256) {
            onProgress({ requestId: request.requestId, state: "running", events: events.slice(published), replace: !request.cursor && published === 0 });
            published = events.length;
          }
        }
        let cursor: string | undefined;
        if (
          partitions.some(
            (partition) => !partition.done || partition.events.length,
          )
        ) {
          cursor = request.cursor ?? `sources:${randomUUID()}`;
          const retained = partitions.reduce(
            (sum, partition) =>
              sum +
              partition.events.reduce(
                (sum, event) => sum + event.message.length,
                0,
              ),
            0,
          );
          if (retained > 16_000_000)
            throw new Error(
              "Source merge buffer limit reached. Narrow the query and retry.",
            );
          continuations.delete(cursor);
          let total = [...continuations.values()].reduce(
            (sum, entry) => sum + entry.characters,
            0,
          );
          while (
            continuations.size &&
            (continuations.size >= 16 || total + retained > 16_000_000)
          ) {
            const key = continuations.keys().next().value!;
            total -= continuations.get(key)!.characters;
            continuations.delete(key);
          }
          continuations.set(cursor, {
            signature,
            expires: Date.now() + 15 * 60000,
            partitions,
            characters: retained,
          });
        } else if (request.cursor) continuations.delete(request.cursor);
        return {
          requestId: request.requestId,
          state: "complete",
          events: events.slice(published),
          cursor,
          replace: !request.cursor && published === 0,
          truncated,
          stats: {
            recordsMatched: events.length,
            elapsedMs: Date.now() - started,
          },
        };
      } catch (error) {
        if (request.cursor) continuations.delete(request.cursor);
        throw error;
      }
    },
  };
}
