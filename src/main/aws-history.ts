import { randomUUID } from "node:crypto";
import type { FilterLogEventsCommandOutput } from "@aws-sdk/client-cloudwatch-logs";
import type { QueryRequest, QueryUpdate } from "../shared/contracts";
import { throwIfAborted } from "./async";
import {
  awsSdk,
  filteredEvents,
  identifier,
  onlySource,
  querySignature,
  type SendCommand,
} from "./aws-common";

/** Empty pages one request may follow while the service searches the range. */
const MAX_PAGES = 32;
const MAX_TOKENS = 256;
const MAX_CURSORS = 128;
const CURSOR_LIFETIME_MS = 15 * 60000;

interface HistoryCursor {
  signature: string;
  token?: string;
  seen: string[];
  expires: number;
}

/** Oldest-first pages of one source. */
export function createHistoryEvents(send: SendCommand) {
  const cursors = new Map<string, HistoryCursor>();
  return {
    async events(
      request: QueryRequest,
      signal: AbortSignal,
    ): Promise<QueryUpdate> {
      const source = onlySource(request);
      const started = Date.now();
      const signature = querySignature(request);
      for (const [id, value] of cursors)
        if (value.expires <= started) cursors.delete(id);
      const saved = request.cursor ? cursors.get(request.cursor) : undefined;
      if (request.cursor && (!saved || saved.signature !== signature))
        throw new Error(
          "Continuation expired or belongs to a different query. Run the query again.",
        );
      let token = saved?.token;
      const seen = [...(saved?.seen ?? [])];
      let truncated = false;
      let found: QueryUpdate["events"] = [];
      // FilterLogEvents may return empty pages while still searching the range.
      // A remaining token is kept so the user can continue a sparse scan.
      for (let page = 0; page < MAX_PAGES; page++) {
        throwIfAborted(signal);
        const response = await send<FilterLogEventsCommandOutput>(
          new (await awsSdk()).FilterLogEventsCommand({
            ...identifier(source.logGroup),
            logStreamNames: source.logStreams?.length
              ? source.logStreams
              : undefined,
            startTime: request.startTime,
            endTime: request.endTime,
            filterPattern: request.filterPattern || undefined,
            nextToken: token,
            limit: Math.min(10000, request.limit),
          }),
          signal,
        );
        throwIfAborted(signal);
        token = response.nextToken;
        if (token && (seen.includes(token) || seen.length >= MAX_TOKENS)) {
          token = undefined;
          truncated = true;
        } else if (token) seen.push(token);
        found = filteredEvents(response, source, request);
        if (found.length || !token) break;
      }
      const events = [
        ...new Map(
          found
            .sort(
              (a, b) => a.timestamp - b.timestamp || a.id.localeCompare(b.id),
            )
            .map((event) => [event.id, event]),
        ).values(),
      ];
      let cursor: string | undefined;
      if (token) {
        cursor = request.cursor ?? randomUUID();
        if (!cursors.has(cursor) && cursors.size >= MAX_CURSORS)
          cursors.delete(cursors.keys().next().value!);
        cursors.set(cursor, {
          signature,
          token,
          seen,
          expires: Date.now() + CURSOR_LIFETIME_MS,
        });
      } else if (request.cursor) cursors.delete(request.cursor);
      return {
        requestId: request.requestId,
        state: "complete",
        events: events.slice(0, request.limit),
        replace: !request.cursor,
        cursor,
        truncated: truncated || events.length > request.limit,
        stats: {
          recordsMatched: events.length,
          elapsedMs: Date.now() - started,
        },
      };
    },
    clear: () => cursors.clear(),
  };
}
