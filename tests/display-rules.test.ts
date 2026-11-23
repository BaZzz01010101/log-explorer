import { describe, expect, it } from "vitest";
import type { Connection, LogEvent, LogSource } from "../src/shared/contracts";
import {
  eventSourceName,
  formatSourceName,
  messagePathPointer,
  messageRuleSourceError,
  pointerMessagePath,
  type MessageRule,
} from "../src/shared/display-rules";
import { messagePreview, parseLogMessage } from "../src/shared/log-data";
import {
  eventSourceDisplay,
  sourceBadges,
  sourceDetails,
} from "../src/shared/source-labels";
import { parsePreferences } from "../src/shared/workspace-parse";

const event = (message: unknown, patch: Partial<LogEvent> = {}): LogEvent => ({
  id: "e1",
  timestamp: 1,
  message: JSON.stringify(message),
  logGroup: "/aws/lambda/orders-api",
  logStream: "2026/11/19/[$LATEST]8f2c1a9b",
  ...patch,
});

describe("formatSourceName", () => {
  const values = {
    NAME: "checkout",
    CLUSTER: "dev",
    NAMESPACE: "payments",
    REGION: "europe-west1",
  };
  it("fills placeholders", () => {
    expect(
      formatSourceName("{NAME} · {CLUSTER} · {NAMESPACE} / {REGION}", values),
    ).toBe("checkout · dev · payments / europe-west1");
  });
  it("drops an empty value with the separator before it", () => {
    expect(
      formatSourceName("{NAME} · {CLUSTER} · {NAMESPACE} / {REGION}", {
        ...values,
        NAMESPACE: undefined,
      }),
    ).toBe("checkout · dev / europe-west1");
  });
  it("drops a leading empty value with the separator after it", () => {
    expect(
      formatSourceName("{NAMESPACE} / {NAME}", { ...values, NAMESPACE: "" }),
    ).toBe("checkout");
  });
  it("keeps unknown placeholders literally", () => {
    expect(formatSourceName("{NAME} {OTHER}", values)).toBe("checkout {OTHER}");
  });
});

describe("message paths", () => {
  it("converts JSONPath-like paths to pointers", () => {
    expect(messagePathPointer("$.message.summary")).toBe("/message/summary");
    expect(messagePathPointer("message.summary")).toBe("/message/summary");
    expect(messagePathPointer("$.events[0].text")).toBe("/events/0/text");
    expect(messagePathPointer("$['a.b']['c/d']")).toBe("/a.b/c~1d");
    expect(messagePathPointer("/already/pointer")).toBe("/already/pointer");
    expect(messagePathPointer("$")).toBeUndefined();
    expect(messagePathPointer("$.a[")).toBeUndefined();
  });
  it("shows pointers as paths that convert back", () => {
    for (const pointer of ["/message/summary", "/events/0/text", "/a.b/c~1d"])
      expect(messagePathPointer(pointerMessagePath(pointer))).toBe(pointer);
    expect(pointerMessagePath("/message/summary")).toBe("$.message.summary");
  });
});

describe("message rules", () => {
  const value = { msg: "default", message: { summary: "custom" } };
  it("prefers a matching rule over msg and message", () => {
    const item = event(value);
    expect(
      messagePreview(parseLogMessage(item.message), item, [
        { id: "r", source: "/aws/lambda/*", path: "$.message.summary" },
      ]),
    ).toEqual({ path: "/message/summary", value: "custom" });
  });
  it("ignores rules for other sources and empty values", () => {
    const item = event({ ...value, empty: " " });
    expect(
      messagePreview(parseLogMessage(item.message), item, [
        { id: "a", source: "other", path: "$.message.summary" },
        { id: "b", source: "", path: "$.empty" },
        { id: "c", source: "", path: "$.missing" },
      ]),
    ).toEqual({ path: "/msg", value: "default" });
  });
  it("matches Google Cloud containers by name", () => {
    const item = event(value, {
      logGroup: "europe-west1/dev/payments/checkout",
      gcpSource: {
        kind: "kubernetes",
        project: "acme",
        region: "europe-west1",
        container: "checkout",
      },
    });
    expect(eventSourceName(item)).toBe("checkout");
    expect(
      messagePreview(parseLogMessage(item.message), item, [
        { id: "r", source: "CHECKOUT", path: "message.summary" },
      ])?.value,
    ).toBe("custom");
  });
  it("filters sources like the local filter", () => {
    const item = event(value);
    const preview = (rule: Partial<MessageRule>) =>
      messagePreview(parseLogMessage(item.message), item, [
        { id: "r", source: "", path: "$.message.summary", ...rule },
      ])?.value;
    expect(preview({ source: "ORDERS" })).toBe("custom");
    expect(preview({ source: "lambda/*-api" })).toBe("custom");
    expect(preview({ source: "ORDERS", caseSensitive: true })).toBe("default");
    expect(preview({ source: "orders-(api|web)$", regex: true })).toBe(
      "custom",
    );
    expect(preview({ source: "^orders", regex: true })).toBe("default");
    expect(preview({ source: "orders(", regex: true })).toBe("default");
    expect(
      messageRuleSourceError({
        id: "r",
        source: "orders(",
        path: "$.a",
        regex: true,
      }),
    ).toBeTruthy();
    expect(
      messageRuleSourceError({ id: "r", source: "orders(", path: "$.a" }),
    ).toBeUndefined();
  });
  it("persists only valid rules and formats", () => {
    const preferences = parsePreferences({
      sourceNameFormats: { aws: "{NAME}", gcp: 3 },
      messageRules: [
        { id: "r", source: "x", path: "$.a", regex: true, caseSensitive: 1 },
        { id: "r", source: "y", path: "$.b" },
        { source: "no id", path: "$.c" },
      ],
    });
    expect(preferences.sourceNameFormats).toEqual({ aws: "{NAME}", gcp: "" });
    expect(preferences.messageRules).toEqual([
      { id: "r", source: "x", path: "$.a", regex: true },
    ]);
  });
});

describe("formatted source labels", () => {
  const connections: Connection[] = [
    { id: "c1", name: "c1", profile: "prod", region: "eu-west-1", mode: "aws" },
    { id: "c2", name: "c2", profile: "prod", region: "us-east-1", mode: "aws" },
  ];
  const sources: LogSource[] = [
    { connectionId: "c1", logGroup: "/aws/lambda/orders-api" },
    { connectionId: "c2", logGroup: "/aws/lambda/payments" },
  ];
  it("formats badges without the automatic region suffix", () => {
    const badges = sourceBadges(sources, {
      formats: { aws: "{NAME} @ {REGION}" },
      connections,
      connectionId: "c1",
    });
    expect(badges.map((badge) => [badge.label, badge.formatted])).toEqual([
      ["orders-api @ eu-west-1", true],
      ["payments @ us-east-1", true],
    ]);
  });
  it("formats the Source column with the event's stream", () => {
    const display = eventSourceDisplay(
      event({}, { connectionId: "c1" }),
      sources,
      connections,
      "c1",
      { aws: "{FULL_NAME} · {STREAM}" },
    );
    expect(display.label).toBe("/aws/lambda/orders-api · 8f2c1a");
  });
  it("keeps automatic labels when the format is empty", () => {
    expect(
      eventSourceDisplay(
        event({}, { connectionId: "c1" }),
        sources,
        connections,
        "c1",
        {
          aws: "  ",
        },
      ).label,
    ).toBe("orders-api · prod / eu-west-1");
  });
  it("describes sources in full", () => {
    expect(sourceDetails(sources[0], "s-1", connections[0])).toBe(
      "Log group: /aws/lambda/orders-api\nLog stream: s-1\nProfile: prod\nRegion: eu-west-1",
    );
  });
});
