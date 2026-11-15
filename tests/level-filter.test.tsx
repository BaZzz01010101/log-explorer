// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MantineProvider } from "@mantine/core";
import { useState } from "react";
import { afterEach, expect, it, vi } from "vitest";
import { LevelFilter } from "../src/renderer/components/LevelFilter";

// Real Mantine components in a DOM: clicks go through the rendered elements,
// so a broken handler, label or popover wiring fails here.
const changed = vi.fn();
function Harness({ initial = undefined }: { initial?: string[] }) {
  const [levels, setLevels] = useState(initial);
  return (
    <MantineProvider env="test">
      <LevelFilter
        level="all"
        levels={levels}
        onChange={(next) => {
          changed(next);
          setLevels(next);
        }}
      />
    </MantineProvider>
  );
}
const control = (label: string) => screen.getByLabelText(label);
const opened = () => screen.queryByLabelText("Include ERROR") !== null;
const openMenu = () => fireEvent.click(control("Local level filter"));
afterEach(() => {
  cleanup();
  changed.mockClear();
});

it("starts with every level checked and supports exclusive text selection", () => {
  render(<Harness />);
  openMenu();
  expect((control("Include ERROR") as HTMLInputElement).checked).toBe(true);
  expect((control("Include UNKNOWN") as HTMLInputElement).checked).toBe(true);
  fireEvent.click(control("Select only ERROR"));
  expect(changed).toHaveBeenLastCalledWith(["error"]);
  expect(opened()).toBe(false);
});

it("toggles checkbox selections without closing and can explicitly select none", () => {
  render(<Harness initial={["error"]} />);
  openMenu();
  fireEvent.click(control("Include INFO"));
  expect(changed).toHaveBeenLastCalledWith(["error", "info"]);
  expect(opened()).toBe(true);
  fireEvent.click(control("Include ERROR"));
  fireEvent.click(control("Include INFO"));
  expect(changed).toHaveBeenLastCalledWith([]);
  expect(control("Local level filter").dataset.tooltip).toBe("No levels");
});

it.each(["ctrlKey", "metaKey"])(
  "uses %s text clicks to toggle levels without closing",
  (modifier) => {
    render(<Harness initial={["error"]} />);
    openMenu();
    fireEvent.click(control("Select only INFO"), { [modifier]: true });
    expect(changed).toHaveBeenLastCalledWith(["error", "info"]);
    expect(opened()).toBe(true);
    fireEvent.click(control("Select only ERROR"), { [modifier]: true });
    expect(changed).toHaveBeenLastCalledWith(["info"]);
  },
);
