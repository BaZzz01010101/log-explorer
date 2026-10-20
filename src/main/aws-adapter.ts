import { createHash, randomUUID } from "node:crypto";
import type {
  Connection,
  LogEvent,
  LogGroup,
  LogStream,
  Page,
  QueryRequest,
  QueryUpdate,
} from "../shared/contracts";
import {
  DescribeLogGroupsCommand,
  DescribeLogStreamsCommand,
  FilterLogEventsCommand,
  StartQueryCommand,
  GetQueryResultsCommand,
  StopQueryCommand,
  StartLiveTailCommand,
  type DescribeLogGroupsCommandOutput,
  type DescribeLogStreamsCommandOutput,
  type FilterLogEventsCommandOutput,
  type StartQueryCommandOutput,
  type GetQueryResultsCommandOutput,
  type StartLiveTailCommandOutput,
  type StopQueryCommandOutput,
} from "@aws-sdk/client-cloudwatch-logs";
export type CloudWatchCommand =
  | DescribeLogGroupsCommand
  | DescribeLogStreamsCommand
  | FilterLogEventsCommand
  | StartQueryCommand
  | GetQueryResultsCommand
  | StopQueryCommand
  | StartLiveTailCommand;
export interface AwsTransport {
  send(
    command: CloudWatchCommand,
    options?: { abortSignal?: AbortSignal },
  ): Promise<unknown>;
  destroy(): void;
}
export interface LogAdapter {
  listGroups(
    prefix: string,
    cursor: string | undefined,
    signal: AbortSignal,
  ): Promise<Page<LogGroup>>;
  listStreams(
    group: string,
    prefix: string,
    cursor: string | undefined,
    signal: AbortSignal,
  ): Promise<Page<LogStream>>;
  events(request: QueryRequest, signal: AbortSignal): Promise<QueryUpdate>;
  insights(
    request: QueryRequest,
    signal: AbortSignal,
    emit: (update: QueryUpdate) => void,
  ): Promise<void>;
  live(
    request: QueryRequest,
    signal: AbortSignal,
    emit: (update: QueryUpdate) => void,
  ): Promise<void>;
  destroy(): void;
}
export interface AwsAdapterOptions {
  allowAws: () => boolean;
  transportFactory?: (connection: Connection) => Promise<AwsTransport>;
  pollIntervalMs?: number;
  maxPolls?: number;
}

export function throwIfAborted(signal: AbortSignal): void {
  if (signal.aborted)
    throw Object.assign(new Error("Operation cancelled"), {
      name: "AbortError",
    });
}

export function delay(ms: number, signal: AbortSignal): Promise<void> {
  throwIfAborted(signal);
  return new Promise((resolve, reject) => {
    const abort = () => {
      clearTimeout(timer);
      signal.removeEventListener("abort", abort);
      reject(
        Object.assign(new Error("Operation cancelled"), { name: "AbortError" }),
      );
    };
    const timer = setTimeout(() => {
      signal.removeEventListener("abort", abort);
      resolve();
    }, ms);
    signal.addEventListener("abort", abort, { once: true });
  });
}

function withAbort<T>(operation: Promise<T>, signal: AbortSignal): Promise<T> {
  return new Promise((resolve, reject) => {
    const abort = () => {
      signal.removeEventListener("abort", abort);
      reject(
        Object.assign(new Error("Operation cancelled"), { name: "AbortError" }),
      );
    };
    signal.addEventListener("abort", abort, { once: true });
    operation.then(
      (value) => {
        signal.removeEventListener("abort", abort);
        resolve(value);
      },
      (error) => {
        signal.removeEventListener("abort", abort);
        reject(error);
      },
    );
    if (signal.aborted) abort();
  });
}

export class Semaphore {
  private active = 0;
  private waiters: Array<{
    signal: AbortSignal;
    resolve: (release: () => void) => void;
    reject: (error: Error) => void;
    abort: () => void;
  }> = [];
  constructor(private readonly capacity: number) {}
  async acquire(signal: AbortSignal): Promise<() => void> {
    throwIfAborted(signal);
    if (this.active < this.capacity) {
      this.active++;
      return this.release;
    }
    return new Promise((resolve, reject) => {
      const waiter = {
        signal,
        resolve,
        reject,
        abort: () => {
          const index = this.waiters.indexOf(waiter);
          if (index >= 0) this.waiters.splice(index, 1);
          reject(
            Object.assign(new Error("Operation cancelled"), {
              name: "AbortError",
            }),
          );
        },
      };
      this.waiters.push(waiter);
      signal.addEventListener("abort", waiter.abort, { once: true });
    });
  }
  private release = () => {
    const next = this.waiters.shift();
    if (next) {
      next.signal.removeEventListener("abort", next.abort);
      next.resolve(this.release);
    } else this.active--;
  };
}

interface SourceCursor {
  token?: string;
  done: boolean;
  seen: string[];
}
interface EventCursor {
  signature: string;
  sources: SourceCursor[];
  expires: number;
}

class MetadataContinuations {
  private searches = new Map<string, { seen: Set<string>; expires: number }>();
  observe(
    key: string,
    input: string | undefined,
    next: string | undefined,
  ): void {
    const now = Date.now();
    for (const [search, value] of this.searches)
      if (value.expires <= now) this.searches.delete(search);
    if (!input) this.searches.delete(key);
    const history = this.searches.get(key) ?? {
      seen: new Set<string>(),
      expires: now + 15 * 60000,
    };
    if (next) {
      if (next === input || history.seen.has(next))
        throw new Error(
          "CloudWatch returned a repeated resource continuation; refresh or narrow the resource search",
        );
      if (history.seen.size >= 256)
        throw new Error(
          "Resource pagination limit reached; narrow the resource search",
        );
      history.seen.add(next);
      if (!this.searches.has(key) && this.searches.size >= 100)
        this.searches.delete(this.searches.keys().next().value!);
      this.searches.set(key, history);
    }
  }
  clear(): void {
    this.searches.clear();
  }
}

function querySignature(request: QueryRequest): string {
  return createHash("sha256")
    .update(
      JSON.stringify([
        request.connection.region,
        request.connection.profile,
        request.sources,
        request.startTime,
        request.endTime,
        request.filterPattern,
      ]),
    )
    .digest("hex");
}

function identifier(
  group: string,
): { logGroupIdentifier: string } | { logGroupName: string } {
  return group.startsWith("arn:")
    ? { logGroupIdentifier: group.replace(/:\*$/, "") }
    : { logGroupName: group };
}

function nameFromIdentifier(group: string): string {
  return group.includes(":log-group:")
    ? group.split(":log-group:")[1].replace(/:\*$/, "")
    : group;
}

function eventId(parts: Array<string | number | undefined>): string {
  return createHash("sha256").update(JSON.stringify(parts)).digest("hex");
}

function streamQuery(request: QueryRequest): string {
  if (!request.sources.some((source) => source.logStreams?.length))
    return request.query;
  const escape = (value: string) =>
    value.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&");
  const predicates = request.sources.map(
    (source) =>
      `(@log like /:${escape(nameFromIdentifier(source.logGroup))}$/` +
      (source.logStreams?.length
        ? ` and @logStream in ${JSON.stringify(source.logStreams)}`
        : "") +
      ")",
  );
  return `filter ${predicates.join(" or ")} | ${request.query}`;
}

function resultEvents(
  response: GetQueryResultsCommandOutput,
  request: QueryRequest,
  queryId: string,
): LogEvent[] {
  return (response.results ?? [])
    .slice(0, request.limit)
    .map((fields, index) => {
      const row = Object.create(null) as Record<string, string>;
      for (const item of fields)
        if (item.field) row[item.field] = item.value ?? "";
      const rawTime = row["@timestamp"] ?? "";
      // CloudWatch service timestamps without an explicit zone describe UTC.
      const time = /^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}:\d{2}(?:\.\d+)?$/.test(
        rawTime,
      )
        ? rawTime.replace(" ", "T") + "Z"
        : rawTime;
      const timestamp = Date.parse(time);
      const log = row["@log"] ?? "";
      return {
        // @ptr identifies the source record, not an expanded/unnested result row.
        id: `${queryId}:${index}:${row["@ptr"] ?? ""}`,
        timestamp: Number.isFinite(timestamp) ? timestamp : request.endTime,
        logGroup: log.includes(":")
          ? log.slice(log.indexOf(":") + 1)
          : "[Insights result]",
        logStream: row["@logStream"] ?? "",
        message: JSON.stringify(row),
      };
    });
}

async function defaultTransport(
  connection: Connection,
  allowAws: () => boolean,
): Promise<AwsTransport> {
  if (!allowAws()) throw new Error("AWS access is disabled");
  const [{ CloudWatchLogsClient }, { fromIni }] = await Promise.all([
    import("@aws-sdk/client-cloudwatch-logs"),
    import("@aws-sdk/credential-providers"),
  ]);
  if (!allowAws()) throw new Error("AWS access is disabled");
  const credentials = fromIni({
    profile: connection.profile || "default",
    clientConfig: { region: connection.region },
  });
  const client = new CloudWatchLogsClient({
    region: connection.region,
    credentials,
    maxAttempts: 1,
    retryMode: "standard",
  });
  return {
    send: (command, options) => client.send(command as never, options),
    destroy: () => client.destroy(),
  };
}
export function createAwsAdapter(
  connection: Connection,
  options: AwsAdapterOptions,
): LogAdapter {
  const slots = new Semaphore(4);
  const cursors = new Map<string, EventCursor>();
  const metadataContinuations = new MetadataContinuations();
  const arnCache = new Map<string, { arn: string; expires: number }>();
  let transport: Promise<AwsTransport> | undefined;
  let destroyed = false;
  function gate() {
    if (!options.allowAws())
      throw new Error(
        "AWS access is disabled. Enable it explicitly in a packaged application.",
      );
    if (destroyed) throw new Error("AWS connection was closed");
  }
  async function getTransport(): Promise<AwsTransport> {
    gate();
    if (!transport) {
      transport = (
        options.transportFactory
          ? options.transportFactory(connection)
          : defaultTransport(connection, options.allowAws)
      ).catch((error) => {
        transport = undefined;
        throw error;
      });
    }
    const client = await transport;
    gate();
    return client;
  }
  async function stopQuery(queryId: string): Promise<StopQueryCommandOutput> {
    // Revocation blocks all new work. Only cancellation of an already started
    // query may reuse its existing client; never construct a transport here.
    if (!transport || destroyed) throw new Error("AWS connection was closed");
    const signal = AbortSignal.timeout(5000);
    const release = await slots.acquire(signal);
    try {
      const client = await transport;
      if (destroyed) throw new Error("AWS connection was closed");
      throwIfAborted(signal);
      return (await withAbort(
        client.send(new StopQueryCommand({ queryId }), { abortSignal: signal }),
        signal,
      )) as StopQueryCommandOutput;
    } finally {
      release();
    }
  }
  async function send<T>(
    command: CloudWatchCommand,
    signal: AbortSignal,
    beforeDispatch?: AbortSignal,
  ): Promise<T> {
    gate();
    const release = await slots.acquire(signal);
    try {
      const client = await getTransport();
      for (let attempt = 0; ; attempt++) {
        gate();
        throwIfAborted(signal);
        if (beforeDispatch) throwIfAborted(beforeDispatch);
        try {
          const timeout = new AbortController();
          const timer = setTimeout(() => timeout.abort(), 30000);
          const operationSignal = AbortSignal.any([signal, timeout.signal]);
          try {
            return (await withAbort(
              client.send(command, { abortSignal: operationSignal }),
              operationSignal,
            )) as T;
          } catch (error) {
            if (timeout.signal.aborted && !signal.aborted)
              throw Object.assign(new Error("CloudWatch request timed out"), {
                name: "TimeoutError",
              });
            throw error;
          } finally {
            clearTimeout(timer);
          }
        } catch (error) {
          throwIfAborted(signal);
          const name =
            error && typeof error === "object" && "name" in error
              ? String(error.name)
              : "";
          const retryable =
            /Throttl|TooManyRequests/.test(name) ||
            (!(command instanceof StartQueryCommand) &&
              /ServiceUnavailable|TimeoutError|RequestTimeout|InternalFailure|InternalServerError/.test(
                name,
              ));
          if (!retryable || attempt >= 2) throw error;
          await delay(
            Math.min(2000, 200 * 2 ** attempt) +
              Math.floor(Math.random() * 100),
            signal,
          );
        }
      }
    } finally {
      release();
    }
  }
  async function resolveArn(
    group: string,
    signal: AbortSignal,
  ): Promise<string> {
    if (group.startsWith("arn:")) return group.replace(/:\*$/, "");
    const cached = arnCache.get(group);
    if (cached && cached.expires > Date.now()) return cached.arn;
    let token: string | undefined;
    const seen = new Set<string>();
    for (let page = 0; page < 100; page++) {
      const response = await send<DescribeLogGroupsCommandOutput>(
        new DescribeLogGroupsCommand({
          logGroupNamePrefix: group,
          limit: 50,
          nextToken: token,
        }),
        signal,
      );
      const found = response.logGroups?.find(
        (value) => value.logGroupName === group,
      );
      if (found) {
        if (found.logGroupClass && found.logGroupClass !== "STANDARD")
          throw new Error(
            "Live Tail is supported only for STANDARD log groups",
          );
        const arn = (found.logGroupArn ?? found.arn)?.replace(/:\*$/, "");
        if (!arn)
          throw new Error(
            "CloudWatch did not return a log group ARN for Live Tail",
          );
        if (arnCache.size >= 100)
          arnCache.delete(arnCache.keys().next().value!);
        arnCache.set(group, { arn, expires: Date.now() + 60000 });
        return arn;
      }
      token = response.nextToken;
      if (!token) break;
      if (seen.has(token))
        throw new Error("CloudWatch returned a repeated resource continuation");
      seen.add(token);
    }
    throw new Error(
      "Log group was not found for Live Tail; verify the region and logs:DescribeLogGroups permission",
    );
  }
  return {
    async listGroups(search, cursor, signal) {
      const response = await send<DescribeLogGroupsCommandOutput>(
        new DescribeLogGroupsCommand({
          logGroupNamePattern: search || undefined,
          nextToken: cursor,
          limit: 50,
        }),
        signal,
      );
      throwIfAborted(signal);
      let groups = (response.logGroups ?? []).filter(
        (group) => !!group.logGroupName,
      );
      if (search && groups.length) {
        // Pattern searches omit class, retention and byte counts. Fetch the same
        // page by exact names so search results retain complete group metadata.
        const names = groups.map((group) => group.logGroupName!);
        const details = new Map<string, (typeof groups)[number]>();
        const seen = new Set<string>();
        let token: string | undefined;
        for (let page = 0; page < 100; page++) {
          const metadata = await send<DescribeLogGroupsCommandOutput>(
            new DescribeLogGroupsCommand({
              logGroupIdentifiers: names,
              limit: 50,
              nextToken: token,
            }),
            signal,
          );
          throwIfAborted(signal);
          for (const group of metadata.logGroups ?? [])
            if (group.logGroupName) details.set(group.logGroupName, group);
          token = metadata.nextToken;
          if (!token) break;
          if (seen.has(token))
            throw new Error(
              "CloudWatch returned a repeated resource continuation",
            );
          seen.add(token);
          if (page === 99)
            throw new Error(
              "CloudWatch returned too many metadata pages; narrow the group search",
            );
        }
        // A group deleted between the search and metadata calls is no longer a
        // usable result. Do not represent missing metadata as STANDARD/indefinite.
        groups = groups.flatMap((group) => {
          const detail = details.get(group.logGroupName!);
          return detail ? [detail] : [];
        });
      }
      metadataContinuations.observe(
        `groups:${search}`,
        cursor,
        response.nextToken,
      );
      return {
        items: groups.map((group) => ({
          name: group.logGroupName!,
          arn: group.logGroupArn ?? group.arn,
          storedBytes: group.storedBytes,
          retentionDays: group.retentionInDays,
          logClass: group.logGroupClass,
        })),
        cursor: response.nextToken,
      };
    },
    async listStreams(group, prefix, cursor, signal) {
      const response = await send<DescribeLogStreamsCommandOutput>(
        new DescribeLogStreamsCommand({
          ...identifier(group),
          logStreamNamePrefix: prefix || undefined,
          nextToken: cursor,
          limit: 50,
          orderBy: prefix ? "LogStreamName" : "LastEventTime",
          descending: true,
        }),
        signal,
      );
      throwIfAborted(signal);
      metadataContinuations.observe(
        `streams:${group}:${prefix}`,
        cursor,
        response.nextToken,
      );
      return {
        items: (response.logStreams ?? [])
          .filter((stream) => !!stream.logStreamName)
          .map((stream) => ({
            name: stream.logStreamName!,
            lastEventTime: stream.lastEventTimestamp,
          })),
        cursor: response.nextToken,
      };
    },
    async events(request, signal) {
      gate();
      throwIfAborted(signal);
      const started = Date.now();
      const key = querySignature(request);
      for (const [id, value] of cursors)
        if (value.expires <= started) cursors.delete(id);
      const saved = request.cursor ? cursors.get(request.cursor) : undefined;
      if (request.cursor && (!saved || saved.signature !== key))
        throw new Error(
          "Continuation expired or belongs to a different query. Run the query again.",
        );
      const states: SourceCursor[] = saved
        ? saved.sources.map((source) => ({ ...source, seen: [...source.seen] }))
        : request.sources.map(() => ({ done: false, seen: [] }));
      const active = states
        .map((state, index) => ({ state, index }))
        .filter(({ state }) => !state.done);
      const selected = active.slice(0, request.limit);
      const quota = Math.floor(request.limit / Math.max(1, selected.length));
      const remainder = request.limit % Math.max(1, selected.length);
      let truncated = false;
      const batches = await Promise.all(
        selected.map(async ({ state, index }, position) => {
          const source = request.sources[index];
          // FilterLogEvents may return empty pages while still searching the range.
          // Follow those pages automatically, with a bounded per-source scan budget.
          // A remaining token is kept so the user can continue an exceptionally sparse scan.
          for (let page = 0; page < 32; page++) {
            throwIfAborted(signal);
            const response = await send<FilterLogEventsCommandOutput>(
              new FilterLogEventsCommand({
                ...identifier(source.logGroup),
                logStreamNames: source.logStreams?.length
                  ? source.logStreams
                  : undefined,
                startTime: request.startTime,
                endTime: request.endTime,
                filterPattern: request.filterPattern || undefined,
                nextToken: state.token,
                limit: Math.min(10000, quota + (position < remainder ? 1 : 0)),
              }),
              signal,
            );
            throwIfAborted(signal);
            const token = response.nextToken;
            if (
              token &&
              (state.seen.includes(token) || state.seen.length >= 256)
            ) {
              state.done = true;
              state.token = undefined;
              truncated = true;
            } else {
              state.done = !token;
              state.token = token;
              if (token) state.seen.push(token);
            }
            const events = (response.events ?? []).map((event) => ({
              id: `${source.logGroup}:${event.eventId ?? eventId([event.logStreamName, event.timestamp, event.ingestionTime, event.message])}`,
              timestamp: event.timestamp ?? request.startTime,
              ingestionTime: event.ingestionTime,
              message: event.message ?? "",
              logGroup: nameFromIdentifier(source.logGroup),
              logStream: event.logStreamName ?? "",
            }));
            if (events.length || state.done) return events;
          }
          return [];
        }),
      );
      throwIfAborted(signal);
      const events = batches
        .flat()
        .sort((a, b) => a.timestamp - b.timestamp || a.id.localeCompare(b.id));
      const unique = [
        ...new Map(events.map((event) => [event.id, event])).values(),
      ];
      let cursor: string | undefined;
      if (states.some((state) => !state.done)) {
        cursor = request.cursor ?? randomUUID();
        if (!cursors.has(cursor) && cursors.size >= 128)
          cursors.delete(cursors.keys().next().value!);
        cursors.set(cursor, {
          signature: key,
          sources: states,
          expires: Date.now() + 15 * 60000,
        });
      } else if (request.cursor) cursors.delete(request.cursor);
      return {
        requestId: request.requestId,
        state: "complete",
        events: unique.slice(0, request.limit),
        replace: !request.cursor,
        cursor,
        truncated: truncated || unique.length > request.limit,
        stats: {
          recordsMatched: unique.length,
          elapsedMs: Date.now() - started,
        },
      };
    },
    async insights(request, signal, emit) {
      if (request.cursor)
        throw new Error("Insights results cannot reuse an event continuation");
      gate();
      throwIfAborted(signal);
      const started = Date.now();
      let queryId: string | undefined;
      let terminal = false;
      try {
        // Once a StartQuery is dispatched, capture its ID even if the caller
        // cancels, so its server job can be stopped rather than left running.
        const startSignal = AbortSignal.timeout(15000);
        const response = await send<StartQueryCommandOutput>(
          new StartQueryCommand({
            queryLanguage: "CWLI",
            logGroupIdentifiers: request.sources.map((source) =>
              source.logGroup.replace(/:\*$/, ""),
            ),
            startTime: Math.floor(request.startTime / 1000),
            endTime: Math.ceil(request.endTime / 1000),
            queryString: streamQuery(request),
            limit: Math.min(request.limit, 10000),
          }),
          startSignal,
          signal,
        );
        queryId = response.queryId;
        if (!queryId)
          throw new Error("CloudWatch did not return an Insights query ID");
        for (let poll = 0; poll < (options.maxPolls ?? 3600); poll++) {
          throwIfAborted(signal);
          const result = await send<GetQueryResultsCommandOutput>(
            new GetQueryResultsCommand({ queryId }),
            signal,
          );
          throwIfAborted(signal);
          const status = result.status;
          const events = resultEvents(result, request, queryId);
          const stats = {
            recordsMatched: result.statistics?.recordsMatched,
            recordsScanned: result.statistics?.recordsScanned,
            bytesScanned: result.statistics?.bytesScanned,
            elapsedMs: Date.now() - started,
          };
          if (status === "Complete") {
            terminal = true;
            emit({
              requestId: request.requestId,
              state: "complete",
              events,
              replace: true,
              stats,
              truncated: !!result.nextToken || events.length >= request.limit,
            });
            return;
          }
          if (status === "Cancelled") {
            terminal = true;
            throw Object.assign(
              new Error("Insights query was cancelled by CloudWatch"),
              { name: "AbortError" },
            );
          }
          if (
            status === "Failed" ||
            status === "Timeout" ||
            status === "Unknown"
          ) {
            terminal = true;
            throw new Error(
              `CloudWatch Insights query ended with status ${status}`,
            );
          }
          if (status !== "Running" && status !== "Scheduled")
            throw new Error(
              "CloudWatch returned an unexpected Insights query status",
            );
          emit({
            requestId: request.requestId,
            state: "running",
            events,
            replace: true,
            stats,
          });
          await delay(options.pollIntervalMs ?? 1000, signal);
        }
        throw new Error(
          "Insights polling time limit reached. Query has been stopped; narrow the time range and retry.",
        );
      } finally {
        if (queryId && !terminal) {
          try {
            const result = await stopQuery(queryId);
            if (!result.success)
              throw new Error("CloudWatch did not confirm cancellation");
          } catch (error) {
            // Cleanup failures must be visible and cannot masquerade as success.
            throw new Error(
              `Could not stop Insights query ${queryId}: ${error instanceof Error ? error.message : "unknown error"}. The server query may still be running.`,
            );
          }
        }
      }
    },
    async live(request, signal, emit) {
      if (request.kind !== "events")
        throw new Error(
          "Live Tail supports event filters; Insights queries are finite operations",
        );
      if (request.sources.length > 10)
        throw new Error("CloudWatch Live Tail supports at most 10 log groups");
      if (
        request.sources.length > 1 &&
        request.sources.some((source) => source.logStreams?.length)
      )
        throw new Error(
          "CloudWatch Live Tail permits stream selection only when one log group is selected",
        );
      gate();
      throwIfAborted(signal);
      const identifiers = await Promise.all(
        request.sources.map((source) => resolveArn(source.logGroup, signal)),
      );
      const streamController = new AbortController();
      const streamSignal = AbortSignal.any([signal, streamController.signal]);
      try {
        const response = await send<StartLiveTailCommandOutput>(
          new StartLiveTailCommand({
            logGroupIdentifiers: identifiers,
            logStreamNames: request.sources[0]?.logStreams?.length
              ? request.sources[0].logStreams
              : undefined,
            logEventFilterPattern: request.filterPattern || undefined,
          }),
          streamSignal,
        );
        if (!response.responseStream)
          throw new Error(
            "CloudWatch did not return a Live Tail response stream",
          );
        const iterator = response.responseStream[Symbol.asyncIterator]();
        let session = "live";
        let sequence = 0;
        try {
          while (true) {
            throwIfAborted(signal);
            let idleTimeout = false;
            const timer = setTimeout(() => {
              idleTimeout = true;
              streamController.abort();
            }, 30000);
            const next = await withAbort(iterator.next(), streamSignal)
              .catch((error) => {
                if (idleTimeout && !signal.aborted)
                  throw new Error(
                    "Live Tail connection stopped sending updates. Start Live again to reconnect.",
                  );
                throw error;
              })
              .finally(() => clearTimeout(timer));
            throwIfAborted(signal);
            if (next.done) break;
            const chunk = next.value;
            if (chunk.SessionTimeoutException)
              throw new Error(
                chunk.SessionTimeoutException.message ??
                  "Live Tail session reached its service time limit",
              );
            if (chunk.SessionStreamingException)
              throw new Error(
                chunk.SessionStreamingException.message ??
                  "Live Tail session failed",
              );
            if (chunk.sessionStart) {
              session = chunk.sessionStart.sessionId ?? session;
              emit({
                requestId: request.requestId,
                state: "running",
                liveState: "streaming",
                sampled: false,
              });
            }
            if (chunk.sessionUpdate) {
              const results = chunk.sessionUpdate.sessionResults ?? [];
              const events = results.map((event) => ({
                id: `${session}:${sequence++}`,
                timestamp: event.timestamp ?? Date.now(),
                ingestionTime: event.ingestionTime,
                message: event.message ?? "",
                logGroup: nameFromIdentifier(event.logGroupIdentifier ?? ""),
                logStream: event.logStreamName ?? "",
              }));
              emit({
                requestId: request.requestId,
                state: "running",
                events,
                replace: false,
                liveState: "streaming",
                sampled: chunk.sessionUpdate.sessionMetadata?.sampled ?? false,
                truncated: false,
              });
            }
          }
          emit({ requestId: request.requestId, state: "complete" });
        } finally {
          streamController.abort();
          if (iterator.return) {
            try {
              await withAbort(iterator.return(), AbortSignal.timeout(1000));
            } catch {
              /* The request abort signal closes the transport even if the iterator cannot finish promptly. */
            }
          }
        }
      } finally {
        streamController.abort();
      }
    },
    destroy() {
      destroyed = true;
      cursors.clear();
      metadataContinuations.clear();
      arnCache.clear();
      if (transport)
        void transport.then((client) => client.destroy()).catch(() => {});
      transport = undefined;
    },
  };
}
