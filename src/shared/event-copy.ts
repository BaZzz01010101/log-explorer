import type { LogEvent } from "./contracts";
import {
  eventColumnValue,
  inferLevel,
  parseLogMessage,
  type ParsedMessage,
} from "./log-data";

export type SelectedEventCopyFormat = "messages" | "rows";
export const COPY_TEXT_LIMIT = 50_000_000;

export function serializeSelectedEvents(
  events: readonly LogEvent[],
  format: SelectedEventCopyFormat,
  columns: readonly string[],
  parsedFor?: (event: LogEvent) => ParsedMessage,
  cellTextFor?: (
    event: LogEvent,
    path: string,
    parsed: ParsedMessage,
  ) => string,
  sourceFor?: (event: LogEvent) => string,
  headerFor?: (path: string) => string,
): string {
  if (format === "messages") {
    const lines: string[] = [];
    let length = 0;
    for (const event of events) {
      const parsed = parsedFor?.(event) ?? parseLogMessage(event.message);
      const line = JSON.stringify({
        timestamp: new Date(event.timestamp).toISOString(),
        level: inferLevel(parsed, event.message, event.severity).toUpperCase(),
        ...(sourceFor ? { source: sourceFor(event) } : {}),
        message: parsed.kind === "json" ? parsed.value : event.message,
      });
      length += line.length + (lines.length ? 1 : 0);
      assertCopySize(length);
      lines.push(line);
    }
    return lines.join("\n");
  }

  if (!events.length || !columns.length) return "";
  const headers = columns.map((path) =>
    singleLineCell(headerFor?.(path) ?? path),
  );
  const widths = headers.map((header) => header.length);
  let length = widths.reduce((sum, width) => sum + width, 0);
  assertCopySize(length);
  const rows = events.map((event) => {
    const parsed = parsedFor?.(event) ?? parseLogMessage(event.message);
    return columns.map((path, index) => {
      const value = cellTextFor
        ? undefined
        : eventColumnValue(event, parsed, path);
      const text = cellTextFor
        ? cellTextFor(event, path, parsed)
        : value === undefined
          ? ""
          : typeof value === "string"
            ? value
            : JSON.stringify(value);
      // A copied table row always occupies one physical line. Preserve literal
      // quotes and JSON syntax; quoting is unnecessary in a readable text table.
      const cell = singleLineCell(text);
      widths[index] = Math.max(widths[index], cell.length);
      length += cell.length;
      assertCopySize(length);
      return cell;
    });
  });
  const rowWidth =
    widths.reduce((sum, width) => sum + width, 0) +
    Math.max(0, columns.length - 1) * 3;
  // Include padding before allocating it: a single long cell must not cause a
  // large selection of short rows to balloon beyond the clipboard limit.
  assertCopySize((rows.length + 2) * rowWidth + rows.length + 1);
  const renderRow = (row: string[]) =>
    row.map((cell, index) => cell.padEnd(widths[index])).join(" | ");
  return [
    renderRow(headers),
    widths.map((width) => "-".repeat(width)).join("-+-"),
    ...rows.map(renderRow),
  ].join("\n");
}

function singleLineCell(text: string): string {
  return text.replace(/[\t\r\n\f\v\u0085\u2028\u2029]+/g, " ").trim();
}

function assertCopySize(length: number): void {
  if (length > COPY_TEXT_LIMIT)
    throw new Error("Clipboard size limit exceeded. Select fewer events.");
}
