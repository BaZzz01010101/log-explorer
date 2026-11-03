import { describe, expect, it } from "vitest";
import type { LogEvent } from "../src/shared/contracts";
import { serializeSelectedEvents } from "../src/shared/event-copy";

const event = (message: string, timestamp = 1000): LogEvent => ({
  id: `event-${timestamp}`,
  timestamp,
  message,
  connectionId: "test/eu-west-1",
  logGroup: "/app/test",
  logStream: "stream-a",
});

describe("selected event copy", () => {
  it("includes visible column names and a separator sized to both headers and values", () => {
    const text = serializeSelectedEvents(
      [event('{"a":7,"b":"x"}')],
      "rows",
      ["/a", "/b"],
      undefined,
      undefined,
      undefined,
      (path) => (path === "/a" ? "Long name" : "B"),
    );
    expect(text).toBe("Long name | B\n----------+--\n7         | x");
  });
  it("keeps a multiline header on one physical line", () => {
    const text = serializeSelectedEvents(
      [event("v")],
      "rows",
      ["@message"],
      undefined,
      undefined,
      undefined,
      () => "Column\nname",
    );
    expect(text).toBe("Column name\n-----------\nv          ");
  });
  it("includes header and separator padding in the clipboard size limit", () => {
    expect(() =>
      serializeSelectedEvents(
        Array<LogEvent>(49).fill(event("x")),
        "rows",
        ["@message"],
        undefined,
        undefined,
        undefined,
        () => "H".repeat(1_000_000),
      ),
    ).toThrow(/clipboard.*limit/i);
  });
  it("preserves the complete structured payload instead of extracting its message cell", () => {
    const payload = {
      level: "INFO",
      msg: "preferred",
      message: "other",
      request: { id: 7 },
      items: [1, null],
    };
    expect(
      JSON.parse(
        serializeSelectedEvents(
          [event(JSON.stringify(payload))],
          "messages",
          [],
        ),
      ),
    ).toEqual({
      timestamp: "1970-01-01T00:00:01.000Z",
      level: "INFO",
      message: payload,
    });
  });
  it("copies plain text, whitespace and line breaks intact inside a JSON record", () => {
    const message = 'WARN first\t"value"\r\nsecond\n';
    const text = serializeSelectedEvents([event(message)], "messages", []);
    expect(text.split("\n")).toHaveLength(1);
    expect(JSON.parse(text)).toEqual({
      timestamp: "1970-01-01T00:00:01.000Z",
      level: "WARN",
      message,
    });
  });
  it.each([
    '{"message":"broken JSON',
    '["one",2]',
    "null",
    "false",
    '"a string"',
  ])("retains all data in JSON and malformed events: %s", (raw) => {
    let message: unknown = raw;
    try {
      message = JSON.parse(raw);
    } catch {}
    expect(
      JSON.parse(serializeSelectedEvents([event(raw)], "messages", [])).message,
    ).toEqual(message);
  });
  it("preserves selection order as one JSON object per event", () => {
    const text = serializeSelectedEvents(
      [event("second", 2000), event("first")],
      "messages",
      [],
    );
    expect(text.split("\n").map((line) => JSON.parse(line).message)).toEqual([
      "second",
      "first",
    ]);
  });
  it("includes only the readable source label for a multisource view", () => {
    const text = serializeSelectedEvents(
      [event("plain")],
      "messages",
      [],
      undefined,
      undefined,
      () => "checkout",
    );
    expect(JSON.parse(text)).toEqual({
      timestamp: "1970-01-01T00:00:01.000Z",
      level: "UNKNOWN",
      source: "checkout",
      message: "plain",
    });
  });
  it("retains the full current structured projection when fields are decoded", () => {
    const text = serializeSelectedEvents(
      [event('{"message":"encoded","extra":7}')],
      "messages",
      [],
      () => ({
        kind: "json",
        value: { message: "decoded\nmessage", extra: 7 },
      }),
    );
    expect(JSON.parse(text).message).toEqual({
      message: "decoded\nmessage",
      extra: 7,
    });
  });
  it("retains raw data beyond the structured inspection limit", () => {
    const message = '{"message":"' + "x".repeat(525000) + '"}';
    expect(
      JSON.parse(serializeSelectedEvents([event(message)], "messages", []))
        .message,
    ).toBe(message);
  });
  it("copies ordered cell values with left aligned fixed width columns", () => {
    const text = serializeSelectedEvents(
      [
        event('{"name":"x","n":100,"ok":false}'),
        event('{"name":"long","n":2,"ok":true}', 2000),
      ],
      "rows",
      ["/name", "/n", "/missing", "/ok"],
    );
    expect(text.split("\n")[0]).toBe("/name | /n  | /missing | /ok  ");
    expect(text.split("\n").slice(2).join("\n")).toBe(
      "x     | 100 |          | false\nlong  | 2   |          | true ",
    );
  });
  it("flattens telemetry whitespace without adding CSV quotes or extra lines", () => {
    const text = serializeSelectedEvents(
      [
        event("TELEMETRY\tName: datadog-agent\tState: Subscribed\n"),
        event("EXTENSION\tState: Ready\r\n"),
      ],
      "rows",
      ["@message"],
    );
    const lines = text.split("\n").slice(2);
    expect(lines).toHaveLength(2);
    expect(lines[0]).toBe("TELEMETRY Name: datadog-agent State: Subscribed");
    expect(lines[1].trimEnd()).toBe("EXTENSION State: Ready");
    expect(lines[1].length).toBe(lines[0].length);
  });
  it("uses displayed cell formatting", () => {
    expect(
      serializeSelectedEvents(
        [event("first"), event("second", 2000)],
        "rows",
        ["@timestamp", "@message"],
        undefined,
        (row, path) =>
          path === "@timestamp"
            ? `time ${row.timestamp}`
            : row.message.toUpperCase(),
      ),
    ).toBe(
      "@timestamp | @message\n-----------+---------\ntime 1000  | FIRST   \ntime 2000  | SECOND  ",
    );
  });
  it("preserves literal quotes, pipe characters and JSON syntax without wrapping or doubling quotes", () => {
    expect(
      serializeSelectedEvents(
        [event(JSON.stringify({ a: 'say "yes" | okay', obj: { v: 1 } }))],
        "rows",
        ["/a", "/obj"],
      )
        .split("\n")
        .slice(2)
        .join("\n")
        .trimEnd(),
    ).toBe('say "yes" | okay | {"v":1}');
  });
  it("copies projected row fields", () => {
    expect(
      serializeSelectedEvents(
        [event('{"payload":"encoded"}')],
        "rows",
        ["/payload/value"],
        () => ({ kind: "json", value: { payload: { value: 7 } } }),
      )
        .split("\n")
        .at(-1)
        ?.trimEnd(),
    ).toBe("7");
  });
  it.each(["messages", "rows"] as const)(
    "returns empty text for an empty %s selection",
    (format) => {
      expect(serializeSelectedEvents([], format, ["@timestamp"])).toBe("");
    },
  );
  it.each(["messages", "rows"] as const)(
    "rejects oversized %s payloads",
    (format) => {
      expect(() =>
        serializeSelectedEvents(
          Array<LogEvent>(51).fill(event("x".repeat(1_000_000))),
          format,
          ["@message"],
        ),
      ).toThrow(/clipboard.*limit/i);
    },
  );
  it("rejects alignment padding that would exceed the clipboard limit", () => {
    expect(() =>
      serializeSelectedEvents(
        [
          event("x".repeat(1_000_000)),
          ...Array<LogEvent>(50).fill(event("short")),
        ],
        "rows",
        ["@message"],
      ),
    ).toThrow(/clipboard.*limit/i);
  });
});
