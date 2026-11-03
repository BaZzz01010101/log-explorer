import { useCallback, useLayoutEffect, useRef } from "react";
import type { Virtualizer } from "@tanstack/react-virtual";

/** Own row measurement so unchanged rows are remeasured even during scrolling. */
export function useMeasuredVirtualRows(
  virtualizer: Virtualizer<HTMLDivElement, HTMLDivElement>,
  layoutKey: string,
) {
  const elements = useRef(new Set<HTMLDivElement>());
  const observer = useRef<ResizeObserver | null>(null);
  const previousLayout = useRef<string | undefined>(undefined);
  const measure = useCallback(
    (element: HTMLDivElement) => {
      if (!element.isConnected) {
        observer.current?.unobserve(element);
        elements.current.delete(element);
        return;
      }
      const index = Number(element.dataset.index);
      if (!Number.isInteger(index) || index < 0) return;
      virtualizer.resizeItem(index, element.getBoundingClientRect().height);
    },
    [virtualizer],
  );
  const ref = useCallback((element: HTMLDivElement | null) => {
    if (element) {
      elements.current.add(element);
      observer.current?.observe(element);
    }
  }, []);
  useLayoutEffect(() => {
    const resize = new ResizeObserver((entries) => {
      for (const entry of entries) measure(entry.target as HTMLDivElement);
    });
    observer.current = resize;
    for (const element of elements.current) resize.observe(element);
    return () => {
      resize.disconnect();
      observer.current = null;
    };
  }, [measure]);
  useLayoutEffect(() => {
    if (previousLayout.current !== layoutKey) {
      previousLayout.current = layoutKey;
      virtualizer.measure();
    }
    // A layout change can leave a short row's DOM height unchanged. Its observer
    // will not fire again, so repopulate all mounted sizes before painting.
    // Use only resizeItem, never the virtualizer's second measurement observer.
    for (const element of elements.current) measure(element);
  });
  return ref;
}
