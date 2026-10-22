import { useLayoutEffect, useRef } from "react";
import type { TabReorderPreview } from "../tab-reorder-preview";

/** A stationary bar preview outside the originating row's overflow clip. */
export function TabRowCrossingPreview({
  source,
}: {
  source: TabReorderPreview["crossingSource"];
}) {
  const preview = useRef<HTMLElement | null>(null);
  useLayoutEffect(() => {
    if (!source) return;
    const original = [
      ...document.querySelectorAll<HTMLElement>("[data-tab-id]"),
    ].find((element) => element.dataset.tabId === source.id);
    if (!original) return;
    const clone = original.cloneNode(true) as HTMLElement;
    for (const element of [
      clone,
      ...clone.querySelectorAll<HTMLElement>("*"),
    ]) {
      element.removeAttribute("id");
      element.removeAttribute("data-tab-id");
      element.removeAttribute("data-tooltip");
      element.removeAttribute("aria-controls");
    }
    clone.setAttribute("aria-hidden", "true");
    clone.inert = true;
    clone.dataset.tabRowPreview = source.id;
    const style = getComputedStyle(original);
    Object.assign(clone.style, {
      position: "fixed",
      left: "0",
      top: "0",
      margin: "0",
      visibility: "visible",
      pointerEvents: "none",
      zIndex: "300",
      boxSizing: "border-box",
      minWidth: "0",
      maxWidth: "none",
      font: style.font,
      borderBottom: style.borderBottom,
      width: `${source.rect.width}px`,
      height: `${source.rect.height}px`,
      transform: `translate3d(${source.rect.left}px, ${source.rect.top}px, 0)`,
      transition: "transform 160ms ease",
    });
    document.body.appendChild(clone);
    preview.current = clone;
    return () => {
      clone.remove();
      preview.current = null;
    };
  }, [source?.id]);
  useLayoutEffect(() => {
    if (!source || !preview.current) return;
    const { left, top, width, height } = source.rect;
    Object.assign(preview.current.style, {
      width: `${width}px`,
      height: `${height}px`,
      transform: `translate3d(${left}px, ${top}px, 0)`,
    });
  }, [source]);
  return null;
}
