import { useEffect, useRef, type RefObject } from "react";

export interface ScrollPageTarget {
  key: string;
  end?: number;
  load(): void;
}

export function useScrollPagination(
  scrollRef: RefObject<HTMLElement | null>,
  options: { scope: string; targets: ScrollPageTarget[] },
) {
  const current = useRef(options);
  current.current = options;
  const consumed = useRef({
    scope: options.scope,
    keys: new Set<string>(),
    budget: 20,
  });
  if (consumed.current.scope !== options.scope)
    consumed.current = { scope: options.scope, keys: new Set(), budget: 20 };
  const checkRef = useRef<(() => void) | null>(null);
  useEffect(() => {
    const element = scrollRef.current;
    if (!element || typeof element.addEventListener !== "function") return;
    const check = () => {
      if (element.clientHeight <= 0) return;
      const bottom = element.scrollTop + element.clientHeight + 96;
      for (const target of current.current.targets) {
        if (
          consumed.current.budget <= 0 ||
          consumed.current.keys.has(target.key) ||
          bottom < (target.end ?? element.scrollHeight)
        )
          continue;
        // Consume before dispatch: React may not commit the loading flag until
        // after another scroll or resize notification.
        consumed.current.keys.add(target.key);
        consumed.current.budget--;
        target.load();
      }
    };
    const onScroll = () => {
      consumed.current.budget = 20;
      check();
    };
    const onWheel = (event: WheelEvent) => {
      if (event.deltaY > 0) onScroll();
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (["ArrowDown", "PageDown", "End", " "].includes(event.key)) onScroll();
    };
    checkRef.current = check;
    element.addEventListener("scroll", onScroll, { passive: true });
    element.addEventListener("wheel", onWheel, { passive: true });
    element.addEventListener("keydown", onKeyDown);
    const observer =
      typeof ResizeObserver === "undefined"
        ? undefined
        : new ResizeObserver(check);
    observer?.observe(element);
    if (element.firstElementChild) observer?.observe(element.firstElementChild);
    check();
    return () => {
      checkRef.current = null;
      element.removeEventListener("scroll", onScroll);
      element.removeEventListener("wheel", onWheel);
      element.removeEventListener("keydown", onKeyDown);
      observer?.disconnect();
    };
  }, [scrollRef, options.scope]);
  // New pages can leave the viewport underfull without causing a scroll event.
  useEffect(() => checkRef.current?.());
}
