import { expect, it } from "vitest";
import {
  changeExplorerSelection,
  selectionPayload,
  type SelectedResource,
} from "../src/renderer/explorer-selection";

const group: SelectedResource = { key: "g", connectionId: "c", logGroup: "/g" };
const one: SelectedResource = {
  key: "s1",
  connectionId: "c",
  logGroup: "/g",
  logStream: "one",
};
const two: SelectedResource = {
  key: "s2",
  connectionId: "c",
  logGroup: "/g",
  logStream: "two",
};
const other: SelectedResource = { key: "h", connectionId: "c", logGroup: "/h" };
const rows = [group, one, two, other];

it("toggles mixed rows, selects a visible range and preserves an existing context selection", () => {
  const initial = changeExplorerSelection(new Map(), rows, one, null, "toggle");
  const range = changeExplorerSelection(initial, rows, other, one.key, "range");
  expect([...range.keys()]).toEqual(["s1", "s2", "h"]);
  expect(changeExplorerSelection(range, rows, two, null, "context")).toBe(
    range,
  );
  expect([
    ...changeExplorerSelection(range, rows, group, null, "context").keys(),
  ]).toEqual(["g"]);
  expect([
    ...changeExplorerSelection(range, rows, two, null, "toggle").keys(),
  ]).toEqual(["s1", "h"]);
});

it("merges streams and lets a selected whole group subsume its streams", () => {
  expect(selectionPayload([one, two, other], "c")).toEqual({
    connectionId: "c",
    sources: [
      { logGroup: "/g", logStreams: ["one", "two"] },
      { logGroup: "/h" },
    ],
  });
  expect(
    selectionPayload(
      [one, group, two, other, { ...other, connectionId: "elsewhere" }],
      "c",
    ),
  ).toEqual({
    connectionId: "c",
    sources: [{ logGroup: "/g" }, { logGroup: "/h" }],
  });
});

it("bounds selections by unique groups while allowing streams from selected groups", () => {
  const many = Array.from({ length: 50 }, (_, i) => ({
    ...group,
    key: String(i),
    logGroup: String(i),
  }));
  const selected = new Map(many.map((item) => [item.key, item]));
  expect(
    changeExplorerSelection(selected, [...many, other], other, null, "toggle")
      .size,
  ).toBe(50);
  const stream = { ...one, logGroup: "0" };
  expect(
    changeExplorerSelection(
      selected,
      [...many, stream],
      stream,
      null,
      "toggle",
    ).has(stream.key),
  ).toBe(true);
});
