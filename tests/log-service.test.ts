import { describe, expect, it } from "vitest";
import type {
  Connection,
  QueryRequest,
  QueryUpdate,
} from "../src/shared/contracts";
import { createLogService } from "../src/main/log-service";
import {
  createAwsAdapter,
  type AwsTransport,
  type CloudWatchCommand,
} from "../src/main/aws-adapter";
import { createOfflineAdapter } from "../src/main/offline-adapter";

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
    await expect(
      adapter.insights(
        request({ kind: "insights", query: "parse @message /(?<name>.*)/" }),
        new AbortController().signal,
        () => {},
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

  it("rejects failed server cancellation even when no renderer owns the cancelled update", async () => {
    const updates: QueryUpdate[] = [];
    let polled!: () => void;
    const reading = new Promise<void>((resolve) => {
      polled = resolve;
    });
    const service = createLogService((update) => updates.push(update), {
      allowAws: () => true,
      awsAdapterFactory: (connection) =>
        createAwsAdapter(connection, {
          allowAws: () => true,
          transportFactory: async () =>
            transport(async (command) => {
              if (command.constructor.name === "StartQueryCommand")
                return { queryId: "server-query" };
              if (command.constructor.name === "StopQueryCommand")
                return { success: false };
              polled();
              return { status: "Running", results: [] };
            }),
        }),
    });
    await service.query(request({ connection: aws, kind: "insights" }));
    await reading;
    await expect(service.cancel("query-1")).rejects.toThrow(
      /server query may still be running/i,
    );
    expect(updates.at(-1)?.state).toBe("cancelled");
    expect(updates.at(-1)?.error).toMatch(/server query may still be running/i);
    await expect(service.shutdown()).rejects.toThrow(
      /server query may still be running/i,
    );
  });

  it("finishes shutdown but reports every server query that could not be stopped on later close attempts", async () => {
    let starts = 0;
    let polls = 0;
    let destroyed = 0;
    let reading!: () => void;
    const running = new Promise<void>((resolve) => {
      reading = resolve;
    });
    const service = createLogService(() => {}, {
      allowAws: () => true,
      awsAdapterFactory: (connection) =>
        createAwsAdapter(connection, {
          allowAws: () => true,
          transportFactory: async () => ({
            ...transport(async (command) => {
              if (command.constructor.name === "StartQueryCommand")
                return { queryId: `server-query-${++starts}` };
              if (command.constructor.name === "StopQueryCommand")
                return { success: false };
              if (++polls === 2) reading();
              return { status: "Running", results: [] };
            }),
            destroy: () => {
              destroyed++;
            },
          }),
        }),
    });
    await service.query(
      request({ connection: aws, kind: "insights", requestId: "one" }),
    );
    await service.query(
      request({ connection: aws, kind: "insights", requestId: "two" }),
    );
    await running;
    let failure: unknown;
    try {
      await service.shutdown();
    } catch (error) {
      failure = error;
    }
    expect(failure).toBeInstanceOf(AggregateError);
    expect((failure as AggregateError).errors).toHaveLength(2);
    expect((failure as Error).message).toMatch(/server-query-1/);
    expect((failure as Error).message).toMatch(/server-query-2/);
    expect(destroyed).toBe(1);
    await expect(service.listGroups(offline, "")).resolves.toBeDefined();
    await expect(service.shutdown()).rejects.toThrow(/server-query-1/);
  });

  it("bounds retained cleanup details while warning about all outstanding failures", async () => {
    let ready = () => {};
    const service = createLogService(() => {}, {
      allowAws: () => false,
      offlineAdapterFactory: () => ({
        ...createOfflineAdapter(),
        insights: (input: QueryRequest, signal: AbortSignal) =>
          new Promise<never>((_resolve, reject) => {
            signal.addEventListener(
              "abort",
              () =>
                reject(
                  new Error(
                    `Could not stop Insights query ${input.requestId}. The server query may still be running.`,
                  ),
                ),
              { once: true },
            );
            ready();
          }),
      }),
    });
    for (let index = 0; index < 35; index++) {
      const reading = new Promise<void>((resolve) => {
        ready = resolve;
      });
      const requestId = `server-query-${index}`;
      await service.query(request({ requestId, kind: "insights" }));
      await reading;
      await expect(service.cancel(requestId)).rejects.toThrow(requestId);
    }
    let failure: unknown;
    try {
      await service.shutdown();
    } catch (error) {
      failure = error;
    }
    expect(failure).toBeInstanceOf(AggregateError);
    expect((failure as AggregateError).errors).toHaveLength(33);
    expect((failure as Error).message).toMatch(/3 additional server query/);
    expect((failure as Error).message).toContain("server-query-0");
    expect((failure as Error).message).not.toContain("server-query-34");
  });
});

describe("AWS adapter with isolated command transport", () => {
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

  it("keeps a continuation independently for each group and enforces page bounds", async () => {
    const visited: string[] = [];
    const adapter = createAwsAdapter(aws, {
      allowAws: () => true,
      transportFactory: async () =>
        transport(async (command) => {
          const input = command.input as {
            logGroupName: string;
            nextToken?: string;
            limit: number;
          };
          visited.push(`${input.logGroupName}:${input.nextToken ?? "first"}`);
          return {
            events: [
              {
                eventId: visited.join(","),
                timestamp: 1,
                logStreamName: "stream",
                message: input.logGroupName,
              },
            ],
            nextToken: input.nextToken
              ? undefined
              : `next-${input.logGroupName}`,
          };
        }),
    });
    const input = request({
      connection: aws,
      sources: [{ logGroup: "a" }, { logGroup: "b" }],
      limit: 2,
    });
    const first = await adapter.events(input, new AbortController().signal);
    const second = await adapter.events(
      { ...input, cursor: first.cursor },
      new AbortController().signal,
    );
    expect(first.events).toHaveLength(2);
    expect(second.events).toHaveLength(2);
    expect(visited).toEqual(["a:first", "b:first", "a:next-a", "b:next-b"]);
    expect(second.cursor).toBeUndefined();
  });

  it("stops a cancelled Insights query and suppresses later snapshots", async () => {
    const controller = new AbortController();
    const operations: string[] = [];
    const adapter = createAwsAdapter(aws, {
      allowAws: () => true,
      pollIntervalMs: 1,
      transportFactory: async () =>
        transport(async (command) => {
          operations.push(command.constructor.name);
          if (command.constructor.name === "StartQueryCommand")
            return { queryId: "server-query" };
          if (command.constructor.name === "GetQueryResultsCommand") {
            controller.abort();
            return { status: "Running", results: [] };
          }
          return { success: true };
        }),
    });
    const updates: QueryUpdate[] = [];
    await expect(
      adapter.insights(
        request({ connection: aws, kind: "insights" }),
        controller.signal,
        (update) => updates.push(update),
      ),
    ).rejects.toThrow(/cancel/i);
    expect(operations).toContain("StopQueryCommand");
    expect(updates).toHaveLength(0);
  });

  it("preserves aggregated Insights rows and scan statistics", async () => {
    const adapter = createAwsAdapter(aws, {
      allowAws: () => true,
      pollIntervalMs: 1,
      transportFactory: async () =>
        transport(async (command) =>
          command.constructor.name === "StartQueryCommand"
            ? { queryId: "aggregate" }
            : {
                status: "Complete",
                results: [
                  [
                    { field: "level", value: "ERROR" },
                    { field: "total", value: "12" },
                  ],
                ],
                statistics: { recordsScanned: 70, bytesScanned: 1000 },
              },
        ),
    });
    const updates: QueryUpdate[] = [];
    await adapter.insights(
      request({
        connection: aws,
        kind: "insights",
        query: "stats count(*) as total by level",
      }),
      new AbortController().signal,
      (update) => updates.push(update),
    );
    expect(JSON.parse(updates.at(-1)!.events![0].message)).toEqual({
      level: "ERROR",
      total: "12",
    });
    expect(updates.at(-1)!.stats?.recordsScanned).toBe(70);
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

  it("surfaces a StopQuery cleanup failure when cancellation cannot stop the server job", async () => {
    const controller = new AbortController();
    const adapter = createAwsAdapter(aws, {
      allowAws: () => true,
      transportFactory: async () =>
        transport(async (command) => {
          if (command.constructor.name === "StartQueryCommand")
            return { queryId: "server-query" };
          if (command.constructor.name === "StopQueryCommand")
            throw Object.assign(new Error("Denied"), {
              name: "AccessDeniedException",
            });
          controller.abort();
          return { status: "Running", results: [] };
        }),
    });
    await expect(
      adapter.insights(
        request({ connection: aws, kind: "insights" }),
        controller.signal,
        () => {},
      ),
    ).rejects.toThrow(/could not stop.*server-query/i);
  });
});
