import { expect, it } from "vitest";
import { sourceColumnConfig } from "../src/renderer/source-column";
import { eventSourceDisplay } from "../src/shared/source-labels";
import { eventColumnValue, parseLogMessage } from "../src/shared/log-data";

it("adds Source before the message for mixed sources without changing existing columns or explicit visibility", () => {
  const columns = [
    { path: "@timestamp", width: 200, pinned: true },
    { path: "@message", width: 500 },
  ];
  expect(sourceColumnConfig(columns, false)).toEqual(columns);
  const mixed = sourceColumnConfig(columns, true);
  expect(mixed.map((column) => column.path)).toEqual([
    "@timestamp",
    "@source",
    "@message",
  ]);
  expect(mixed[0]).toEqual(columns[0]);
  const hidden = [{ path: "@source", width: 310, hidden: true }, ...columns];
  expect(sourceColumnConfig(hidden, true)).toEqual(hidden);
});

it("keeps full stream dates when identifier suffixes are identical", () => {
  const first = "2026/10/18/[$LATEST]same-token";
  const second = "2026/10/19/[$LATEST]same-token";
  const sources = [
    { logGroup: "/aws/lambda/orders", logStreams: [first, second] },
  ];
  const base = {
    id: "one",
    timestamp: 0,
    message: "",
    logGroup: "/aws/lambda/orders",
  };
  const a = eventSourceDisplay({ ...base, logStream: first }, sources, [], "");
  const b = eventSourceDisplay({ ...base, logStream: second }, sources, [], "");
  expect(a.label).not.toBe(b.label);
  expect(a.label).toContain(first);
  expect(b.label).toContain(second);
});

it("distinguishes streams and equal group names across profiles and regions", () => {
  const sources = [
    { connectionId: "west", logGroup: "/aws/lambda/orders" },
    {
      connectionId: "east",
      logGroup: "/aws/lambda/orders",
      logStreams: [
        "2026/10/13/[$LATEST]abcdef123",
        "2026/10/13/[$LATEST]ghijkl456",
      ],
    },
  ];
  const connections = [
    {
      id: "west",
      name: "West",
      profile: "dev",
      region: "eu-west-1",
      mode: "offline" as const,
    },
    {
      id: "east",
      name: "East",
      profile: "prod",
      region: "us-east-1",
      mode: "offline" as const,
    },
  ];
  const event = {
    id: "one",
    timestamp: 0,
    message: "one",
    logGroup: "/aws/lambda/orders",
    logStream: "2026/10/13/[$LATEST]abcdef123",
    connectionId: "east",
  };
  const display = eventSourceDisplay(event, sources, connections, "west");
  expect(display.label).toBe("orders · abcdef · prod / us-east-1");
  expect(display.detail).toContain("/aws/lambda/orders");
  expect(display.detail).toContain("2026/10/13/[$LATEST]abcdef123");
  expect(
    eventColumnValue(event, parseLogMessage(event.message), "@source"),
  ).toContain(event.logGroup);
  expect(
    eventColumnValue(event, parseLogMessage(event.message), "@source"),
  ).toContain(event.logStream);
});
