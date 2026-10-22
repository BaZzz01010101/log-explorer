import type { Workspace } from "../shared/contracts";
import type { LayoutRect } from "../shared/layout-geometry";
import type { TabInsertion } from "./tab-insertion";
import { workspaceReducer } from "./workspace";
import { workspaceEntries } from "./workspace-entries";

interface TabSize {
  id: string;
  width: number;
  height: number;
}
export function projectTabSlots(
  items: TabSize[],
  width: number,
  wrap: boolean,
) {
  const slots = new Map<string, { x: number; y: number }>();
  let x = 0,
    y = 0,
    rowHeight = 0;
  for (const item of items) {
    if (wrap && x > 0 && x + item.width > width + 0.01) {
      y += rowHeight;
      x = 0;
      rowHeight = 0;
    }
    slots.set(item.id, { x, y });
    x += item.width;
    rowHeight = Math.max(rowHeight, item.height);
  }
  return { slots, height: y + rowHeight };
}

/** Read the logical slot while a preview translation is interpolating. */
export function tabSlotRect(element: HTMLElement): LayoutRect {
  const rect = element.getBoundingClientRect();
  const view = element.ownerDocument?.defaultView;
  const transform = view?.getComputedStyle(element).transform;
  const matrix =
    transform && transform !== "none" ? new DOMMatrixReadOnly(transform) : null;
  return {
    left: rect.left - (matrix?.e ?? 0),
    top: rect.top - (matrix?.f ?? 0),
    width: rect.width,
    height: rect.height,
  };
}

export interface TabReorderPreview {
  translations: Record<
    string,
    { x: number; y: number; scaleX: number; scaleY: number }
  >;
  heights: Record<string, number>;
  marker: LayoutRect;
  crossingSource?: { id: string; rect: LayoutRect };
}

/** Project the same reducer action used on drop; logical DOM order stays intact. */
export function tabReorderPreview(
  workspace: Workspace,
  sourceId: string,
  insertion: Pick<TabInsertion, "beforeTabId" | "pinned">,
): TabReorderPreview | null {
  const strips = [
    ...document.querySelectorAll<HTMLElement>("[data-tab-strip]"),
  ].filter(
    (strip) =>
      !!strip.dataset.tabStrip && typeof strip.querySelectorAll === "function",
  );
  const measured = new Map<string, TabSize & { rect: LayoutRect }>();
  for (const strip of strips)
    for (const element of strip.querySelectorAll<HTMLElement>(
      "[data-tab-id]",
    )) {
      const rect = tabSlotRect(element);
      measured.set(element.dataset.tabId!, {
        id: element.dataset.tabId!,
        width: rect.width,
        height: rect.height,
        rect,
      });
    }
  if (!measured.has(sourceId)) return null;
  const projected = workspaceReducer(workspace, {
    type: "tab/move",
    tabId: sourceId,
    beforeTabId: insertion.beforeTabId,
    pinned: insertion.pinned,
  });
  const entries = workspaceEntries(projected).filter((entry) =>
    measured.has(entry.id),
  );
  const translations: TabReorderPreview["translations"] = {};
  const heights: TabReorderPreview["heights"] = {};
  let marker: LayoutRect | null = null;
  let crossingSource: TabReorderPreview["crossingSource"];
  for (const strip of strips) {
    const kind = strip.dataset.tabStrip!;
    const bounds = strip.getBoundingClientRect();
    const left = bounds.left + strip.clientLeft - strip.scrollLeft;
    const top = bounds.top + strip.clientTop - strip.scrollTop;
    const ordered = entries
      .filter(
        (entry) => kind === "shared" || !!entry.pinned === (kind === "pinned"),
      )
      .map((entry) => measured.get(entry.id)!);
    const wrap = strip.classList.contains("is-wrapped");
    const packed = projectTabSlots(ordered, strip.clientWidth, wrap);
    for (const item of ordered) {
      const slot = packed.slots.get(item.id)!;
      const destination = {
        left: left + slot.x,
        top: top + slot.y,
        width: item.width,
        height: item.height,
      };
      const pixel = (value: number) => Math.round(value * 10) / 10;
      translations[item.id] = {
        x: pixel(destination.left - item.rect.left),
        y: pixel(destination.top - item.rect.top),
        scaleX: 1,
        scaleY: 1,
      };
      if (item.id === sourceId) {
        const sourceStrip = strips.find((candidate) =>
          [...candidate.querySelectorAll<HTMLElement>("[data-tab-id]")].some(
            (element) => element.dataset.tabId === sourceId,
          ),
        );
        if (sourceStrip !== strip)
          crossingSource = { id: sourceId, rect: destination };
        marker = {
          ...destination,
          left: pixel(destination.left - 1),
          top: pixel(destination.top),
          width: 3,
        };
      }
    }
    if (wrap) {
      // Reserve space if a proposed order needs another visual row. Keep the
      // logical slots mounted so insertion and hover activation remain stable.
      const originalHeight = Math.max(
        40,
        ...[...strip.querySelectorAll<HTMLElement>("[data-tab-id]")].map(
          (element) => {
            const rect = measured.get(element.dataset.tabId!)!.rect;
            return rect.top - top + rect.height;
          },
        ),
      );
      const borderHeight = Math.max(0, strip.offsetHeight - strip.clientHeight);
      heights[kind] = Math.ceil(
        Math.max(
          bounds.height,
          originalHeight + borderHeight,
          packed.height + borderHeight,
        ) - 0.01,
      );
    }
  }
  return marker ? { translations, heights, marker, crossingSource } : null;
}
