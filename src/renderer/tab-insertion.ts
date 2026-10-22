import type { Workspace } from "../shared/contracts";
import type { LayoutRect } from "../shared/layout-geometry";
import { workspaceEntries } from "./workspace-entries";
export interface TabInsertion {
  beforeTabId: string | null;
  pinned: boolean;
  rect: LayoutRect;
}
export function tabInsertionAt(
  workspace: Workspace,
  point: { x: number; y: number },
): TabInsertion | null {
  const entries = workspaceEntries(workspace);
  for (const strip of document.querySelectorAll<HTMLElement>(
    "[data-tab-strip]",
  )) {
    if (!strip.dataset.tabStrip) continue;
    const bounds = strip.getBoundingClientRect();
    if (
      !bounds.width ||
      !bounds.height ||
      point.x < bounds.left ||
      point.x > bounds.right ||
      point.y < bounds.top ||
      point.y > bounds.bottom
    )
      continue;
    const tabs = [...strip.querySelectorAll<HTMLElement>("[data-tab-id]")]
      .map((element) => {
        // Sortable transforms follow the pointer and animate neighbouring tabs.
        // Measure their unchanged layout slots for a stable insertion boundary.
        const left = bounds.left + element.offsetLeft - strip.scrollLeft;
        const top = bounds.top + element.offsetTop - strip.scrollTop;
        const rect =
          element.offsetParent === strip &&
          typeof element.offsetLeft === "number"
            ? {
                left,
                top,
                right: left + element.offsetWidth,
                bottom: top + element.offsetHeight,
                width: element.offsetWidth,
                height: element.offsetHeight,
              }
            : element.getBoundingClientRect();
        return { id: element.dataset.tabId!, rect };
      })
      .filter((tab) => tab.rect.width && tab.rect.height);
    const rows: { tabs: typeof tabs; top: number; bottom: number }[] = [];
    for (const tab of tabs) {
      const row = rows.find(
        (row) => tab.rect.top < row.bottom && tab.rect.bottom > row.top,
      );
      if (row) {
        row.tabs.push(tab);
        row.top = Math.min(row.top, tab.rect.top);
        row.bottom = Math.max(row.bottom, tab.rect.bottom);
      } else
        rows.push({ tabs: [tab], top: tab.rect.top, bottom: tab.rect.bottom });
    }
    const row = rows.reduce<(typeof rows)[number] | undefined>((best, row) => {
      const distance = (candidate: typeof row) =>
        Math.max(candidate.top - point.y, 0, point.y - candidate.bottom);
      return !best || distance(row) < distance(best) ? row : best;
    }, undefined);
    const before = row?.tabs.find(
      (tab) => point.x < tab.rect.left + tab.rect.width / 2,
    );
    const last = row?.tabs.at(-1);
    const next = before ?? (last ? tabs[tabs.indexOf(last) + 1] : undefined);
    const pinnedRow = strip.dataset.tabStrip === "pinned";
    const boundary =
      next?.id ??
      (pinnedRow ? (entries.find((entry) => !entry.pinned)?.id ?? null) : null);
    const pinned =
      pinnedRow ||
      (strip.dataset.tabStrip === "shared" &&
        !!entries.find((entry) => entry.id === boundary)?.pinned);
    const x = before?.rect.left ?? last?.rect.right ?? bounds.left;
    return {
      beforeTabId: boundary,
      pinned,
      rect: {
        left: Math.max(bounds.left, Math.min(bounds.right - 3, x - 1)),
        top: Math.max(bounds.top, row?.top ?? bounds.top),
        width: 3,
        height: Math.max(
          1,
          Math.min(bounds.bottom, row?.bottom ?? bounds.bottom) -
            Math.max(bounds.top, row?.top ?? bounds.top),
        ),
      },
    };
  }
  return null;
}
