import type { LogEvent } from "./contracts";
import { eventColumnValue, parseLogMessage } from "./log-data";

export type SelectedEventCopyFormat = "messages" | "records";
export const COPY_TEXT_LIMIT = 50_000_000;

export function serializeSelectedEvents(
  events: readonly LogEvent[],
  format: SelectedEventCopyFormat,
  columns: readonly string[],
): string {
  const lines: string[] = [];
  let length = 0;
  for (const event of events) {
    let line = event.message;
    if (format === "records") {
      const parsed = parseLogMessage(event.message);
      line = JSON.stringify(
        Object.fromEntries(
          columns.map((path) => [
            path,
            eventColumnValue(event, parsed, path) ?? null,
          ]),
        ),
      );
    }
    length += line.length + (lines.length ? 1 : 0);
    if (length > COPY_TEXT_LIMIT)
      throw new Error("Clipboard size limit exceeded. Select fewer events.");
    lines.push(line);
  }
  return lines.join("\n");
}
