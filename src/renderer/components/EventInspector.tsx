import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";
import "./event-inspector.css";

interface Props {
  opened: boolean;
  onClose(): void;
  children: ReactNode;
  eventId?: string;
}

interface ResizeSession {
  pointerId: number;
  startX: number;
  startWidth: number;
  latest: number;
  target: HTMLDivElement;
  cleanup(): void;
}

export function EventInspector({ opened, onClose, children, eventId }: Props) {
  const container = useRef<HTMLElement>(null);
  const session = useRef<ResizeSession | null>(null);
  const [desiredWidth, setDesiredWidth] = useState(400);
  const [draft, setDraft] = useState<number | null>(null);
  const [parentWidth, setParentWidth] = useState<number | null>(null);
  const min = parentWidth === null ? 260 : Math.min(260, parentWidth * 0.65);
  const max = parentWidth === null ? 400 : Math.max(min, parentWidth - 140);
  const bounds = useRef({ min, max });
  bounds.current = { min, max };
  const width = Math.min(max, Math.max(min, draft ?? desiredWidth));

  const finish = useCallback((commit: boolean, update = true) => {
    const active = session.current;
    if (!active) return;
    session.current = null;
    active.cleanup();
    if (active.target.hasPointerCapture(active.pointerId))
      active.target.releasePointerCapture(active.pointerId);
    if (update) {
      if (commit) setDesiredWidth(active.latest);
      setDraft(null);
    }
  }, []);

  useEffect(() => () => finish(false, false), [finish]);
  useLayoutEffect(() => {
    if (!opened) {
      finish(false);
      return;
    }
    const parent = container.current?.parentElement;
    if (!parent) return;
    const measure = () => {
      const measured = parent.getBoundingClientRect().width;
      if (measured > 0) setParentWidth(measured);
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(parent);
    return () => observer.disconnect();
  }, [opened, finish]);

  const move = (event: ReactPointerEvent<HTMLDivElement>) => {
    const active = session.current;
    if (!active || active.pointerId !== event.pointerId) return;
    event.preventDefault();
    event.stopPropagation();
    active.latest = Math.min(
      bounds.current.max,
      Math.max(
        bounds.current.min,
        active.startWidth + active.startX - event.clientX,
      ),
    );
    setDraft(active.latest);
  };

  const begin = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0 || session.current) return;
    event.preventDefault();
    event.stopPropagation();
    const target = event.currentTarget;
    target.focus({ preventScroll: true });
    const doc = target.ownerDocument;
    const previousSelection = doc.documentElement.style.userSelect;
    const previousCursor = doc.documentElement.style.cursor;
    doc.documentElement.style.userSelect = "none";
    doc.documentElement.style.cursor = "col-resize";
    doc.defaultView?.getSelection()?.removeAllRanges();
    const cancelOnBlur = () => finish(false);
    const cancelOnEscape = (keyboard: KeyboardEvent) => {
      if (keyboard.key !== "Escape") return;
      keyboard.preventDefault();
      keyboard.stopPropagation();
      finish(false);
    };
    doc.defaultView?.addEventListener("blur", cancelOnBlur);
    doc.defaultView?.addEventListener("keydown", cancelOnEscape, true);
    session.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startWidth: width,
      latest: width,
      target,
      cleanup() {
        doc.documentElement.style.userSelect = previousSelection;
        doc.documentElement.style.cursor = previousCursor;
        doc.defaultView?.removeEventListener("blur", cancelOnBlur);
        doc.defaultView?.removeEventListener("keydown", cancelOnEscape, true);
      },
    };
    setDraft(width);
    try {
      target.setPointerCapture(event.pointerId);
    } catch {
      finish(false);
    }
  };

  if (!opened) return null;
  return (
    <aside
      ref={container}
      role="region"
      aria-label="Event inspector"
      className={`event-inspector${draft !== null ? " is-resizing" : ""}`}
      data-event-id={eventId}
      style={{ width }}
    >
      <div
        className="event-inspector-resizer"
        role="separator"
        aria-label="Resize event inspector"
        aria-orientation="vertical"
        aria-valuemin={Math.round(min)}
        aria-valuemax={Math.round(max)}
        aria-valuenow={Math.round(width)}
        aria-valuetext={`${Math.round(width)} pixels`}
        tabIndex={0}
        draggable={false}
        onPointerDown={begin}
        onPointerMove={move}
        onPointerUp={(event) => {
          if (session.current?.pointerId !== event.pointerId) return;
          move(event);
          finish(true);
        }}
        onPointerCancel={(event) => {
          if (session.current?.pointerId === event.pointerId) finish(false);
        }}
        onLostPointerCapture={(event) => {
          if (session.current?.pointerId === event.pointerId) finish(false);
        }}
        onDragStart={(event) => event.preventDefault()}
        onKeyDown={(event) => {
          if (event.key === "Escape" && session.current) {
            event.preventDefault();
            event.stopPropagation();
            finish(false);
            return;
          }
          const next =
            event.key === "ArrowLeft"
              ? width + 20
              : event.key === "ArrowRight"
                ? width - 20
                : event.key === "Home"
                  ? min
                  : event.key === "End"
                    ? max
                    : undefined;
          if (next === undefined) return;
          event.preventDefault();
          event.stopPropagation();
          finish(false);
          setDesiredWidth(Math.min(max, Math.max(min, next)));
        }}
      />
      <header className="event-inspector-header">
        <span>Event inspector</span>
        <button
          type="button"
          className="event-inspector-hide"
          aria-label="Hide inspector"
          onClick={onClose}
        >
          Hide
        </button>
      </header>
      <div className="event-inspector-body">{children}</div>
    </aside>
  );
}
