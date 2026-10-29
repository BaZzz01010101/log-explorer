import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { useState } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { ExpandedEventDetails } from "../src/renderer/components/ExpandedEventDetails";

let renderer: ReactTestRenderer;
let view: EventTarget;
let captured = false;
const style = { userSelect: "text", cursor: "default" };
const commit = vi.fn();
const target = {
  focus: vi.fn(),
  ownerDocument: {
    documentElement: { style },
    defaultView: {
      addEventListener: (
        ...args: Parameters<EventTarget["addEventListener"]>
      ) => view.addEventListener(...args),
      removeEventListener: (
        ...args: Parameters<EventTarget["removeEventListener"]>
      ) => view.removeEventListener(...args),
      getSelection: () => ({ removeAllRanges: vi.fn() }),
    },
  },
  setPointerCapture: vi.fn(() => {
    captured = true;
  }),
  hasPointerCapture: () => captured,
  releasePointerCapture: vi.fn(() => {
    captured = false;
  }),
};
beforeEach(() => {
  view = new EventTarget();
  captured = false;
  style.userSelect = "text";
  style.cursor = "default";
  vi.clearAllMocks();
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(async () => {
  await act(async () => renderer?.unmount());
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
async function mount(initialHeight?: number) {
  await act(async () => {
    renderer = create(
      <ExpandedEventDetails
        initialHeight={initialHeight}
        onHeightChange={commit}
        footer={<button>Copy</button>}
      >
        <div>Contents</div>
      </ExpandedEventDetails>,
      {
        createNodeMock: () => ({
          getBoundingClientRect: () => ({ height: 245 }),
        }),
      },
    );
  });
}
const divider = () => renderer.root.findByProps({ role: "separator" });
const content = () =>
  renderer.root.findByProps({ className: "expanded-event-content" });
const pointer = (clientY = 300, pointerId = 3) => ({
  currentTarget: target,
  clientY,
  pointerId,
  button: 0,
  preventDefault: vi.fn(),
  stopPropagation: vi.fn(),
});
const key = (value: string) => ({
  key: value,
  preventDefault: vi.fn(),
  stopPropagation: vi.fn(),
});

it("uses natural height within a scrollable default and restores a previously chosen height", async () => {
  await mount();
  expect(content().props.style.height).toBeUndefined();
  expect(content().props.style.maxHeight).toBe(245);
  await act(async () => renderer.unmount());
  await mount(420);
  expect(content().props.style.height).toBe(420);
  expect(divider().props["aria-orientation"]).toBe("horizontal");
});
it("resizes content live without selecting surrounding text and commits on pointer release", async () => {
  await mount();
  await act(async () => divider().props.onPointerDown(pointer()));
  expect(style).toEqual({ userSelect: "none", cursor: "row-resize" });
  await act(async () => divider().props.onPointerMove(pointer(400)));
  expect(content().props.style.height).toBe(345);
  expect(commit).not.toHaveBeenCalled();
  await act(async () => divider().props.onPointerUp(pointer(420)));
  expect(content().props.style.height).toBe(365);
  expect(commit).toHaveBeenLastCalledWith(365);
  expect(captured).toBe(false);
  expect(style).toEqual({ userSelect: "text", cursor: "default" });
});
it.each(["escape", "cancel", "blur", "lostcapture", "unmount"])(
  "cancels and restores pointer state on %s",
  async (reason) => {
    await mount(320);
    await act(async () => divider().props.onPointerDown(pointer()));
    await act(async () => divider().props.onPointerMove(pointer(400)));
    await act(async () => {
      if (reason === "escape")
        view.dispatchEvent(
          Object.assign(new Event("keydown"), { key: "Escape" }),
        );
      if (reason === "cancel") divider().props.onPointerCancel(pointer());
      if (reason === "blur") view.dispatchEvent(new Event("blur"));
      if (reason === "lostcapture")
        divider().props.onLostPointerCapture(pointer());
      if (reason === "unmount") renderer.unmount();
    });
    if (reason !== "unmount") expect(content().props.style.height).toBe(320);
    expect(commit).not.toHaveBeenCalled();
    expect(captured).toBe(false);
    expect(style).toEqual({ userSelect: "text", cursor: "default" });
  },
);
it("clamps resizing, ignores other pointers and supports keyboard resizing and reset", async () => {
  await mount();
  await act(async () => divider().props.onPointerDown(pointer()));
  await act(async () => divider().props.onPointerMove(pointer(400, 5)));
  expect(content().props.style.height).toBe(245);
  await act(async () => divider().props.onPointerMove(pointer(10000)));
  expect(content().props.style.height).toBe(1200);
  await act(async () => divider().props.onPointerUp(pointer(-10000)));
  expect(content().props.style.height).toBe(80);
  await act(async () => divider().props.onKeyDown(key("ArrowDown")));
  expect(commit).toHaveBeenLastCalledWith(100);
  await act(async () => divider().props.onKeyDown(key("ArrowUp")));
  expect(commit).toHaveBeenLastCalledWith(80);
  await act(async () =>
    divider().props.onDoubleClick({
      preventDefault: vi.fn(),
      stopPropagation: vi.fn(),
    }),
  );
  expect(commit).toHaveBeenLastCalledWith(undefined);
  expect(content().props.style.height).toBeUndefined();
});

it("coordinates externally controlled heights and resets across expanded views", async () => {
  function Pair() {
    const [height, setHeight] = useState<number | undefined>();
    return ["light", "dark"].map((theme) => (
      <ExpandedEventDetails
        key={theme}
        height={height ?? null}
        onHeightChange={setHeight}
        footer={null}
      >
        Contents
      </ExpandedEventDetails>
    ));
  }
  await act(async () => {
    renderer = create(<Pair />, {
      createNodeMock: () => ({
        getBoundingClientRect: () => ({ height: 245 }),
      }),
    });
  });
  const dividers = () => renderer.root.findAllByProps({ role: "separator" });
  const heights = () =>
    renderer.root
      .findAllByProps({ className: "expanded-event-content" })
      .map((node) => node.props.style.height);
  await act(async () => dividers()[0].props.onKeyDown(key("ArrowDown")));
  expect(heights()).toEqual([265, 265]);
  await act(async () => dividers()[1].props.onKeyDown(key("ArrowDown")));
  expect(heights()).toEqual([285, 285]);
  await act(async () => dividers()[0].props.onKeyDown(key("Home")));
  expect(heights()).toEqual([undefined, undefined]);
});
