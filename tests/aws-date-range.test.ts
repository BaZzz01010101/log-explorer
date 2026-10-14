import { expect, it } from "vitest";
import {
  createAwsAdapter,
  type CloudWatchCommand,
} from "../src/main/aws-adapter";
import type {
  Connection,
  QueryRequest,
  QueryUpdate,
} from "../src/shared/contracts";

const connection: Connection = {
  id: "injected",
  name: "Injected only",
  mode: "aws",
  profile: "unused",
  region: "eu-west-1",
};
const request: QueryRequest = {
  requestId: "date-range",
  connection,
  sources: [{ logGroup: "/aws/lambda/injected" }],
  startTime: Date.parse("2026-10-14T08:00:00.123Z"),
  endTime: Date.parse("2026-10-14T09:00:00.456Z"),
  kind: "events",
  filterPattern: "",
  query: "fields @timestamp, @message",
  limit: 100,
};
function adapterFor(send: (command: CloudWatchCommand) => Promise<unknown>) {
  return createAwsAdapter(connection, {
    allowAws: () => true,
    transportFactory: async () => ({ send, destroy() {} }),
  });
}
it("searches past nonterminal empty AWS pages before reporting the selected date range empty", async () => {
  const commands: CloudWatchCommand[] = [];
  const adapter = adapterFor(async (command) => {
    commands.push(command);
    const input = command.input as { nextToken?: string };
    if (!input.nextToken) return { events: [], nextToken: "empty-1" };
    if (input.nextToken === "empty-1")
      return { events: [], nextToken: "empty-2" };
    return {
      events: [
        {
          eventId: "found",
          timestamp: request.startTime,
          message: "inside selected date range",
          logStreamName: "stream",
        },
      ],
    };
  });
  const update = await adapter.events(request, new AbortController().signal);
  expect(update.events?.map((event) => event.message)).toEqual([
    "inside selected date range",
  ]);
  expect(update.cursor).toBeUndefined();
  expect(commands).toHaveLength(3);
  for (const command of commands)
    expect(command.input).toMatchObject({
      startTime: request.startTime,
      endTime: request.endTime,
    });
});
it("bounds empty-page scans and preserves a continuation when the scan budget is reached", async () => {
  let count = 0;
  const adapter = adapterFor(async () => ({
    events: [],
    nextToken: `empty-${++count}`,
  }));
  const update = await adapter.events(request, new AbortController().signal);
  expect(count).toBeGreaterThan(1);
  expect(count).toBeLessThanOrEqual(32);
  expect(update.events).toEqual([]);
  expect(update.cursor).toBeTruthy();
  expect(update.truncated).toBe(false);
});
it("stops scanning empty pages promptly when cancelled", async () => {
  const controller = new AbortController();
  let count = 0;
  const adapter = adapterFor(async () => {
    count++;
    if (count === 2) controller.abort();
    return { events: [], nextToken: `empty-${count}` };
  });
  await expect(
    adapter.events(request, controller.signal),
  ).rejects.toMatchObject({ name: "AbortError" });
  expect(count).toBe(2);
});
it("maps a millisecond date range to epoch seconds only at the Insights SDK boundary", async () => {
  const commands: CloudWatchCommand[] = [];
  const updates: QueryUpdate[] = [];
  const adapter = adapterFor(async (command) => {
    commands.push(command);
    return command.constructor.name === "StartQueryCommand"
      ? { queryId: "injected" }
      : { status: "Complete", results: [] };
  });
  await adapter.insights(
    { ...request, kind: "insights" },
    new AbortController().signal,
    (update) => updates.push(update),
  );
  expect(commands[0].input).toMatchObject({
    startTime: Math.floor(request.startTime / 1000),
    endTime: Math.ceil(request.endTime / 1000),
  });
  expect(updates[0].state).toBe("complete");
});
