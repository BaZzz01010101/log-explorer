import type { ColumnConfig } from "../shared/contracts";

/**
 * Mixed sources get a Source column; existing entries, including an explicit
 * hidden choice, take precedence. A single-source view never shows it (every
 * row would repeat the same source, e.g. after a second source was removed).
 */
export function sourceColumnConfig(
  columns: ColumnConfig[],
  multipleSources: boolean,
): ColumnConfig[] {
  if (!multipleSources)
    return columns.some((column) => column.path === "@source")
      ? columns.filter((column) => column.path !== "@source")
      : columns;
  if (
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
