import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { useState } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { SegmentedDateTimeInput } from "../src/renderer/components/SegmentedDateTimeInput";

vi.mock("@mantine/core", async () => {
  const { createElement, forwardRef } = await import("react");
  return {
    TextInput: forwardRef<HTMLInputElement, Record<string, unknown>>(
      (props, ref) =>
        createElement(
          "div",
          {},
          createElement("input", { ...props, ref }),
          props.rightSection as import("react").ReactNode,
        ),
    ),
  };
});

let renderer: ReactTestRenderer | undefined;
let wheel: ((event: WheelEvent) => void) | undefined;
const page = { activeElement: null as unknown };
const node = {
  selectionStart: 5,
  selectionEnd: 7,
  addEventListener: vi.fn(
    (type: string, listener: (event: WheelEvent) => void) => {
      if (type === "wheel") wheel = listener;
    },
  ),
  removeEventListener: vi.fn(),
  setSelectionRange: vi.fn((start: number, end: number) => {
    node.selectionStart = start;
    node.selectionEnd = end;
  }),
  focus: vi.fn(() => {
    page.activeElement = node;
  }),
};
const changed = vi.fn();

function Harness({
  kind = "date",
  initial = "2026/01/31",
}: {
  kind?: "date" | "time" | "duration";
  initial?: string;
}) {
  const [value, setValue] = useState(initial);
  return (
    <SegmentedDateTimeInput
      label="Start date"
      kind={kind}
      value={value}
      onChange={(next) => {
        changed(next);
        setValue(next);
      }}
    />
  );
}

const input = () => renderer!.root.findByType("input");
const wheelEvent = (deltaY: number) => ({ deltaY, preventDefault: vi.fn() });
async function render(content = <Harness />) {
  await act(async () => {
    renderer = create(content, { createNodeMock: () => node });
  });
}

beforeEach(() => {
  wheel = undefined;
  page.activeElement = node;
  node.selectionStart = 5;
  node.selectionEnd = 7;
  vi.clearAllMocks();
  vi.stubGlobal("document", page);
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

it.each([
  ["date", "2026/01/31", 10],
  ["time", "12:30:45", 8],
  ["duration", "15", 4],
] as const)(
  "renders %s as an accessible controlled text input",
  async (kind, value, maxLength) => {
    await render(
      <SegmentedDateTimeInput
        label="Edit value"
        kind={kind}
        value={value}
        onChange={changed}
        error
      />,
    );
    expect(input().props).toMatchObject({
      label: "Edit value",
      "aria-label": "Edit value",
      type: "text",
      value,
      maxLength,
      inputMode: "numeric",
      error: true,
    });
    await act(async () =>
      input().props.onChange({ currentTarget: { value: "2" } }),
    );
    expect(changed).toHaveBeenCalledWith("2");
  },
);

it("registers a nonpassive wheel listener and selects the changed date segment after commit", async () => {
  await render();
  expect(node.addEventListener).toHaveBeenCalledWith(
    "wheel",
    expect.any(Function),
    { passive: false },
  );
  const event = wheelEvent(-100);
  await act(async () => wheel!(event as unknown as WheelEvent));
  expect(event.preventDefault).toHaveBeenCalledOnce();
  expect(changed).toHaveBeenCalledWith("2026/02/28");
  expect(input().props.value).toBe("2026/02/28");
  expect(node.setSelectionRange).toHaveBeenLastCalledWith(5, 7);
  expect(page.activeElement).toBe(node);
});

it("offers duration step buttons that focus the input and use the latest draft", async () => {
  await render(<Harness kind="duration" initial="5" />);
  expect(input().props.rightSectionPointerEvents).toBe("auto");
  const button = (label: string) =>
    renderer!.root.findByProps({ "aria-label": label });
  page.activeElement = {};
  await act(async () => button("Increase start date").props.onClick());
  expect(input().props.value).toBe("6");
  expect(node.focus).toHaveBeenCalledOnce();
  await act(async () => button("Decrease start date").props.onClick());
  expect(input().props.value).toBe("5");
  expect(changed.mock.calls.map(([value]) => value)).toEqual(["6", "5"]);
  expect(button("Increase start date").props.type).toBe("button");
  const down = { preventDefault: vi.fn() };
  button("Increase start date").props.onMouseDown(down);
  expect(down.preventDefault).toHaveBeenCalledOnce();
});

it.each(["date", "time"] as const)(
  "keeps %s fields free of duration controls",
  async (kind) => {
    await render(<Harness kind={kind} />);
    expect(input().props.rightSection).toBeUndefined();
  },
);

it("leaves unfocused and horizontal-only wheel events available for page scrolling", async () => {
  await render();
  page.activeElement = {};
  const unfocused = wheelEvent(-100);
  await act(async () => wheel!(unfocused as unknown as WheelEvent));
  page.activeElement = node;
  const horizontal = wheelEvent(0);
  await act(async () => wheel!(horizontal as unknown as WheelEvent));
  expect(changed).not.toHaveBeenCalled();
  expect(unfocused.preventDefault).not.toHaveBeenCalled();
  expect(horizontal.preventDefault).not.toHaveBeenCalled();
});

it("decrements on wheel down and uses the latest controlled value and callback", async () => {
  const nextChanged = vi.fn();
  await render(
    <SegmentedDateTimeInput
      label="Duration"
      kind="duration"
      value="9"
      onChange={changed}
    />,
  );
  const registered = wheel;
  await act(async () =>
    renderer!.update(
      <SegmentedDateTimeInput
        label="Duration"
        kind="duration"
        value="20"
        onChange={nextChanged}
      />,
    ),
  );
  const event = wheelEvent(100);
  await act(async () => wheel!(event as unknown as WheelEvent));
  expect(wheel).toBe(registered);
  expect(node.addEventListener).toHaveBeenCalledOnce();
  expect(changed).not.toHaveBeenCalled();
  expect(nextChanged).toHaveBeenCalledWith("19");
  expect(event.preventDefault).toHaveBeenCalledOnce();
});

it("uses arrow keys for the selected time segment and leaves other keys alone", async () => {
  node.selectionStart = 6;
  await render(<Harness kind="time" initial="12:00:00" />);
  const down = {
    key: "ArrowDown",
    currentTarget: node,
    preventDefault: vi.fn(),
  };
  await act(async () => input().props.onKeyDown(down));
  expect(input().props.value).toBe("12:00:59");
  expect(down.preventDefault).toHaveBeenCalledOnce();
  expect(node.setSelectionRange).toHaveBeenLastCalledWith(6, 8);
  const up = { key: "ArrowUp", currentTarget: node, preventDefault: vi.fn() };
  await act(async () => input().props.onKeyDown(up));
  expect(input().props.value).toBe("12:00:00");
  const left = {
    key: "ArrowLeft",
    currentTarget: node,
    preventDefault: vi.fn(),
  };
  await act(async () => input().props.onKeyDown(left));
  expect(left.preventDefault).not.toHaveBeenCalled();
  expect(changed).toHaveBeenCalledTimes(2);
});

it("removes the native wheel listener when the input unmounts", async () => {
  await render();
  const registered = wheel;
  await act(async () => renderer!.unmount());
  renderer = undefined;
  expect(node.removeEventListener).toHaveBeenCalledWith("wheel", registered);
});
