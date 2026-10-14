import { afterEach, expect, it, vi } from "vitest";
import {
  GetQueryResultsCommand,
  StartQueryCommand,
} from "@aws-sdk/client-cloudwatch-logs";
import { createAwsAdapter, type AwsTransport } from "../src/main/aws-adapter";
import type { QueryRequest, QueryUpdate } from "../src/shared/contracts";
import { mergeEvents } from "../src/renderer/query-state";

afterEach(() => vi.unstubAllEnvs());
const request: QueryRequest = {
  requestId: "insights",
  connection: {
    id: "fixture",
    name: "Injected transport",
    profile: "never-read",
    region: "eu-west-1",
    mode: "aws",
  },
  sources: [{ logGroup: "/fixture" }],
  startTime: 0,
  endTime: 1800000000000,
  kind: "insights",
  query: "fields @timestamp, @ptr, item | sort @timestamp desc",
  filterPattern: "",
  limit: 100,
};

async function runRows(results: { field: string; value: string }[][]) {
  const updates: QueryUpdate[] = [];
  const transport: AwsTransport = {
    destroy() {},
    async send(command) {
      if (command instanceof StartQueryCommand) return { queryId: "query" };
      if (command instanceof GetQueryResultsCommand)
        return { status: "Complete", results };
      throw new Error(
        `Unexpected injected command ${command.constructor.name}`,
      );
    },
  };
  const adapter = createAwsAdapter(request.connection, {
    allowAws: () => true,
    transportFactory: async () => transport,
  });
  try {
    await adapter.insights(request, new AbortController().signal, (update) =>
      updates.push(update),
    );
    return updates.at(-1)!.events!;
  } finally {
    adapter.destroy();
  }
}

it("retains each expanded result row when multiple rows share the same log-record pointer", async () => {
  const events = await runRows([
    [
      { field: "@ptr", value: "same-record" },
      { field: "item", value: "first" },
    ],
    [
      { field: "@ptr", value: "same-record" },
      { field: "item", value: "second" },
    ],
  ]);
  expect(new Set(events.map((event) => event.id)).size).toBe(2);
  expect(
    mergeEvents([], events, 100, undefined, true).events.map(
      (event) => JSON.parse(event.message).item,
    ),
  ).toEqual(["first", "second"]);
});

it("interprets unzoned service timestamps as UTC and preserves explicit offsets", async () => {
  vi.stubEnv("TZ", "Europe/Madrid");
  const events = await runRows([
    [{ field: "@timestamp", value: "2026-10-13 10:15:12.123" }],
    [{ field: "@timestamp", value: "2026-10-13T12:15:12.123+02:00" }],
  ]);
  expect(events.map((event) => event.timestamp)).toEqual([
    Date.parse("2026-10-13T10:15:12.123Z"),
    Date.parse("2026-10-13T10:15:12.123Z"),
  ]);
});
