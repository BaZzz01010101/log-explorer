import type { PaneLayout, SplitEdge, Workspace } from "./contracts";
import {
  clampRatio,
  layoutPaneIds,
  legacyLayout,
  removeLayoutPane,
  splitLayout,
} from "./pane-layout";

/** Viewport coordinates, matching getBoundingClientRect() and a fixed overlay. */
export interface LayoutRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface ProjectedPaneDrop {
  kind: "split" | "assign";
  rect: LayoutRect;
}

function validBounds(bounds: LayoutRect, dividerSize: number): boolean {
  return (
    [bounds.left, bounds.top, bounds.width, bounds.height, dividerSize].every(
      Number.isFinite,
    ) &&
    bounds.width >= 0 &&
    bounds.height >= 0 &&
    dividerSize >= 0
  );
}

/** Resolve a pane's actual flex rectangle, excluding each branch's divider. */
export function paneLayoutRect(
  layout: PaneLayout,
  paneId: string,
  rootBounds: LayoutRect,
  dividerSize = 6,
): LayoutRect | undefined {
  if (!validBounds(rootBounds, dividerSize)) return;
  const pending = [
    {
      node: layout,
      rect: {
        left: rootBounds.left,
        top: rootBounds.top,
        width: rootBounds.width,
        height: rootBounds.height,
      },
    },
  ];
  let visited = 0;
  while (pending.length) {
    const { node, rect } = pending.pop()!;
    if (++visited > 7) return;
    if (node.type === "leaf") {
      if (node.paneId === paneId) return rect;
      continue;
    }
    const horizontal = node.axis === "horizontal";
    const available = Math.max(
      0,
      (horizontal ? rect.width : rect.height) - dividerSize,
    );
    const firstSize = available * clampRatio(node.ratio);
    const secondSize = available - firstSize;
    pending.push({
      node: node.second,
      rect: horizontal
        ? {
            ...rect,
            left: rect.left + firstSize + dividerSize,
            width: secondSize,
          }
        : {
            ...rect,
            top: rect.top + firstSize + dividerSize,
            height: secondSize,
          },
    });
    pending.push({
      node: node.first,
      rect: horizontal
        ? { ...rect, width: firstSize }
        : { ...rect, height: firstSize },
    });
  }
}

/**
 * Predict the rectangle produced by pane/drop-tab or a center pane assignment.
 * Moving an already-visible tab removes its old pane before splitting the target;
 * the target can therefore expand beyond its current on-screen rectangle.
 */
export function projectPaneDrop(
  workspace: Pick<Workspace, "tabs" | "panes" | "layout" | "splitSizes">,
  tabId: string,
  targetPaneId: string,
  edge: SplitEdge | null,
  rootBounds: LayoutRect,
  dividerSize = 6,
): ProjectedPaneDrop | null {
  if (
    !validBounds(rootBounds, dividerSize) ||
    !workspace.tabs.some((tab) => tab.id === tabId)
  )
    return null;
  const target = workspace.panes.find((pane) => pane.id === targetPaneId);
  if (!target) return null;
  let layout =
    workspace.layout ??
    legacyLayout(
      workspace.panes.map((pane) => pane.id),
      workspace.splitSizes,
    );
  if (edge === null || target.tabId === null) {
    const rect = paneLayoutRect(layout, targetPaneId, rootBounds, dividerSize);
    return rect ? { kind: "assign", rect } : null;
  }
  const source = workspace.panes.find((pane) => pane.tabId === tabId);
  const removeSource = source && source.id !== targetPaneId;
  if (
    workspace.panes.length - (removeSource ? 1 : 0) >= 4 ||
    (source?.id === targetPaneId && workspace.tabs.length >= 100)
  )
    return null;
  if (removeSource) {
    const collapsed = removeLayoutPane(layout, source.id);
    if (!collapsed) return null;
    layout = collapsed;
  }
  const ids = layoutPaneIds(layout);
  let projectedId = "__drop-preview__";
  while (ids.includes(projectedId)) projectedId += "_";
  const projected = splitLayout(layout, targetPaneId, projectedId, edge);
  const rect = paneLayoutRect(projected, projectedId, rootBounds, dividerSize);
  return rect ? { kind: "split", rect } : null;
}
