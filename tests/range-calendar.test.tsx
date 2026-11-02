import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { useState } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { RangeCalendar } from "../src/renderer/components/RangeCalendar";

let renderer: ReactTestRenderer | undefined;
const select = vi.fn(),
  focused = vi.fn();
const listeners = new Map<string, EventListener>();
const calendarNode = () => ({
  addEventListener: (name: string, listener: EventListener) =>
    listeners.set(name, listener),
  removeEventListener: (name: string) => listeners.delete(name),
  querySelector: (selector: string) => ({ focus: () => focused(selector) }),
});
function Harness({
  anchor = null,
  initialMonth = "2026-09-01",
}: {
  anchor?: string | null;
  initialMonth?: string;
}) {
  const [month, setMonth] = useState(initialMonth);
  return (
    <RangeCalendar
      month={month}
      start="2026-09-10"
      end={anchor ? "2026-09-10" : "2026-10-13"}
      anchor={anchor}
      onMonthChange={setMonth}
      onSelect={select}
    />
  );
}
const day = (date: string) =>
  renderer!.root.findByProps({ "data-calendar-day": date });
beforeEach(() => {
  select.mockClear();
  focused.mockClear();
  listeners.clear();
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const original = console.error.bind(console);
  vi.spyOn(console, "error").mockImplementation((...args) => {
    if (!String(args[0]).startsWith("react-test-renderer is deprecated"))
      original(...args);
  });
});
afterEach(async () => {
  await act(async () => renderer?.unmount());
  renderer = undefined;
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});
it("renders two distinct months and highlights inclusive endpoints and interior days", async () => {
  await act(async () => {
    renderer = create(<Harness />);
  });
  const buttons = renderer!.root
    .findAllByType("button")
    .filter((node) => node.props["data-calendar-day"]);
  expect(buttons).toHaveLength(61);
  expect(
    new Set(buttons.map((node) => node.props["data-calendar-day"])).size,
  ).toBe(61);
  expect(day("2026-09-10").props["aria-pressed"]).toBe(true);
  expect(day("2026-10-13").props["aria-pressed"]).toBe(true);
  expect(day("2026-10-01").parent!.props["aria-selected"]).toBe(true);
  expect(day("2026-10-14").parent!.props["aria-selected"]).toBe(false);
  await act(async () => day("2026-10-09").props.onClick());
  expect(select).toHaveBeenCalledExactlyOnceWith("2026-10-09");
});
it("previews a range while choosing its second endpoint without committing hover", async () => {
  await act(async () => {
    renderer = create(<Harness anchor="2026-09-10" />);
  });
  await act(async () => day("2026-10-03").props.onMouseEnter());
  expect(day("2026-10-03").props["aria-pressed"]).toBe(true);
  expect(day("2026-09-20").parent!.props["aria-selected"]).toBe(true);
  expect(select).not.toHaveBeenCalled();
  await act(async () => day("2026-09-08").props.onMouseEnter());
  expect(day("2026-09-08").props["aria-pressed"]).toBe(true);
  expect(day("2026-09-09").parent!.props["aria-selected"]).toBe(true);
});
it("navigates across month boundaries with the keyboard and focuses the resulting day", async () => {
  await act(async () => {
    renderer = create(<Harness />, {
      createNodeMock: (node) =>
        node.type === "div"
          ? {
              querySelector: (selector: string) => ({
                focus: () => focused(selector),
              }),
              addEventListener() {},
              removeEventListener() {},
            }
          : null,
    });
  });
  const preventDefault = vi.fn();
  await act(async () =>
    day("2026-10-31").props.onKeyDown({ key: "ArrowRight", preventDefault }),
  );
  expect(preventDefault).toHaveBeenCalledOnce();
  expect(day("2026-11-01")).toBeTruthy();
  expect(focused).toHaveBeenLastCalledWith('[data-calendar-day="2026-11-01"]');
  await act(async () =>
    day("2026-11-01").props.onKeyDown({ key: "ArrowLeft", preventDefault }),
  );
  expect(focused).toHaveBeenLastCalledWith('[data-calendar-day="2026-10-31"]');
});

it("Today returns to the current month without selecting or resetting an unfinished range", async () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-11-02T12:00:00Z"));
  await act(async () => {
    renderer = create(<Harness anchor="2026-09-10" />);
  });
  const today = renderer!.root.findByProps({
    className: "calendar-today-button",
  });
  expect(today.props.children).toBe("Today");
  expect(today.props.type).toBe("button");
  await act(async () => today.props.onClick());
  expect(day("2026-11-02")).toBeTruthy();
  expect(day("2026-12-01")).toBeTruthy();
  expect(select).not.toHaveBeenCalled();
  expect(renderer!.root.findByType(RangeCalendar).props.anchor).toBe(
    "2026-09-10",
  );
});

it("wheel navigates months in both directions without scrolling or selecting, and ignores zoom and horizontal gestures", async () => {
  await act(async () => {
    renderer = create(<Harness />, {
      createNodeMock: (node) =>
        (node.props as { className?: string }).className === "range-calendar"
          ? calendarNode()
          : null,
    });
  });
  const wheel = async (deltaY: number, extra = {}) => {
    const preventDefault = vi.fn();
    await act(async () =>
      listeners.get("wheel")!({
        deltaY,
        deltaX: 0,
        deltaMode: 0,
        timeStamp: 100,
        preventDefault,
        ...extra,
      } as unknown as Event),
    );
    return preventDefault;
  };
  expect(await wheel(-100)).toHaveBeenCalledOnce();
  expect(day("2026-08-01")).toBeTruthy();
  await wheel(100);
  expect(day("2026-09-01")).toBeTruthy();
  expect(await wheel(100, { ctrlKey: true })).not.toHaveBeenCalled();
  expect(await wheel(10, { deltaX: 100 })).not.toHaveBeenCalled();
  expect(await wheel(0)).not.toHaveBeenCalled();
  expect(day("2026-09-01")).toBeTruthy();
  expect(select).not.toHaveBeenCalled();
  await act(async () => renderer!.unmount());
  renderer = undefined;
  expect(listeners.has("wheel")).toBe(false);
});

it("wheel navigation stops at the supported first and last two-month views", async () => {
  const renderAt = async (month: string) => {
    await act(async () => renderer?.unmount());
    await act(async () => {
      renderer = create(<Harness initialMonth={month} />, {
        createNodeMock: (node) =>
          (node.props as { className?: string }).className === "range-calendar"
            ? calendarNode()
            : null,
      });
    });
  };
  const wheel = async (deltaY: number) =>
    act(async () =>
      listeners.get("wheel")!({
        deltaY,
        deltaX: 0,
        deltaMode: 1,
        timeStamp: 100,
        preventDefault: vi.fn(),
      } as unknown as Event),
    );
  await renderAt("1970-01-01");
  await wheel(-3);
  expect(day("1970-01-01")).toBeTruthy();
  await wheel(3);
  expect(day("1970-03-01")).toBeTruthy();
  await renderAt("9999-11-01");
  await wheel(3);
  expect(day("9999-12-31")).toBeTruthy();
  await wheel(-3);
  expect(day("9999-10-01")).toBeTruthy();
});

it("accumulates small trackpad packets and resets the partial step when direction changes", async () => {
  await act(async () => {
    renderer = create(<Harness />, {
      createNodeMock: (node) =>
        (node.props as { className?: string }).className === "range-calendar"
          ? calendarNode()
          : null,
    });
  });
  const wheel = async (deltaY: number) =>
    act(async () =>
      listeners.get("wheel")!({
        deltaY,
        deltaX: 0,
        deltaMode: 0,
        timeStamp: 100,
        preventDefault: vi.fn(),
      } as unknown as Event),
    );
  for (let index = 0; index < 3; index++) await wheel(10);
  expect(day("2026-09-01")).toBeTruthy();
  await wheel(-10);
  expect(day("2026-09-01")).toBeTruthy();
  for (let index = 0; index < 3; index++) await wheel(-10);
  expect(day("2026-08-01")).toBeTruthy();
  expect(select).not.toHaveBeenCalled();
});
