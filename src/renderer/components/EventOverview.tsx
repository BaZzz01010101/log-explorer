import {
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type RefObject,
} from "react";
import {
  QUICK_MAP_COLOR,
  SELECTION_MAP_COLOR,
  buildOverviewMarks,
  rowMatchesMark,
  type OverviewMark,
  type OverviewRow,
} from "../event-overview";
import { createOverviewColorResolver } from "../overview-colors";

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
  const overviewRef = useRef<HTMLDivElement>(null);
  const [palette, setPalette] = useState(new Map<string, string>());
  const colors = useMemo(
    () => [
      ...new Set([
        QUICK_MAP_COLOR,
        SELECTION_MAP_COLOR,
        ...rows.flatMap((row) => row.colors),
      ]),
    ],
    [rows],
  );
  useLayoutEffect(() => {
    const overview = overviewRef.current;
    if (!overview) return;
    const refresh = () => {
      const resolve = createOverviewColorResolver(overview);
      const next = new Map(colors.map((color) => [color, resolve(color)]));
      setPalette((previous) =>
        previous.size === next.size &&
        [...next].every(([color, value]) => previous.get(color) === value)
          ? previous
          : next,
      );
    };
    refresh();
    const observer = new MutationObserver(refresh);
    for (
      let ancestor: HTMLElement | null = overview;
      ancestor;
      ancestor = ancestor.parentElement
    )
      observer.observe(ancestor, {
        attributes: true,
        attributeFilter: [
          "class",
          "style",
          "data-mantine-color-scheme",
          "data-theme",
        ],
      });
    return () => observer.disconnect();
  }, [colors]);
  // Highlight colors are strengthened for the narrow lanes; the fixed
  // severity colors are already strong.
  const mapColor = (color: string, mark: OverviewMark) =>
    mark.kind === "severity" ? color : (palette.get(color) ?? color);
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
  const jump = (mark: OverviewMark, y: number) => {
    let selected = mark.index,
      nearest = Infinity;
    for (let index = mark.index; index <= mark.endIndex; index++) {
      const row = rows[index];
      if (!row || !rowMatchesMark(row, mark)) continue;
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
      ref={overviewRef}
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
      {(["quick", "highlights"] as const).map((lane) => (
        <div
          key={lane}
          className={`event-overview-lane overview-${lane}`}
          data-tooltip={
            lane === "quick"
              ? "Highlight text matches and selected events"
              : "Highlights from Settings, warnings, errors and fatal events"
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
            jump(nearest, y);
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
              data-kind={mark.kind}
              aria-label={`Jump to ${markLabel(mark).toLowerCase()} event ${mark.index + 1}`}
              data-tooltip={`${markLabel(mark)} · event ${mark.index + 1} · Click to jump`}
              style={{
                top: mark.top,
                height: mark.height,
                background:
                  mark.colors.length === 1
                    ? mapColor(mark.colors[0], mark)
                    : `linear-gradient(to right, ${mark.colors.flatMap((color, index) => [`${mapColor(color, mark)} ${(index * 100) / mark.colors.length}%`, `${mapColor(color, mark)} ${((index + 1) * 100) / mark.colors.length}%`]).join(", ")})`,
              }}
              onClick={(event) => {
                event.stopPropagation();
                jump(
                  mark,
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

function markLabel(mark: OverviewMark): string {
  if (mark.kind === "quick")
    return mark.colors.includes(SELECTION_MAP_COLOR)
      ? "Highlight text, selected"
      : "Highlight text";
  if (mark.kind === "selection") return "Selected";
  if (mark.kind === "highlight") return "Highlight";
  return mark.level.toUpperCase();
}
