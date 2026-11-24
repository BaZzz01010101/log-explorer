/** A row's place in the viewport below the sticky header. */
export interface RowBox {
  id: string;
  /** Distance from the top of the viewport; negative when cut off there. */
  top: number;
  height: number;
}

/** The row that keeps its place when the layout changes. */
export type LayoutAnchor =
  | { kind: "end"; id: string }
  | {
      kind: "row";
      id: string;
      top: number;
      /** The part of the row above the viewport, from 0 to 1. */
      cut: number;
      /** The whole row was visible. */
      whole: boolean;
    };

/**
 * The selected row if it is visible, else the end of a list scrolled to it,
 * else the first row that is mostly visible.
 */
export function layoutAnchor(
  rows: readonly RowBox[],
  viewport: number,
  options: { selectedId?: string | null; endId?: string },
): LayoutAnchor | null {
  const visible = rows
    .filter((row) => row.top + row.height > 0.5 && row.top < viewport - 0.5)
    .sort((a, b) => a.top - b.top);
  const mostly = visible.filter((row) => {
    const shown =
      Math.min(row.top + row.height, viewport) - Math.max(row.top, 0);
    return shown >= Math.min(row.height, viewport) / 2;
  });
  const selected = mostly.find((row) => row.id === options.selectedId);
  if (!selected && options.endId !== undefined)
    return { kind: "end", id: options.endId };
  const row = selected ?? mostly[0] ?? visible[0];
  if (!row) return null;
  return {
    kind: "row",
    id: row.id,
    top: row.top,
    cut: row.top < 0 ? -row.top / Math.max(1, row.height) : 0,
    whole: row.top > -0.5 && row.top + row.height < viewport + 0.5,
  };
}

/** Where the top of the anchor row belongs, now that it has this height. */
export function anchoredTop(
  anchor: LayoutAnchor,
  height: number,
  viewport: number,
): number {
  if (anchor.kind === "end") return viewport - height;
  // A row cut off at the top stays cut off by the same share.
  if (anchor.cut > 0) return -anchor.cut * height;
  // One that grew moves up as far as needed to stay in view.
  const shown = anchor.whole ? height : Math.min(height, viewport / 2);
  return Math.min(anchor.top, Math.max(0, viewport - shown));
}
