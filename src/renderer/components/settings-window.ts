import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type PointerEvent,
} from "react";

export interface SettingsFrame {
  x: number;
  y: number;
  width: number;
  height: number;
}
interface Viewport {
  width: number;
  height: number;
}
export const settingsResizeEdges = [
  "n",
  "ne",
  "e",
  "se",
  "s",
  "sw",
  "w",
  "nw",
] as const;
type Operation = (typeof settingsResizeEdges)[number] | "move";
const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));
const viewport = (): Viewport => ({
  width: typeof window === "undefined" ? 1280 : window.innerWidth || 1280,
  height: typeof window === "undefined" ? 900 : window.innerHeight || 900,
});
function limits(view: Viewport) {
  const margin = Math.min(view.width, view.height) >= 64 ? 16 : 0;
  const width = Math.max(1, view.width - margin * 2),
    height = Math.max(1, view.height - margin * 2);
  return {
    margin,
    width,
    height,
    minWidth: Math.min(560, width),
    minHeight: Math.min(360, height),
  };
}
export function constrainSettingsFrame(
  frame: SettingsFrame,
  view: Viewport,
): SettingsFrame {
  const bounds = limits(view);
  const width = clamp(frame.width, bounds.minWidth, bounds.width),
    height = clamp(frame.height, bounds.minHeight, bounds.height);
  return {
    width,
    height,
    x: clamp(frame.x, bounds.margin, view.width - bounds.margin - width),
    y: clamp(frame.y, bounds.margin, view.height - bounds.margin - height),
  };
}
export function initialSettingsFrame(view: Viewport): SettingsFrame {
  const bounds = limits(view),
    width = Math.min(1100, bounds.width),
    height = Math.min(760, bounds.height);
  return {
    width,
    height,
    x: (view.width - width) / 2,
    y: (view.height - height) / 2,
  };
}
export function moveSettingsFrame(
  start: SettingsFrame,
  operation: Operation,
  dx: number,
  dy: number,
  view: Viewport,
): SettingsFrame {
  const frame = constrainSettingsFrame(start, view),
    bounds = limits(view);
  if (operation === "move")
    return constrainSettingsFrame(
      { ...frame, x: frame.x + dx, y: frame.y + dy },
      view,
    );
  const right = frame.x + frame.width,
    bottom = frame.y + frame.height;
  if (operation.includes("w")) {
    frame.x = clamp(frame.x + dx, bounds.margin, right - bounds.minWidth);
    frame.width = right - frame.x;
  }
  if (operation.includes("e"))
    frame.width = clamp(
      frame.width + dx,
      bounds.minWidth,
      view.width - bounds.margin - frame.x,
    );
  if (operation.includes("n")) {
    frame.y = clamp(frame.y + dy, bounds.margin, bottom - bounds.minHeight);
    frame.height = bottom - frame.y;
  }
  if (operation.includes("s"))
    frame.height = clamp(
      frame.height + dy,
      bounds.minHeight,
      view.height - bounds.margin - frame.y,
    );
  return frame;
}

interface Gesture {
  operation: Operation;
  pointerId: number;
  x: number;
  y: number;
  start: SettingsFrame;
  target: HTMLElement;
  cleanup(): void;
}

/** Keep the detached Settings frame independent of its current page/content. */
export function useSettingsWindow(enabled: boolean) {
  const [saved, setFrame] = useState<SettingsFrame | null>(null);
  const [interacting, setInteracting] = useState(false);
  const frame = saved ?? initialSettingsFrame(viewport());
  const current = useRef(frame);
  current.current = frame;
  const gesture = useRef<Gesture | null>(null);
  const finish = useCallback((commit: boolean, update = true) => {
    const active = gesture.current;
    if (!active) return;
    gesture.current = null;
    active.cleanup();
    if (update) setInteracting(false);
    if (active.target.hasPointerCapture(active.pointerId))
      active.target.releasePointerCapture(active.pointerId);
    if (!commit && update)
      setFrame(constrainSettingsFrame(active.start, viewport()));
  }, []);
  useEffect(() => () => finish(false, false), [finish]);
  useLayoutEffect(() => {
    if (!enabled) {
      finish(false);
      return;
    }
    const fit = () => {
      finish(false);
      setFrame((old) =>
        old
          ? constrainSettingsFrame(old, viewport())
          : initialSettingsFrame(viewport()),
      );
    };
    fit();
    if (typeof window === "undefined" || !window.addEventListener) return;
    window.addEventListener("resize", fit);
    return () => window.removeEventListener("resize", fit);
  }, [enabled, finish]);

  const move = (event: PointerEvent<HTMLElement>) => {
    const active = gesture.current;
    if (!active || event.pointerId !== active.pointerId) return;
    event.preventDefault();
    event.stopPropagation();
    setFrame(
      moveSettingsFrame(
        active.start,
        active.operation,
        event.clientX - active.x,
        event.clientY - active.y,
        viewport(),
      ),
    );
  };
  const handlers = (operation: Operation) => ({
    onPointerDown(event: PointerEvent<HTMLElement>) {
      if (
        event.button !== 0 ||
        gesture.current ||
        (operation === "move" &&
          (event.target as Element).closest(
            "button,a,input,select,textarea,[role=button]",
          ))
      )
        return;
      event.preventDefault();
      event.stopPropagation();
      const target = event.currentTarget,
        doc = target.ownerDocument;
      const previousSelection = doc.documentElement.style.userSelect,
        previousCursor = doc.documentElement.style.cursor;
      doc.documentElement.style.userSelect = "none";
      doc.documentElement.style.cursor =
        operation === "move" ? "grabbing" : `${operation}-resize`;
      const cancel = () => finish(false);
      const escape = (keyboard: KeyboardEvent) => {
        if (keyboard.key !== "Escape") return;
        keyboard.preventDefault();
        keyboard.stopPropagation();
        finish(false);
      };
      doc.defaultView?.addEventListener("blur", cancel);
      doc.defaultView?.addEventListener("keydown", escape, true);
      gesture.current = {
        operation,
        pointerId: event.pointerId,
        x: event.clientX,
        y: event.clientY,
        start: current.current,
        target,
        cleanup() {
          doc.documentElement.style.userSelect = previousSelection;
          doc.documentElement.style.cursor = previousCursor;
          doc.defaultView?.removeEventListener("blur", cancel);
          doc.defaultView?.removeEventListener("keydown", escape, true);
        },
      };
      setInteracting(true);
      try {
        target.setPointerCapture(event.pointerId);
      } catch {
        finish(false);
      }
    },
    onPointerMove: move,
    onPointerUp(event: PointerEvent<HTMLElement>) {
      if (gesture.current?.pointerId === event.pointerId) {
        move(event);
        finish(true);
      }
    },
    onPointerCancel(event: PointerEvent<HTMLElement>) {
      if (gesture.current?.pointerId === event.pointerId) finish(false);
    },
    onLostPointerCapture(event: PointerEvent<HTMLElement>) {
      if (gesture.current?.pointerId === event.pointerId) finish(false);
    },
    onDragStart(event: React.DragEvent<HTMLElement>) {
      event.preventDefault();
    },
  });
  return {
    frame,
    interacting,
    header: handlers("move"),
    resize: handlers,
    resizeWithKey(key: string, large: boolean) {
      const step = large ? 40 : 10;
      const dx = key === "ArrowLeft" ? -step : key === "ArrowRight" ? step : 0;
      const dy = key === "ArrowUp" ? -step : key === "ArrowDown" ? step : 0;
      if (!dx && !dy) return false;
      const start = gesture.current?.start ?? current.current;
      finish(false);
      setFrame(moveSettingsFrame(start, "se", dx, dy, viewport()));
      return true;
    },
  };
}
