import { expect, it } from "vitest";
import type { LogEvent } from "../src/shared/contracts";
import { contextEventIndex } from "../src/renderer/context-event";

const origin: LogEvent = {
  id: "origin",
  timestamp: 42,
  logGroup: "/group",
  logStream: "stream",
  connectionId: "account",
  message: "same message",
};
it("matches stable event IDs or the same event returned with a new service ID", () => {
  expect(contextEventIndex([{ ...origin, id: "new-query-id" }], origin)).toBe(
    0,
  );
  expect(
    contextEventIndex(
      [{ ...origin, message: "service normalized message" }],
      origin,
    ),
  ).toBe(0);
});
it("prefers the exact event ID over an identical neighboring message at the same timestamp", () => {
  expect(
    contextEventIndex([{ ...origin, id: "duplicate" }, origin], origin),
  ).toBe(1);
});
it("does not select an identically named event in another source or a neighboring event at the same timestamp", () => {
  expect(
    contextEventIndex(
      [
        { ...origin, connectionId: "other" },
        { ...origin, logGroup: "/other" },
        { ...origin, logStream: "other" },
        { ...origin, id: "neighbor", message: "other" },
        origin,
      ],
      origin,
    ),
  ).toBe(4);
  expect(contextEventIndex([], origin)).toBe(-1);
});
