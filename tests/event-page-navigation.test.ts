import { expect, it } from "vitest";
import { eventPageDestination } from "../src/renderer/event-page-navigation";

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
