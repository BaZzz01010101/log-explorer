import { useEffect, useLayoutEffect, useRef, type RefObject } from "react";
import type { Virtualizer } from "@tanstack/react-virtual";
import {
  anchoredTop,
  layoutAnchor,
  type LayoutAnchor,
  type RowBox,
} from "./layout-anchor";

/** Rows measured after the change keep moving the estimates for a short while. */
const SETTLE_MS = 700;

/**
 * Keeps the visible rows in view when every row's layout changes at once: view
 * mode, line wrapping, folding, density or font size. Changing back returns to
 * the same position unless the viewer scrolled meanwhile.
 */
export function useLayoutAnchor(options: {
  layoutKey: string;
  scrollRef: RefObject<HTMLDivElement | null>;
  virtualizer: Virtualizer<HTMLDivElement, HTMLDivElement>;
  ids: readonly string[];
  selectedId: string | null;
  /** Whether another rule (Live following, Recent paging) owns the position. */
  owned: () => boolean;
  /** Takes the position over; the result tells whether it still owns it. */
  takeOver: () => () => boolean;
}): void {
  const { layoutKey, scrollRef, virtualizer, ids, selectedId } = options;
  const previousKey = useRef(layoutKey);
  const active = useRef<{ anchor: LayoutAnchor; owns: () => boolean } | null>(
    null,
  );
  const settled = useRef<{
    anchor: LayoutAnchor;
    scrollTop: number;
    selectedId: string | null;
  } | null>(null);

  const measure = (scroll: HTMLDivElement) => {
    const header =
      scroll
        .querySelector<HTMLElement>(".log-table-header")
        ?.getBoundingClientRect().height ?? 0;
    return {
      top: scroll.getBoundingClientRect().top + header,
      header,
      viewport: Math.max(1, scroll.clientHeight - header),
    };
  };
  // Read before this render replaces the rows on screen.
  if (previousKey.current !== layoutKey) {
    previousKey.current = layoutKey;
    active.current = null;
    const scroll = scrollRef.current;
    if (scroll && scroll.clientHeight > 0 && !options.owned()) {
      const last = settled.current;
      let anchor =
        last &&
        last.selectedId === selectedId &&
        Math.abs(last.scrollTop - scroll.scrollTop) <= 1 &&
        ids.includes(last.anchor.id)
          ? last.anchor
          : null;
      if (!anchor) {
        const { top, viewport } = measure(scroll);
        const rows = [
          ...scroll.querySelectorAll<HTMLElement>(
            ".virtual-event[data-event-id]",
          ),
        ].map((element): RowBox => {
          const bounds = element.getBoundingClientRect();
          return {
            id: element.dataset.eventId!,
            top: bounds.top - top,
            height: bounds.height,
          };
        });
        const atEnd =
          scroll.scrollTop > 1 &&
          scroll.scrollHeight - scroll.scrollTop - scroll.clientHeight <= 1;
        anchor = layoutAnchor(rows, viewport, {
          selectedId,
          endId: atEnd ? ids[ids.length - 1] : undefined,
        });
      }
      if (anchor) active.current = { anchor, owns: options.takeOver() };
    }
  }

  const apply = () => {
    const scroll = scrollRef.current;
    const current = active.current;
    if (!scroll || !current) return;
    if (!current.owns()) {
      active.current = null;
      return;
    }
    const { anchor } = current;
    const { top, header, viewport } = measure(scroll);
    const element = scroll.querySelector<HTMLElement>(
      `.virtual-event[data-event-id="${CSS.escape(anchor.id)}"]`,
    );
    const before = scroll.scrollTop;
    if (element && anchor.kind === "end") {
      scroll.scrollTop = scroll.scrollHeight;
    } else if (element) {
      const bounds = element.getBoundingClientRect();
      const delta =
        bounds.top - top - anchoredTop(anchor, bounds.height, viewport);
      if (Math.abs(delta) > 0.5) scroll.scrollTop = before + delta;
    } else {
      // Not rendered yet: place it from measurements, then correct it.
      const index = ids.indexOf(anchor.id);
      const list = scroll.querySelector<HTMLElement>(".virtual-events");
      virtualizer.getTotalSize();
      const item = virtualizer.measurementsCache[index];
      if (!item || !list) return;
      const base = list.getBoundingClientRect().top - top + before;
      scroll.scrollTop = Math.max(
        0,
        base + item.start - anchoredTop(anchor, item.size, viewport),
      );
    }
    settled.current = { anchor, scrollTop: scroll.scrollTop, selectedId };
    // Renders the rows at the new position before the browser paints it.
    if (Math.abs(scroll.scrollTop - before) > header + viewport)
      scroll.dispatchEvent(new Event("scroll"));
  };
  const latest = useRef(apply);
  latest.current = apply;
  useLayoutEffect(() => latest.current());
  useEffect(() => {
    if (!active.current) return;
    const started = performance.now();
    let frame = requestAnimationFrame(function settle() {
      latest.current();
      if (active.current && performance.now() - started < SETTLE_MS)
        frame = requestAnimationFrame(settle);
      else active.current = null;
    });
    return () => cancelAnimationFrame(frame);
  }, [layoutKey]);
}
