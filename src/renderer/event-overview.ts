export interface OverviewRow {
  id: string;
  level: string;
  /** Colors of the highlights configured in Settings. */
  colors: string[];
  /** The event matches the custom highlight text. */
  quick?: boolean;
  /** The event is one of the selected rows. */
  selected?: boolean;
}
export type OverviewLane = "quick" | "highlights";
export type OverviewMarkKind = "quick" | "selection" | "highlight" | "severity";
export interface OverviewMark {
  id: string;
  index: number;
  endIndex: number;
  top: number;
  height: number;
  colors: string[];
  level: string;
  kind: OverviewMarkKind;
}
export const QUICK_HIGHLIGHT_COLOR = "var(--mantine-color-yellow-5)";
/** Lighter than the WARN mark (yellow-6) so the two map lanes read apart. */
export const QUICK_MAP_COLOR = "var(--mantine-color-yellow-3)";
export const SELECTION_MAP_COLOR = "var(--mantine-color-blue-3)";
const severity = { warn: 1, error: 2, fatal: 3 };
const severityColors = { warn: "yellow", error: "red", fatal: "pink" };
const rank = (level: string) =>
  Object.hasOwn(severity, level) ? severity[level as keyof typeof severity] : 0;

/**
 * Rasterize full event intervals at track resolution, then merge adjacent
 * marks. The quick lane shows custom highlight text matches and selected
 * rows, side by side where both fall on one pixel. The
 * highlights lane shows configured highlights and the fixed WARN/ERROR/FATAL
 * colors; where both fall on one pixel, the configured highlight wins.
 */
export function buildOverviewMarks(
  rows: OverviewRow[],
  measurements: readonly { start: number; size: number }[],
  totalSize: number,
  trackHeight: number,
) {
  const result: Record<OverviewLane, OverviewMark[]> = {
    quick: [],
    highlights: [],
  };
  if (!rows.length || totalSize <= 0 || trackHeight <= 0) return result;
  const count = Math.ceil(trackHeight);
  const lanes: Record<OverviewLane, (OverviewMark | undefined)[]> = {
    quick: Array(count),
    highlights: Array(count),
  };
  rows.forEach((row, index) => {
    const measurement = measurements[index];
    const start = measurement?.start ?? (index * totalSize) / rows.length;
    const end = start + (measurement?.size ?? totalSize / rows.length);
    if (end <= 0 || start >= totalSize || end <= start) return;
    const top = Math.max(
      0,
      Math.min(count - 1, Math.round((start / totalSize) * trackHeight)),
    );
    const bottom = Math.min(
      count,
      Math.max(top + 1, Math.round((end / totalSize) * trackHeight)),
    );
    const level = rank(row.level);
    for (let pixel = top; pixel < bottom; pixel++) {
      const mark = {
        id: row.id,
        index,
        endIndex: index,
        top: pixel,
        height: Math.min(1, trackHeight - pixel),
        level: row.level,
      };
      if (row.quick || row.selected) {
        const existing = lanes.quick[pixel];
        const quick = row.quick || existing?.colors.includes(QUICK_MAP_COLOR);
        const selected =
          row.selected || existing?.colors.includes(SELECTION_MAP_COLOR);
        lanes.quick[pixel] = {
          ...(existing ?? mark),
          endIndex: index,
          // A highlight text match names the mark; selection adds its color.
          kind: quick ? "quick" : "selection",
          colors: [
            ...(quick ? [QUICK_MAP_COLOR] : []),
            ...(selected ? [SELECTION_MAP_COLOR] : []),
          ],
        };
      }
      const existing = lanes.highlights[pixel];
      if (row.colors.length) {
        if (existing?.kind === "highlight") {
          existing.colors = [...new Set([...existing.colors, ...row.colors])]
            .slice(0, 4)
            .sort();
          existing.endIndex = index;
        } else
          lanes.highlights[pixel] = {
            ...mark,
            kind: "highlight",
            colors: [...new Set(row.colors)].slice(0, 4).sort(),
          };
      } else if (level) {
        if (
          !existing ||
          (existing.kind === "severity" && level > rank(existing.level))
        )
          lanes.highlights[pixel] = {
            ...mark,
            kind: "severity",
            colors: [
              `var(--mantine-color-${severityColors[row.level as keyof typeof severityColors]}-6)`,
            ],
          };
        else if (existing.kind === "severity" && level === rank(existing.level))
          existing.endIndex = index;
      }
    }
  });
  for (const lane of ["quick", "highlights"] as const) {
    for (const mark of lanes[lane]) {
      if (!mark) continue;
      const previous = result[lane].at(-1);
      if (
        previous &&
        previous.top + previous.height === mark.top &&
        previous.kind === mark.kind &&
        previous.colors.join("|") === mark.colors.join("|")
      ) {
        previous.height += mark.height;
        previous.endIndex = Math.max(previous.endIndex, mark.endIndex);
      } else result[lane].push({ ...mark });
    }
  }
  return result;
}

/** Whether `row` is one of the events that `mark` stands for. */
export function rowMatchesMark(row: OverviewRow, mark: OverviewMark): boolean {
  if (mark.kind === "quick" || mark.kind === "selection")
    return Boolean(
      (row.quick && mark.colors.includes(QUICK_MAP_COLOR)) ||
      (row.selected && mark.colors.includes(SELECTION_MAP_COLOR)),
    );
  if (mark.kind === "highlight")
    return row.colors.some((color) => mark.colors.includes(color));
  return !row.colors.length && row.level === mark.level;
}
