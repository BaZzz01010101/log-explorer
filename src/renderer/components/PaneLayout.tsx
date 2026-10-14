import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";
import type { PaneLayout as Layout } from "../../shared/contracts";
import { clampRatio } from "../../shared/pane-layout";
import "./pane-layout.css";

interface Props {
  layout: Layout;
  renderPane(paneId: string): ReactNode;
  onResize(path: string, ratio: number): void;
}
interface NodeProps extends Props {
  path: string;
}
interface ResizeSession {
  pointerId: number;
  path: string;
  start: number;
  available: number;
  original: number;
  latest: number;
  target: HTMLDivElement;
  cleanup(): void;
}

export function PaneLayoutView(props: Props) {
  return (
    <div className="pane-layout-root">
      <LayoutNode {...props} path="" />
    </div>
  );
}

function LayoutNode({ layout, path, renderPane, onResize }: NodeProps) {
  if (layout.type === "leaf")
    return (
      <div
        className="pane-layout-leaf"
        data-layout-pane={layout.paneId}
        key={layout.paneId}
      >
        {renderPane(layout.paneId)}
      </div>
    );
  return (
    <SplitBranch
      layout={layout}
      path={path}
      renderPane={renderPane}
      onResize={onResize}
    />
  );
}

function SplitBranch({
  layout,
  path,
  renderPane,
  onResize,
}: NodeProps & { layout: Extract<Layout, { type: "split" }> }) {
  const container = useRef<HTMLDivElement>(null);
  const session = useRef<ResizeSession | null>(null);
  const resizeCallback = useRef(onResize);
  resizeCallback.current = onResize;
  const [draft, setDraft] = useState<number | null>(null);
  const horizontal = layout.axis === "horizontal";
  const ratio = clampRatio(draft ?? layout.ratio);

  const finish = useCallback((commit: boolean, update = true) => {
    const active = session.current;
    if (!active) return;
    session.current = null;
    active.cleanup();
    if (active.target.hasPointerCapture(active.pointerId))
      active.target.releasePointerCapture(active.pointerId);
    if (update) setDraft(null);
    if (commit && active.latest !== active.original)
      resizeCallback.current(active.path, active.latest);
  }, []);

  useEffect(() => () => finish(false, false), [finish]);
  useEffect(() => {
    finish(false);
  }, [layout.axis, path, finish]);

  const move = (event: ReactPointerEvent<HTMLDivElement>) => {
    const active = session.current;
    if (!active || active.pointerId !== event.pointerId) return;
    event.preventDefault();
    event.stopPropagation();
    active.latest = clampRatio(
      active.original +
        ((horizontal ? event.clientX : event.clientY) - active.start) /
          active.available,
    );
    setDraft(active.latest);
  };

  const begin = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    const rect = container.current?.getBoundingClientRect();
    if (!rect || (horizontal ? rect.width : rect.height) <= 6) return;
    event.preventDefault();
    event.stopPropagation();
    finish(false);
    const target = event.currentTarget;
    target.focus({ preventScroll: true });
    const doc = target.ownerDocument;
    const previousSelection = doc.documentElement.style.userSelect;
    const previousCursor = doc.documentElement.style.cursor;
    doc.documentElement.style.userSelect = "none";
    doc.documentElement.style.cursor = horizontal ? "col-resize" : "row-resize";
    doc.defaultView?.getSelection()?.removeAllRanges();
    const cancelOnBlur = () => finish(false);
    doc.defaultView?.addEventListener("blur", cancelOnBlur);
    session.current = {
      pointerId: event.pointerId,
      path,
      start: horizontal ? event.clientX : event.clientY,
      available: (horizontal ? rect.width : rect.height) - 6,
      original: ratio,
      latest: ratio,
      target,
      cleanup() {
        doc.documentElement.style.userSelect = previousSelection;
        doc.documentElement.style.cursor = previousCursor;
        doc.defaultView?.removeEventListener("blur", cancelOnBlur);
      },
    };
    setDraft(ratio);
    target.setPointerCapture(event.pointerId);
  };

  return (
    <div
      ref={container}
      className={`pane-layout-split pane-layout-${layout.axis}${draft !== null ? " is-resizing" : ""}`}
      data-layout-path={path}
    >
      <div
        className="pane-layout-child"
        style={{ flex: `${ratio} 1 0%` }}
        key="first"
      >
        <LayoutNode
          layout={layout.first}
          path={`${path}0`}
          renderPane={renderPane}
          onResize={onResize}
        />
      </div>
      <div
        className="pane-layout-divider"
        role="separator"
        tabIndex={0}
        draggable={false}
        aria-label={`Resize panes ${horizontal ? "horizontally" : "vertically"}`}
        aria-orientation={horizontal ? "vertical" : "horizontal"}
        aria-valuemin={20}
        aria-valuemax={80}
        aria-valuenow={Math.round(ratio * 100)}
        aria-valuetext={`${Math.round(ratio * 100)}%`}
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
          if (session.current?.pointerId === event.pointerId) finish(true);
        }}
        onDragStart={(event) => event.preventDefault()}
        onDoubleClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          finish(false);
          onResize(path, 0.5);
        }}
        onKeyDown={(event) => {
          if (event.key === "Escape" && session.current) {
            event.preventDefault();
            event.stopPropagation();
            finish(false);
            return;
          }
          const delta = horizontal
            ? event.key === "ArrowRight"
              ? 0.02
              : event.key === "ArrowLeft"
                ? -0.02
                : 0
            : event.key === "ArrowDown"
              ? 0.02
              : event.key === "ArrowUp"
                ? -0.02
                : 0;
          if (!delta && event.key !== "Home") return;
          event.preventDefault();
          event.stopPropagation();
          finish(false);
          onResize(
            path,
            event.key === "Home" ? 0.5 : clampRatio(ratio + delta),
          );
        }}
      />
      <div
        className="pane-layout-child"
        style={{ flex: `${1 - ratio} 1 0%` }}
        key="second"
      >
        <LayoutNode
          layout={layout.second}
          path={`${path}1`}
          renderPane={renderPane}
          onResize={onResize}
        />
      </div>
    </div>
  );
}
