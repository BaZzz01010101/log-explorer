import { expect, it } from "vitest";
import type { ColumnConfig } from "../src/shared/contracts";
import { reorderVisibleColumns } from "../src/renderer/column-order";

const column = (
  path: string,
  options: Partial<ColumnConfig> = {},
): ColumnConfig => ({ path, width: 180, ...options });
const config = [
  column("@timestamp", { pinned: true, width: 194 }),
  column("@level", { width: 84 }),
  column("@logGroup", { hidden: true }),
  column("/service/name", { format: "json" }),
  column("@message", { width: 420 }),
];
it("moves displayed headers without losing hidden columns or changing their slots", () => {
  const moved = reorderVisibleColumns(
    config,
    "@level",
    "/service/name",
    "after",
  );
  expect(moved.map((item) => item.path)).toEqual([
    "@timestamp",
    "/service/name",
    "@logGroup",
    "@level",
    "@message",
  ]);
  expect(moved[2]).toBe(config[2]);
  expect(moved[1]).toBe(config[3]);
  expect(config[1].path).toBe("@level");
  expect(
    reorderVisibleColumns(moved, "@level", "/service/name", "before"),
  ).toEqual(config);
});
it("reorders only within the same pinning section and retains pinning flags", () => {
  const columns = [
    column("a", { pinned: true }),
    column("h", { hidden: true, pinned: true }),
    column("b", { pinned: true }),
    column("c"),
    column("d"),
  ];
  expect(
    reorderVisibleColumns(columns, "a", "b", "after").map((item) => item.path),
  ).toEqual(["b", "h", "a", "c", "d"]);
  expect(reorderVisibleColumns(columns, "a", "c", "after")).toBe(columns);
  expect(reorderVisibleColumns(columns, "d", "a", "before")).toBe(columns);
});
it("keeps no-op, unavailable, and hidden source or destination orders stable", () => {
  expect(
    reorderVisibleColumns(config, "@level", "/service/name", "before"),
  ).toBe(config);
  expect(reorderVisibleColumns(config, "@level", "@level", "after")).toBe(
    config,
  );
  expect(reorderVisibleColumns(config, "absent", "@message", "before")).toBe(
    config,
  );
  expect(reorderVisibleColumns(config, "@logGroup", "@message", "before")).toBe(
    config,
  );
  expect(reorderVisibleColumns(config, "@message", "@logGroup", "after")).toBe(
    config,
  );
});
