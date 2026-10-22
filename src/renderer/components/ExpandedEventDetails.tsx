import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type PointerEvent,
  type ReactNode,
} from "react";

interface Props {
  children: ReactNode;
  footer: ReactNode;
  initialHeight?: number;
  onHeightChange(height: number | undefined): void;
  onResizeStart?(): void;
}
interface ResizeSession {
  pointerId: number;
  startY: number;
  startHeight: number;
  latest: number;
  target: HTMLDivElement;
  cleanup(): void;
}
const minimumHeight = 80;
const maximumHeight = 1200;
const clamp = (height: number) =>
  Math.min(maximumHeight, Math.max(minimumHeight, height));

export function ExpandedEventDetails({
  children,
  footer,
  initialHeight,
  onHeightChange,
  onResizeStart,
}: Props) {
  const content = useRef<HTMLDivElement>(null);
  const session = useRef<ResizeSession | null>(null);
  const [height, setHeight] = useState(initialHeight);
  const [draft, setDraft] = useState<number | undefined>();
  const commit = useRef(onHeightChange);
  commit.current = onHeightChange;
  const currentHeight = draft ?? height;
  const measuredHeight = () =>
    currentHeight ?? content.current?.getBoundingClientRect().height ?? 245;
  const finish = useCallback((save: boolean, update = true) => {
    const active = session.current;
    if (!active) return;
    session.current = null;
    active.cleanup();
    if (active.target.hasPointerCapture(active.pointerId))
      active.target.releasePointerCapture(active.pointerId);
    if (update) {
      if (save) {
        setHeight(active.latest);
        commit.current(active.latest);
      }
      setDraft(undefined);
    }
  }, []);
  useEffect(() => () => finish(false, false), [finish]);
  const move = (event: PointerEvent<HTMLDivElement>) => {
    const active = session.current;
    if (!active || event.pointerId !== active.pointerId) return;
    event.preventDefault();
    event.stopPropagation();
    active.latest = clamp(active.startHeight + event.clientY - active.startY);
    setDraft(active.latest);
  };
  const reset = () => {
    finish(false);
    setHeight(undefined);
    commit.current(undefined);
  };
  return (
    <div
      className={`hybrid-detail event-message-details${draft !== undefined ? " is-resizing" : ""}`}
    >
      <div
        ref={content}
        className="expanded-event-content"
        role="region"
        aria-label="Expanded event content"
        style={{ height: currentHeight, maxHeight: currentHeight ?? 245 }}
      >
        {children}
      </div>
      {footer}
      <div
        className="expanded-event-resizer"
        role="separator"
        aria-label="Resize expanded event"
        aria-orientation="horizontal"
        aria-valuemin={minimumHeight}
        aria-valuemax={maximumHeight}
        aria-valuenow={Math.round(currentHeight ?? 245)}
        tabIndex={0}
        draggable={false}
        onPointerDown={(event) => {
          if (event.button !== 0 || session.current) return;
          onResizeStart?.();
          event.preventDefault();
          event.stopPropagation();
          const target = event.currentTarget,
            doc = target.ownerDocument;
          target.focus({ preventScroll: true });
          const previousSelection = doc.documentElement.style.userSelect,
            previousCursor = doc.documentElement.style.cursor;
          doc.documentElement.style.userSelect = "none";
          doc.documentElement.style.cursor = "row-resize";
          doc.defaultView?.getSelection()?.removeAllRanges();
          const cancel = () => finish(false);
          const escape = (keyboard: KeyboardEvent) => {
            if (keyboard.key !== "Escape") return;
            keyboard.preventDefault();
            keyboard.stopPropagation();
            finish(false);
          };
          doc.defaultView?.addEventListener("blur", cancel);
          doc.defaultView?.addEventListener("keydown", escape, true);
          const startHeight = measuredHeight();
          session.current = {
            pointerId: event.pointerId,
            startY: event.clientY,
            startHeight,
            latest: startHeight,
            target,
            cleanup() {
              doc.documentElement.style.userSelect = previousSelection;
              doc.documentElement.style.cursor = previousCursor;
              doc.defaultView?.removeEventListener("blur", cancel);
              doc.defaultView?.removeEventListener("keydown", escape, true);
            },
          };
          setDraft(startHeight);
          try {
            target.setPointerCapture(event.pointerId);
          } catch {
            finish(false);
          }
        }}
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
        onClick={(event) => event.stopPropagation()}
        onDoubleClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          reset();
        }}
        onKeyDown={(event) => {
          if (!["ArrowUp", "ArrowDown", "Home", "End"].includes(event.key))
            return;
          onResizeStart?.();
          event.preventDefault();
          event.stopPropagation();
          if (event.key === "Home") {
            reset();
            return;
          }
          const next = clamp(
            event.key === "End"
              ? maximumHeight
              : measuredHeight() + (event.key === "ArrowDown" ? 20 : -20),
          );
          finish(false);
          setHeight(next);
          commit.current(next);
        }}
        data-tooltip="Resize expanded event · Double-click to reset"
      />
    </div>
  );
}
