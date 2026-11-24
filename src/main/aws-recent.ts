import { randomUUID } from "node:crypto";
import type {
  DescribeLogGroupsCommandOutput,
  DescribeLogStreamsCommandOutput,
  FilterLogEventsCommandOutput,
} from "@aws-sdk/client-cloudwatch-logs";
import type {
  LogEvent,
  LogSource,
  QueryRequest,
  QueryUpdate,
} from "../shared/contracts";
import { throwIfAborted } from "./async";
import {
  awsSdk,
  filteredEvents,
  identifier,
  nameFromIdentifier,
  onlySource,
  querySignature,
  type SendCommand,
} from "./aws-common";

/** Calls one page may use to find events in sparse history. */
const MAX_CALLS = 32;
const MAX_CURSORS = 128;
const MAX_BUFFERED_CHARACTERS = 32_000_000;
/** A larger window is split instead of buffered. */
const MAX_WINDOW_CHARACTERS = 8_000_000;
const CURSOR_LIFETIME_MS = 23 * 3600000;

interface RecentCursor {
  signature: string;
  expires: number;
  /** `recent` pages come newest first; `old` windows are sorted here. */
  phase: "recent" | "old";
  token?: string;
  seen: string[];
  floor: number;
  recentStart: number;
  end: number;
  span: number;
  start?: number;
  buffer: LogEvent[];
  ready: boolean;
}

const characters = (cursor: RecentCursor) =>
  cursor.buffer.reduce((sum, event) => sum + event.message.length, 0);

/**
 * Bounds a Recent search with metadata. CloudWatch accepts events at most 14
 * days older than ingestion and within retention (expired events are deleted
 * up to 3 days late), so nothing predates `floor`. `ceiling` is the newest
 * event the selected streams (or the whole group) can hold; stream metadata may lag by about an
 * hour, so callers still search the latest hours. Missing permissions or
 * metadata leave the search unbounded.
 */
async function recentBounds(
  send: SendCommand,
  source: LogSource,
  signal: AbortSignal,
): Promise<{ floor: number; ceiling?: number }> {
  const day = 86400000;
  const sdk = await awsSdk();
  const quiet = <T>(operation: Promise<T>) =>
    operation.catch(() => {
      throwIfAborted(signal);
      return undefined;
    });
  const name = nameFromIdentifier(source.logGroup);
  const names = source.logStreams ?? [];
  const [groups, streams] = await Promise.all([
    quiet(
      send<DescribeLogGroupsCommandOutput>(
        new sdk.DescribeLogGroupsCommand({
          logGroupIdentifiers: [source.logGroup.replace(/:\*$/, "")],
        }),
        signal,
      ),
    ),
    names.length && names.length <= 20
      ? Promise.all(
          names.map((stream) =>
            quiet(
              send<DescribeLogStreamsCommandOutput>(
                new sdk.DescribeLogStreamsCommand({
                  ...identifier(source.logGroup),
                  logStreamNamePrefix: stream,
                  limit: 50,
                }),
                signal,
              ),
            ).then((response) =>
              // null: the listing succeeded and the stream does not exist.
              Array.isArray(response?.logStreams)
                ? (response.logStreams.find(
                    (item) => item.logStreamName === stream,
                  ) ?? null)
                : undefined,
            ),
          ),
        )
      : names.length
        ? undefined
        : // The newest stream bounds the whole group: one listing replaces
          // a year-long scan of an idle group's streams.
          quiet(
            send<DescribeLogStreamsCommandOutput>(
              new sdk.DescribeLogStreamsCommand({
                ...identifier(source.logGroup),
                orderBy: "LastEventTime",
                descending: true,
                limit: 1,
              }),
              signal,
            ),
          ).then((response) =>
            Array.isArray(response?.logStreams)
              ? response.logStreams
              : undefined,
          ),
  ]);
  let floor = -Infinity;
  const group = groups?.logGroups?.find((item) => item.logGroupName === name);
  if (group?.retentionInDays)
    floor = Math.max(floor, Date.now() - (group.retentionInDays + 3) * day);
  if (group?.creationTime)
    floor = Math.max(floor, group.creationTime - 15 * day);
  if (!streams || streams.some((stream) => stream === undefined))
    return { floor };
  const found = streams.filter((stream) => stream !== null) as Array<
    NonNullable<(typeof streams)[number]>
  >;
  // Missing streams (or a group without streams) hold no events outside
  // the lag window.
  if (!found.length) return { floor, ceiling: -Infinity };
  if (!found.every((stream) => stream.creationTime)) return { floor };
  // Only a full stream selection bounds the oldest possible event.
  if (names.length)
    floor = Math.max(
      floor,
      Math.min(...found.map((stream) => stream.creationTime!)) - 15 * day,
    );
  // Events may be stamped up to 2 hours ahead of ingestion.
  const ceiling =
    Math.max(
      ...found.map((stream) =>
        Math.max(
          stream.creationTime!,
          stream.lastEventTimestamp ?? 0,
          stream.lastIngestionTime ?? 0,
        ),
      ),
    ) +
    2 * 3600000;
  return { floor, ceiling };
}

/** Newest-first pages of one source. */
export function createRecentEvents(send: SendCommand) {
  const cursors = new Map<string, RecentCursor>();
  return {
    async events(
      request: QueryRequest,
      signal: AbortSignal,
    ): Promise<QueryUpdate> {
      const source = onlySource(request);
      const started = Date.now();
      const key = querySignature(request);
      const boundary = Date.UTC(2024, 0, 1);
      for (const [id, cursor] of cursors)
        if (cursor.expires <= started) cursors.delete(id);
      const saved = request.cursor ? cursors.get(request.cursor) : undefined;
      if (request.cursor && (!saved || saved.signature !== key))
        throw new Error(
          "Continuation expired or belongs to a different query. Run the query again.",
        );
      let state: RecentCursor;
      if (saved) state = structuredClone(saved);
      else {
        const bounds = await recentBounds(send, source, signal);
        throwIfAborted(signal);
        const floor = Math.max(request.startTime, bounds.floor);
        let recentStart = Math.max(boundary, floor);
        let end = Math.min(request.endTime, boundary - 1);
        // An idle stream: search only the metadata lag window newest first,
        // then continue from its last event instead of scanning empty history.
        const lag = Date.now() - 6 * 3600000;
        if (bounds.ceiling !== undefined && bounds.ceiling < lag) {
          recentStart = Math.max(floor, lag);
          end = Math.min(request.endTime, bounds.ceiling, recentStart - 1);
        }
        state = {
          signature: key,
          expires: 0,
          phase: request.endTime >= recentStart ? "recent" : "old",
          seen: [],
          floor,
          recentStart,
          end,
          span: 86400000,
          buffer: [],
          ready: false,
        };
      }
      let events: LogEvent[] = [];
      let finished = false;
      for (
        let calls = 0;
        calls < MAX_CALLS && !events.length && !finished;
        calls++
      ) {
        throwIfAborted(signal);
        if (state.phase === "old" && state.ready) {
          events = state.buffer.splice(0, request.limit);
          if (!state.buffer.length) {
            state.ready = false;
            state.end = state.start! - 1;
            state.start = undefined;
          }
          if (state.end < state.floor && !state.buffer.length) finished = true;
          continue;
        }
        if (state.phase === "old" && state.end < state.floor) {
          finished = true;
          break;
        }
        if (state.phase === "old" && state.start === undefined)
          state.start = Math.max(state.floor, state.end - state.span + 1);
        const response = await send<FilterLogEventsCommandOutput>(
          new (await awsSdk()).FilterLogEventsCommand({
            ...identifier(source.logGroup),
            logStreamNames: source.logStreams?.length
              ? source.logStreams
              : undefined,
            startTime:
              state.phase === "recent" ? state.recentStart : state.start,
            endTime: state.phase === "recent" ? request.endTime : state.end,
            startFromHead: state.phase === "old",
            filterPattern: request.filterPattern || undefined,
            nextToken: state.token,
            limit: Math.min(10000, request.limit),
          }),
          signal,
        );
        throwIfAborted(signal);
        const token = response.nextToken;
        if (token && state.seen.includes(token))
          throw new Error("CloudWatch returned a repeated continuation token.");
        if (token) state.seen.push(token);
        state.token = token;
        const page = filteredEvents(response, source, request);
        if (state.phase === "recent") {
          events = page;
          if (!token) {
            state.phase = "old";
            state.seen = [];
            if (state.end < state.floor) finished = true;
          }
        } else {
          state.buffer.push(...page);
          const over =
            state.buffer.length > Math.max(2000, request.limit * 4) ||
            characters(state) > MAX_WINDOW_CHARACTERS;
          if (state.start === state.end) {
            // All rows have the same timestamp, so ascending service order is
            // also a valid descending order and can be streamed page by page.
            events = state.buffer.splice(0, request.limit);
            if (!token) {
              state.end = state.start! - 1;
              state.start = undefined;
              state.seen = [];
            }
          } else if (over) {
            state.span = Math.max(
              1,
              Math.floor((state.end - state.start! + 1) / 2),
            );
            state.start = undefined;
            state.buffer = [];
            state.token = undefined;
            state.seen = [];
          } else if (!token) {
            // Newest first, but same-millisecond rows keep service (ingestion) order;
            // a plain reverse would show multi-line output upside-down.
            if (state.buffer.length) {
              state.buffer.sort((a, b) => b.timestamp - a.timestamp);
              state.ready = true;
            } else {
              state.end = state.start! - 1;
              state.start = undefined;
              state.span = Math.min(Number.MAX_SAFE_INTEGER, state.span * 4);
            }
            state.seen = [];
          }
        }
      }
      let cursor: string | undefined;
      if (!finished || state.buffer.length) {
        cursor = request.cursor ?? `recent:${randomUUID()}`;
        cursors.delete(cursor);
        let retained = [...cursors.values()].reduce(
          (sum, entry) => sum + characters(entry),
          characters(state),
        );
        while (
          cursors.size &&
          (cursors.size >= MAX_CURSORS || retained > MAX_BUFFERED_CHARACTERS)
        ) {
          const oldest = cursors.keys().next().value!;
          retained -= characters(cursors.get(oldest)!);
          cursors.delete(oldest);
        }
        cursors.set(cursor, {
          ...state,
          expires: Date.now() + CURSOR_LIFETIME_MS,
        });
      } else if (request.cursor) cursors.delete(request.cursor);
      return {
        requestId: request.requestId,
        state: "complete",
        events,
        replace: !request.cursor,
        cursor,
        ...(cursor && !events.length ? { incomplete: true } : {}),
        ...(cursor && state.phase === "old"
          ? { cursorUpperBound: state.end }
          : {}),
        stats: {
          recordsMatched: events.length,
          elapsedMs: Date.now() - started,
        },
      };
    },
    clear: () => cursors.clear(),
  };
}
