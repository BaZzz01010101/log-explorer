export interface EventRowBounds { start: number; end: number }

/** Select the visible edge first; only scroll when that edge is selected. */
export function eventPageDestination(
  rows: readonly EventRowBounds[], current: number, scrollTop: number,
  viewportHeight: number, maxScrollTop: number, direction: "up" | "down",
): { index: number; scrollTop: number } | null {
  if (!rows.length || viewportHeight <= 0) return null;
  const edge = (top: number) => {
    const bottom = top + viewportHeight;
    const visible = rows.flatMap((row, index) => row.end > top + 0.5 && row.start < bottom - 0.5 ? [index] : []);
    return direction === "up" ? visible[0] : visible[visible.length - 1];
  };
  const clamp = (top: number) => Math.min(Math.max(0, top), maxScrollTop);
  const align = (index: number) => clamp(direction === "up" ? rows[index]!.start : rows[index]!.end - viewportHeight);
  const initial = edge(scrollTop);
  if (initial === undefined) return null;
  const aligned = align(initial);
  if (current !== initial || Math.abs(aligned - scrollTop) > 0.5) return { index: initial, scrollTop: aligned };
  const target = direction === "up" ? rows[initial]!.start - viewportHeight : rows[initial]!.end + viewportHeight;
  let next = initial;
  if (direction === "up") {
    while (next > 0 && rows[next - 1]!.start >= target - 0.5) next--;
    if (next === initial && next > 0) next--;
  } else {
    while (next + 1 < rows.length && rows[next + 1]!.end <= target + 0.5) next++;
    if (next === initial && next + 1 < rows.length) next++;
  }
  return { index: next, scrollTop: align(next) };
}

export interface RowSpan {
  start: number;
  end: number;
}

/**
 * Chooses the top of the visible area (in list coordinates) after a filter is
 * cleared. All previously visible rows are shown, centered, when they fit.
 * Otherwise the anchor (the selected row, or the middle visible row) stays
 * fully visible near the center while the window includes as many previously
 * visible rows as possible.
 */
export function filterRestoreTop(
  visible: readonly RowSpan[],
  anchor: RowSpan | undefined,
  viewport: number,
): number | undefined {
  const rows = [...visible].sort((a, b) => a.start - b.start);
  if (!rows.length && !anchor) return undefined;
  const all = anchor ? [...rows, anchor] : rows;
  const low = Math.min(...all.map((row) => row.start));
  const high = Math.max(...all.map((row) => row.end));
  if (high - low <= viewport) return low - (viewport - (high - low)) / 2;
  const center = anchor ?? rows[Math.floor(rows.length / 2)]!;
  const centered = center.start - (viewport - (center.end - center.start)) / 2;
  // Keep the anchor fully visible (or its top, for a row taller than the view).
  const min = Math.min(center.start, center.end - viewport);
  const max = center.start;
  const clamp = (value: number) => Math.min(max, Math.max(min, value));
  const fits = (top: number) =>
    rows.filter((row) => row.start >= top && row.end <= top + viewport).length;
  let best = clamp(centered);
  let bestCount = fits(best);
  for (const row of rows)
    for (const candidate of [row.start, row.end - viewport]) {
      const top = clamp(candidate);
      const count = fits(top);
      if (
        count > bestCount ||
        (count === bestCount &&
          Math.abs(top - centered) < Math.abs(best - centered))
      ) {
        best = top;
        bestCount = count;
      }
    }
  return best;
}
