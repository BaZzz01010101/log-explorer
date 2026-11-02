import {
  useCallback,
  useLayoutEffect,
  useRef,
  useState,
  type HTMLAttributes,
  type PointerEvent,
} from "react";

const defaultHeight = 220;
const minimumHeight = 80;
const maximumHeight = 1000;
const collapsedHeight = 31;
const expandedHeaderHeight = 39;
const minimumTreeHeight = 80;
const clamp = (value: number, min: number, max: number) =>
  Math.max(min, Math.min(max, value));
const requestedHeight = (height: number) =>
  Number.isFinite(height)
    ? Math.round(clamp(height, minimumHeight, maximumHeight))
    : defaultHeight;

interface Session {
  id: number;
  start: number;
  height: number;
  latest: number;
  min: number;
  max: number;
  target: HTMLDivElement;
  cleanup(): void;
}

export function useSourceDetailsSize({
  height,
  onHeightChange,
  expanded,
}: {
  height?: number;
  onHeightChange?(height: number): void;
  expanded: boolean;
}) {
  const panel = useRef<HTMLElement>(null);
  const session = useRef<Session | null>(null);
  const [localHeight, setLocalHeight] = useState(defaultHeight);
  const [maximum, setMaximum] = useState(maximumHeight);
  const [draft, setDraft] = useState<number>();
  const callbacks = useRef({ onHeightChange });
  callbacks.current = { onHeightChange };
  const commit = useCallback((value: number) => {
    const next = requestedHeight(value);
    setLocalHeight(next);
    callbacks.current.onHeightChange?.(next);
  }, []);
  const finish = useCallback(
    (save: boolean, update = true) => {
      const active = session.current;
      if (!active) return;
      session.current = null;
      active.cleanup();
      if (active.target.hasPointerCapture(active.id))
        active.target.releasePointerCapture(active.id);
      if (update) {
        // Clicking a constrained separator must not replace the saved size.
        if (save && active.latest !== active.height) commit(active.latest);
        setDraft(undefined);
      }
    },
    [commit],
  );
  useLayoutEffect(() => () => finish(false, false), [finish]);
  useLayoutEffect(() => {
    const node = panel.current,
      parent = node?.parentElement;
    if (!node || !parent) return;
    const fixed = Array.from(parent.children).filter(
      (child) => child !== node && !child.classList.contains("resource-tree"),
    );
    const measure = () => {
      if (!parent.clientHeight) return;
      const fixedHeight = fixed.reduce((total, child) => {
        const style = getComputedStyle(child);
        return (
          total +
          child.getBoundingClientRect().height +
          (parseFloat(style.marginTop) || 0) +
          (parseFloat(style.marginBottom) || 0)
        );
      }, 0);
      const next = Math.max(
        expandedHeaderHeight,
        Math.min(
          maximumHeight,
          parent.clientHeight - fixedHeight - minimumTreeHeight,
        ),
      );
      if (session.current && session.current.max !== next) finish(false);
      setMaximum(next);
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(parent);
    for (const sibling of fixed) observer.observe(sibling);
    return () => observer.disconnect();
  });
  const minimum = Math.min(minimumHeight, maximum);
  const value = clamp(
    draft ?? requestedHeight(height ?? localHeight),
    minimum,
    maximum,
  );
  const move = (event: PointerEvent<HTMLDivElement>) => {
    const active = session.current;
    if (!active || active.id !== event.pointerId) return;
    event.preventDefault();
    event.stopPropagation();
    active.latest = Math.round(
      clamp(
        active.height + active.start - event.clientY,
        active.min,
        active.max,
      ),
    );
    setDraft(active.latest);
  };
  const separatorProps: HTMLAttributes<HTMLDivElement> & {
    "data-resizing": boolean;
    "data-tooltip": string;
  } = {
    className: "source-details-resizer",
    role: "separator",
    tabIndex: 0,
    "aria-label": "Resize source details",
    "aria-orientation": "horizontal",
    "aria-valuemin": Math.round(minimum),
    "aria-valuemax": Math.round(maximum),
    "aria-valuenow": Math.round(value),
    "aria-valuetext": `${Math.round(value)} pixels`,
    "data-resizing": draft !== undefined,
    "data-tooltip": "Drag to resize · Arrow keys adjust · Double-click resets",
    draggable: false,
    onPointerDown(event) {
      if (event.button !== 0 || session.current) return;
      event.preventDefault();
      event.stopPropagation();
      const target = event.currentTarget,
        doc = target.ownerDocument;
      target.focus({ preventScroll: true });
      const oldSelection = doc.documentElement.style.userSelect,
        oldCursor = doc.documentElement.style.cursor;
      doc.documentElement.style.userSelect = "none";
      doc.documentElement.style.cursor = "row-resize";
      doc.defaultView?.getSelection?.()?.removeAllRanges();
      const cancel = () => finish(false);
      const escape = (key: KeyboardEvent) => {
        if (key.key !== "Escape") return;
        key.preventDefault();
        key.stopPropagation();
        cancel();
      };
      doc.defaultView?.addEventListener("blur", cancel);
      doc.defaultView?.addEventListener("keydown", escape, true);
      session.current = {
        id: event.pointerId,
        start: event.clientY,
        height: value,
        latest: value,
        min: minimum,
        max: maximum,
        target,
        cleanup() {
          doc.documentElement.style.userSelect = oldSelection;
          doc.documentElement.style.cursor = oldCursor;
          doc.defaultView?.removeEventListener("blur", cancel);
          doc.defaultView?.removeEventListener("keydown", escape, true);
        },
      };
      setDraft(value);
      try {
        target.setPointerCapture(event.pointerId);
      } catch {
        finish(false);
      }
    },
    onPointerMove: move,
    onPointerUp(event) {
      if (session.current?.id !== event.pointerId) return;
      move(event);
      finish(true);
    },
    onPointerCancel(event) {
      if (session.current?.id === event.pointerId) finish(false);
    },
    onLostPointerCapture(event) {
      if (session.current?.id === event.pointerId) finish(false);
    },
    onDragStart: (event) => event.preventDefault(),
    onDoubleClick(event) {
      event.preventDefault();
      event.stopPropagation();
      finish(false);
      commit(defaultHeight);
    },
    onKeyDown(event) {
      if (event.key === "Escape" && session.current) {
        event.preventDefault();
        event.stopPropagation();
        finish(false);
        return;
      }
      const sign =
        event.key === "ArrowUp" ? 1 : event.key === "ArrowDown" ? -1 : 0;
      if (!sign && event.key !== "Home" && event.key !== "End") return;
      event.preventDefault();
      event.stopPropagation();
      finish(false);
      const next =
        event.key === "Home"
          ? defaultHeight
          : event.key === "End"
            ? maximum
            : clamp(
                value + sign * (event.shiftKey ? 50 : 20),
                minimum,
                maximum,
              );
      if (!sign || next !== value) commit(next);
    },
  };
  return {
    panel,
    height: expanded ? value : collapsedHeight,
    separatorProps,
    cancel: () => finish(false),
  };
}
