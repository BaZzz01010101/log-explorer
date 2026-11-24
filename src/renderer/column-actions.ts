import type { ColumnConfig, NewColumnPosition } from "../shared/contracts";
import { reorderVisibleColumns } from "./column-order";

export type ColumnAction =
  | "move-left"
  | "move-right"
  | "pin"
  | "pin-left"
  | "unpin"
  | "unpin-right"
  | "remove";

export function isProtectedColumn(path: string): boolean {
  return ["@timestamp", "@level", "@message", "@source"].includes(path);
}

/** The displayed unpinned position a new column gets. */
export function insertColumn(
  columns: ColumnConfig[],
  column: ColumnConfig,
  position: NewColumnPosition,
): ColumnConfig[] {
  const message = columns.findIndex((entry) => entry.path === "@message");
  const first = columns.findIndex((entry) => !entry.hidden && !entry.pinned);
  let index = columns.length;
  if (position === "first" || (position !== "last" && columns[message]?.pinned))
    index = first < 0 ? columns.length : first;
  else if (position !== "last" && message >= 0)
    index = position === "before-message" ? message : message + 1;
  return [...columns.slice(0, index), column, ...columns.slice(index)];
}

/**
 * The displayed columns with every pinned one back where it was pinned from:
 * after its former left neighbor, else before its former right one, else left
 * in place. Columns may be each other's neighbors, so this repeats until stable.
 */
function homeOrder(visible: ColumnConfig[]): ColumnConfig[] {
  const order = [...visible];
  // Later pins return first.
  const away = visible.filter((column) => column.pinned && column.home);
  away.reverse();
  for (let pass = 0; pass < away.length; pass++) {
    const before = [...order];
    for (const column of away) {
      const index = order.indexOf(column);
      order.splice(index, 1);
      const at = (path: string | undefined) =>
        path === undefined
          ? -1
          : order.findIndex((entry) => entry.path === path);
      const left = at(column.home!.left);
      const right = at(column.home!.right);
      order.splice(
        left >= 0 ? left + 1 : right >= 0 ? right : index,
        0,
        column,
      );
    }
    if (order.every((column, index) => column === before[index])) break;
  }
  return order;
}

/** The displayed neighbors as if no column had been pinned out of its place. */
function homeOf(
  order: ColumnConfig[],
  column: ColumnConfig,
): ColumnConfig["home"] {
  const index = order.indexOf(column);
  const left = order[index - 1]?.path;
  const right = order[index + 1]?.path;
  return {
    ...(left !== undefined ? { left } : {}),
    ...(right !== undefined ? { right } : {}),
  };
}

function unpinned(column: ColumnConfig): ColumnConfig {
  const { home: _home, ...rest } = column;
  return { ...rest, pinned: false };
}

export function applyColumnAction(
  columns: ColumnConfig[],
  path: string,
  action: ColumnAction,
): ColumnConfig[] {
  const source = columns.find((column) => column.path === path);
  if (!source) return columns;
  if (action === "remove") {
    if (
      !source.hidden &&
      columns.filter((column) => !column.hidden).length <= 1
    )
      return columns;
    if (!isProtectedColumn(path))
      return columns.filter((column) => column !== source);
    return source.hidden
      ? columns
      : columns.map((column) =>
          column === source ? { ...column, hidden: true } : column,
        );
  }
  if (source.hidden) {
    if (action !== "pin" && action !== "unpin") return columns;
    const pinned = action === "pin";
    return Boolean(source.pinned) === pinned
      ? columns
      : columns.map((column) =>
          column !== source
            ? column
            : pinned
              ? { ...column, pinned }
              : unpinned(column),
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
  const pinning = action === "pin" || action === "pin-left";
  const single = action === "pin" || action === "unpin";
  const changed = visible.filter(
    (column, position) =>
      Boolean(column.pinned) !== pinning &&
      (single
        ? column === source
        : pinning
          ? position <= index
          : position >= index),
  );
  if (!changed.length) return columns;
  let next: ColumnConfig[];
  if (pinning) {
    const order = homeOrder(visible);
    const pinned = changed.map((column) => ({
      ...column,
      pinned: true,
      home: homeOf(order, column),
    }));
    // The clicked column joins the pinned ones; a prefix keeps its order.
    next = [
      ...visible.filter((column) => column.pinned),
      ...pinned,
      ...visible.filter(
        (column) => !column.pinned && !changed.includes(column),
      ),
    ];
  } else {
    const order = homeOrder(visible);
    const released = new Set(changed);
    const pool = visible.filter((column) => !column.pinned);
    // Each follows the nearest column that is to its left and not pinned.
    let previous = -1;
    for (const column of order) {
      if (released.has(column)) pool.splice(++previous, 0, unpinned(column));
      else if (!column.pinned) previous = pool.indexOf(column);
    }
    next = [
      ...visible.filter((column) => column.pinned && !released.has(column)),
      ...pool,
    ];
  }
  // Hidden columns retain their exact slots and configuration.
  let position = 0;
  return columns.map((column) => (column.hidden ? column : next[position++]!));
}
