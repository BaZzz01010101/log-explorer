import { useEffect, useMemo, useRef, useState, type PointerEvent } from "react";
import type { ColumnConfig } from "../shared/contracts";
import { clampColumnWidth, columnId } from "./log-columns";

interface Session {
  pointerId: number;
  element: HTMLDivElement;
  path: string;
  id: string;
  startX: number;
  startWidth: number;
  width: number;
}

/** Drags a column's right edge; the new width is stored when it ends. */
export function useColumnResize(
  columns: ColumnConfig[],
  onChange: (columns: ColumnConfig[]) => void,
) {
  const current = useRef({ columns, onChange });
  current.current = { columns, onChange };
  const [draft, setDraft] = useState<Record<string, number> | null>(null);
  const resizeSession = useRef<Session | null>(null);
  const configuredSizing = useMemo(
    () =>
      Object.fromEntries(
        columns.map((column) => [columnId(column.path), column.width]),
      ),
    [columns],
  );
  const finish = (commit: boolean) => {
    const session = resizeSession.current;
    if (!session) return;
    resizeSession.current = null;
    document.body.classList.remove("resizing-columns");
    if (session.element.hasPointerCapture(session.pointerId))
      session.element.releasePointerCapture(session.pointerId);
    if (commit && session.width !== session.startWidth) {
      current.current.onChange(
        current.current.columns.map((column) =>
          column.path === session.path
            ? { ...column, width: session.width }
            : column,
        ),
      );
    }
    setDraft(null);
  };
  useEffect(() => {
    const cancel = () => finish(false);
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape" && resizeSession.current) {
        event.preventDefault();
        event.stopPropagation();
        cancel();
      }
    };
    window.addEventListener("blur", cancel);
    window.addEventListener("keydown", escape, true);
    return () => {
      window.removeEventListener("blur", cancel);
      window.removeEventListener("keydown", escape, true);
      const session = resizeSession.current;
      if (session) {
        resizeSession.current = null;
        document.body.classList.remove("resizing-columns");
        if (session.element.hasPointerCapture(session.pointerId))
          session.element.releasePointerCapture(session.pointerId);
      }
    };
  }, []);
  const owned = (event: PointerEvent<HTMLDivElement>) =>
    event.pointerId === resizeSession.current?.pointerId;
  /** For the resize handle of one column. */
  const handlers = (id: string, path: string, size: number) => ({
    onPointerDown: (event: PointerEvent<HTMLDivElement>) => {
      if (!event.isPrimary || event.button !== 0) return;
      event.preventDefault();
      event.stopPropagation();
      finish(true);
      window.getSelection()?.removeAllRanges();
      const element = event.currentTarget;
      element.setPointerCapture(event.pointerId);
      resizeSession.current = {
        pointerId: event.pointerId,
        element,
        path,
        id,
        startX: event.clientX,
        startWidth: size,
        width: size,
      };
      document.body.classList.add("resizing-columns");
      setDraft({ ...configuredSizing });
    },
    onPointerMove: (event: PointerEvent<HTMLDivElement>) => {
      const session = resizeSession.current;
      if (!session || !owned(event)) return;
      event.preventDefault();
      const width = Math.round(
        clampColumnWidth(session.startWidth + event.clientX - session.startX),
      );
      if (width === session.width) return;
      session.width = width;
      setDraft({ ...configuredSizing, [session.id]: width });
    },
    onPointerUp: (event: PointerEvent<HTMLDivElement>) => {
      if (owned(event)) finish(true);
    },
    onPointerCancel: (event: PointerEvent<HTMLDivElement>) => {
      if (owned(event)) finish(false);
    },
    onLostPointerCapture: (event: PointerEvent<HTMLDivElement>) => {
      if (owned(event)) finish(true);
    },
  });
  return {
    sizing: draft ?? configuredSizing,
    setSizing: setDraft,
    resizing: resizeSession.current?.id,
    finish,
    handlers,
  };
}
