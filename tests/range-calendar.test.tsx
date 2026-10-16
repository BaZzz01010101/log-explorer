import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { useState } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { RangeCalendar } from "../src/renderer/components/RangeCalendar";

let renderer: ReactTestRenderer | undefined;
const select = vi.fn(),
  focused = vi.fn();
function Harness({ anchor = null }: { anchor?: string | null }) {
  const [month, setMonth] = useState("2026-09-01");
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
