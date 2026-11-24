import type { CSSProperties } from "react";
import type { Column } from "@tanstack/react-table";
import type { ColumnConfig } from "../shared/contracts";
import { DEFAULT_TIMESTAMP_COLUMN_WIDTH } from "../shared/log-data";

export const MIN_COLUMN_WIDTH = 70;
export const MAX_COLUMN_WIDTH = 1400;
export const DEFAULT_COLUMN_WIDTH = 180;

export const clampColumnWidth = (width: number): number =>
  Math.min(MAX_COLUMN_WIDTH, Math.max(MIN_COLUMN_WIDTH, width));

const columnNames: Record<string, string> = {
  "@timestamp": "Timestamp",
  "@level": "Level",
  "@message": "Message",
  "@logGroup": "Log group",
  "@logStream": "Log stream",
  "@source": "Source",
};
export const initialColumns: ColumnConfig[] = [
  { path: "@timestamp", width: DEFAULT_TIMESTAMP_COLUMN_WIDTH, pinned: true },
  { path: "@level", width: 84 },
  { path: "@message", width: 560 },
  { path: "@logStream", width: 220, hidden: true },
  { path: "@logGroup", width: 240, hidden: true },
];

export function titleFor(path: string): string {
  return columnNames[path] ?? (path === "" ? "$" : path);
}

/** Table column IDs cannot be empty like the path of the JSON root. */
export function columnId(path: string): string {
  return path || "@jsonRoot";
}
export function columnPath(id: string): string {
  return id === "@jsonRoot" ? "" : id;
}

/** Only the rightmost pinned column casts a shadow over the scrolled ones. */
export function pinClass<T>(column: Column<T>): string {
  if (!column.getIsPinned()) return "";
  return column.getIsLastColumn("left") ? "pinned pinned-edge" : "pinned";
}

export function pinStyle<T>(column: Column<T>): CSSProperties {
  return {
    width: column.getSize(),
    flex: `0 0 ${column.getSize()}px`,
    ...(column.getIsPinned()
      ? { position: "sticky", left: column.getStart("left"), zIndex: 2 }
      : {}),
  };
}
