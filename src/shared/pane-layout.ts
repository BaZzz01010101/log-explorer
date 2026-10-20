import type { PaneLayout, SplitAxis, SplitEdge } from "./contracts";

/** A split cannot own more views than the workspace's existing tab budget. */
export const MAX_SPLIT_PANES = 100;
export const MAX_LAYOUT_DEPTH = MAX_SPLIT_PANES - 1;
export const MAX_LAYOUT_NODES = MAX_SPLIT_PANES * 2 - 1;

const leaf = (paneId: string): PaneLayout => ({ type: "leaf", paneId });
export const clampRatio = (value: number) =>
  Math.min(0.8, Math.max(0.2, Number.isFinite(value) ? value : 0.5));
const branch = (
  axis: SplitAxis,
  first: PaneLayout,
  second: PaneLayout,
  ratio = 0.5,
): PaneLayout => ({
  type: "split",
  axis,
  ratio: clampRatio(ratio),
  first,
  second,
});

export function legacyLayout(
  ids: string[],
  sizes = { horizontal: 0.5, vertical: 0.5 },
): PaneLayout {
  if (ids.length > 4) {
    const midpoint = Math.ceil(ids.length / 2);
    return branch(
      "horizontal",
      legacyLayout(ids.slice(0, midpoint), sizes),
      legacyLayout(ids.slice(midpoint), sizes),
      sizes.horizontal,
    );
  }
  if (ids.length <= 1) return leaf(ids[0] ?? "pane-1");
  if (ids.length === 2)
    return branch("horizontal", leaf(ids[0]), leaf(ids[1]), sizes.horizontal);
  if (ids.length === 3)
    return branch(
      "horizontal",
      leaf(ids[0]),
      branch("vertical", leaf(ids[1]), leaf(ids[2]), sizes.vertical),
      sizes.horizontal,
    );
  return branch(
    "horizontal",
    branch("vertical", leaf(ids[0]), leaf(ids[2]), sizes.vertical),
    branch("vertical", leaf(ids[1]), leaf(ids[3]), sizes.vertical),
    sizes.horizontal,
  );
}

export function layoutPaneIds(layout: PaneLayout): string[] {
  return layout.type === "leaf"
    ? [layout.paneId]
    : [...layoutPaneIds(layout.first), ...layoutPaneIds(layout.second)];
}

export function normalizeLayout(
  value: unknown,
  ids: string[],
): PaneLayout | undefined {
  if (!ids.length || ids.length > MAX_SPLIT_PANES) return;
  const seen = new Set<string>();
  let visited = 0;
  const parse = (value: unknown, depth: number): PaneLayout | undefined => {
    if (
      ++visited > MAX_LAYOUT_NODES ||
      !value ||
      typeof value !== "object" ||
      depth > MAX_LAYOUT_DEPTH
    )
      return;
    const raw = value as Record<string, unknown>;
    if (raw.type === "leaf") {
      if (
        typeof raw.paneId !== "string" ||
        !ids.includes(raw.paneId) ||
        seen.has(raw.paneId)
      )
        return;
      seen.add(raw.paneId);
      return leaf(raw.paneId);
    }
    if (
      raw.type !== "split" ||
      (raw.axis !== "horizontal" && raw.axis !== "vertical") ||
      typeof raw.ratio !== "number" ||
      !Number.isFinite(raw.ratio)
    )
      return;
    const first = parse(raw.first, depth + 1);
    const second = parse(raw.second, depth + 1);
    return first && second
      ? branch(raw.axis, first, second, raw.ratio)
      : undefined;
  };
  const result = parse(value, 0);
  return result && seen.size === ids.length && ids.length <= MAX_SPLIT_PANES
    ? result
    : undefined;
}

export function isPaneLayout(value: unknown): value is PaneLayout {
  const pending: unknown[] = [value],
    ids: string[] = [];
  let count = 0;
  while (pending.length) {
    const current = pending.pop();
    if (++count > MAX_LAYOUT_NODES || !current || typeof current !== "object")
      return false;
    const raw = current as Record<string, unknown>;
    if (raw.type === "leaf") {
      if (
        typeof raw.paneId !== "string" ||
        !raw.paneId ||
        raw.paneId.length > 160
      )
        return false;
      ids.push(raw.paneId);
    } else if (
      raw.type === "split" &&
      (raw.axis === "horizontal" || raw.axis === "vertical") &&
      typeof raw.ratio === "number" &&
      raw.ratio >= 0.2 &&
      raw.ratio <= 0.8
    )
      pending.push(raw.first, raw.second);
    else return false;
  }
  return !!normalizeLayout(value, ids);
}

export function splitLayout(
  layout: PaneLayout,
  paneId: string,
  newPaneId: string,
  edge: SplitEdge,
): PaneLayout {
  if (layout.type === "leaf") {
    if (layout.paneId !== paneId) return layout;
    const before = edge === "left" || edge === "top";
    return branch(
      edge === "left" || edge === "right" ? "horizontal" : "vertical",
      before ? leaf(newPaneId) : layout,
      before ? layout : leaf(newPaneId),
    );
  }
  return {
    ...layout,
    first: splitLayout(layout.first, paneId, newPaneId, edge),
    second: splitLayout(layout.second, paneId, newPaneId, edge),
  };
}

export function removeLayoutPane(
  layout: PaneLayout,
  paneId: string,
): PaneLayout | null {
  if (layout.type === "leaf") return layout.paneId === paneId ? null : layout;
  const first = removeLayoutPane(layout.first, paneId),
    second = removeLayoutPane(layout.second, paneId);
  return first && second ? { ...layout, first, second } : (first ?? second);
}

export function nextSplitAxis(
  layout: PaneLayout,
  paneId: string,
  parent: SplitAxis = "vertical",
): SplitAxis {
  if (layout.type === "leaf")
    return parent === "horizontal" ? "vertical" : "horizontal";
  return nextSplitAxis(
    layoutPaneIds(layout.first).includes(paneId) ? layout.first : layout.second,
    paneId,
    layout.axis,
  );
}

export function resizeLayout(
  layout: PaneLayout,
  path: string,
  ratio: number,
): PaneLayout {
  if (layout.type === "leaf") return layout;
  if (!path) return { ...layout, ratio: clampRatio(ratio) };
  return path[0] === "0"
    ? { ...layout, first: resizeLayout(layout.first, path.slice(1), ratio) }
    : { ...layout, second: resizeLayout(layout.second, path.slice(1), ratio) };
}

export function mapLayoutIds(
  layout: PaneLayout,
  map: Map<string, string>,
): PaneLayout {
  return layout.type === "leaf"
    ? leaf(map.get(layout.paneId) ?? layout.paneId)
    : {
        ...layout,
        first: mapLayoutIds(layout.first, map),
        second: mapLayoutIds(layout.second, map),
      };
}
