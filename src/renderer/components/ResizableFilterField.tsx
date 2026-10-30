import { useEffect, useRef, useState, type ReactNode } from "react";

export function ResizableFilterField({
  label,
  width,
  defaultWidth,
  onResize,
  children,
}: {
  label: string;
  width?: number;
  defaultWidth: number;
  onResize(width: number): void;
  children: ReactNode;
}) {
  const root = useRef<HTMLDivElement>(null);
  const session = useRef<{
    id: number;
    x: number;
    width: number;
    latest: number;
    target: HTMLDivElement;
    cleanup(): void;
  } | null>(null);
  const [draft, setDraft] = useState<number>();
  const callback = useRef(onResize);
  callback.current = onResize;
  const clamp = (value: number) =>
    Math.max(
      140,
      Math.min(
        2400,
        (root.current?.parentElement?.clientWidth ?? 2424) - 24,
        value,
      ),
    );
  const finish = (save: boolean, update = true) => {
    const active = session.current;
    if (!active) return;
    session.current = null;
    active.cleanup();
    if (active.target.hasPointerCapture(active.id))
      active.target.releasePointerCapture(active.id);
    if (update) {
      if (save) callback.current(active.latest);
      setDraft(undefined);
    }
  };
  useEffect(() => () => finish(false, false), []);
  return (
    <div
      className="viewer-edit-field"
      ref={root}
      style={{
        flexBasis: draft ?? width ?? defaultWidth,
        width: draft ?? width ?? defaultWidth,
      }}
    >
      {children}
      <div
        className="viewer-field-resizer"
        role="separator"
        aria-label={label}
        aria-orientation="vertical"
        aria-valuemin={140}
        aria-valuemax={2400}
        aria-valuenow={Math.round(draft ?? width ?? defaultWidth)}
        tabIndex={0}
        onPointerDown={(event) => {
          if (event.button !== 0 || session.current) return;
          event.preventDefault();
          event.stopPropagation();
          const target = event.currentTarget,
            doc = target.ownerDocument;
          const oldSelection = doc.documentElement.style.userSelect,
            oldCursor = doc.documentElement.style.cursor;
          doc.documentElement.style.userSelect = "none";
          doc.documentElement.style.cursor = "col-resize";
          const cancel = () => finish(false);
          const escape = (key: KeyboardEvent) => {
            if (key.key === "Escape") {
              key.preventDefault();
              key.stopPropagation();
              cancel();
            }
          };
          doc.defaultView?.addEventListener("blur", cancel);
          doc.defaultView?.addEventListener("keydown", escape, true);
          const current = root.current!.getBoundingClientRect().width;
          session.current = {
            id: event.pointerId,
            x: event.clientX,
            width: current,
            latest: current,
            target,
            cleanup() {
              doc.documentElement.style.userSelect = oldSelection;
              doc.documentElement.style.cursor = oldCursor;
              doc.defaultView?.removeEventListener("blur", cancel);
              doc.defaultView?.removeEventListener("keydown", escape, true);
            },
          };
          try {
            target.setPointerCapture(event.pointerId);
          } catch {
            finish(false);
          }
        }}
        onPointerMove={(event) => {
          const active = session.current;
          if (!active || active.id !== event.pointerId) return;
          event.preventDefault();
          active.latest = clamp(active.width + event.clientX - active.x);
          setDraft(active.latest);
        }}
        onPointerUp={(event) => {
          const active = session.current;
          if (!active || active.id !== event.pointerId) return;
          active.latest = clamp(active.width + event.clientX - active.x);
          finish(true);
        }}
        onPointerCancel={() => finish(false)}
        onLostPointerCapture={() => finish(false)}
        onDoubleClick={() => onResize(defaultWidth)}
        onKeyDown={(event) => {
          if (!["ArrowLeft", "ArrowRight", "Home"].includes(event.key)) return;
          event.preventDefault();
          event.stopPropagation();
          onResize(
            event.key === "Home"
              ? defaultWidth
              : clamp(
                  (root.current?.getBoundingClientRect().width ??
                    defaultWidth) + (event.key === "ArrowRight" ? 20 : -20),
                ),
          );
        }}
        data-tooltip="Drag to resize · Arrow keys adjust · Double-click resets"
      />
    </div>
  );
}
