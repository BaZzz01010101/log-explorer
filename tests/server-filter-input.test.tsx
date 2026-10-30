import { createElement } from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { ServerFilterInput } from "../src/renderer/components/ServerFilterInput";

vi.mock("@mantine/core", () => ({
  TextInput: (props: Record<string, unknown>) => createElement("input", props),
}));
vi.mock("../src/renderer/components/AppMenu", () => ({
  Menu: Object.assign(() => null, {
    Target: () => null,
    Dropdown: () => null,
    Label: () => null,
    Item: () => null,
  }),
}));

let renderer: ReactTestRenderer;
const draft = "{ $.level N";
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("requestAnimationFrame", vi.fn());
  const original = console.error.bind(console);
  vi.spyOn(console, "error").mockImplementation((...args) => {
    if (!String(args[0]).includes("react-test-renderer is deprecated"))
      original(...args);
  });
});
afterEach(async () => {
  await act(async () => renderer?.unmount());
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

async function suggest() {
  const onChange = vi.fn(),
    onRun = vi.fn();
  await act(async () => {
    renderer = create(
      <ServerFilterInput
        value={draft}
        mode="pattern"
        onChange={onChange}
        onModeChange={vi.fn()}
        onRun={onRun}
        onClear={vi.fn()}
      />,
    );
  });
  await act(async () => {
    const input = renderer.root.findByType("input");
    input.props.onFocus();
    input.props.onSelect({ currentTarget: { selectionStart: draft.length } });
  });
  expect(
    renderer.root
      .findByProps({ role: "listbox" })
      .findAllByType("code")
      .map((node) => node.children),
  ).toContainEqual(["NOT EXISTS"]);
  return { onChange, onRun };
}

it.each([
  { name: "Ctrl+Tab", ctrlKey: true },
  { name: "Ctrl+Shift+Tab", ctrlKey: true, shiftKey: true },
  { name: "Shift+Tab", shiftKey: true },
  { name: "Meta+Tab", metaKey: true },
  { name: "Alt+Tab", altKey: true },
])(
  "leaves the filter draft unchanged and lets $name bubble with suggestions open",
  async (modifiers) => {
    const { onChange, onRun } = await suggest();
    const event = {
      key: "Tab",
      ctrlKey: false,
      metaKey: false,
      altKey: false,
      shiftKey: false,
      ...modifiers,
      nativeEvent: { isComposing: false },
      preventDefault: vi.fn(),
      stopPropagation: vi.fn(),
    };
    await act(async () =>
      renderer.root.findByType("input").props.onKeyDown(event),
    );
    expect(onChange).not.toHaveBeenCalled();
    expect(onRun).not.toHaveBeenCalled();
    expect(event.preventDefault).not.toHaveBeenCalled();
    expect(event.stopPropagation).not.toHaveBeenCalled();
    expect(renderer.root.findByType("input").props.value).toBe(draft);
    expect(renderer.root.findByType("input").props["aria-expanded"]).toBe(true);
  },
);

it("accepts the selected keyword with an unmodified Tab", async () => {
  const { onChange, onRun } = await suggest();
  const event = {
    key: "Tab",
    ctrlKey: false,
    metaKey: false,
    altKey: false,
    shiftKey: false,
    nativeEvent: { isComposing: false },
    preventDefault: vi.fn(),
    stopPropagation: vi.fn(),
  };
  await act(async () =>
    renderer.root.findByType("input").props.onKeyDown(event),
  );
  expect(onChange).toHaveBeenCalledExactlyOnceWith("{ $.level NOT EXISTS ");
  expect(event.preventDefault).toHaveBeenCalledOnce();
  expect(onRun).not.toHaveBeenCalled();
  expect(renderer.root.findByType("input").props["aria-expanded"]).toBe(false);
});
