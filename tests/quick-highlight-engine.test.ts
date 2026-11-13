import { describe, expect, it } from "vitest";
import {
  highlightEvent,
  textHighlightKey,
} from "../src/renderer/highlight-engine";
import type { LogEvent } from "../src/shared/contracts";

const event: LogEvent = {
  id: "quick",
  timestamp: 0,
  logGroup: "group",
  logStream: "stream",
  message: "Failed failed fail.ed",
};
const run = (
  needle: string,
  quick: { regex?: boolean; caseSensitive?: boolean } = {},
  message = event.message,
  overview = false,
) =>
  highlightEvent(
    { ...event, message },
    [],
    "light",
    [],
    "utc",
    overview,
    needle,
    undefined,
    true,
    quick,
  );

describe("quick highlight matching", () => {
  it("exposes quick match state for navigation", () => {
    expect(run("WARN", {}, "WARN payment", true).quickMatch).toBe(true);
    expect(run("WARN", {}, "INFO payment", true).quickMatch).toBe(false);
  });
  it("defaults to case-insensitive literal spans and treats regex syntax literally", () => {
    expect(
      run("failed").manual?.[textHighlightKey("@message", event.message)],
    ).toEqual([
      { start: 0, end: 6 },
      { start: 7, end: 13 },
    ]);
    expect(
      run("fail.ed").manual?.[textHighlightKey("@message", event.message)],
    ).toEqual([{ start: 14, end: 21 }]);
    expect(run("fail.ed", {}, "failed").manual).toBeUndefined();
  });

  it("applies case sensitivity independently to literal and regex matching", () => {
    expect(
      run("failed", { caseSensitive: true }).manual?.[
        textHighlightKey("@message", event.message)
      ],
    ).toEqual([{ start: 7, end: 13 }]);
    expect(
      run("fail.*?d", { regex: true }).manual?.[
        textHighlightKey("@message", event.message)
      ],
    ).toEqual([
      { start: 0, end: 6 },
      { start: 7, end: 13 },
      { start: 14, end: 21 },
    ]);
    expect(
      run("fail.*?d", { regex: true, caseSensitive: true }).manual?.[
        textHighlightKey("@message", event.message)
      ],
    ).toEqual([
      { start: 7, end: 13 },
      { start: 14, end: 21 },
    ]);
  });

  it("uses regex and case options for overview marks and structured path evidence", () => {
    const message = '{"status":"FAILED","other":"failed","failedKey":0}';
    const result = run(
      "fail\\w+",
      { regex: true, caseSensitive: true },
      message,
    );
    expect(result.paths).toEqual({
      "/other": ["manual"],
      "/failedKey": ["manual"],
    });
    expect(result.manual?.[textHighlightKey("/other", '"failed"')]).toEqual([
      { start: 1, end: 7 },
    ]);
    expect(
      result.manual?.[textHighlightKey("@key/failedKey", '"failedKey"')],
    ).toEqual([{ start: 1, end: 10 }]);
    expect(
      run("^FAILED$", { regex: true, caseSensitive: true }, "FAILED", true)
        .overview,
    ).toEqual(["var(--mantine-color-yellow-5)"]);
    expect(
      run("^FAILED$", { regex: true, caseSensitive: true }, "failed", true)
        .overview,
    ).toEqual([]);
    expect(run("\\d+", { regex: true }, message, true).overview).toEqual([
      "var(--mantine-color-yellow-5)",
    ]);
  });

  it("matches decoded displayed fields for overview when serialized text does not match", () => {
    const message = '{"value":"\\u0046AILED"}';
    expect(run("FAILED", { regex: true }, message, true).overview).toEqual([
      "var(--mantine-color-yellow-5)",
    ]);
    expect(run("FAILED", { regex: true }, message).paths?.["/value"]).toEqual([
      "manual",
    ]);
  });

  it("ignores invalid and zero-width patterns and advances over Unicode code points", () => {
    for (const pattern of ["[", "^|$", "(?=.)"]) {
      expect(run(pattern, { regex: true }).manual).toBeUndefined();
      expect(
        run(pattern, { regex: true }, event.message, true).overview,
      ).toEqual([]);
    }
    expect(
      run("(?=😀)|b", { regex: true }, "😀b").manual?.[
        textHighlightKey("@message", "😀b")
      ],
    ).toEqual([{ start: 2, end: 3 }]);
    const manyZeroWidthMatches = "😀".repeat(120) + "b";
    expect(
      run("(?=😀)|b", { regex: true }, manyZeroWidthMatches).manual?.[
        textHighlightKey("@message", manyZeroWidthMatches)
      ],
    ).toEqual([{ start: 240, end: 241 }]);
  });

  it("keeps quick spans bounded and changes the match key when options change", () => {
    const message = "a".repeat(1000);
    expect(
      run("a", { regex: true }, message).manual?.[
        textHighlightKey("@message", message)
      ],
    ).toHaveLength(100);
    const structured = '{"value":"failed"}';
    expect(run("failed", {}, structured).matchKey).not.toBe(
      run("failed", { caseSensitive: true }, structured).matchKey,
    );
    expect(run("failed", {}, structured).matchKey).not.toBe(
      run("failed", { regex: true }, structured).matchKey,
    );
    expect(run("x".repeat(201), { regex: true }).manual).toBeUndefined();
  });

  it("retains structured path evidence after reaching the total quick span limit", () => {
    const message = JSON.stringify(
      Object.fromEntries(
        Array.from({ length: 180 }, (_, index) => [
          String(index),
          "failed ".repeat(5),
        ]),
      ),
    );
    const result = run("failed", { regex: true }, message);
    expect(Object.values(result.manual ?? {}).flat()).toHaveLength(512);
    expect(result.paths?.["/179"]).toEqual(["manual"]);
  });
});
