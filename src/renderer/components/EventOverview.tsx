import { useLayoutEffect, useMemo, useState, type RefObject } from "react";
import {
  buildOverviewMarks,
  type OverviewRow,
  type OverviewMark,
} from "../event-overview";

export function EventOverview({
  rows,
  measurements,
  totalSize,
  scrollRef,
  onNavigate,
}: {
  rows: OverviewRow[];
  measurements: readonly { start: number; size: number }[];
  totalSize: number;
  scrollRef: RefObject<HTMLDivElement | null>;
  onNavigate(index: number): void;
}) {
  const [geometry, setGeometry] = useState({ height: 0, total: 0, offset: 0 });
  useLayoutEffect(() => {
    const scroll = scrollRef.current;
    if (!scroll) return;
    const content = scroll.querySelector<HTMLElement>(".virtual-events");
    const measure = () => {
      const next = {
        height: scroll.clientHeight,
        total: scroll.scrollHeight,
        offset: content?.offsetTop ?? 0,
      };
      setGeometry((old) =>
        old.height === next.height &&
        old.total === next.total &&
        old.offset === next.offset
          ? old
          : next,
      );
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(scroll);
    if (content) observer.observe(content);
    return () => observer.disconnect();
  }, [scrollRef, totalSize, rows.length, measurements]);
  const marks = useMemo(
    () =>
      buildOverviewMarks(
        rows,
        measurements.map((item) => ({
          ...item,
          start: item.start + geometry.offset,
        })),
        geometry.total,
        geometry.height,
      ),
    [rows, measurements, geometry],
  );
  const jump = (
    mark: OverviewMark,
    lane: "severity" | "highlights",
    y: number,
  ) => {
    let selected = mark.index,
      nearest = Infinity;
    for (let index = mark.index; index <= mark.endIndex; index++) {
      const row = rows[index];
      if (
        !row ||
        (lane === "severity"
          ? row.level !== mark.level
          : !row.colors.some((color) => mark.colors.includes(color)))
      )
        continue;
      const item = measurements[index];
      const from = item
        ? ((item.start + geometry.offset) / geometry.total) * geometry.height
        : (index / rows.length) * geometry.height;
      const to = item
        ? ((item.start + item.size + geometry.offset) / geometry.total) *
          geometry.height
        : ((index + 1) / rows.length) * geometry.height;
      const distance = Math.max(from - y, y - to, 0);
      if (distance < nearest) {
        nearest = distance;
        selected = index;
      }
      if (!distance) break;
    }
    onNavigate(selected);
    scrollRef.current?.focus({ preventScroll: true });
  };
  return (
    <div
      className="event-overview"
      role="group"
      aria-label="Event scrollbar overview"
      style={{ height: geometry.height }}
      onWheel={(event) => {
        const scroll = scrollRef.current;
        if (scroll) {
          scroll.scrollTop += event.deltaY;
          scroll.scrollLeft += event.deltaX;
        }
        event.stopPropagation();
      }}
    >
      {(["severity", "highlights"] as const).map((lane) => (
        <div
          key={lane}
          className={`event-overview-lane overview-${lane}`}
          data-tooltip={
            lane === "severity"
              ? "Warnings, errors and fatal events"
              : "Highlighted events"
          }
          onClick={(event) => {
            if (!marks[lane].length) return;
            const y =
              event.clientY - event.currentTarget.getBoundingClientRect().top;
            const nearest = marks[lane].reduce((a, b) =>
              Math.max(a.top - y, y - a.top - a.height, 0) <=
              Math.max(b.top - y, y - b.top - b.height, 0)
                ? a
                : b,
            );
            jump(nearest, lane, y);
          }}
        >
          {marks[lane].map((mark) => (
            <button
              key={mark.top}
              type="button"
              tabIndex={-1}
              className="event-overview-mark"
              data-event-id={mark.id}
              data-event-index={mark.index}
              data-event-end-index={mark.endIndex}
              data-level={mark.level}
              aria-label={`Jump to ${lane === "severity" ? mark.level.toUpperCase() : "highlighted"} event ${mark.index + 1}`}
              data-tooltip={`${lane === "severity" ? mark.level.toUpperCase() : "Highlight"} · event ${mark.index + 1} · Click to jump`}
              style={{
                top: mark.top,
                height: mark.height,
                background:
                  mark.colors.length === 1
                    ? mark.colors[0]
                    : `linear-gradient(to right, ${mark.colors.flatMap((color, index) => [`${color} ${(index * 100) / mark.colors.length}%`, `${color} ${((index + 1) * 100) / mark.colors.length}%`]).join(", ")})`,
              }}
              onClick={(event) => {
                event.stopPropagation();
                jump(
                  mark,
                  lane,
                  event.clientY -
                    event.currentTarget
                      .closest(".event-overview")!
                      .getBoundingClientRect().top,
                );
              }}
            />
          ))}
        </div>
      ))}
    </div>
  );
}
