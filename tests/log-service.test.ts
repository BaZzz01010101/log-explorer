import { describe, expect, it, vi } from "vitest";
import type {
  Connection,
  QueryRequest,
  QueryUpdate,
} from "../src/shared/contracts";
import { createLogService } from "../src/main/log-service";
import { createAwsAdapter, type AwsTransport } from "../src/main/aws-adapter";
import type { CloudWatchCommand } from "../src/main/aws-common";
import { createOfflineAdapter } from "../src/main/offline-adapter";
import { setAwsAccess } from "../src/main/aws-access-toggle";

const offline: Connection = {
  id: "fixture",
  name: "Offline",
  mode: "offline",
  profile: "default",
  region: "eu-west-1",
};
const aws: Connection = { ...offline, id: "aws", mode: "aws" };
function request(overrides: Partial<QueryRequest> = {}): QueryRequest {
  return {
    requestId: "query-1",
    connection: offline,
    sources: [{ logGroup: "/aws/lambda/orders-api" }],
    startTime: 0,
    endTime: Date.now(),
    kind: "events",
    filterPattern: "",
    query: "fields @timestamp, @message | sort @timestamp desc | limit 100",
    limit: 8,
    ...overrides,
  };
}
async function waitFor(updates: QueryUpdate[], state: QueryUpdate["state"]) {
  for (let i = 0; i < 100; i++) {
    const update = updates.find((value) => value.state === state);
    if (update) return update;
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  throw new Error(`Missing ${state}: ${JSON.stringify(updates)}`);
}
function transport(
  run: (command: CloudWatchCommand, signal?: AbortSignal) => Promise<unknown>,
): AwsTransport {
  return {
    send: (command, options) => run(command, options?.abortSignal),
    destroy: () => {},
  };
}

describe("offline log service", () => {
  it("paginates fixtures without duplicates and applies exact stream selection", async () => {
    const adapter = createOfflineAdapter();
    const streams = await adapter.listStreams(
      "/aws/lambda/orders-api",
      "",
      undefined,
      new AbortController().signal,
    );
    const selected = streams.items[0].name;
    const input = request({
      sources: [{ logGroup: "/aws/lambda/orders-api", logStreams: [selected] }],
    });
    const first = await adapter.events(input, new AbortController().signal);
    const second = await adapter.events(
      { ...input, cursor: first.cursor },
      new AbortController().signal,
    );
    expect(first.events?.length).toBe(8);
    expect(first.cursor).toBeTruthy();
    expect(second.events?.every((event) => event.logStream === selected)).toBe(
      true,
    );
    expect(
      new Set([...first.events!, ...second.events!].map((event) => event.id))
        .size,
    ).toBe(16);
  });

  it("rejects unsupported fixture queries instead of returning fabricated success", async () => {
    const adapter = createOfflineAdapter();
    await expect(
      adapter.events(
        request({ filterPattern: '{ $.level = "ERROR" }' }),
        new AbortController().signal,
      ),
    ).rejects.toThrow(/offline.*supports/i);
  });

  it("emits a complete result through the actual scheduled service path", async () => {
    const updates: QueryUpdate[] = [];
    const service = createLogService((update) => updates.push(update), {
      allowAws: () => false,
    });
    await service.query(request());
    const complete = await waitFor(updates, "complete");
    expect(updates[0].state).toBe("queued");
    expect(complete.events).toHaveLength(8);
    expect(complete.cursor).toBeTruthy();
    await service.shutdown();
  });

  it("cancels live monitoring without later result updates", async () => {
    const updates: QueryUpdate[] = [];
    const service = createLogService((update) => updates.push(update), {
      allowAws: () => false,
    });
    await service.live(request());
    await waitFor(updates, "running");
    await service.cancel("query-1");
    const cancelled = await waitFor(updates, "cancelled");
    const index = updates.indexOf(cancelled);
    await new Promise((resolve) => setTimeout(resolve, 25));
    expect(updates.slice(index + 1)).toHaveLength(0);
    await service.shutdown();
  });

  it("bypasses the metadata cache for an explicit refresh", async () => {
    let calls = 0;
    const service = createLogService(() => {}, {
      allowAws: () => true,
      awsAdapterFactory: (connection) =>
        createAwsAdapter(connection, {
          allowAws: () => true,
          transportFactory: async () =>
            transport(async () => {
              calls++;
              return { logGroups: [{ logGroupName: `group-${calls}` }] };
            }),
        }),
    });
    await service.listGroups(aws, "");
    await service.listGroups(aws, "");
    expect(calls).toBe(1);
    const refreshed = await service.listGroups(aws, "", undefined, true);
    expect(calls).toBe(2);
    expect(refreshed.items[0]?.name).toBe("group-2");
    await service.shutdown();
  });
  it("checks authorization before serving cached AWS metadata", async () => {
    let enabled = false;
    let constructed = 0;
    const service = createLogService(() => {}, {
      allowAws: () => enabled,
      awsAdapterFactory: (connection) => {
        constructed++;
        return createAwsAdapter(connection, {
          allowAws: () => enabled,
          transportFactory: async () =>
            transport(async () => ({ logGroups: [{ logGroupName: "group" }] })),
        });
      },
    });
    await expect(service.listGroups(aws, "")).rejects.toThrow(/disabled/i);
    expect(constructed).toBe(0);
    enabled = true;
    expect((await service.listGroups(aws, "")).items).toHaveLength(1);
    enabled = false;
    await expect(service.listGroups(aws, "")).rejects.toThrow(/disabled/i);
    expect(constructed).toBe(1);
    await service.shutdown();
  });

  it("cancels a queued query before it can dispatch an AWS command", async () => {
    const updates: QueryUpdate[] = [];
    let dispatched = 0;
    const service = createLogService((update) => updates.push(update), {
      allowAws: () => true,
      awsAdapterFactory: (connection) =>
        createAwsAdapter(connection, {
          allowAws: () => true,
          transportFactory: async () =>
            transport(async (_command, signal) => {
              dispatched++;
              return new Promise((_resolve, reject) =>
                signal!.addEventListener(
                  "abort",
                  () =>
                    reject(
                      Object.assign(new Error("Cancelled"), {
                        name: "AbortError",
                      }),
                    ),
                  { once: true },
                ),
              );
            }),
        }),
    });
    for (let index = 0; index < 6; index++)
      await service.query(
        request({ connection: aws, requestId: `queued-${index}` }),
      );
    await new Promise((resolve) => setTimeout(resolve, 10));
    await service.cancel("queued-5");
    expect(dispatched).toBe(4);
    expect(
      updates.some(
        (update) =>
          update.requestId === "queued-5" && update.state === "running",
      ),
    ).toBe(false);
    expect(
      updates.filter((update) => update.requestId === "queued-5").at(-1)?.state,
    ).toBe("cancelled");
    await service.shutdown();
  });

  it("treats errors after cancellation as cancellation and never poisons shutdown", async () => {
    const updates: QueryUpdate[] = [];
    let started!: () => void;
    const running = new Promise<void>((resolve) => {
      started = resolve;
    });
    const service = createLogService((update) => updates.push(update), {
      allowAws: () => false,
      offlineAdapterFactory: () => ({
        ...createOfflineAdapter(),
        events: (_input, signal) =>
          new Promise<never>((_resolve, reject) => {
            signal.addEventListener(
              "abort",
              () => reject(new Error("x")),
              { once: true },
            );
            started();
          }),
      }),
    });
    await service.query(request());
    await running;
    await expect(service.cancel("query-1")).resolves.toBeUndefined();
    expect(updates.at(-1)).toEqual({ requestId: "query-1", state: "cancelled" });
    await expect(service.shutdown()).resolves.toBeUndefined();
    await expect(service.shutdown()).resolves.toBeUndefined();
  });

  it("reports adapter destroy failures only for that shutdown", async () => {
    let fail = true;
    const service = createLogService(() => {}, {
      allowAws: () => false,
      offlineAdapterFactory: () => ({
        ...createOfflineAdapter(),
        destroy: () => {
          if (fail) throw new Error("destroy failed");
        },
      }),
    });
    await service.listGroups(offline, "");
    await expect(service.shutdown()).rejects.toThrow(/destroy failed/);
    fail = false;
    await expect(service.shutdown()).resolves.toBeUndefined();
  });
});

describe("AWS adapter with isolated command transport", () => {
  it("cancels an authorized Events request after access is revoked and blocks new requests", async () => {
    let enabled = true,
      constructions = 0;
    const operations: string[] = [];
    let dispatched!: () => void;
    let activeSignal: AbortSignal | undefined;
    const running = new Promise<void>((resolve) => {
      dispatched = resolve;
    });
    const service = createLogService(() => {}, {
      allowAws: () => enabled,
      awsAdapterFactory: (connection) =>
        createAwsAdapter(connection, {
          allowAws: () => enabled,
          transportFactory: async () => {
            constructions++;
            return transport(async (command, signal) => {
              operations.push(command.constructor.name);
              activeSignal = signal;
              dispatched();
              return new Promise(() => {});
            });
          },
        }),
    });
    await service.query(request({ connection: aws }));
    await running;
    await expect(
      setAwsAccess(
        {
          setEnabled(value) {
            enabled = value;
          },
        },
        false,
        () => service.shutdown(),
      ),
    ).resolves.toBeUndefined();
    expect(activeSignal?.aborted).toBe(true);
    expect(operations).toEqual(["FilterLogEventsCommand"]);
    expect(constructions).toBe(1);
    await expect(service.listGroups(aws, "")).rejects.toThrow(/disabled/i);
    expect(operations).toHaveLength(1);
    expect(constructions).toBe(1);
  });

  it("denies before constructing any transport, including an already cached connection", async () => {
    let enabled = false;
    let constructions = 0;
    const adapter = createAwsAdapter(aws, {
      allowAws: () => enabled,
      transportFactory: async () => {
        constructions++;
        return transport(async () => ({ logGroups: [] }));
      },
    });
    await expect(
      adapter.listGroups("", undefined, new AbortController().signal),
    ).rejects.toThrow(/AWS access is disabled/i);
    expect(constructions).toBe(0);
    enabled = true;
    await adapter.listGroups("", undefined, new AbortController().signal);
    enabled = false;
    await expect(
      adapter.listGroups("", undefined, new AbortController().signal),
    ).rejects.toThrow(/AWS access is disabled/i);
    expect(constructions).toBe(1);
  });

  it("detects multi-token cycles in group pagination", async () => {
    const adapter = createAwsAdapter(aws, {
      allowAws: () => true,
      transportFactory: async () =>
        transport(async (command) => {
          const token = (command.input as { nextToken?: string }).nextToken;
          return { logGroups: [], nextToken: token === "a" ? "b" : "a" };
        }),
    });
    expect(
      (await adapter.listGroups("", undefined, new AbortController().signal))
        .cursor,
    ).toBe("a");
    expect(
      (await adapter.listGroups("", "a", new AbortController().signal)).cursor,
    ).toBe("b");
    await expect(
      adapter.listGroups("", "b", new AbortController().signal),
    ).rejects.toThrow(/repeated.*continuation/i);
  });

  it("terminates repeated tokens while scanning empty pages visibly", async () => {
    const commands: CloudWatchCommand[] = [];
    const adapter = createAwsAdapter(aws, {
      allowAws: () => true,
      transportFactory: async () =>
        transport(async (command) => {
          commands.push(command);
          return { events: [], nextToken: "same" };
        }),
    });
    const input = request({ connection: aws });
    const first = await adapter.events(input, new AbortController().signal);
    expect(first.cursor).toBeUndefined();
    expect(first.truncated).toBe(true);
    expect(commands).toHaveLength(2);
    expect((commands[1].input as { nextToken?: string }).nextToken).toBe(
      "same",
    );
  });

  it("continues one group with its own token and takes one group per request", async () => {
    const visited: (string | undefined)[] = [];
    const adapter = createAwsAdapter(aws, {
      allowAws: () => true,
      transportFactory: async () =>
        transport(async (command) => {
          const input = command.input as { nextToken?: string };
          visited.push(input.nextToken);
          return {
            events: [
              {
                eventId: String(visited.length),
                timestamp: 1,
                logStreamName: "stream",
                message: "message",
              },
            ],
            nextToken: input.nextToken ? undefined : "next",
          };
        }),
    });
    const input = request({ connection: aws, sources: [{ logGroup: "a" }] });
    const signal = new AbortController().signal;
    const first = await adapter.events(input, signal);
    const second = await adapter.events(
      { ...input, cursor: first.cursor },
      signal,
    );
    expect(visited).toEqual([undefined, "next"]);
    expect([...first.events!, ...second.events!]).toHaveLength(2);
    expect(second.cursor).toBeUndefined();
    await expect(
      adapter.events(
        { ...input, sources: [{ logGroup: "a" }, { logGroup: "b" }] },
        signal,
      ),
    ).rejects.toThrow(/exactly one source/);
  });

  it("uses the actual Live Tail event stream and reports sampling", async () => {
    async function* stream() {
      yield { sessionStart: { sessionId: "session" } };
      yield {
        sessionUpdate: {
          sessionMetadata: { sampled: true },
          sessionResults: [
            {
              logGroupIdentifier:
                "arn:aws:logs:eu-west-1:000000000000:log-group:group",
              logStreamName: "stream",
              timestamp: 5,
              ingestionTime: 6,
              message: '{"level":"ERROR"}',
            },
          ],
        },
      };
    }
    const adapter = createAwsAdapter(aws, {
      allowAws: () => true,
      transportFactory: async () =>
        transport(async (command) =>
          command.constructor.name === "DescribeLogGroupsCommand"
            ? {
                logGroups: [
                  {
                    logGroupName: "group",
                    arn: "arn:aws:logs:eu-west-1:000000000000:log-group:group:*",
                  },
                ],
              }
            : { responseStream: stream() },
        ),
    });
    const updates: QueryUpdate[] = [];
    await adapter.live(
      request({ connection: aws, sources: [{ logGroup: "group" }] }),
      new AbortController().signal,
      (update) => updates.push(update),
    );
    expect(
      updates.some(
        (update) => update.sampled && update.events?.[0].logGroup === "group",
      ),
    ).toBe(true);
    expect(updates.at(-1)?.state).toBe("complete");
    expect(updates[0]).toMatchObject({ liveState: "streaming" });
  });

  it("receives new AWS events after empty five-minute history and a quiet healthy Live session", async () => {
    vi.useFakeTimers();
    try {
      const now = Date.now();
      const commands: CloudWatchCommand[] = [];
      async function* stream() {
        yield { sessionStart: { sessionId: "after-empty" } };
        for (let index = 0; index < 4; index++) {
          await new Promise((resolve) => setTimeout(resolve, 10_000));
          yield { sessionUpdate: { sessionResults: [] } };
        }
        yield {
          sessionUpdate: {
            sessionResults: [
              {
                logGroupIdentifier:
                  "arn:aws:logs:eu-west-1:000000000000:log-group:group",
                logStreamName: "new-service-stream",
                timestamp: Date.now(),
                ingestionTime: Date.now(),
                message: "service started",
              },
            ],
          },
        };
      }
      const adapter = createAwsAdapter(aws, {
        allowAws: () => true,
        transportFactory: async () =>
          transport(async (command) => {
            commands.push(command);
            return command.constructor.name === "FilterLogEventsCommand"
              ? { events: [] }
              : { responseStream: stream() };
          }),
      });
      const input = request({
        connection: aws,
        startTime: now - 300_000,
        endTime: now,
        sources: [
          { logGroup: "arn:aws:logs:eu-west-1:000000000000:log-group:group" },
        ],
      });
      expect(
        (await adapter.events(input, new AbortController().signal)).events,
      ).toEqual([]);
      const updates: QueryUpdate[] = [];
      const live = adapter.live(input, new AbortController().signal, (update) =>
        updates.push(update),
      );
      await vi.advanceTimersByTimeAsync(40_001);
      await live;
      expect(commands.map((command) => command.constructor.name)).toEqual([
        "FilterLogEventsCommand",
        "StartLiveTailCommand",
      ]);
      expect(commands[1]!.input).not.toHaveProperty("startTime");
      expect(commands[1]!.input).not.toHaveProperty("endTime");
      const events = updates.flatMap((update) => update.events ?? []);
      expect(events).toHaveLength(1);
      expect(events[0]).toMatchObject({
        message: "service started",
        logStream: "new-service-stream",
      });
      expect(events[0]!.timestamp).toBeGreaterThan(input.endTime);
      expect(updates.some((update) => update.state === "error")).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });

  it("ends a silent Live response with a useful timeout and aborts its transport", async () => {
    vi.useFakeTimers();
    try {
      let ready!: () => void;
      const reading = new Promise<void>((resolve) => {
        ready = resolve;
      });
      let transportSignal: AbortSignal | undefined;
      let closed = false;
      const adapter = createAwsAdapter(aws, {
        allowAws: () => true,
        transportFactory: async () =>
          transport(async (_command, signal) => {
            transportSignal = signal;
            return {
              responseStream: {
                [Symbol.asyncIterator]() {
                  return {
                    next() {
                      ready();
                      return new Promise(() => {});
                    },
                    async return() {
                      closed = true;
                      return { done: true, value: undefined };
                    },
                  };
                },
              },
            };
          }),
      });
      const promise = adapter.live(
        request({
          connection: aws,
          sources: [
            { logGroup: "arn:aws:logs:eu-west-1:000000000000:log-group:group" },
          ],
        }),
        new AbortController().signal,
        () => {},
      );
      const rejected = expect(promise).rejects.toThrow(
        /Live Tail.*(updates|connection)/i,
      );
      await reading;
      await vi.advanceTimersByTimeAsync(30_001);
      await rejected;
      expect(transportSignal?.aborted).toBe(true);
      expect(closed).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  it("delivers the complete Live batch so the view buffer can retain the newest events", async () => {
    async function* stream() {
      yield {
        sessionUpdate: {
          sessionMetadata: { sampled: false },
          sessionResults: [
            { timestamp: 1, message: "first" },
            { timestamp: 2, message: "last" },
          ],
        },
      };
    }
    const adapter = createAwsAdapter(aws, {
      allowAws: () => true,
      transportFactory: async () =>
        transport(async () => ({ responseStream: stream() })),
    });
    const updates: QueryUpdate[] = [];
    await adapter.live(
      request({
        connection: aws,
        limit: 1,
        sources: [
          { logGroup: "arn:aws:logs:eu-west-1:000000000000:log-group:group" },
        ],
      }),
      new AbortController().signal,
      (update) => updates.push(update),
    );
    expect(
      updates
        .flatMap((update) => update.events ?? [])
        .map((event) => event.message),
    ).toEqual(["first", "last"]);
    expect(updates.some((update) => update.truncated)).toBe(false);
  });

  it("cancels Live Tail while waiting for the next streamed event and closes its iterator", async () => {
    let ready!: () => void;
    const reading = new Promise<void>((resolve) => {
      ready = resolve;
    });
    let closed = false;
    const stream = {
      [Symbol.asyncIterator]() {
        return {
          next() {
            ready();
            return new Promise(() => {});
          },
          async return() {
            closed = true;
            return { done: true, value: undefined };
          },
        };
      },
    };
    const controller = new AbortController();
    const adapter = createAwsAdapter(aws, {
      allowAws: () => true,
      transportFactory: async () =>
        transport(async () => ({ responseStream: stream })),
    });
    const completion = adapter.live(
      request({
        connection: aws,
        sources: [
          { logGroup: "arn:aws:logs:eu-west-1:000000000000:log-group:group" },
        ],
      }),
      controller.signal,
      () => {},
    );
    await reading;
    controller.abort();
    const result = await Promise.race([
      completion.then(
        () => "fulfilled",
        () => "cancelled",
      ),
      new Promise<string>((resolve) =>
        setTimeout(() => resolve("still waiting"), 100),
      ),
    ]);
    expect(result).toBe("cancelled");
    expect(closed).toBe(true);
  });
});
