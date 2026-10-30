import { expect, it } from "vitest";
import { createAwsAdapter } from "../src/main/aws-adapter";
import { createLogService } from "../src/main/log-service";
import { createOfflineAdapter } from "../src/main/offline-adapter";
import type { QueryRequest, QueryUpdate } from "../src/shared/contracts";

const request: QueryRequest = {
  requestId: "events-cancellation",
  connection: {
    id: "fixture",
    mode: "offline",
    name: "Fixture",
    profile: "unused",
    region: "eu-west-1",
  },
  sources: [{ logGroup: "/aws/lambda/orders-api" }],
  kind: "events",
  startTime: 0,
  endTime: Date.now(),
  filterPattern: "",
  query: "",
  limit: 100,
};

it("cancels Events promptly when the AWS transport ignores cancellation", async () => {
  const controller = new AbortController();
  let started!: () => void;
  const running = new Promise<void>((resolve) => {
    started = resolve;
  });
  let transportSignal: AbortSignal | undefined;
  const adapter = createAwsAdapter(
    { ...request.connection, mode: "aws" },
    {
      allowAws: () => true,
      transportFactory: async () => ({
        send: async (_command, options) => {
          transportSignal = options?.abortSignal;
          started();
          return new Promise(() => {});
        },
        destroy() {},
      }),
    },
  );
  const result = adapter.events(request, controller.signal);
  const cancelled = expect(result).rejects.toMatchObject({
    name: "AbortError",
  });
  await running;
  controller.abort();
  await cancelled;
  expect(transportSignal?.aborted).toBe(true);
  adapter.destroy();
});

it("suppresses an Events result that arrives after cancellation and finishes shutdown cleanly", async () => {
  let started!: () => void, finish!: (update: QueryUpdate) => void;
  const running = new Promise<void>((resolve) => {
    started = resolve;
  });
  const updates: QueryUpdate[] = [];
  const service = createLogService((update) => updates.push(update), {
    allowAws: () => false,
    offlineAdapterFactory: () => ({
      ...createOfflineAdapter(),
      events: async () => {
        started();
        return new Promise<QueryUpdate>((resolve) => {
          finish = resolve;
        });
      },
    }),
  });
  await service.query(request);
  await running;
  const cancellation = service.cancel(request.requestId);
  finish({
    requestId: request.requestId,
    state: "complete",
    events: [
      {
        id: "retired",
        timestamp: 1,
        message: "Late result",
        logGroup: "/aws/lambda/orders-api",
        logStream: "fixture",
      },
    ],
  });
  await expect(cancellation).resolves.toBeUndefined();
  expect(updates.map((update) => update.state)).toEqual([
    "queued",
    "running",
    "cancelled",
  ]);
  expect(updates.some((update) => update.events?.length || update.error)).toBe(
    false,
  );
  await expect(service.shutdown()).resolves.toBeUndefined();
});
