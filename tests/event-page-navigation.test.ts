import { describe, expect, it } from "vitest";
import { eventPageDestination, filterRestoreTop } from "../src/renderer/event-page-navigation";

const rows = Array.from({ length: 20 }, (_, i) => ({ start: i * 20, end: (i + 1) * 20 }));
it("moves to the visible edge before scrolling a page", () => {
  expect(eventPageDestination(rows, 2, 0, 100, 300, "down")).toEqual({ index: 4, scrollTop: 0 });
  expect(eventPageDestination(rows, 4, 0, 100, 300, "down")).toEqual({ index: 9, scrollTop: 100 });
  expect(eventPageDestination(rows, 7, 100, 100, 300, "up")).toEqual({ index: 5, scrollTop: 100 });
  expect(eventPageDestination(rows, 5, 100, 100, 300, "up")).toEqual({ index: 0, scrollTop: 0 });
});
it("handles partial and oversized rows without getting stuck", () => {
  const variable = [{ start: 0, end: 20 }, { start: 20, end: 180 }, { start: 180, end: 200 }];
  expect(eventPageDestination(variable, 1, 20, 100, 100, "down")).toEqual({ index: 1, scrollTop: 80 });
  expect(eventPageDestination(variable, 1, 80, 100, 100, "down")).toEqual({ index: 2, scrollTop: 100 });
  expect(eventPageDestination([], -1, 0, 100, 0, "down")).toBeNull();
});

it("selects the partially visible edge row and aligns it", () => {
  expect(eventPageDestination(rows, 2, 0, 95, 305, "down")).toEqual({ index: 4, scrollTop: 5 });
  expect(eventPageDestination(rows, 7, 105, 95, 305, "up")).toEqual({ index: 5, scrollTop: 100 });
});

it("moves by whole rows and aligns the selected edge on subsequent pages", () => {
  expect(eventPageDestination(rows, 4, 5, 95, 305, "down")).toEqual({ index: 8, scrollTop: 85 });
  expect(eventPageDestination(rows, 5, 100, 95, 305, "up")).toEqual({ index: 1, scrollTop: 20 });
});

describe("filterRestoreTop", () => {
  const row = (start: number, size = 30) => ({ start, end: start + size });
  it("centers all previously visible rows when they fit", () => {
    expect(filterRestoreTop([row(1000), row(1100)], undefined, 330)).toBe(1000 - (330 - 130) / 2);
  });
  it("includes the anchor in the block that must fit", () => {
    expect(filterRestoreTop([row(1000)], row(1200), 330)).toBe(1000 - (330 - 230) / 2);
  });
  it("keeps the anchor visible and shows as many previous rows as possible", () => {
    const visible = [row(0), row(400), row(900), row(950), row(1000), row(2000)];
    const anchor = row(900);
    const top = filterRestoreTop(visible, anchor, 300)!;
    expect(top).toBeLessThanOrEqual(anchor.start);
    expect(top + 300).toBeGreaterThanOrEqual(anchor.end);
    // 900, 950 and 1000 fit together with the anchor.
    expect(visible.filter((item) => item.start >= top && item.end <= top + 300)).toHaveLength(3);
  });
  it("prefers the centered anchor position among equally good windows", () => {
    const top = filterRestoreTop([row(0), row(5000)], row(2000), 300)!;
    expect(top).toBe(2000 - (300 - 30) / 2);
  });
  it("uses the middle visible row without a selection and returns nothing without rows", () => {
    expect(filterRestoreTop([row(0), row(2000), row(4000)], undefined, 300)).toBe(2000 - 135);
    expect(filterRestoreTop([], undefined, 300)).toBeUndefined();
  });
});
