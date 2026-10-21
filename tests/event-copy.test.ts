import { describe, expect, it } from "vitest";
import type { LogEvent } from "../src/shared/contracts";
import { serializeSelectedEvents } from "../src/shared/event-copy";
import { serializeEvents } from "../src/shared/log-data";

const event = (message: string, timestamp = 1000): LogEvent => ({
  id: `event-${timestamp}`,
  timestamp,
  message,
  connectionId: "test/eu-west-1",
  logGroup: "/app/test",
  logStream: "stream-a",
});

describe("selected event copy", () => {
  it("uses temporary view values for records and CSV while preserving raw message and JSON exports", () => {
    const original = event('{"payload":"{\\"value\\":7}"}');
    const parsedFor = () => ({
      kind: "json" as const,
      value: { payload: { value: 7 } },
    });
    expect(
      JSON.parse(
        serializeSelectedEvents(
          [original],
          "records",
          ["/payload/value", "@message"],
          parsedFor,
        ),
      ),
    ).toEqual({ "/payload/value": 7, "@message": original.message });
    expect(serializeSelectedEvents([original], "messages", [], parsedFor)).toBe(
      original.message,
    );
    expect(
      serializeEvents([original], "csv", ["/payload/value"], parsedFor),
    ).toBe('"/payload/value"\r\n"7"');
    expect(
      JSON.parse(serializeEvents([original], "json", [], parsedFor))[0].message,
    ).toBe(original.message);
  });
  it("copies messages verbatim in supplied order, retaining newlines", () => {
    expect(
      serializeSelectedEvents(
        [event("last\nline", 2000), event("first\r\nline")],
        "messages",
        [],
      ),
    ).toBe("last\nline\nfirst\r\nline");
  });
  it.each(["messages", "records"] as const)(
    "copies an empty %s selection as empty text",
    (format) => {
      expect(serializeSelectedEvents([], format, ["@timestamp"])).toBe("");
    },
  );
  it("writes one typed JSON object per row with exactly the requested columns", () => {
    const message =
      '{"level":"WARN","amount":12.5,"ok":false,"nested":{"code":0},"items":[1,null,"x"],"empty":""}';
    const text = serializeSelectedEvents(
      [event(message), event(message, 2000)],
      "records",
      [
        "@timestamp",
        "/amount",
        "/ok",
        "/nested",
        "/items",
        "/empty",
        "/missing",
        "@level",
      ],
    );
    expect(text.split("\n").map((line) => JSON.parse(line))).toEqual([
      {
        "@timestamp": 1000,
        "/amount": 12.5,
        "/ok": false,
        "/nested": { code: 0 },
        "/items": [1, null, "x"],
        "/empty": "",
        "/missing": null,
        "@level": "warn",
      },
      {
        "@timestamp": 2000,
        "/amount": 12.5,
        "/ok": false,
        "/nested": { code: 0 },
        "/items": [1, null, "x"],
        "/empty": "",
        "/missing": null,
        "@level": "warn",
      },
    ]);
    expect(Object.keys(JSON.parse(text.split("\n")[0]))).toEqual([
      "@timestamp",
      "/amount",
      "/ok",
      "/nested",
      "/items",
      "/empty",
      "/missing",
      "@level",
    ]);
  });
  it("escapes multiline and malformed messages into a single physical record line", () => {
    const message = 'ERROR failed\n    at handler "quoted"\r\n{ invalid JSON';
    const text = serializeSelectedEvents([event(message)], "records", [
      "@message",
      "/missing",
      "@logGroup",
      "@logStream",
      "@source",
    ]);
    expect(text.split("\n")).toHaveLength(1);
    expect(JSON.parse(text)).toEqual({
      "@message": message,
      "/missing": null,
      "@logGroup": "/app/test",
      "@logStream": "stream-a",
      "@source": "test/eu-west-1 · /app/test · stream-a",
    });
  });
  it("keeps literal and nested JSON Pointer fields distinct, including prototype-like keys", () => {
    const text = serializeSelectedEvents(
      [
        event(
          '{"http.status":200,"http":{"status":500},"a/b":true,"__proto__":{"safe":1}}',
        ),
      ],
      "records",
      ["/http.status", "/http/status", "/a~1b", "/__proto__"],
    );
    expect(JSON.parse(text)).toEqual({
      "/http.status": 200,
      "/http/status": 500,
      "/a~1b": true,
      "/__proto__": { safe: 1 },
    });
    expect(({} as { safe?: number }).safe).toBeUndefined();
  });
  it.each(["messages", "records"] as const)(
    "rejects oversized %s selections before constructing a clipboard payload",
    (format) => {
      const entries = Array<LogEvent>(51).fill(event("x".repeat(1_000_000)));
      expect(() =>
        serializeSelectedEvents(entries, format, ["@message"]),
      ).toThrow(/clipboard.*limit/i);
    },
  );
});
