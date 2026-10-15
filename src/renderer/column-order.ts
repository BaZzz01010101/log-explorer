import type { ColumnConfig } from "../shared/contracts";

// Visible columns reorder within their pinning section. Hidden configurations
// keep their slots and settings, so revealing a column never loses its state.
export function reorderVisibleColumns(
  columns: ColumnConfig[],
  sourcePath: string,
  targetPath: string,
  edge: "before" | "after",
): ColumnConfig[] {
  const source = columns.find((column) => column.path === sourcePath);
  const target = columns.find((column) => column.path === targetPath);
  if (
    !source ||
    !target ||
    source.hidden ||
    target.hidden ||
    source === target ||
    Boolean(source.pinned) !== Boolean(target.pinned)
  )
    return columns;
  const indices = columns
    .map((column, index) => ({ column, index }))
    .filter(
      ({ column }) =>
        !column.hidden && Boolean(column.pinned) === Boolean(source.pinned),
    )
    .map(({ index }) => index);
  const visible = indices.map((index) => columns[index]);
  const original = [...visible];
  const sourceIndex = visible.findIndex((column) => column.path === sourcePath);
  const moved = visible.splice(sourceIndex, 1)[0];
  const targetIndex = visible.findIndex((column) => column.path === targetPath);
  visible.splice(targetIndex + (edge === "after" ? 1 : 0), 0, moved);
  if (visible.every((column, index) => column === original[index]))
    return columns;
  const next = [...columns];
  indices.forEach((index, position) => {
    next[index] = visible[position];
  });
  return next;
}
