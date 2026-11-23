import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type {
  Connection,
  LogEvent,
  QueryRequest,
  QueryUpdate,
} from "../src/shared/contracts";
import type { LogAdapter } from "../src/main/aws-adapter";
import {
  createLiveReorder,
  LIVE_CONNECT_MS,
  LIVE_HOLD_MS,
} from "../src/main/live-merge";
import { createLogService } from "../src/main/log-service";

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(1_000_000);
});
afterEach(() => vi.useRealTimers());

const event = (timestamp: number, message = String(timestamp)): LogEvent => ({
  id: message,
  timestamp,
  message,
  logGroup: "/group",
  logStream: "stream",
});
const messages = (events: LogEvent[] = []) =>
  events.map((item) => item.message);

it("orders late events, releases each within the hold and keeps equal times in arrival order", async () => {
  const batches: string[][] = [];
  const reorder = createLiveReorder((events) => batches.push(messages(events)));
  reorder.ready();
  reorder.push([event(200, "b"), event(200, "c")]);
  await vi.advanceTimersByTimeAsync(2000);
  reorder.push([event(100, "a"), event(300, "d")]);
  await vi.advanceTimersByTimeAsync(LIVE_HOLD_MS - 2000 - 1);
  expect(batches).toEqual([]);
  await vi.advanceTimersByTimeAsync(1);
  expect(batches).toEqual([["a", "b", "c"]]);
  await vi.advanceTimersByTimeAsync(2000);
  expect(batches).toEqual([["a", "b", "c"], ["d"]]);
  expect(vi.getTimerCount()).toBe(0);
});

it("still delivers an event that arrives after the hold", async () => {
  const batches: string[][] = [];
  const reorder = createLiveReorder((events) => batches.push(messages(events)));
  reorder.ready();
  reorder.push([event(200)]);
  await vi.advanceTimersByTimeAsync(LIVE_HOLD_MS);
  reorder.push([event(100)]);
  await vi.advanceTimersByTimeAsync(LIVE_HOLD_MS);
  expect(batches).toEqual([["200"], ["100"]]);
});

it("waits for slow connections only up to the limit", async () => {
  const batches: string[][] = [];
  const reorder = createLiveReorder((events) => batches.push(messages(events)));
  reorder.push([event(200)]);
  await vi.advanceTimersByTimeAsync(LIVE_CONNECT_MS - 1);
  expect(batches).toEqual([]);
  await vi.advanceTimersByTimeAsync(1);
  expect(batches).toEqual([["200"]]);
});

it("releases the oldest events when the buffer is full and the rest on flush", () => {
  const batches: LogEvent[][] = [];
  const reorder = createLiveReorder((events) => batches.push(events));
  reorder.push(Array.from({ length: 20010 }, (_, index) => event(index)));
  expect(batches[0].map((item) => item.timestamp)).toEqual([
    0, 1, 2, 3, 4, 5, 6, 7, 8, 9,
  ]);
  reorder.flush();
  expect(batches[1]).toHaveLength(20000);
  reorder.push([
    event(1, "x".repeat(10_000_000)),
    event(2, "y".repeat(10_000_000)),
  ]);
  expect(batches[2].map((item) => item.timestamp)).toEqual([1]);
  reorder.close();
});

const connection = (id: string, mode: Connection["mode"]): Connection => ({
  id,
  mode,
  name: id.toUpperCase(),
  profile: "p",
  region: "eu-west-1",
  ...(mode === "gcp"
    ? { gcpIdentity: { configuration: "c", account: "a@example.com" } }
    : {}),
});
const request: QueryRequest = {
  requestId: "live",
  connection: connection("aws", "aws"),
  connections: [connection("gcp", "gcp")],
  sources: [
    { logGroup: "/group" },
    {
      connectionId: "gcp",
      logGroup: "/gcp",
      gcp: {
        kind: "function",
        project: "demo-123",
        region: "europe-west2",
        generation: "v1",
        functionName: "f",
      },
    },
  ],
  startTime: 0,
  endTime: 100,
  kind: "events",
  filterPattern: "",
  query: "",
  limit: 10,
};

interface Stream {
  signal: AbortSignal;
  emit(update: Partial<QueryUpdate>): void;
  fail(error: Error): void;
  end(): void;
}
/** A service whose provider streams are driven by the test. */
async function setup() {
  const updates: QueryUpdate[] = [];
  const streams: Record<string, Stream> = {};
  const factory = (item: Connection): LogAdapter => ({
    live: (input, signal, emit) =>
      new Promise<void>((resolve, reject) => {
        signal.addEventListener("abort", () =>
          reject(
            Object.assign(new Error("Operation cancelled"), {
              name: "AbortError",
            }),
          ),
        );
        streams[item.id] = {
          signal,
          emit: (update) =>
            emit({ requestId: input.requestId, state: "running", ...update }),
          fail: reject,
          end: () => {
            emit({ requestId: input.requestId, state: "complete" });
            resolve();
          },
        };
      }),
    events: vi.fn(),
    listGroups: vi.fn(),
    listStreams: vi.fn(),
    destroy: vi.fn(),
  });
  const service = createLogService((update) => updates.push(update), {
    allowAws: () => true,
    allowGcp: () => true,
    awsAdapterFactory: factory,
    gcpAdapterFactory: factory,
  });
  await service.live(request);
  await vi.advanceTimersByTimeAsync(0);
  const last = () => updates.at(-1)!;
  const shown = () => updates.flatMap((update) => messages(update.events));
  return { service, streams, updates, last, shown };
}

it("merges AWS and Google Live in time order as one stream", async () => {
  const { service, streams, updates, last, shown } = await setup();
  expect(last()).toMatchObject({ state: "running", liveState: "connecting" });
  streams.aws.emit({ liveState: "streaming", events: [event(200, "aws")] });
  expect(last()).toMatchObject({ liveState: "streaming" });
  await vi.advanceTimersByTimeAsync(1000);
  streams.gcp.emit({
    liveState: "streaming",
    sampled: true,
    events: [event(100, "gcp")],
  });
  expect(last().sampled).toBe(true);
  streams.aws.emit({ sampled: false });
  expect(last().sampled).toBe(true);
  expect(shown()).toEqual([]);
  await vi.advanceTimersByTimeAsync(LIVE_HOLD_MS);
  expect(shown()).toEqual(["gcp", "aws"]);
  expect(
    updates
      .flatMap((update) => update.events ?? [])
      .map((item) => item.connectionId),
  ).toEqual(["gcp", "aws"]);
  // A reconnecting source does not hide that the other one is streaming.
  streams.gcp.emit({ liveState: "connecting" });
  expect(last().liveState).toBe("streaming");
  await service.shutdown();
});

it("shows held events immediately on Stop and nothing afterwards", async () => {
  const { service, streams, updates, shown } = await setup();
  streams.aws.emit({ liveState: "streaming", events: [event(200, "held")] });
  await service.cancel("live");
  expect(shown()).toEqual(["held"]);
  expect(updates.at(-1)?.state).toBe("cancelled");
  expect(streams.aws.signal.aborted).toBe(true);
  expect(streams.gcp.signal.aborted).toBe(true);
  const count = updates.length;
  streams.aws.emit({ events: [event(300)] });
  await vi.advanceTimersByTimeAsync(10000);
  expect(updates).toHaveLength(count);
  expect(vi.getTimerCount()).toBe(0);
});

it("keeps streaming when one source fails and names it", async () => {
  const { service, streams, last, shown } = await setup();
  streams.aws.emit({ liveState: "streaming" });
  streams.gcp.emit({
    liveState: "streaming",
    events: [event(100, "before failure")],
  });
  streams.gcp.fail(new Error("Google Cloud credentials expired."));
  await vi.advanceTimersByTimeAsync(0);
  expect(last()).toMatchObject({
    state: "running",
    liveState: "streaming",
    liveFailures: [
      {
        connectionId: "gcp",
        name: "GCP",
        error: "Google Cloud credentials expired.",
      },
    ],
  });
  expect(streams.aws.signal.aborted).toBe(false);
  streams.aws.emit({ events: [event(200, "aws")] });
  await vi.advanceTimersByTimeAsync(LIVE_HOLD_MS + 250);
  expect(shown()).toEqual(["before failure", "aws"]);
  await service.shutdown();
});

it("reports an AWS session that ends while Google continues", async () => {
  const { service, streams, last } = await setup();
  streams.gcp.emit({ liveState: "streaming" });
  streams.aws.end();
  await vi.advanceTimersByTimeAsync(0);
  expect(last()).toMatchObject({
    state: "running",
    liveFailures: [{ connectionId: "aws", error: "Live stream ended." }],
  });
  await service.shutdown();
});

it("fails with each source's own error after all stop, showing held events first", async () => {
  const { streams, updates, last, shown } = await setup();
  streams.gcp.emit({ liveState: "streaming", events: [event(100, "held")] });
  streams.aws.fail(
    Object.assign(new Error("raw"), { name: "AccessDeniedException" }),
  );
  await vi.advanceTimersByTimeAsync(0);
  streams.gcp.fail(new Error("Google failed."));
  await vi.advanceTimersByTimeAsync(0);
  expect(shown()).toEqual(["held"]);
  expect(last().state).toBe("error");
  expect(last().error).toBe(
    "AWS: Permission denied. Verify the selected profile and CloudWatch Logs IAM permissions.\nGCP: Google failed.",
  );
  expect(updates.filter((update) => update.state === "error")).toHaveLength(1);
});

it("completes when every source ends normally", async () => {
  const { streams, last } = await setup();
  streams.aws.end();
  streams.gcp.end();
  await vi.advanceTimersByTimeAsync(0);
  expect(last().state).toBe("complete");
});
