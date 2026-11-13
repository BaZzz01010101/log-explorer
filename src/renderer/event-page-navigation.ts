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
