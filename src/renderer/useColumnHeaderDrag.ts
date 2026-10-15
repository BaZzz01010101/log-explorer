import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type MouseEvent,
  type PointerEvent,
  type RefObject,
} from "react";
import type { ColumnConfig } from "../shared/contracts";
import { reorderVisibleColumns } from "./column-order";

interface Visual {
  sourcePath: string;
  targetPath?: string;
  edge?: "before" | "after";
}
interface Session extends Visual {
  pointerId: number;
  element: HTMLElement;
  header: HTMLElement;
  startX: number;
  startY: number;
  x: number;
  y: number;
  active: boolean;
  frame?: number;
}

export function useColumnHeaderDrag(
  columns: ColumnConfig[],
  onColumnsChange: (columns: ColumnConfig[]) => void,
  scrollRef: RefObject<HTMLDivElement | null>,
) {
  const current = useRef({ columns, onColumnsChange, scrollRef });
  current.current = { columns, onColumnsChange, scrollRef };
  const session = useRef<Session | null>(null);
  const mounted = useRef(true);
  const suppressClick = useRef(false);
  const [visual, setVisual] = useState<Visual | null>(null);

  const finish = useCallback((commit: boolean) => {
    const active = session.current;
    if (!active) return;
    session.current = null;
    if (active.frame !== undefined) cancelAnimationFrame(active.frame);
    active.element.ownerDocument.body.classList.remove("reordering-columns");
    if (active.element.hasPointerCapture(active.pointerId))
      active.element.releasePointerCapture(active.pointerId);
    if (active.active) suppressClick.current = true;
    if (mounted.current) setVisual(null);
    if (
      commit &&
      active.active &&
      active.targetPath !== undefined &&
      active.edge
    ) {
      const state = current.current;
      const next = reorderVisibleColumns(
        state.columns,
        active.sourcePath,
        active.targetPath,
        active.edge,
      );
      if (next !== state.columns) state.onColumnsChange(next);
    }
  }, []);

  useEffect(() => {
    mounted.current = true;
    const cancel = () => finish(false);
    const escape = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || !session.current) return;
      event.preventDefault();
      event.stopPropagation();
      cancel();
    };
    window.addEventListener("blur", cancel);
    window.addEventListener("keydown", escape, true);
    return () => {
      mounted.current = false;
      window.removeEventListener("blur", cancel);
      window.removeEventListener("keydown", escape, true);
      finish(false);
    };
  }, [finish]);

  const chooseTarget = (active: Session) => {
    const doc = active.element.ownerDocument;
    const header = doc
      .elementFromPoint(active.x, active.y)
      ?.closest<HTMLElement>(".log-header-cell[data-column-path]");
    const path = header?.getAttribute("data-column-path");
    const state = current.current;
    const source = state.columns.find(
      (column) => column.path === active.sourcePath,
    );
    const target = state.columns.find((column) => column.path === path);
    if (
      !header ||
      !active.header.contains(header) ||
      path === null ||
      path === undefined ||
      !source ||
      !target ||
      source.hidden ||
      target.hidden ||
      Boolean(source.pinned) !== Boolean(target.pinned) ||
      path === active.sourcePath
    ) {
      active.targetPath = undefined;
      active.edge = undefined;
    } else {
      const rect = header.getBoundingClientRect();
      active.targetPath = path;
      active.edge = active.x < rect.left + rect.width / 2 ? "before" : "after";
    }
    setVisual((previous) =>
      previous?.sourcePath === active.sourcePath &&
      previous?.targetPath === active.targetPath &&
      previous?.edge === active.edge
        ? previous
        : {
            sourcePath: active.sourcePath,
            targetPath: active.targetPath,
            edge: active.edge,
          },
    );
  };

  const scrollStep = (active: Session) => {
    if (session.current !== active || !active.active) return;
    active.frame = undefined;
    const scroll = current.current.scrollRef.current;
    if (!scroll) return;
    const rect = scroll.getBoundingClientRect();
    const row = active.header.getBoundingClientRect();
    if (
      active.y < row.top ||
      active.y > row.bottom ||
      active.x < rect.left ||
      active.x > rect.right
    )
      return;
    const distance =
      active.x - rect.left < 36
        ? active.x - rect.left - 36
        : rect.right - active.x < 36
          ? 36 - (rect.right - active.x)
          : 0;
    if (!distance) return;
    const previous = scroll.scrollLeft;
    scroll.scrollLeft +=
      Math.sign(distance) * Math.max(2, Math.min(18, Math.abs(distance) / 2));
    if (scroll.scrollLeft === previous) return;
    chooseTarget(active);
    active.frame = requestAnimationFrame(() => scrollStep(active));
  };

  const begin = (path: string, event: PointerEvent<HTMLElement>) => {
    if (
      !event.isPrimary ||
      event.button !== 0 ||
      (event.target instanceof Element &&
        event.target.closest(".column-resizer,[data-column-control]"))
    )
      return;
    const header =
      event.currentTarget.closest<HTMLElement>(".log-table-header");
    if (
      !header ||
      current.current.columns.find((column) => column.path === path)?.hidden
    )
      return;
    finish(false);
    suppressClick.current = false;
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.focus({ preventScroll: true });
    event.currentTarget.setPointerCapture(event.pointerId);
    session.current = {
      pointerId: event.pointerId,
      element: event.currentTarget,
      header,
      sourcePath: path,
      startX: event.clientX,
      startY: event.clientY,
      x: event.clientX,
      y: event.clientY,
      active: false,
    };
  };
  const move = (event: PointerEvent<HTMLElement>) => {
    const active = session.current;
    if (!active || event.pointerId !== active.pointerId) return;
    active.x = event.clientX;
    active.y = event.clientY;
    if (
      !active.active &&
      Math.hypot(active.x - active.startX, active.y - active.startY) < 6
    )
      return;
    event.preventDefault();
    event.stopPropagation();
    if (!active.active) {
      active.active = true;
      active.element.ownerDocument.defaultView
        ?.getSelection()
        ?.removeAllRanges();
      active.element.ownerDocument.body.classList.add("reordering-columns");
    }
    chooseTarget(active);
    if (active.frame === undefined) scrollStep(active);
  };
  return {
    visual,
    begin,
    move,
    end(event: PointerEvent<HTMLElement>) {
      if (session.current?.pointerId !== event.pointerId) return;
      if (session.current.active) {
        session.current.x = event.clientX;
        session.current.y = event.clientY;
        chooseTarget(session.current);
      }
      finish(true);
    },
    cancel(event?: PointerEvent<HTMLElement>) {
      if (!event || session.current?.pointerId === event.pointerId)
        finish(false);
    },
    onClickCapture(event: MouseEvent<HTMLElement>) {
      if (!suppressClick.current || event.detail === 0) return;
      suppressClick.current = false;
      event.preventDefault();
      event.stopPropagation();
    },
  };
}
