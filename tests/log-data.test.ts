import { afterEach, describe, expect, it, vi } from "vitest";
import {
  flattenJson,
  getPointer,
  inferLevel,
  parseLogMessage,
  matchesLocalFilter,
  serializeEvents,
  inspectionRows,
  formatColumnValue,
  compareLogValues,
} from "../src/shared/log-data";
import type { LogEvent } from "../src/shared/contracts";

const event = (message: string): LogEvent => ({
  id: "event-1",
  timestamp: 1000,
  message,
  logGroup: "/app/test",
  logStream: "stream-a",
});

afterEach(() => vi.unstubAllEnvs());

describe("column formatting", () => {
  it("formats byte sizes with IEC units and preserves zero", () => {
    expect(formatColumnValue(0, "bytes")).toBe("0 B");
    expect(formatColumnValue(1536, "bytes")).toBe("1.5 KiB");
    expect(formatColumnValue(1099511627776, "bytes")).toBe("1 TiB");
    expect(formatColumnValue("2048", "bytes")).toBe("2 KiB");
  });
  it("formats durations without treating zero or invalid values as missing", () => {
    expect(formatColumnValue(0, "milliseconds")).toBe("0 ms");
    expect(formatColumnValue(750, "milliseconds")).toBe("750 ms");
    expect(formatColumnValue(1250, "milliseconds")).toBe("1.25 s");
    expect(formatColumnValue("not a duration", "milliseconds")).toBe(
      "not a duration",
    );
    expect(formatColumnValue(undefined, "bytes")).toBe("");
  });
  it("formats epoch and ISO dates in UTC and rejects out-of-range or invalid dates", () => {
    expect(formatColumnValue(0, "datetime", "utc")).toBe(
      "1970-01-01 00:00:00.000 UTC",
    );
    expect(formatColumnValue("2026-10-13T12:34:56Z", "datetime", "utc")).toBe(
      "2026-10-13 12:34:56.000 UTC",
    );
    expect(formatColumnValue(1e20, "datetime", "utc")).toBe(
      "100000000000000000000",
    );
    expect(formatColumnValue("bad date", "datetime", "utc")).toBe("bad date");
    expect(formatColumnValue(false, "datetime", "utc")).toBe("false");
  });
  it("honors local timezone including daylight-saving time", () => {
    vi.stubEnv("TZ", "Europe/Madrid");
    expect(formatColumnValue("2026-10-13T12:34:56Z", "datetime", "local")).toBe(
      "2026-10-13 14:34:56.000",
    );
    expect(formatColumnValue("2026-12-13T12:34:56Z", "datetime", "local")).toBe(
      "2026-12-13 13:34:56.000",
    );
  });
  it("retains a bounded compact JSON preview without changing data", () => {
    const value = { label: "x".repeat(5000), count: 0 };
    const preview = formatColumnValue(value, "json");
    expect(preview.startsWith('{"label":"')).toBe(true);
    expect(preview.length).toBeLessThanOrEqual(1501);
    expect(preview.endsWith("…")).toBe(true);
    expect(value.label.length).toBe(5000);
    expect(formatColumnValue("literal", "json")).toBe('"literal"');
  });
});

describe("raw column ordering", () => {
  it("compares complete string values beyond the rendered preview", () => {
    const prefix = "x".repeat(2000);
    expect(compareLogValues(prefix + "z", prefix + "a")).toBeGreaterThan(0);
    expect(compareLogValues(prefix + "a", prefix + "z")).toBeLessThan(0);
    expect(compareLogValues(prefix, prefix)).toBe(0);
  });
  it("uses one transitive type ordering for mixed numbers, strings and booleans", () => {
    expect(compareLogValues(-10, -2)).toBeLessThan(0);
    expect(compareLogValues(-2, "-5")).toBeLessThan(0);
    expect(compareLogValues(-10, "-5")).toBeLessThan(0);
    const values = ["-5", false, -2, undefined, 10, null, -10];
    const sorted = values
      .map((value) => ({ value }))
      .sort((a, b) => compareLogValues(a.value, b.value))
      .map((item) => item.value);
    expect(sorted).toEqual([undefined, null, -10, -2, 10, "-5", false]);
  });
});

describe("bounded structured messages", () => {
  it("accepts structured values and preserves raw invalid/stack trace messages", () => {
    expect(parseLogMessage('{"message":"ok","count":0}').kind).toBe("json");
    expect(parseLogMessage("null").value).toBeNull();
    expect(parseLogMessage("Error: failure\n    at run (app.js:2)").kind).toBe(
      "text",
    );
    expect(parseLogMessage("{broken").kind).toBe("text");
  });
  it("limits huge and deeply nested messages before JSON.parse", () => {
    expect(parseLogMessage('"' + "x".repeat(600_000) + '"').kind).toBe(
      "limited",
    );
    expect(parseLogMessage("[".repeat(40) + "0" + "]".repeat(40)).kind).toBe(
      "limited",
    );
    expect(parseLogMessage('{"message":"[\\\"deep\\\"]"}').kind).toBe("json");
  });
  it("uses reversible pointers for dotted, slash, tilde, empty keys and arrays", () => {
    const value = {
      "user.id": 1,
      user: { id: 2 },
      "a/b~": [0, false, null, { "": "empty" }],
    };
    const flat = flattenJson(value);
    expect(flat.fields["/user.id"]).toBe(1);
    expect(flat.fields["/user/id"]).toBe(2);
    expect(flat.fields["/a~1b~0/1"]).toBe(false);
    expect(flat.fields["/a~1b~0/3/"]).toBe("empty");
    expect(getPointer(value, "/a~1b~0/3/")).toBe("empty");
    expect(getPointer(value, "/user.id")).toBe(1);
    expect(getPointer(value, "/missing")).toBeUndefined();
    expect(getPointer({}, "/__proto__")).toBeUndefined();
  });
  it("bounds wide flattening and inspection without losing empty containers", () => {
    const value = {
      empty: {},
      arr: [],
      values: Array.from({ length: 1000 }, (_, i) => i),
    };
    const result = flattenJson(value, { maxFields: 10 });
    expect(result.truncated).toBe(true);
    expect(result.fields["/empty"]).toEqual({});
    expect(result.fields["/arr"]).toEqual([]);
    expect(Object.keys(result.fields).length).toBe(10);
    const rows = inspectionRows(value, new Set(["", "/values"]), {
      maxNodes: 20,
    });
    expect(rows.rows.length).toBeLessThanOrEqual(20);
    expect(rows.truncated).toBe(true);
  });
  it("normalizes Pino, named and text severity", () => {
    expect(inferLevel(parseLogMessage('{"level":50}'), "")).toBe("error");
    expect(inferLevel(parseLogMessage('{"severity":"WARNING"}'), "")).toBe(
      "warn",
    );
    expect(
      inferLevel(
        parseLogMessage("ERROR request failed"),
        "ERROR request failed",
      ),
    ).toBe("error");
    expect(inferLevel(parseLogMessage('{"message":"fine"}'), "")).toBe(
      "unknown",
    );
  });
  it.each([
    "__proto__",
    "constructor",
    "prototype",
    "toString",
    "valueOf",
    "hasOwnProperty",
  ])("treats hostile severity %s as unknown and safely exports it", (key) => {
    const item = event(JSON.stringify({ level: key, severity: key }));
    expect(inferLevel(parseLogMessage(item.message), item.message)).toBe(
      "unknown",
    );
    expect(serializeEvents([item], "csv", ["@level"])).toBe(
      '"@level"\r\n"unknown"',
    );
  });
  it("combines literal text and exact JSON Pointer properties locally", () => {
    const item = event(
      '{"user.id":7,"user":{"id":9},"message":"Request failed"}',
    );
    expect(
      matchesLocalFilter(
        item,
        parseLogMessage(item.message),
        "failed @/user.id=7",
        "all",
      ),
    ).toBe(true);
    expect(
      matchesLocalFilter(
        item,
        parseLogMessage(item.message),
        "@/user/id=7",
        "all",
      ),
    ).toBe(false);
    expect(
      matchesLocalFilter(
        item,
        parseLogMessage(item.message),
        "@/user/id",
        "all",
      ),
    ).toBe(true);
    expect(
      matchesLocalFilter(item, parseLogMessage(item.message), "missing", "all"),
    ).toBe(false);
  });
});

describe("loaded event export", () => {
  it("escapes CSV commas, quotes and newlines and retains dotted JSON keys", () => {
    const items = [event('{"user.id":"a,b\\\"c\\nd"}')];
    const csv = serializeEvents(items, "csv", ["@timestamp", "/user.id"]);
    expect(csv).toBe(
      '"@timestamp","/user.id"\r\n"1970-01-01T00:00:01.000Z","a,b""c\nd"',
    );
  });
  it("retains full raw messages in JSON and JSONL with event metadata", () => {
    const item = event("first\nsecond");
    expect(JSON.parse(serializeEvents([item], "json"))[0]).toEqual(item);
    expect(JSON.parse(serializeEvents([item], "jsonl"))).toEqual(item);
    expect(serializeEvents([], "jsonl")).toBe("");
  });
  it("handles timestamps outside the Date range without crashing CSV export", () => {
    expect(() =>
      serializeEvents([{ ...event("value"), timestamp: 1e20 }], "csv"),
    ).not.toThrow();
  });
  it("neutralizes formula-looking CSV values while JSON retains the exact text", () => {
    const item = event('=HYPERLINK("https://example.invalid","open")');
    expect(serializeEvents([item], "csv", ["@message"])).toContain(
      "\"'=HYPERLINK",
    );
    expect(JSON.parse(serializeEvents([item], "json"))[0].message).toBe(
      item.message,
    );
  });
  it("rejects oversized exports instead of silently truncating loaded events", () => {
    expect(() =>
      serializeEvents([event("x".repeat(20_000_001))], "json"),
    ).toThrow("Export exceeds");
  });
});
