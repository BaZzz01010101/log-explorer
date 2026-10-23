import { expect, it } from "vitest";
import {
  contextRangeLabel,
  contextTimeRange,
  type ContextDirection,
} from "../src/shared/context-range";
import { resolveTimeRange } from "../src/renderer/query-state";

const timestamp = Date.parse("2026-10-22T12:34:56.789Z");

it.each([
  ["past", timestamp - 5000, timestamp + 1],
  ["future", timestamp, timestamp + 5000],
  ["both", timestamp - 5000, timestamp + 5000],
] as const)(
  "builds an exact %s range including the selected event",
  (direction, startTime, endTime) => {
    const range = contextTimeRange(timestamp, { direction, durationMs: 5000 });
    expect(range).toEqual({ startTime, endTime });
    expect(range.startTime).toBeLessThanOrEqual(timestamp);
    expect(range.endTime).toBeGreaterThan(timestamp);
    expect(
      resolveTimeRange(
        "custom",
        new Date(startTime).toISOString(),
        new Date(endTime).toISOString(),
      ),
    ).toEqual(range);
  },
);

it.each(["past", "future", "both"] as const)(
  "keeps %s ranges valid at the Unix epoch",
  (direction) => {
    expect(contextTimeRange(0, { direction, durationMs: 1000 })).toEqual({
      startTime: 0,
      endTime: direction === "past" ? 1 : 1000,
    });
  },
);

it("clamps past and bidirectional ranges at zero", () => {
  expect(
    contextTimeRange(123, { direction: "past", durationMs: 1000 }),
  ).toEqual({ startTime: 0, endTime: 124 });
  expect(
    contextTimeRange(123, { direction: "both", durationMs: 1000 }),
  ).toEqual({ startTime: 0, endTime: 1123 });
});

it("clamps future bounds to dates supported by custom-range parsing", () => {
  const maximumEnd = Date.parse("9999-12-31T23:59:59.999Z");
  for (const direction of ["future", "both"] as const) {
    const range = contextTimeRange(maximumEnd - 1, {
      direction,
      durationMs: 300000,
    });
    expect(range.endTime).toBe(maximumEnd);
    expect(
      resolveTimeRange(
        "custom",
        new Date(range.startTime).toISOString(),
        new Date(range.endTime).toISOString(),
      ),
    ).toEqual(range);
  }
});

it.each([
  -1,
  NaN,
  Infinity,
  0.5,
  Number.MAX_SAFE_INTEGER,
  Date.parse("9999-12-31T23:59:59.999Z"),
])("rejects invalid or unrepresentable anchor %s", (anchor) => {
  expect(() =>
    contextTimeRange(anchor, { direction: "past", durationMs: 1000 }),
  ).toThrow();
});

it.each([0, -1, NaN, Infinity, 0.5, Number.MAX_SAFE_INTEGER + 1])(
  "rejects invalid duration %s",
  (durationMs) => {
    expect(() =>
      contextTimeRange(timestamp, { direction: "both", durationMs }),
    ).toThrow();
  },
);

it("rejects an unknown direction without producing a request", () => {
  expect(() =>
    contextTimeRange(timestamp, {
      direction: "sideways" as ContextDirection,
      durationMs: 1000,
    }),
  ).toThrow();
});

it("describes the requested direction and duration in a context title", () => {
  expect(contextRangeLabel({ direction: "past", durationMs: 1000 })).toBe(
    "Previous 1 second",
  );
  expect(contextRangeLabel({ direction: "future", durationMs: 300000 })).toBe(
    "Next 5 minutes",
  );
  expect(contextRangeLabel({ direction: "both", durationMs: 30000 })).toBe(
    "30 seconds before and after",
  );
});
