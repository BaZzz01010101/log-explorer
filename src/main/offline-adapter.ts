import { createHash } from "node:crypto";
import type {
  LogEvent,
  LogGroup,
  Page,
  QueryRequest,
} from "../shared/contracts";
import { delay, throwIfAborted, type LogAdapter } from "./aws-adapter";

const GROUP_NAMES = [
  "/aws/lambda/orders-api",
  "/aws/lambda/payments-worker",
  "/aws/lambda/media-pipeline",
  "/aws/lambda/notifications",
  "/ecs/checkout",
  "/ecs/inventory",
  "/ecs/api-gateway",
  "/application/audit",
  "/application/security",
];
const LEVELS = ["INFO", "INFO", "DEBUG", "WARN", "INFO", "ERROR"];

function fixtureMessage(group: string, index: number): string {
  if (index % 53 === 0) return "Unexpected upstream response: { invalid JSON";
  if (index % 29 === 0)
    return `ERROR Request failed\nTypeError: Cannot read properties of undefined\n    at processOrder (src/orders.ts:142:18)\n    at async handler (src/handler.ts:31:5)`;
  const level = LEVELS[index % LEVELS.length];
  return JSON.stringify({
    timestamp: new Date(index * 1000).toISOString(),
    level,
    message:
      level === "ERROR"
        ? "Payment provider timed out"
        : level === "WARN"
          ? "Retrying upstream request"
          : "Request processed",
    service: {
      name: group.split("/").at(-1),
      version: "2.8.1",
      environment: "offline-fixture",
    },
    request: {
      id: `req-${index.toString(16).padStart(6, "0")}`,
      method: index % 2 ? "POST" : "GET",
      path: `/api/orders/${index % 83}`,
      durationMs: 10 + ((index * 19) % 1800),
    },
    user: {
      id: `user-${index % 41}`,
      roles: ["customer", ...(index % 11 === 0 ? ["admin"] : [])],
    },
    items: [
      { sku: `SKU-${index % 13}`, quantity: (index % 4) + 1 },
      { sku: "SHIP", metadata: { nullable: null, enabled: true } },
    ],
    "http.status": level === "ERROR" ? 504 : 200,
    traceId: `1-offline-${index.toString(16).padStart(24, "0")}`,
    ...(index % 97 === 0
      ? { payload: "A long structured payload. ".repeat(4000) }
      : {}),
    ...(level === "ERROR"
      ? {
          error: {
            type: "TimeoutError",
            message: "Upstream did not respond within 1500ms",
            stack:
              "TimeoutError: request timed out\n    at fetchPayment (payments.ts:48:9)\n    at async confirmOrder (orders.ts:118:3)",
          },
        }
      : {}),
  });
}

function signature(request: QueryRequest): string {
  return createHash("sha256")
    .update(
      JSON.stringify([
        request.sources,
        request.startTime,
        request.endTime,
        request.filterPattern,
      ]),
    )
    .digest("hex")
    .slice(0, 16);
}

function page<T>(items: T[], cursor: string | undefined, key: string): Page<T> {
  const match = cursor?.match(/^fixture:([a-f0-9]{16}):(\d+)$/);
  const expected = createHash("sha256").update(key).digest("hex").slice(0, 16);
  if (cursor && (!match || match[1] !== expected))
    throw new Error(
      "This offline continuation belongs to a different resource search",
    );
  const offset = match ? Number(match[2]) : 0;
  if (!Number.isSafeInteger(offset) || offset > items.length)
    throw new Error("Invalid offline continuation");
  return {
    items: items.slice(offset, offset + 5),
    ...(offset + 5 < items.length
      ? { cursor: `fixture:${expected}:${offset + 5}` }
      : {}),
  };
}

function fixtureFilter(pattern: string): (event: LogEvent) => boolean {
  if (!pattern.trim()) return () => true;
  // Deliberately limited interpreter. CloudWatch JSON, regex and boolean patterns
  // are never approximated by silently returning all fixture events.
  const tokens = pattern.match(/"(?:[^"\\]|\\.)*"|[A-Za-z0-9_.:/-]+/g) ?? [];
  if (
    tokens.length === 0 ||
    tokens.join("").replace(/\s/g, "") !== pattern.replace(/\s/g, "") ||
    tokens.some(
      (token) => /^(OR|AND|NOT)$/.test(token) || token.startsWith("-"),
    )
  ) {
    throw new Error(
      "Offline mode supports only positive words and quoted phrases as filter patterns. Full CloudWatch patterns require an explicitly enabled AWS connection.",
    );
  }
  const words = tokens.map((token) =>
    token.startsWith('"') ? (JSON.parse(token) as string) : token,
  );
  return (event) => words.every((word) => event.message.includes(word));
}

function field(event: LogEvent, name: string): unknown {
  if (name === "@timestamp") return new Date(event.timestamp).toISOString();
  if (name === "@message") return event.message;
  if (name === "@logStream") return event.logStream;
  if (name === "@log") return `000000000000:${event.logGroup}`;
  if (name === "@ingestionTime")
    return new Date(event.ingestionTime ?? event.timestamp).toISOString();
  let value: unknown;
  try {
    value = JSON.parse(event.message);
  } catch {
    return undefined;
  }
  for (const part of name.split(".")) {
    if (!value || typeof value !== "object" || !Object.hasOwn(value, part))
      return undefined;
    value = (value as Record<string, unknown>)[part];
  }
  return value;
}

function interpretInsights(
  events: LogEvent[],
  query: string,
  limit: number,
): LogEvent[] {
  let rows = events;
  let selected: string[] | undefined;
  let aggregate: { alias: string; group?: string } | undefined;
  const unsupported = () =>
    new Error(
      "Offline Insights supports fields, sort @timestamp asc/desc, limit, simple equality/literal message filters, and stats count(*) as name [by field]. Other CWLI commands require AWS.",
    );
  const stages = query.split("|").map((value) => value.trim());
  if (stages.some((value) => !value)) throw unsupported();
  for (const stage of stages) {
    let match: RegExpMatchArray | null;
    if (
      (match = stage.match(
        /^fields\s+([@A-Za-z_][@\w.]*(?:\s*,\s*[@A-Za-z_][@\w.]*)*)$/i,
      ))
    ) {
      if (aggregate) throw unsupported();
      selected = match[1].split(",").map((value) => value.trim());
    } else if ((match = stage.match(/^sort\s+@timestamp\s+(asc|desc)$/i))) {
      if (aggregate) throw unsupported();
      rows = [...rows].sort((a, b) =>
        match![1].toLowerCase() === "asc"
          ? a.timestamp - b.timestamp
          : b.timestamp - a.timestamp,
      );
    } else if ((match = stage.match(/^limit\s+(\d+)$/i))) {
      const amount = Number(match[1]);
      if (amount < 1 || amount > 10000 || aggregate) throw unsupported();
      rows = rows.slice(0, amount);
    } else if (
      (match = stage.match(
        /^filter\s+([@A-Za-z_][@\w.]*)\s*=\s*("(?:[^"\\]|\\.)*"|-?\d+(?:\.\d+)?|true|false|null)$/i,
      ))
    ) {
      if (aggregate) throw unsupported();
      const expected: unknown = JSON.parse(match[2]);
      rows = rows.filter((event) => field(event, match![1]) === expected);
    } else if (
      (match = stage.match(
        /^filter\s+@message\s+like\s+\/([^/\\^$.*+?()[\]{}|]+)\/$/i,
      ))
    ) {
      if (aggregate) throw unsupported();
      rows = rows.filter((event) => event.message.includes(match![1]));
    } else if (
      (match = stage.match(
        /^stats\s+count\(\*\)\s+as\s+([A-Za-z_]\w*)(?:\s+by\s+([A-Za-z_][\w.]*))?$/i,
      ))
    ) {
      if (aggregate) throw unsupported();
      aggregate = { alias: match[1], group: match[2] };
    } else throw unsupported();
  }
  if (aggregate) {
    const buckets = new Map<string, { value: unknown; count: number }>();
    for (const event of rows) {
      const value = aggregate.group ? field(event, aggregate.group) : undefined;
      const key = JSON.stringify(value) ?? "undefined";
      const bucket = buckets.get(key) ?? { value, count: 0 };
      bucket.count++;
      buckets.set(key, bucket);
    }
    if (!aggregate.group && rows.length === 0)
      buckets.set("all", { value: undefined, count: 0 });
    return [...buckets.values()].slice(0, limit).map((bucket, index) => ({
      id: `fixture:aggregate:${index}`,
      timestamp: rows.at(-1)?.timestamp ?? 0,
      logGroup: "[offline Insights]",
      logStream: "",
      message: JSON.stringify({
        ...(aggregate!.group
          ? { [aggregate!.group]: bucket.value ?? null }
          : {}),
        [aggregate!.alias]: bucket.count,
      }),
    }));
  }
  return rows.slice(0, limit).map((event) =>
    selected
      ? {
          ...event,
          message: JSON.stringify(
            Object.fromEntries(
              selected.map((name) => [name, field(event, name)]),
            ),
          ),
        }
      : event,
  );
}
export function createOfflineAdapter(): LogAdapter {
  const anchor = Math.floor(Date.now() / 60000) * 60000;
  const fixtures = new Map<string, LogEvent[]>();
  let liveIndex = 540;
  function groupEvents(name: string): LogEvent[] {
    if (!GROUP_NAMES.includes(name))
      throw new Error("This log group does not exist in the offline fixtures");
    let events = fixtures.get(name);
    if (!events) {
      events = Array.from({ length: 540 }, (_, index) => ({
        id: `fixture:${name}:${index}`,
        timestamp: anchor - (540 - index) * 5000,
        ingestionTime: anchor - (540 - index) * 5000 + 170,
        logGroup: name,
        logStream: `2026/10/13/[$LATEST]worker-${(index % 4) + 1}`,
        message: fixtureMessage(name, index),
      }));
      fixtures.set(name, events);
    }
    return events;
  }
  function select(request: QueryRequest): LogEvent[] {
    const predicate = fixtureFilter(request.filterPattern);
    return request.sources
      .flatMap((source) =>
        groupEvents(source.logGroup).filter(
          (event) =>
            event.timestamp >= request.startTime &&
            event.timestamp <= request.endTime &&
            (!source.logStreams?.length ||
              source.logStreams.includes(event.logStream)) &&
            predicate(event),
        ),
      )
      .sort((a, b) => a.timestamp - b.timestamp || a.id.localeCompare(b.id));
  }
  return {
    async listGroups(search, cursor, signal) {
      throwIfAborted(signal);
      const groups: LogGroup[] = GROUP_NAMES.filter((name) =>
        name.includes(search),
      ).map((name) => ({
        name,
        arn: `arn:aws:logs:eu-west-1:000000000000:log-group:${name}`,
        storedBytes: 1024 * 1024 * (GROUP_NAMES.indexOf(name) + 1),
        retentionDays: 30,
        logClass: "STANDARD",
      }));
      return page(groups, cursor, `groups:${search}`);
    },
    async listStreams(group, prefix, cursor, signal) {
      throwIfAborted(signal);
      const events = groupEvents(group);
      const streams = Array.from({ length: 4 }, (_, index) => ({
        name: `2026/10/13/[$LATEST]worker-${index + 1}`,
        lastEventTime: events[events.length - 4 + index].timestamp,
      })).filter((stream) => stream.name.startsWith(prefix));
      return page(
        streams.sort((a, b) => b.lastEventTime - a.lastEventTime),
        cursor,
        `streams:${group}:${prefix}`,
      );
    },
    async events(request, signal) {
      throwIfAborted(signal);
      const started = Date.now();
      const items = select(request);
      const key = signature(request);
      const match = request.cursor?.match(/^events:([a-f0-9]{16}):(\d+)$/);
      if (request.cursor && (!match || match[1] !== key))
        throw new Error(
          "This offline continuation belongs to a different query",
        );
      const offset = match ? Number(match[2]) : 0;
      if (!Number.isSafeInteger(offset) || offset > items.length)
        throw new Error("Invalid offline continuation");
      const events = items.slice(offset, offset + request.limit);
      return {
        requestId: request.requestId,
        state: "complete",
        events,
        replace: !request.cursor,
        ...(offset + request.limit < items.length
          ? { cursor: `events:${key}:${offset + request.limit}` }
          : {}),
        stats: {
          recordsMatched: items.length,
          recordsScanned: request.sources.length * 540,
          elapsedMs: Date.now() - started,
        },
      };
    },
    async insights(request, signal, emit) {
      throwIfAborted(signal);
      const started = Date.now();
      const items = select(request);
      const events = interpretInsights(
        items,
        request.query.trim(),
        request.limit,
      );
      await delay(40, signal);
      throwIfAborted(signal);
      emit({
        requestId: request.requestId,
        state: "complete",
        events,
        replace: true,
        stats: {
          recordsMatched: items.length,
          recordsScanned: request.sources.length * 540,
          bytesScanned: items.reduce(
            (sum, event) => sum + Buffer.byteLength(event.message),
            0,
          ),
          elapsedMs: Date.now() - started,
        },
        truncated: events.length >= request.limit,
      });
    },
    async live(request, signal, emit) {
      if (request.kind !== "events")
        throw new Error(
          "Live monitoring supports event filters; Insights queries are finite operations",
        );
      const predicate = fixtureFilter(request.filterPattern);
      for (const source of request.sources) groupEvents(source.logGroup);
      emit({
        requestId: request.requestId,
        state: "running",
        sampled: false,
        liveState: "streaming",
      });
      while (!signal.aborted) {
        await delay(900, signal);
        const now = Date.now();
        const events = request.sources.flatMap((source) => {
          const index = liveIndex++;
          const event: LogEvent = {
            id: `fixture:live:${source.logGroup}:${index}`,
            timestamp: now,
            ingestionTime: now,
            logGroup: source.logGroup,
            logStream:
              source.logStreams?.[index % source.logStreams.length] ??
              `2026/10/13/[$LATEST]worker-${(index % 4) + 1}`,
            message: fixtureMessage(source.logGroup, index),
          };
          return predicate(event) ? [event] : [];
        });
        throwIfAborted(signal);
        emit({
          requestId: request.requestId,
          state: "running",
          events,
          replace: false,
          sampled: false,
        });
      }
      throwIfAborted(signal);
    },
    destroy() {
      fixtures.clear();
    },
  };
}
