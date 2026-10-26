import { expect, it } from "vitest";
import type { ColumnConfig } from "../src/shared/contracts";
import { applyColumnAction } from "../src/renderer/column-actions";

const columns: ColumnConfig[] = [
  { path: "a", width: 210, pinned: true },
  { path: "hidden", width: 115, hidden: true, format: "json" },
  { path: "b", width: 80 },
  { path: "c", width: 330, pinned: true, format: "bytes" },
  { path: "d", width: 420 },
];
const display = (config: ColumnConfig[]) =>
  [
    ...config.filter((column) => !column.hidden && column.pinned),
    ...config.filter((column) => !column.hidden && !column.pinned),
  ].map((column) => [column.path, !!column.pinned]);

it("pins one column next to the last pinned column without losing hidden slots or formats", () => {
  const result = applyColumnAction(columns, "d", "pin");
  expect(display(result)).toEqual([
    ["a", true],
    ["c", true],
    ["d", true],
    ["b", false],
  ]);
  expect(result[1]).toBe(columns[1]);
  expect(result.find((column) => column.path === "c")).toEqual({
    path: "c",
    width: 330,
    pinned: true,
    format: "bytes",
  });
  expect(columns[4].pinned).toBeUndefined();
});

it("pins the displayed prefix including the clicked column while keeping its order", () => {
  const result = applyColumnAction(columns, "b", "pin-left");
  expect(display(result)).toEqual([
    ["a", true],
    ["c", true],
    ["b", true],
    ["d", false],
  ]);
  expect(result[1]).toBe(columns[1]);
});

it("unpins one column into the front of the unpinned pool", () => {
  expect(display(applyColumnAction(columns, "a", "unpin"))).toEqual([
    ["c", true],
    ["a", false],
    ["b", false],
    ["d", false],
  ]);
});

it("unpins the displayed suffix including the clicked column without changing its order", () => {
  expect(display(applyColumnAction(columns, "c", "unpin-right"))).toEqual([
    ["a", true],
    ["c", false],
    ["b", false],
    ["d", false],
  ]);
});

it("moves a column one place within its pinning pool in displayed order", () => {
  expect(display(applyColumnAction(columns, "c", "move-left"))).toEqual([
    ["c", true],
    ["a", true],
    ["b", false],
    ["d", false],
  ]);
  expect(display(applyColumnAction(columns, "b", "move-right"))).toEqual([
    ["a", true],
    ["c", true],
    ["d", false],
    ["b", false],
  ]);
});

it("keeps unavailable, hidden, idempotent and pool-boundary actions stable", () => {
  expect(applyColumnAction(columns, "a", "move-left")).toBe(columns);
  expect(applyColumnAction(columns, "c", "move-right")).toBe(columns);
  expect(applyColumnAction(columns, "b", "move-left")).toBe(columns);
  expect(applyColumnAction(columns, "d", "move-right")).toBe(columns);
  expect(applyColumnAction(columns, "a", "pin")).toBe(columns);
  expect(applyColumnAction(columns, "d", "unpin")).toBe(columns);
  expect(applyColumnAction(columns, "c", "pin-left")).toBe(columns);
  expect(applyColumnAction(columns, "b", "unpin-right")).toBe(columns);
  expect(applyColumnAction(columns, "hidden", "move-left")).toBe(columns);
  expect(applyColumnAction(columns, "missing", "unpin")).toBe(columns);
});

it("allows the column editor to pin and unpin hidden columns without moving their slots", () => {
  const pinned = applyColumnAction(columns, "hidden", "pin");
  expect(pinned[1]).toEqual({
    path: "hidden",
    width: 115,
    hidden: true,
    format: "json",
    pinned: true,
  });
  expect(pinned.map((column) => column.path)).toEqual([
    "a",
    "hidden",
    "b",
    "c",
    "d",
  ]);
  const unpinned = applyColumnAction(pinned, "hidden", "unpin");
  expect(unpinned[1].pinned).toBe(false);
  expect(unpinned[1].hidden).toBe(true);
});

it("removes a custom column without changing the remaining configuration", () => {
  const result = applyColumnAction(columns, "c", "remove");
  expect(result).toEqual(columns.filter((column) => column.path !== "c"));
  expect(result[1]).toBe(columns[1]);
});

it.each(["@timestamp", "@level", "@message", "@source"])(
  "hides protected %s instead of removing it",
  (path) => {
    const config = [{ path, width: 240, pinned: true }, ...columns];
    const result = applyColumnAction(config, path, "remove");
    expect(result[0]).toEqual({ ...config[0], hidden: true });
    expect(result.slice(1)).toEqual(columns);
    expect(applyColumnAction(result, path, "remove")).toBe(result);
  },
);

it("keeps at least one visible column and ignores a stale menu target", () => {
  const config = [{ path: "/last", width: 180 }];
  expect(applyColumnAction(config, "/last", "remove")).toBe(config);
  expect(applyColumnAction(config, "/missing", "remove")).toBe(config);
});
