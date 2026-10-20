import {
  useEffect,
  useRef,
  useState,
  type ReactNode,
  type MouseEvent,
} from "react";
import { createPortal } from "react-dom";
import {
  announceResourceDragStart,
  RESOURCE_DRAG_MOVE,
  announceResourceDragEnd,
  type ResourcePayload,
} from "../resource-drag";

export const SOURCE_DROP_EVENT = "explorer:add-sources";
export type { ResourcePayload } from "../resource-drag";
// Explorer is outside the tab drag context. This pointer gesture uses the same
// captured-pointer approach as dividers, without entering Windows' modal native
// drag loop. Drops carry the existing bounded resource payload.
export function ResourceDragLabel({
  payload,
  children,
  title,
  onClick,
  onDoubleClick,
}: {
  payload: ResourcePayload;
  children: ReactNode;
  title?: string;
  onClick(event?: MouseEvent<HTMLButtonElement>): void;
  onDoubleClick(): void;
}) {
  const [preview, setPreview] = useState<{ x: number; y: number }>();
  const cleanup = useRef<() => void>(() => {});
  const suppressClick = useRef(false);
  useEffect(() => () => cleanup.current(), []);
  return (
    <>
      <button
        className="resource-label"
        title={title}
        onClick={(event) => {
          if (!suppressClick.current) onClick(event);
        }}
        onDoubleClick={(event) => {
          if (
            !suppressClick.current &&
            !event?.ctrlKey &&
            !event?.metaKey &&
            !event?.shiftKey
          )
            onDoubleClick();
        }}
        onPointerDown={(event) => {
          if (event.button !== 0) return;
          cleanup.current();
          event.preventDefault();
          const button = event.currentTarget,
            pointerId = event.pointerId,
            start = { x: event.clientX, y: event.clientY };
          let dragging = false,
            target: HTMLElement | null = null;
          const oldSelect = document.body.style.userSelect,
            oldCursor = document.body.style.cursor;
          button.setPointerCapture(pointerId);
          const clearTarget = () => {
            target?.dispatchEvent(
              new CustomEvent("explorer:source-drag-leave"),
            );
            target = null;
          };
          const finish = (drop: boolean) => {
            const destination = target,
              wasDragging = dragging;
            if (wasDragging) announceResourceDragEnd(drop && !destination);
            dragging = false;
            cleanup.current();
            if (wasDragging && drop && destination)
              destination.dispatchEvent(
                new CustomEvent(SOURCE_DROP_EVENT, { detail: payload }),
              );
            clearTarget();
            setPreview(undefined);
            if (wasDragging) {
              suppressClick.current = true;
              setTimeout(() => {
                suppressClick.current = false;
              }, 0);
            }
          };
          const move = (move: PointerEvent) => {
            if (move.pointerId !== pointerId) return;
            if (
              !dragging &&
              Math.hypot(move.clientX - start.x, move.clientY - start.y) < 6
            )
              return;
            if (!dragging) announceResourceDragStart();
            dragging = true;
            move.preventDefault();
            document.body.style.userSelect = "none";
            document.body.style.cursor = "copy";
            setPreview({ x: move.clientX + 16, y: move.clientY + 12 });
            window.dispatchEvent(
              new CustomEvent(RESOURCE_DRAG_MOVE, {
                detail: {
                  payload,
                  point: { x: move.clientX, y: move.clientY },
                },
              }),
            );
            const next =
              document
                .elementFromPoint(move.clientX, move.clientY)
                ?.closest<HTMLElement>(".source-badges") ?? null;
            if (next !== target) {
              clearTarget();
              target = next;
              target?.dispatchEvent(
                new CustomEvent("explorer:source-drag-enter"),
              );
            }
          };
          const up = (event: PointerEvent) => {
            if (event.pointerId === pointerId) {
              if (dragging) move(event);
              finish(true);
            }
          };
          const cancel = () => finish(false);
          const key = (event: KeyboardEvent) => {
            if (event.key === "Escape") {
              event.preventDefault();
              finish(false);
            }
          };
          window.addEventListener("pointermove", move, { passive: false });
          window.addEventListener("pointerup", up);
          window.addEventListener("pointercancel", cancel);
          window.addEventListener("keydown", key);
          window.addEventListener("blur", cancel);
          cleanup.current = () => {
            if (dragging) announceResourceDragEnd(false);
            dragging = false;
            window.removeEventListener("pointermove", move);
            window.removeEventListener("pointerup", up);
            window.removeEventListener("pointercancel", cancel);
            window.removeEventListener("keydown", key);
            window.removeEventListener("blur", cancel);
            document.body.style.userSelect = oldSelect;
            document.body.style.cursor = oldCursor;
            clearTarget();
            if (button.hasPointerCapture(pointerId))
              button.releasePointerCapture(pointerId);
            cleanup.current = () => {};
          };
        }}
      >
        {children}
      </button>
      {preview &&
        createPortal(
          <div
            className="resource-drag-preview"
            style={{ left: preview.x, top: preview.y }}
          >
            {payload.sources[0].logStreams?.[0] ?? payload.sources[0].logGroup}
            {payload.sources.length > 1
              ? ` +${payload.sources.length - 1}`
              : ""}
          </div>,
          document.body,
        )}
    </>
  );
}
