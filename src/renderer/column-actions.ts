import type { ColumnConfig } from "../shared/contracts";
import { reorderVisibleColumns } from "./column-order";

export type ColumnAction =
  "move-left" | "move-right" | "pin" | "pin-left" | "unpin" | "unpin-right";

export function applyColumnAction(
  columns: ColumnConfig[],
  path: string,
  action: ColumnAction,
): ColumnConfig[] {
  const source = columns.find((column) => column.path === path);
  if (!source) return columns;
  if (source.hidden) {
    if (action !== "pin" && action !== "unpin") return columns;
    const pinned = action === "pin";
    return Boolean(source.pinned) === pinned
      ? columns
      : columns.map((column) =>
          column === source ? { ...column, pinned } : column,
        );
  }
  const visible = [
    ...columns.filter((column) => !column.hidden && column.pinned),
    ...columns.filter((column) => !column.hidden && !column.pinned),
  ];
  const index = visible.indexOf(source);
  if (action === "move-left" || action === "move-right") {
    const adjacent = visible[index + (action === "move-left" ? -1 : 1)];
    if (!adjacent || Boolean(adjacent.pinned) !== Boolean(source.pinned))
      return columns;
    return reorderVisibleColumns(
      columns,
      path,
      adjacent.path,
      action === "move-left" ? "before" : "after",
    );
  }
  let next: ColumnConfig[];
  if (action === "pin" || action === "unpin") {
    const pinned = action === "pin";
    if (Boolean(source.pinned) === pinned) return columns;
    const remaining = visible.filter((column) => column !== source);
    const boundary = remaining.filter((column) => column.pinned).length;
    remaining.splice(boundary, 0, { ...source, pinned });
    next = remaining;
  } else {
    next = visible.map((column, position) => {
      const change =
        action === "pin-left" ? position <= index : position >= index;
      const pinned = action === "pin-left";
      return change && Boolean(column.pinned) !== pinned
        ? { ...column, pinned }
        : column;
    });
    if (next.every((column, position) => column === visible[position]))
      return columns;
  }
  // Hidden columns retain their exact slots and configuration.
  let position = 0;
  return columns.map((column) => (column.hidden ? column : next[position++]!));
}
