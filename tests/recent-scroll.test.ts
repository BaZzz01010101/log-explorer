import { expect, it } from "vitest";
import { lockCorrection, newestIndex, releasedByInput, type RecentScrollLock } from "../src/renderer/recent-scroll";

const row = (phase: "tracking" | "holding"): RecentScrollLock => ({ kind: "row", id: "a", offset: 40, phase, awaitingIndicator: false, expires: 0 });

it("releases the bottom and holding locks on input but keeps a loading page anchored", () => {
  expect(releasedByInput({ kind: "bottom" })).toBeNull();
  expect(releasedByInput(row("holding"))).toBeNull();
  const tracking = row("tracking");
  expect(releasedByInput(tracking)).toBe(tracking);
  expect(releasedByInput(null)).toBeNull();
});

it("corrects only meaningful row drift", () => {
  expect(lockCorrection(48, 40)).toBe(8);
  expect(lockCorrection(40.3, 40)).toBe(0);
  expect(lockCorrection(-16, 40)).toBe(-56);
});

it("finds the newest row, preferring the later row for equal timestamps", () => {
  expect(newestIndex([])).toBe(-1);
  expect(newestIndex([1, 3, 2])).toBe(1);
  expect(newestIndex([1, 3, 3])).toBe(2);
});
