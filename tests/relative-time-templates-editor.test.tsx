import { createElement, useState, type ReactNode } from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { RelativeTimeTemplatesEditor } from "../src/renderer/components/RelativeTimeTemplatesEditor";
import { normalizeRelativeTimeTemplates } from "../src/shared/relative-time-templates";
vi.mock("../src/renderer/components/SettingLabel", () => ({
  SettingLabel: ({ label }: { label: ReactNode }) =>
    createElement("span", null, label),
}));

vi.mock("@mantine/core", async () => {
  const { forwardRef } = await import("react");
  const component = ({ children, ...props }: Record<string, unknown>) =>
    createElement("div", props, children as ReactNode);
  return {
    NumberInput: forwardRef<HTMLInputElement, Record<string, unknown>>(
      (props, ref) => createElement("input", { ...props, ref }),
    ),
    Stack: component,
    Text: component,
  };
});

let renderer: ReactTestRenderer | undefined;
const nodes = new Map<
  string,
  {
    addEventListener: ReturnType<typeof vi.fn>;
    removeEventListener: ReturnType<typeof vi.fn>;
    wheel?: (event: WheelEvent) => void;
  }
>();
const page = { activeElement: null as unknown };
const changed = vi.fn();
const label = "Relative dropdown Minutes slot 2";
function Harness() {
  const [value, setValue] = useState(normalizeRelativeTimeTemplates(undefined));
  return (
    <RelativeTimeTemplatesEditor
      value={value}
      onChange={(next) => {
        changed(next);
        setValue(next);
      }}
    />
  );
}
const input = (name = label) =>
  renderer!.root
    .findAllByType("input")
    .find((entry) => entry.props["aria-label"] === name)!;
const durations = () =>
  renderer!.root
    .findAllByType("input")
    .filter((entry) =>
      entry.props["aria-label"].startsWith("Relative dropdown Minutes"),
    )
    .map((entry) => entry.props.value);
async function render() {
  await act(async () => {
    renderer = create(<Harness />, {
      createNodeMock: (element) => {
        if (element.type !== "input") return null;
        const node = {
          addEventListener: vi.fn(
            (type: string, listener: (event: WheelEvent) => void) => {
              if (type === "wheel") node.wheel = listener;
            },
          ),
          removeEventListener: vi.fn(),
          wheel: undefined as ((event: WheelEvent) => void) | undefined,
        };
        nodes.set(
          (element.props as Record<string, unknown>)["aria-label"] as string,
          node,
        );
        return node;
      },
    });
  });
}
async function wheel(deltaY: number, name = label) {
  const event = { deltaY, preventDefault: vi.fn() };
  await act(async () =>
    nodes.get(name)!.wheel!(event as unknown as WheelEvent),
  );
  return event;
}
beforeEach(() => {
  nodes.clear();
  changed.mockClear();
  page.activeElement = null;
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

it("enables bounded integer up/down controls for all 27 fixed slots", async () => {
  await render();
  const inputs = renderer!.root.findAllByType("input");
  expect(inputs).toHaveLength(27);
  for (const entry of inputs) {
    expect(entry.props.hideControls).not.toBe(true);
    expect(entry.props).toMatchObject({
      min: 1,
      max: 9999,
      allowDecimal: false,
      allowNegative: false,
    });
  }
});

it("uses nonpassive wheel adjustment with live ascending cascades in both directions", async () => {
  await render();
  const node = nodes.get(label)!;
  expect(node.addEventListener).toHaveBeenCalledWith(
    "wheel",
    expect.any(Function),
    { passive: false },
  );
  page.activeElement = node;
  await act(async () => input().props.onChange(29));
  expect(durations()).toEqual([5, 29, 30, 31, 45]);
  const up = await wheel(-100);
  expect(durations()).toEqual([5, 30, 31, 32, 45]);
  expect(up.preventDefault).toHaveBeenCalledOnce();
  const down = await wheel(100);
  expect(durations()).toEqual([5, 29, 31, 32, 45]);
  expect(down.preventDefault).toHaveBeenCalledOnce();
  const fourth = "Relative dropdown Minutes slot 4";
  await act(async () => input(fourth).props.onChange(8));
  expect(durations()).toEqual([5, 6, 7, 8, 45]);
  page.activeElement = nodes.get(fourth);
  expect((await wheel(100, fourth)).preventDefault).toHaveBeenCalledOnce();
  expect(durations()).toEqual([4, 5, 6, 7, 45]);
  expect(node.addEventListener).toHaveBeenCalledOnce();
  expect(changed.mock.lastCall![0].quick[0].duration).toBe(1);
});

it("adjusts every slot and prevents panel scrolling even at duration boundaries", async () => {
  await render();
  for (const entry of renderer!.root.findAllByType("input")) {
    const name = entry.props["aria-label"];
    page.activeElement = nodes.get(name);
    const before = input(name).props.value;
    expect((await wheel(-100, name)).preventDefault).toHaveBeenCalledOnce();
    expect(input(name).props.value).toBe(before + 1);
  }
  const last = "Relative dropdown Weeks slot 4";
  await act(async () => input(last).props.onChange(9999));
  page.activeElement = nodes.get(last);
  expect((await wheel(-100, last)).preventDefault).toHaveBeenCalledOnce();
  expect(input(last).props.value).toBe(9999);
  const first = "Quick toolbar Minutes slot 1";
  await act(async () => input(first).props.onChange(1));
  page.activeElement = nodes.get(first);
  expect((await wheel(100, first)).preventDefault).toHaveBeenCalledOnce();
  expect(input(first).props.value).toBe(1);
});

it("leaves unfocused and horizontal wheel gestures available for scrolling and removes listeners", async () => {
  await render();
  const node = nodes.get(label)!;
  expect((await wheel(-100)).preventDefault).not.toHaveBeenCalled();
  page.activeElement = node;
  expect((await wheel(0)).preventDefault).not.toHaveBeenCalled();
  expect(changed).not.toHaveBeenCalled();
  await act(async () => renderer!.unmount());
  renderer = undefined;
  expect(node.removeEventListener).toHaveBeenCalledWith("wheel", node.wheel);
});
