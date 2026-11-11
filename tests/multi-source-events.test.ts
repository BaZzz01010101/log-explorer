import { expect, it, vi } from "vitest";
import type {
  Connection,
  QueryRequest,
  QueryUpdate,
} from "../src/shared/contracts";
import { createMultiSourceEvents } from "../src/main/multi-source-events";
import { createLogService } from "../src/main/log-service";
import { createAwsAdapter, type LogAdapter } from "../src/main/aws-adapter";

const west: Connection = {
  id: "west",
  profile: "p",
  region: "eu-west-1",
  mode: "offline",
  name: "West",
};
const east = { ...west, id: "east", region: "us-east-1" };
const request = (patch: Partial<QueryRequest> = {}): QueryRequest => ({
  requestId: "q",
  connection: west,
  connections: [east],
  sources: [
    { logGroup: "/same", logStreams: ["one", "two"] },
    { connectionId: "east", logGroup: "/same" },
  ],
  startTime: 0,
  endTime: 100,
  kind: "events",
  filterPattern: "",
  query: "fields @message",
  limit: 3,
  ...patch,
});
const adapter = (events: LogAdapter["events"]): LogAdapter => ({
  events,
  listGroups: vi.fn(),
  listStreams: vi.fn(),
  live: vi.fn(),
  destroy: vi.fn(),
});

it("starts independent source reads concurrently while keeping merged events chronological", async () => {
  let release!: () => void;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  const started: string[] = [];
  const merger = createMultiSourceEvents((connection) => adapter(async (input) => {
    started.push(connection.id);
    await gate;
    return { requestId: input.requestId, state: "complete", events: [{ id: connection.id, timestamp: connection.id === "west" ? 2 : 1, message: connection.id, logGroup: "/same", logStream: "one" }] };
  }));
  const task = merger.events(request(), new AbortController().signal);
  try { await vi.waitFor(() => expect(started).toHaveLength(2), { timeout: 200 }); }
  finally { release(); }
  const result = await task;
  expect(result.events?.map((event) => event.timestamp)).toEqual([1, 2]);
});

it("publishes ordered batches before waiting for later source pages", async () => {
  let release!: () => void;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  const progress = vi.fn();
  const merger = createMultiSourceEvents((connection) => adapter(async (input) => {
    if (input.cursor) { await gate; return { requestId: input.requestId, state: "complete", events: [] }; }
    const base = connection.id === "west" ? 0 : 1000;
    return { requestId: input.requestId, state: "complete", cursor: "next", events: Array.from({ length: 256 }, (_, i) => ({ id: String(i), timestamp: base + i, message: "x", logGroup: "/same", logStream: "one" })) };
  }));
  const task = merger.events(request({ limit: 800 }), new AbortController().signal, progress);
  try { await vi.waitFor(() => expect(progress).toHaveBeenCalled(), { timeout: 300 }); }
  finally { release(); }
  const result = await task;
  const combined = [...progress.mock.calls.flatMap(([update]) => update.events ?? []), ...(result.events ?? [])];
  expect(combined).toHaveLength(512);
  expect(combined.every((event, index) => index === 0 || event.timestamp >= combined[index - 1].timestamp)).toBe(true);
});

it("preserves ordering through sparse scans and binds continuation to exact regional selection", async () => {
  const calls: QueryRequest[] = [];
  const adapters = new Map(
    [west, east].map((connection) => [
      connection.id,
      adapter(async (input) => {
        calls.push(input);
        if (connection.id === "west" && !input.cursor)
          return {
            requestId: input.requestId,
            state: "complete",
            events: [],
            cursor: "sparse",
          };
        const timestamp = connection.id === "west" ? 1 : 2;
        return {
          requestId: input.requestId,
          state: "complete",
          events: [
            {
              id: "same-id",
              timestamp,
              message: connection.id,
              logGroup: "/same",
              logStream: "one",
            },
          ],
        };
      }),
    ]),
  );
  const merger = createMultiSourceEvents((connection) =>
    adapters.get(connection.id)!,
  );
  const first = await merger.events(request(), new AbortController().signal);
  expect(first.events).toEqual([]);
  expect(first.cursor).toBeTruthy();
  const second = await merger.events(
    request({ requestId: "next", cursor: first.cursor }),
    new AbortController().signal,
  );
  expect(second.events?.map((event) => event.timestamp)).toEqual([1, 2]);
  expect(second.events?.map((event) => event.connectionId)).toEqual([
    "west",
    "east",
  ]);
  expect(second.cursor).toBeUndefined();
  expect(calls[0].sources).toEqual([
    { logGroup: "/same", logStreams: ["one", "two"] },
  ]);
  expect(calls[1].connection.region).toBe("us-east-1");
  await expect(
    merger.events(
      request({ cursor: first.cursor, filterPattern: "changed" }),
      new AbortController().signal,
    ),
  ).rejects.toThrow(/Continuation/);
});

it("cancels a regional request using its parent signal without emitting a completed query", async () => {
  const updates: QueryUpdate[] = [],
    started = vi.fn();
  const service = createLogService((update) => updates.push(update), {
    allowAws: () => false,
    offlineAdapterFactory: () =>
      adapter(
        async (_request, signal) =>
          new Promise((_resolve, reject) => {
            started();
            signal.addEventListener(
              "abort",
              () =>
                reject(
                  Object.assign(new Error("aborted"), { name: "AbortError" }),
                ),
              { once: true },
            );
          }),
      ),
  });
  await service.query(request());
  await expect.poll(() => started.mock.calls.length).toBeGreaterThanOrEqual(1);
  await service.cancel("q");
  expect(updates.at(-1)?.state).toBe("cancelled");
  expect(updates.some((update) => update.state === "complete")).toBe(false);
  await service.shutdown();
});

it("expires a merge continuation after a partial regional failure rather than reusing advanced child cursors", async () => {
  let fail = false;
  const merger = createMultiSourceEvents((connection) =>
    adapter(async (input) => {
      if (fail) throw new Error("regional failure");
      const offset = Number(input.cursor ?? 0);
      return {
        requestId: input.requestId,
        state: "complete",
        cursor: String(offset + 1),
        events: [
          {
            id: String(offset),
            timestamp: offset,
            message: connection.id,
            logGroup: "/same",
            logStream: "one",
          },
        ],
      };
    }),
  );
  const first = await merger.events(
    request({ limit: 1 }),
    new AbortController().signal,
  );
  fail = true;
  await expect(
    merger.events(
      request({ limit: 1, cursor: first.cursor }),
      new AbortController().signal,
    ),
  ).rejects.toThrow("regional failure");
  fail = false;
  await expect(
    merger.events(
      request({ limit: 1, cursor: first.cursor }),
      new AbortController().signal,
    ),
  ).rejects.toThrow(/Continuation/);
});

it("bounds output message characters and preserves the unconsumed head for the next page", async () => {
  const message = "x".repeat(1_000_000);
  const merger = createMultiSourceEvents((connection) =>
    adapter(async (input) => {
      const offset = Number(input.cursor ?? 0);
      return {
        requestId: input.requestId,
        state: "complete",
        cursor: offset < 24 ? String(offset + 1) : undefined,
        events: [
          {
            id: String(offset),
            timestamp: offset,
            message,
            logGroup: "/same",
            logStream: "one",
          },
        ],
      };
    }),
  );
  const first = await merger.events(
    request({ limit: 100 }),
    new AbortController().signal,
  );
  expect(
    first.events!.reduce((sum, event) => sum + event.message.length, 0),
  ).toBeLessThanOrEqual(16_000_000);
  expect(first.cursor).toBeTruthy();
  expect(first.truncated).toBe(false);
  let events = first.events!,
    cursor = first.cursor;
  while (cursor) {
    const next = await merger.events(
      request({ limit: 100, cursor }),
      new AbortController().signal,
    );
    events = [...events, ...next.events!];
    cursor = next.cursor;
  }
  expect(events).toHaveLength(50);
  expect(new Set(events.map((event) => event.id)).size).toBe(50);
  expect(
    events.every(
      (event, index) =>
        index === 0 || event.timestamp >= events[index - 1].timestamp,
    ),
  ).toBe(true);
});

it("bounds child page reads and continues a long one-event-per-page query without loss", async () => {
  let calls = 0;
  const merger = createMultiSourceEvents((connection) =>
    adapter(async (input) => {
      calls++;
      const offset = Number(input.cursor ?? 0);
      return {
        requestId: input.requestId,
        state: "complete",
        cursor: offset < 299 ? String(offset + 1) : undefined,
        events: [
          {
            id: String(offset),
            timestamp: offset,
            message: connection.id,
            logGroup: "/same",
            logStream: "one",
          },
        ],
      };
    }),
  );
  const first = await merger.events(
    request({ limit: 10000 }),
    new AbortController().signal,
  );
  expect(calls).toBeLessThanOrEqual(128);
  expect(first.cursor).toBeTruthy();
  let events = first.events!,
    cursor = first.cursor;
  while (cursor) {
    const before = calls;
    const next = await merger.events(
      request({ limit: 10000, cursor }),
      new AbortController().signal,
    );
    expect(calls - before).toBeLessThanOrEqual(128);
    events = [...events, ...next.events!];
    cursor = next.cursor;
  }
  expect(events).toHaveLength(600);
  expect(new Set(events.map((event) => event.id)).size).toBe(600);
});

it("rejects missing connections, legacy queries, cross-region Live and disabled AWS before constructing adapters", async () => {
  const factory = vi.fn(() => adapter(vi.fn()));
  const service = createLogService(() => {}, {
    allowAws: () => false,
    offlineAdapterFactory: factory,
    awsAdapterFactory: factory,
  });
  await expect(service.query(request({ connections: [] }))).rejects.toThrow(
    /no longer exists/,
  );
  await expect(service.query(request({ kind: "insights" }))).rejects.toThrow(
    /only Events/i,
  );
  await expect(service.live(request())).rejects.toThrow(
    /one connection and region/,
  );
  await expect(
    service.query(request({ connections: [{ ...east, mode: "aws" }] })),
  ).rejects.toThrow(/AWS access is disabled/);
  expect(factory).not.toHaveBeenCalled();
  await service.shutdown();
});

it("queries only the selected secondary region when the original group has been removed", async () => {
  const updates: QueryUpdate[] = [],
    calls: QueryRequest[] = [];
  const service = createLogService((update) => updates.push(update), {
    allowAws: () => false,
    offlineAdapterFactory: () =>
      adapter(async (input) => {
        calls.push(input);
        return {
          requestId: input.requestId,
          state: "complete",
          events: [
            {
              id: "event",
              timestamp: 1,
              message: "right region",
              logGroup: "/same",
              logStream: "one",
            },
          ],
        };
      }),
  });
  await service.query(
    request({
      sources: [
        { connectionId: "east", logGroup: "/same", logStreams: ["one", "two"] },
      ],
    }),
  );
  await expect.poll(() => updates.at(-1)?.state).toBe("complete");
  expect(calls[0].connection.region).toBe("us-east-1");
  expect(calls[0].sources[0].logStreams).toEqual(["one", "two"]);
  expect(updates.at(-1)?.events?.[0].connectionId).toBe("east");
  await service.shutdown();
});

it("does not gate an unused AWS anchor when every selected source is offline", async () => {
  const updates: QueryUpdate[] = [],
    calls = vi.fn();
  const service = createLogService((update) => updates.push(update), {
    allowAws: () => false,
    awsAdapterFactory: () => {
      throw new Error("Unused AWS adapter was constructed");
    },
    offlineAdapterFactory: () =>
      adapter(async (input) => {
        calls();
        return { requestId: input.requestId, state: "complete", events: [] };
      }),
  });
  await service.query(
    request({
      connection: { ...west, mode: "aws" },
      sources: [{ connectionId: east.id, logGroup: "/same" }],
    }),
  );
  await expect.poll(() => updates.at(-1)?.state).toBe("complete");
  expect(calls).toHaveBeenCalledOnce();
  await service.shutdown();
});

it("sends same-group stream selections to the correct regional AWS clients", async () => {
  const calls: { region: string; input: unknown }[] = [],
    updates: QueryUpdate[] = [];
  const service = createLogService((update) => updates.push(update), {
    allowAws: () => true,
    awsAdapterFactory: (connection) =>
      createAwsAdapter(connection, {
        allowAws: () => true,
        transportFactory: async (selected) => ({
          send: async (command) => {
            calls.push({ region: selected.region, input: command.input });
            return {
              events: [
                {
                  eventId: "same",
                  timestamp: 1,
                  logStreamName: "one",
                  message: "matched",
                },
              ],
            };
          },
          destroy: () => {},
        }),
      }),
  });
  await service.query(
    request({
      connection: { ...west, mode: "aws" },
      connections: [{ ...east, mode: "aws" }],
    }),
  );
  await expect.poll(() => updates.at(-1)?.state).toBe("complete");
  expect(calls).toEqual([
    {
      region: "eu-west-1",
      input: expect.objectContaining({
        logGroupName: "/same",
        logStreamNames: ["one", "two"],
        startTime: 0,
        endTime: 100,
      }),
    },
    {
      region: "us-east-1",
      input: expect.objectContaining({
        logGroupName: "/same",
        logStreamNames: undefined,
        startTime: 0,
        endTime: 100,
      }),
    },
  ]);
  expect(updates.at(-1)?.events).toHaveLength(2);
  await service.shutdown();
});

it("requests newest-first AWS stream pages without combining an incompatible name prefix", async () => {
  const inputs: unknown[] = [];
  const awsAdapter = createAwsAdapter(
    { ...west, mode: "aws" },
    {
      allowAws: () => true,
      transportFactory: async () => ({
        send: async (command) => {
          inputs.push(command.input);
          return { logStreams: [] };
        },
        destroy: () => {},
      }),
    },
  );
  try {
    await awsAdapter.listStreams(
      "/same",
      "",
      undefined,
      new AbortController().signal,
    );
    await awsAdapter.listStreams(
      "/same",
      "prefix",
      undefined,
      new AbortController().signal,
    );
    expect(inputs[0]).toMatchObject({
      orderBy: "LastEventTime",
      descending: true,
    });
    expect(inputs[1]).toMatchObject({
      orderBy: "LogStreamName",
      logStreamNamePrefix: "prefix",
      descending: true,
    });
  } finally {
    awsAdapter.destroy();
  }
});
