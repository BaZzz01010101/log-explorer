import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { useState, type ReactNode } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { LevelFilter } from "../src/renderer/components/LevelFilter";

vi.mock("@mantine/core", async () => {
  const { createElement } = await import("react");
  const component = ({ children, ...props }: Record<string, unknown>) =>
    createElement("div", props, children as ReactNode);
  const button = ({ children, ...props }: Record<string, unknown>) =>
    createElement("button", props, children as ReactNode);
  return {
    Button: button,
    Checkbox: (props: Record<string, unknown>) =>
      createElement("input", { ...props, type: "checkbox" }),
    Group: component,
    Stack: component,
    Popover: Object.assign(component, {
      Target: component,
      Dropdown: component,
    }),
  };
});

let renderer: ReactTestRenderer | undefined;
const changed = vi.fn();
function Harness({ initial = undefined }: { initial?: string[] }) {
  const [levels, setLevels] = useState(initial);
  return (
    <LevelFilter
      level="all"
      levels={levels}
      onChange={(next) => {
        changed(next);
        setLevels(next);
      }}
    />
  );
}
const element = (label: string) =>
  renderer!.root
    .findAllByProps({ "aria-label": label })
    .find((node) => typeof node.type === "string")!;
const isOpened = () =>
  renderer!.root
    .findAllByType("div")
    .some((node) => node.props.opened === true);
beforeEach(() => {
  changed.mockClear();
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
it("starts with every level checked and supports exclusive text selection", async () => {
  await act(async () => {
    renderer = create(<Harness />);
  });
  await act(async () => element("Local level filter").props.onClick());
  expect(element("Include ERROR").props.checked).toBe(true);
  expect(element("Include UNKNOWN").props.checked).toBe(true);
  await act(async () =>
    element("Select only ERROR").props.onClick({
      ctrlKey: false,
      metaKey: false,
    }),
  );
  expect(changed).toHaveBeenLastCalledWith(["error"]);
  expect(isOpened()).toBe(false);
});
it("toggles checkbox selections without closing and can explicitly select none", async () => {
  await act(async () => {
    renderer = create(<Harness initial={["error"]} />);
  });
  await act(async () => element("Local level filter").props.onClick());
  await act(async () =>
    element("Include INFO").props.onChange({
      currentTarget: { checked: true },
    }),
  );
  expect(changed).toHaveBeenLastCalledWith(["error", "info"]);
  expect(isOpened()).toBe(true);
  await act(async () =>
    element("Include ERROR").props.onChange({
      currentTarget: { checked: false },
    }),
  );
  await act(async () =>
    element("Include INFO").props.onChange({
      currentTarget: { checked: false },
    }),
  );
  expect(changed).toHaveBeenLastCalledWith([]);
  expect(element("Local level filter").props.title).toBe("No levels");
});
it.each(["ctrlKey", "metaKey"])(
  "uses %s text clicks to toggle levels without closing",
  async (modifier) => {
    await act(async () => {
      renderer = create(<Harness initial={["error"]} />);
    });
    await act(async () => element("Local level filter").props.onClick());
    await act(async () =>
      element("Select only INFO").props.onClick({ [modifier]: true }),
    );
    expect(changed).toHaveBeenLastCalledWith(["error", "info"]);
    expect(isOpened()).toBe(true);
    await act(async () =>
      element("Select only ERROR").props.onClick({ [modifier]: true }),
    );
    expect(changed).toHaveBeenLastCalledWith(["info"]);
  },
);
