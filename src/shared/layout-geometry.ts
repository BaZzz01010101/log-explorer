import type { PaneLayout } from "./contracts";
import { clampRatio, MAX_LAYOUT_NODES } from "./pane-layout";

/** Viewport coordinates, matching getBoundingClientRect() and a fixed overlay. */
export interface LayoutRect {
  left: number;
  top: number;
  width: number;
  height: number;
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
    if (++visited > MAX_LAYOUT_NODES) return;
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
