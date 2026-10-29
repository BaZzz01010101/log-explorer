import {
  useCallback,
  useLayoutEffect,
  useRef,
  useState,
  type PointerEvent,
} from "react";

export type DividerAxis = "x" | "y";
interface Props {
  label: string;
  defaultAxis?: DividerAxis;
  values: Record<DividerAxis, number>;
  onDraft(axis: DividerAxis, value: number | null): void;
  onCommit(axis: DividerAxis, value: number): void;
}
interface Geometry {
  axis: DividerAxis;
  available: number;
  first: number;
  min: number;
  max: number;
}
interface Session extends Geometry {
  pointerId: number;
  start: number;
  latest: number;
  target: HTMLDivElement;
  cleanup(): void;
}

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));

export function HighlightPaneDivider({
  label,
  defaultAxis = "x",
  values,
  onDraft,
  onCommit,
}: Props) {
  const element = useRef<HTMLDivElement>(null);
  const session = useRef<Session | null>(null);
  const callbacks = useRef({ values, onDraft, onCommit });
  callbacks.current = { values, onDraft, onCommit };
  const [geometry, setGeometry] = useState<Geometry>({
    axis: defaultAxis,
    available: 1,
    first: 0.5,
    min: 0.2,
    max: 0.8,
  });
  const [draft, setDraft] = useState<number | null>(null);
  const finish = useCallback((commit: boolean, update = true) => {
    const active = session.current;
    if (!active) return;
    session.current = null;
    active.cleanup();
    if (active.target.hasPointerCapture(active.pointerId))
      active.target.releasePointerCapture(active.pointerId);
    if (commit) callbacks.current.onCommit(active.axis, active.latest);
    callbacks.current.onDraft(active.axis, null);
    if (update) setDraft(null);
  }, []);
  const measure = useCallback((): Geometry | null => {
    const node = element.current,
      parent = node?.parentElement;
    const before = node?.previousElementSibling,
      after = node?.nextElementSibling;
    if (!node || !parent || !before || !after) return null;
    const axis =
      getComputedStyle(parent)
        .getPropertyValue("--highlight-split-axis")
        .trim() === "y"
        ? "y"
        : "x";
    const a = before.getBoundingClientRect(),
      b = after.getBoundingClientRect();
    const first = axis === "x" ? a.width : a.height;
    const available = first + (axis === "x" ? b.width : b.height);
    if (available <= 1) return null;
    const minBefore =
      parseFloat(
        getComputedStyle(before).getPropertyValue("--highlight-resize-min"),
      ) || 100;
    const minAfter =
      parseFloat(
        getComputedStyle(after).getPropertyValue("--highlight-resize-min"),
      ) || 100;
    const scale = Math.min(1, available / (minBefore + minAfter));
    const min = Math.max(0.2, (minBefore * scale) / available),
      max = Math.min(0.8, 1 - (minAfter * scale) / available);
    return {
      axis,
      available,
      first,
      min: Math.min(min, max),
      max: Math.max(min, max),
    };
  }, []);
  useLayoutEffect(() => {
    const parent = element.current?.parentElement;
    if (!parent) return;
    const update = () => {
      const next = measure();
      if (!next) {
        finish(false);
        return;
      }
      if (
        session.current &&
        (session.current.axis !== next.axis ||
          Math.abs(session.current.available - next.available) > 1)
      )
        finish(false);
      setGeometry(next);
      if (!session.current) {
        const value = callbacks.current.values[next.axis],
          limited = clamp(value, next.min, next.max);
        if (Math.abs(value - limited) > 0.0001)
          callbacks.current.onCommit(next.axis, limited);
      }
    };
    // Tabs retain hidden children with React Activity: cleanup releases capture,
    // while this state survives. Clear its transient indicator on reconnection.
    setDraft(null);
    update();
    const observer = new ResizeObserver(update);
    observer.observe(parent);
    return () => {
      observer.disconnect();
      finish(false, false);
    };
  }, [measure, finish]);

  const move = (event: PointerEvent<HTMLDivElement>) => {
    const active = session.current;
    if (!active || event.pointerId !== active.pointerId) return;
    event.preventDefault();
    event.stopPropagation();
    const coordinate = active.axis === "x" ? event.clientX : event.clientY;
    active.latest = clamp(
      (active.first + coordinate - active.start) / active.available,
      active.min,
      active.max,
    );
    setDraft(active.latest);
    callbacks.current.onDraft(active.axis, active.latest);
  };
  const value = draft ?? values[geometry.axis];
  return (
    <div
      ref={element}
      className="highlight-pane-divider"
      role="separator"
      tabIndex={0}
      data-axis={geometry.axis}
      data-resizing={draft !== null}
      data-mantine-stop-propagation={draft !== null ? "true" : undefined}
      draggable={false}
      aria-label={label}
      aria-orientation={geometry.axis === "x" ? "vertical" : "horizontal"}
      aria-valuemin={Math.round(geometry.min * 100)}
      aria-valuemax={Math.round(geometry.max * 100)}
      aria-valuenow={Math.round(value * 100)}
      aria-valuetext={`${Math.round(value * 100)}%`}
      onPointerDown={(event) => {
        if (event.button !== 0 || session.current) return;
        const bounds = measure();
        if (!bounds) return;
        event.preventDefault();
        event.stopPropagation();
        const target = event.currentTarget,
          doc = target.ownerDocument;
        target.focus({ preventScroll: true });
        const previousSelection = doc.documentElement.style.userSelect,
          previousCursor = doc.documentElement.style.cursor;
        doc.documentElement.style.userSelect = "none";
        doc.documentElement.style.cursor =
          bounds.axis === "x" ? "col-resize" : "row-resize";
        doc.defaultView?.getSelection()?.removeAllRanges();
        const blur = () => finish(false);
        const escape = (keyboard: KeyboardEvent) => {
          if (keyboard.key !== "Escape") return;
          keyboard.preventDefault();
          keyboard.stopPropagation();
          finish(false);
        };
        doc.defaultView?.addEventListener("blur", blur);
        doc.defaultView?.addEventListener("keydown", escape, true);
        session.current = {
          ...bounds,
          pointerId: event.pointerId,
          start: bounds.axis === "x" ? event.clientX : event.clientY,
          latest: clamp(
            bounds.first / bounds.available,
            bounds.min,
            bounds.max,
          ),
          target,
          cleanup() {
            doc.documentElement.style.userSelect = previousSelection;
            doc.documentElement.style.cursor = previousCursor;
            doc.defaultView?.removeEventListener("blur", blur);
            doc.defaultView?.removeEventListener("keydown", escape, true);
          },
        };
        setDraft(session.current.latest);
        try {
          target.setPointerCapture(event.pointerId);
        } catch {
          finish(false);
        }
      }}
      onPointerMove={move}
      onPointerUp={(event) => {
        if (session.current?.pointerId === event.pointerId) {
          move(event);
          finish(true);
        }
      }}
      onPointerCancel={(event) => {
        if (session.current?.pointerId === event.pointerId) finish(false);
      }}
      onLostPointerCapture={(event) => {
        if (session.current?.pointerId === event.pointerId) finish(false);
      }}
      onDragStart={(event) => event.preventDefault()}
      onDoubleClick={(event) => {
        event.preventDefault();
        event.stopPropagation();
        finish(false);
        onCommit(geometry.axis, clamp(0.5, geometry.min, geometry.max));
      }}
      onKeyDown={(event) => {
        if (event.key === "Escape" && session.current) {
          event.preventDefault();
          event.stopPropagation();
          finish(false);
          return;
        }
        const sign =
          geometry.axis === "x"
            ? event.key === "ArrowRight"
              ? 1
              : event.key === "ArrowLeft"
                ? -1
                : 0
            : event.key === "ArrowDown"
              ? 1
              : event.key === "ArrowUp"
                ? -1
                : 0;
        if (!sign && event.key !== "Home" && event.key !== "End") return;
        event.preventDefault();
        event.stopPropagation();
        finish(false);
        onCommit(
          geometry.axis,
          clamp(
            event.key === "Home"
              ? 0.5
              : event.key === "End"
                ? geometry.max
                : value + sign * (event.shiftKey ? 0.1 : 0.02),
            geometry.min,
            geometry.max,
          ),
        );
      }}
    />
  );
}
