import {
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import {
  buildInspectorMessageMarks,
  nearestInspectorMessageMatch,
  type InspectorMessageMatch,
  type InspectorMessageOrigin,
} from "../inspector-message-overview";
import { createOverviewColorResolver } from "../overview-colors";
import "./inspector-message.css";

const origins = ["server", "local", "manual", "profile"] as const;
const labels: Record<InspectorMessageOrigin, string> = {
  server: "Server filter matches",
  local: "Local filter matches",
  manual: "Manual text matches",
  profile: "Profile highlights",
};
interface MessageGeometry {
  eventId?: string;
  height: number;
  total: number;
  matches: InspectorMessageMatch[];
}

export function InspectorMessage({
  children,
  className,
  style,
  eventId,
}: {
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
  eventId?: string;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const overviewRef = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const overview = overviewRef.current;
    if (!overview) return;
    // React delegates wheel listeners passively; a native listener prevents ancestor scrolling.
    const wheel = (event: WheelEvent) => {
      const scroll = scrollRef.current;
      if (scroll) {
        const unit =
          event.deltaMode === 1
            ? 16
            : event.deltaMode === 2
              ? scroll.clientHeight
              : 1;
        scroll.scrollTop += event.deltaY * unit;
        scroll.scrollLeft += event.deltaX * unit;
      }
      event.preventDefault();
      event.stopPropagation();
    };
    overview.addEventListener("wheel", wheel, { passive: false });
    return () => overview.removeEventListener("wheel", wheel);
  }, []);
  const [geometry, setGeometry] = useState<MessageGeometry>({
    height: 0,
    total: 0,
    matches: [],
  });
  useLayoutEffect(() => {
    const scroll = scrollRef.current,
      body = bodyRef.current;
    if (!scroll || !body) return;
    let disposed = false,
      frame = 0;
    const schedule = () => {
      if (disposed) return;
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(begin);
    };
    const begin = () => {
      frame = 0;
      if (disposed) return;
      const mapColor = createOverviewColorResolver(overviewRef.current);
      const elements = body.querySelectorAll<HTMLElement>(
        "mark[data-highlight-origins], .profile-highlight-text, .json-match-indicator i[data-match-origin]",
      );
      const matches: InspectorMessageMatch[] = [];
      let cursor = 0;
      let fragment:
        | {
            rects: DOMRectList;
            index: number;
            offset: number;
            horizontalOffset: number;
            colors: { origin: InspectorMessageOrigin; color: string }[];
          }
        | undefined;
      const batch = () => {
        frame = 0;
        if (disposed) return;
        let nodes = 0,
          rectangles = 0;
        // Bound layout reads and processing per frame, including a single long wrapped mark.
        while (
          (fragment || cursor < elements.length) &&
          nodes < 200 &&
          rectangles < 1000
        ) {
          if (!fragment) {
            const element = elements[cursor++];
            nodes++;
            const markedOrigins = (
              element.dataset.highlightOrigins ??
              element.dataset.matchOrigin ??
              ""
            ).split(/\s+/);
            const colors: { origin: InspectorMessageOrigin; color: string }[] =
              [];
            const computed = getComputedStyle(element);
            for (const origin of origins) {
              if (origin === "profile") {
                if (
                  element.classList.contains("profile-highlight-text") ||
                  markedOrigins.includes(origin)
                ) {
                  const background = computed.backgroundColor;
                  const transparent =
                    background === "transparent" ||
                    /^rgba\(.+,\s*0(?:\.0+)?\s*\)$/.test(background) ||
                    /\/\s*0(?:\.0+)?%?\s*\)$/.test(background);
                  colors.push({
                    origin,
                    color: mapColor(transparent ? computed.color : background),
                  });
                }
              } else if (markedOrigins.includes(origin))
                colors.push({
                  origin,
                  color: mapColor(
                    computed
                      .getPropertyValue(`--filter-match-${origin}`)
                      .trim() ||
                      `var(--mantine-color-${origin === "server" ? "blue" : origin === "local" ? "green" : "yellow"}-6)`,
                  ),
                });
            }
            fragment = {
              rects: element.getClientRects(),
              index: 0,
              colors,
              offset:
                scroll.scrollTop -
                scroll.getBoundingClientRect().top -
                scroll.clientTop,
              horizontalOffset:
                scroll.scrollLeft -
                scroll.getBoundingClientRect().left -
                scroll.clientLeft,
            };
          }
          while (fragment.index < fragment.rects.length && rectangles < 1000) {
            const rect = fragment.rects[fragment.index++];
            rectangles++;
            if (rect.width <= 0 || rect.height <= 0) continue;
            const start = rect.top + fragment.offset;
            for (const { origin, color } of fragment.colors)
              matches.push({
                origin,
                color,
                start,
                end: start + rect.height,
                left: rect.left + fragment.horizontalOffset,
                right: rect.left + fragment.horizontalOffset + rect.width,
              });
          }
          if (fragment.index >= fragment.rects.length) fragment = undefined;
        }
        if (fragment || cursor < elements.length)
          frame = requestAnimationFrame(batch);
        else
          setGeometry({
            eventId,
            height: scroll.clientHeight,
            total: scroll.scrollHeight,
            matches,
          });
      };
      batch();
    };
    const resize = new ResizeObserver(schedule);
    resize.observe(scroll);
    resize.observe(body);
    const mutation = new MutationObserver(schedule);
    mutation.observe(body, {
      subtree: true,
      childList: true,
      characterData: true,
      attributes: true,
      attributeFilter: [
        "class",
        "style",
        "hidden",
        "data-highlight-origins",
        "data-match-origin",
      ],
    });
    // Theme/profile colors can change on any ancestor without changing the message DOM.
    for (
      let ancestor: HTMLElement | null = scroll;
      ancestor;
      ancestor = ancestor.parentElement
    ) {
      mutation.observe(ancestor, {
        attributes: true,
        attributeFilter: ["class", "style", "data-mantine-color-scheme"],
      });
    }
    const fonts = scroll.ownerDocument?.fonts;
    fonts?.addEventListener("loadingdone", schedule);
    schedule();
    return () => {
      disposed = true;
      cancelAnimationFrame(frame);
      resize.disconnect();
      mutation.disconnect();
      fonts?.removeEventListener("loadingdone", schedule);
    };
  }, [children, eventId, className, style]);
  // Never expose geometry from a previously selected event, even before layout effects run.
  const current = geometry.eventId === eventId ? geometry : undefined;
  const marks = useMemo(
    () =>
      current
        ? buildInspectorMessageMarks(
            current.matches,
            current.total,
            current.height,
          )
        : [],
    [current],
  );
  return (
    <div className="inspector-message inspector-message-layout">
      <div
        ref={scrollRef}
        className={`inspector-content${className ? ` ${className}` : ""}`}
        style={style}
      >
        <div ref={bodyRef} className="inspector-message-body">
          {children}
        </div>
      </div>
      <div
        ref={overviewRef}
        className="inspector-message-overview"
        role="group"
        aria-label="Message scrollbar match overview"
        style={{ height: current?.height ?? 0 }}
      >
        {origins.map((origin) => (
          <div
            key={origin}
            className="inspector-message-lane"
            data-match-origin={origin}
            data-tooltip={`${labels[origin]} · Click to jump`}
            onMouseDown={(event) => event.preventDefault()}
            onClick={(event) => {
              const scroll = scrollRef.current;
              if (!scroll || !current) return;
              const match = nearestInspectorMessageMatch(
                current.matches,
                origin,
                event.clientY - event.currentTarget.getBoundingClientRect().top,
                current.total,
                current.height,
              );
              if (match) {
                scroll.scrollTop = Math.max(
                  0,
                  Math.min(
                    scroll.scrollHeight - scroll.clientHeight,
                    match.start -
                      (scroll.clientHeight - (match.end - match.start)) / 2,
                  ),
                );
                if (
                  match.left !== undefined &&
                  match.right !== undefined &&
                  (match.left < scroll.scrollLeft ||
                    match.right > scroll.scrollLeft + scroll.clientWidth)
                ) {
                  scroll.scrollLeft = Math.max(
                    0,
                    Math.min(
                      scroll.scrollWidth - scroll.clientWidth,
                      (match.left + match.right - scroll.clientWidth) / 2,
                    ),
                  );
                }
              }
            }}
          >
            {marks
              .filter((mark) => mark.origin === origin)
              .map((mark) => (
                <button
                  key={mark.top}
                  type="button"
                  tabIndex={-1}
                  className="inspector-message-mark"
                  data-match-origin={origin}
                  data-content-start={mark.contentStart}
                  data-content-end={mark.contentEnd}
                  aria-label={`Jump to ${labels[origin].toLowerCase()}`}
                  data-tooltip={`${labels[origin]} · Click to jump`}
                  style={{
                    top: mark.top,
                    height: mark.height,
                    background:
                      mark.colors.length === 1
                        ? mark.colors[0]
                        : `linear-gradient(to right, ${mark.colors.flatMap((color, index) => [`${color} ${(index * 100) / mark.colors.length}%`, `${color} ${((index + 1) * 100) / mark.colors.length}%`]).join(", ")})`,
                  }}
                />
              ))}
          </div>
        ))}
      </div>
    </div>
  );
}
