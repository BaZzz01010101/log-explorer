import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { IconChevronLeft, IconChevronRight } from "@tabler/icons-react";
import {
  calendarMonthDays,
  rangeInputFields,
  shiftCalendarDay,
  shiftCalendarMonth,
} from "../time-range";

interface Props {
  month: string;
  start: string;
  end: string;
  anchor: string | null;
  timezone?: "local" | "utc";
  onMonthChange(month: string): void;
  onSelect(day: string): void;
}

export function RangeCalendar({
  month,
  start,
  end,
  anchor,
  timezone = "local",
  onMonthChange,
  onSelect,
}: Props) {
  const [hover, setHover] = useState<string | null>(null);
  const [focused, setFocused] = useState(start || month);
  const root = useRef<HTMLDivElement>(null);
  const current = useRef({ month, onMonthChange });
  current.current = { month, onMonthChange };
  const focusRequested = useRef(false);
  const secondMonth = shiftCalendarMonth(month, 1);
  const today = rangeInputFields(
    new Date().toISOString(),
    timezone,
  ).date.replaceAll("/", "-");
  const preview = anchor
    ? [anchor, hover ?? anchor].sort()
    : [start, end].sort();
  useEffect(() => {
    const element = root.current;
    if (!element) return;
    let accumulated = 0,
      lastWheel = 0;
    const wheel = (event: WheelEvent) => {
      if (
        !event.deltaY ||
        !Number.isFinite(event.deltaY) ||
        event.ctrlKey ||
        event.metaKey ||
        event.altKey ||
        Math.abs(event.deltaX) > Math.abs(event.deltaY)
      )
        return;
      // Keep the popover still; the wheel belongs to month navigation here.
      event.preventDefault();
      const delta =
        event.deltaY *
        (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? 240 : 1);
      if (
        event.timeStamp - lastWheel > 250 ||
        (accumulated && Math.sign(accumulated) !== Math.sign(delta))
      )
        accumulated = 0;
      lastWheel = event.timeStamp;
      accumulated += delta;
      // Small trackpad packets accumulate instead of racing through months.
      if (Math.abs(accumulated) < 40) return;
      const step = Math.sign(accumulated);
      accumulated = 0;
      const next = shiftCalendarMonth(current.current.month, step);
      if (next < "1970-01-01" || next > "9999-11-01") return;
      current.current.month = next;
      setHover(null);
      current.current.onMonthChange(next);
    };
    element.addEventListener("wheel", wheel, { passive: false });
    return () => element.removeEventListener("wheel", wheel);
  }, []);
  useLayoutEffect(() => {
    if (!focusRequested.current) return;
    root.current
      ?.querySelector<HTMLButtonElement>(
        '[data-calendar-day="' + focused + '"]',
      )
      ?.focus();
    focusRequested.current = false;
  }, [focused, month]);
  const moveFocus = (day: string, key: string) => {
    let next: string;
    if (key === "PageUp" || key === "PageDown")
      next = shiftCalendarMonth(day, key === "PageUp" ? -1 : 1);
    else {
      const weekday = new Date(day + "T00:00:00Z").getUTCDay();
      const delta =
        key === "ArrowLeft"
          ? -1
          : key === "ArrowRight"
            ? 1
            : key === "ArrowUp"
              ? -7
              : key === "ArrowDown"
                ? 7
                : key === "Home"
                  ? -weekday
                  : 6 - weekday;
      next = shiftCalendarDay(day, delta);
    }
    if (next < "1970-01-01") return;
    focusRequested.current = true;
    if (next.slice(0, 7) < month.slice(0, 7))
      onMonthChange(next.slice(0, 7) + "-01");
    else if (next.slice(0, 7) > secondMonth.slice(0, 7))
      onMonthChange(shiftCalendarMonth(next.slice(0, 7) + "-01", -1));
    setFocused(next);
  };
  return (
    <div
      className="range-calendar"
      ref={root}
      onMouseLeave={() => setHover(null)}
    >
      <div className="calendar-month-navigation">
        <button
          type="button"
          className="calendar-navigation-button"
          aria-label="Previous month"
          disabled={month <= "1970-01-01"}
          onClick={() => onMonthChange(shiftCalendarMonth(month, -1))}
        >
          <IconChevronLeft size={18} />
        </button>
        <button
          type="button"
          className="calendar-today-button"
          onClick={() => {
            const today = rangeInputFields(
              new Date().toISOString(),
              timezone,
            ).date.replaceAll("/", "-");
            setHover(null);
            setFocused(today);
            onMonthChange(today.slice(0, 7) + "-01");
          }}
        >
          Today
        </button>
        <button
          type="button"
          className="calendar-navigation-button"
          aria-label="Next month"
          disabled={month >= "9999-11-01"}
          onClick={() => onMonthChange(shiftCalendarMonth(month, 1))}
        >
          <IconChevronRight size={18} />
        </button>
      </div>
      <div className="calendar-months">
        {[month, secondMonth].map((first) => {
          const title = new Intl.DateTimeFormat(undefined, {
            month: "long",
            year: "numeric",
            timeZone: "UTC",
          }).format(new Date(first + "T00:00:00Z"));
          const days = calendarMonthDays(first);
          const focusDay =
            days.includes(focused) && focused.slice(0, 7) === first.slice(0, 7)
              ? focused
              : first;
          return (
            <section className="calendar-month" key={first} aria-label={title}>
              <h3>{title}</h3>
              <div className="calendar-weekdays" aria-hidden="true">
                {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map(
                  (label) => (
                    <span key={label}>{label}</span>
                  ),
                )}
              </div>
              <div
                className="calendar-days"
                role="grid"
                aria-label={title}
                aria-colcount={7}
              >
                {Array.from({ length: 6 }, (_, week) => (
                  <div role="row" className="calendar-week" key={week}>
                    {days.slice(week * 7, week * 7 + 7).map((day, index) =>
                      day.slice(0, 7) !== first.slice(0, 7) ? (
                        <span key={index} aria-hidden="true" />
                      ) : (
                        <div
                          role="gridcell"
                          aria-colindex={index + 1}
                          key={day}
                          aria-selected={Boolean(
                            preview[0] &&
                            day >= preview[0] &&
                            day <= preview[1],
                          )}
                        >
                          <button
                            type="button"
                            data-calendar-day={day}
                            aria-current={day === today ? "date" : undefined}
                            aria-label={day}
                            aria-pressed={
                              day === preview[0] || day === preview[1]
                            }
                            tabIndex={day === focusDay ? 0 : -1}
                            className={
                              "calendar-day" +
                              (preview[0] &&
                              day >= preview[0] &&
                              day <= preview[1]
                                ? " is-in-range"
                                : "") +
                              (day === preview[0] ? " is-range-start" : "") +
                              (day === preview[1] ? " is-range-end" : "") +
                              (day === today ? " is-today" : "")
                            }
                            onFocus={() => setFocused(day)}
                            onMouseEnter={() => anchor && setHover(day)}
                            onClick={() => {
                              setHover(null);
                              onSelect(day);
                            }}
                            onKeyDown={(event) => {
                              if (
                                [
                                  "ArrowLeft",
                                  "ArrowRight",
                                  "ArrowUp",
                                  "ArrowDown",
                                  "Home",
                                  "End",
                                  "PageUp",
                                  "PageDown",
                                ].includes(event.key)
                              ) {
                                event.preventDefault();
                                moveFocus(day, event.key);
                              }
                            }}
                          >
                            {Number(day.slice(8))}
                          </button>
                        </div>
                      ),
                    )}
                  </div>
                ))}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}
