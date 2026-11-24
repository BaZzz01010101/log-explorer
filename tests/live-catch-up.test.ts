import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type {
  Connection,
  LogEvent,
  QueryRequest,
  QueryUpdate,
} from "../src/shared/contracts";
import type { LogAdapter } from "../src/main/log-adapter";
import { LIVE_SETTLE_MS } from "../src/main/live-catch-up";
import { createLogService } from "../src/main/log-service";

const START = 10_000_000;
beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(START);
});
afterEach(() => vi.useRealTimers());

const connection = (id: string): Connection => ({
  id,
  mode: "aws",
  name: id,
  profile: id,
  region: "eu-west-1",
});
const event = (id: string, timestamp: number, message = id): LogEvent => ({
  id,
  timestamp,
  message,
  logGroup: "/group",
  logStream: "stream",
});
const base: QueryRequest = {
  requestId: "live",
  connection: connection("one"),
  sources: [{ logGroup: "/group" }],
  startTime: 0,
  endTime: 100,
  kind: "events",
  filterPattern: "error",
  query: "",
  limit: 10000,
  catchUp: { from: START - 3600000, limit: 5 },
};

async function setup(
  request: QueryRequest,
  load: (request: QueryRequest) => Promise<Partial<QueryUpdate>>,
) {
  const updates: QueryUpdate[] = [];
  const queries: QueryRequest[] = [];
  const signals: AbortSignal[] = [];
  const streams: Record<string, (update: Partial<QueryUpdate>) => void> = {};
  const fail: Record<string, (error: Error) => void> = {};
  const adapter = (item: Connection): LogAdapter => ({
    live: (_input, signal, emit) =>
      new Promise<void>((_resolve, reject) => {
        signal.addEventListener("abort", () => reject(new Error("aborted")));
        fail[item.id] = reject;
        streams[item.id] = (update) =>
          emit({ requestId: "live", state: "running", ...update });
      }),
    events: async (input, signal) => {
      queries.push(input);
      signals.push(signal);
      return { requestId: "live", state: "complete", ...(await load(input)) };
    },
    listGroups: vi.fn(),
    listStreams: vi.fn(),
    destroy: vi.fn(),
  });
  const service = createLogService((update) => updates.push(update), {
    allowAws: () => true,
    awsAdapterFactory: adapter,
  });
  await service.live(request);
  await vi.advanceTimersByTimeAsync(0);
  const found = () =>
    updates
      .flatMap((update) => update.events ?? [])
      .map((item) => item.message);
  return { service, updates, queries, signals, streams, fail, found };
}

it("loads the missed period newest first, then the connection period once more", async () => {
  const pages: Record<string, Partial<QueryUpdate>> = {
    first: { events: [event("c", 30), event("b", 20)], cursor: "next" },
    next: { events: [event("a", 10)] },
  };
  let reconnected = false;
  const { updates, queries, streams, found, service } = await setup(
    base,
    async ({ cursor }) =>
      reconnected
        ? { events: [event("d", 40), event("c", 30)] }
        : pages[cursor ?? "first"],
  );
  expect(queries).toHaveLength(2);
  expect(queries[0]).toMatchObject({
    direction: "older",
    startTime: START - 3600000,
    filterPattern: "error",
  });
  expect(queries[0].endTime).toBeGreaterThan(START);
  expect(found()).toEqual(["c", "b", "a"]);
  await vi.advanceTimersByTimeAsync(60_000);
  expect(queries).toHaveLength(2);
  reconnected = true;
  streams.one({ liveState: "streaming" });
  await vi.advanceTimersByTimeAsync(LIVE_SETTLE_MS - 1);
  expect(queries).toHaveLength(2);
  await vi.advanceTimersByTimeAsync(1);
  expect(queries).toHaveLength(3);
  expect(queries[2].startTime).toBe(START - 120_000);
  expect(found()).toEqual(["c", "b", "a", "d"]);
  expect(updates.at(-1)).toMatchObject({
    state: "running",
    catchUp: { state: "complete" },
  });
  expect(updates.some((update) => update.replace)).toBe(false);
  await service.shutdown();
});

it("numbers identical events separately for Live and history", async () => {
  const { updates, streams, service } = await setup(base, async () => ({
    events: [event("h1", 50, "same"), event("h2", 50, "same")],
  }));
  streams.one({ liveState: "streaming", events: [event("l1", 50, "same\n")] });
  streams.one({ events: [event("l2", 50, "same")] });
  expect(updates.flatMap((update) => update.occurrences ?? [])).toEqual([
    1, 2, 1, 2,
  ]);
  await vi.advanceTimersByTimeAsync(LIVE_SETTLE_MS);
  streams.one({ events: [event("later", 51)] });
  expect(updates.at(-1)!.occurrences).toBeUndefined();
  await service.shutdown();
});

it("stops at the view limit and reports a failure without ending Live", async () => {
  let failing = false;
  let page = 0;
  const { updates, queries, streams, service } = await setup(base, async () => {
    if (failing) throw new Error("No history access");
    page++;
    return {
      events: Array.from({ length: 1000 }, (_, index) =>
        event(`${page}-${index}`, 100 - page),
      ),
      cursor: "more",
    };
  });
  expect(queries).toHaveLength(1);
  failing = true;
  streams.one({ liveState: "streaming" });
  await vi.advanceTimersByTimeAsync(LIVE_SETTLE_MS);
  expect(updates.at(-1)).toMatchObject({
    state: "running",
    catchUp: { state: "error", error: "No history access" },
  });
  streams.one({ events: [event("still-live", 500)] });
  expect(updates.at(-1)!.events).toHaveLength(1);
  await service.shutdown();
});

it("stops loading when Live is cancelled or fails", async () => {
  for (const end of ["cancel", "fail"]) {
    let finish!: () => void;
    const { service, signals, queries, fail } = await setup(
      base,
      () =>
        new Promise((resolve) => {
          finish = () => resolve({ events: [], cursor: "more" });
        }),
    );
    expect(queries).toHaveLength(1);
    if (end === "cancel") await service.cancel("live");
    else fail.one(new Error("lost"));
    await vi.advanceTimersByTimeAsync(0);
    expect(signals[0].aborted).toBe(true);
    finish();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(queries).toHaveLength(1);
  }
});

it("waits for every connection of a mixed view, including failed ones", async () => {
  const { queries, streams, fail, service } = await setup(
    {
      ...base,
      connections: [connection("two")],
      sources: [
        { logGroup: "/group" },
        { connectionId: "two", logGroup: "/group" },
      ],
    },
    async () => ({ events: [] }),
  );
  expect(queries).toHaveLength(2);
  streams.one({ liveState: "streaming" });
  await vi.advanceTimersByTimeAsync(60_000);
  expect(queries).toHaveLength(2);
  fail.two(new Error("denied"));
  await vi.advanceTimersByTimeAsync(LIVE_SETTLE_MS);
  expect(queries).toHaveLength(4);
  await service.shutdown();
});
