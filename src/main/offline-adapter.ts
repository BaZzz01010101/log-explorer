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
        request.direction,
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
      if (request.direction === "older") items.reverse();
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
    async live(request, signal, emit) {
      if (request.kind !== "events")
        throw new Error("Only Events queries are supported");
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
