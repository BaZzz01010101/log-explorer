import type { ColumnConfig } from "../shared/contracts";

/** Existing entries, including an explicit hidden choice, always take precedence. */
export function sourceColumnConfig(
  columns: ColumnConfig[],
  multipleSources: boolean,
): ColumnConfig[] {
  if (
    !multipleSources ||
    columns.some((column) => column.path === "@source") ||
    columns.length >= 80
  )
    return columns;
  const message = columns.findIndex((column) => column.path === "@message");
  const index = message < 0 ? Math.min(2, columns.length) : message;
  return [
    ...columns.slice(0, index),
    { path: "@source", width: 240 },
    ...columns.slice(index),
  ];
}
