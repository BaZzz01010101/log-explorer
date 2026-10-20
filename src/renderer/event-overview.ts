export interface OverviewRow {
  id: string;
  level: string;
  colors: string[];
}
export interface OverviewMark {
  id: string;
  index: number;
  endIndex: number;
  top: number;
  height: number;
  colors: string[];
  level: string;
}
const severity = { warn: 1, error: 2, fatal: 3 };
const severityColors = { warn: "yellow", error: "red", fatal: "pink" };

/** Rasterize full event intervals at track resolution, then merge adjacent colors. */
export function buildOverviewMarks(
  rows: OverviewRow[],
  measurements: readonly { start: number; size: number }[],
  totalSize: number,
  trackHeight: number,
) {
  const result: { severity: OverviewMark[]; highlights: OverviewMark[] } = {
    severity: [],
    highlights: [],
  };
  if (!rows.length || totalSize <= 0 || trackHeight <= 0) return result;
  const count = Math.ceil(trackHeight);
  const lanes: Record<"severity" | "highlights", (OverviewMark | undefined)[]> =
    { severity: Array(count), highlights: Array(count) };
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
    const rank = Object.hasOwn(severity, row.level)
      ? severity[row.level as keyof typeof severity]
      : 0;
    for (let pixel = top; pixel < bottom; pixel++) {
      const mark = {
        id: row.id,
        index,
        endIndex: index,
        top: pixel,
        height: Math.min(1, trackHeight - pixel),
        level: row.level,
      };
      const previous = lanes.severity[pixel];
      if (
        rank &&
        (!previous || rank > severity[previous.level as keyof typeof severity])
      )
        lanes.severity[pixel] = {
          ...mark,
          colors: [
            `var(--mantine-color-${severityColors[row.level as keyof typeof severityColors]}-6)`,
          ],
        };
      if (
        rank &&
        previous &&
        rank === severity[previous.level as keyof typeof severity]
      )
        previous.endIndex = index;
      if (row.colors.length) {
        const existing = lanes.highlights[pixel];
        if (existing) {
          existing.colors = [...new Set([...existing.colors, ...row.colors])]
            .slice(0, 4)
            .sort();
          existing.endIndex = index;
        } else
          lanes.highlights[pixel] = {
            ...mark,
            colors: [...new Set(row.colors)].slice(0, 4).sort(),
          };
      }
    }
  });
  for (const lane of ["severity", "highlights"] as const) {
    for (const mark of lanes[lane]) {
      if (!mark) continue;
      const previous = result[lane].at(-1);
      if (
        previous &&
        previous.top + previous.height === mark.top &&
        previous.colors.join("|") === mark.colors.join("|")
      ) {
        previous.height += mark.height;
        previous.endIndex = Math.max(previous.endIndex, mark.endIndex);
      } else result[lane].push({ ...mark });
    }
  }
  return result;
}
