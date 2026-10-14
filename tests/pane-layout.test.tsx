import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { PaneLayoutView } from "../src/renderer/components/PaneLayout";
import type { PaneLayout as Layout } from "../src/shared/contracts";

const layout: Layout = {
  type: "split",
  axis: "horizontal",
  ratio: 0.5,
  first: { type: "leaf", paneId: "one" },
  second: {
    type: "split",
    axis: "vertical",
    ratio: 0.4,
    first: { type: "leaf", paneId: "two" },
    second: { type: "leaf", paneId: "three" },
  },
};
let renderer: ReactTestRenderer | undefined;
let resize: ReturnType<typeof vi.fn>;
const style = { userSelect: "text", cursor: "default" };
const doc = {
  documentElement: { style },
  defaultView: {
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    getSelection: () => ({ removeAllRanges: vi.fn() }),
  },
};
const target = {
  ownerDocument: doc,
  focus: vi.fn(),
  setPointerCapture: vi.fn(),
  hasPointerCapture: () => true,
  releasePointerCapture: vi.fn(),
};
beforeEach(() => {
  resize = vi.fn();
  style.userSelect = "text";
  style.cursor = "default";
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
async function mount() {
  await act(async () => {
    renderer = create(
      <PaneLayoutView
        layout={layout}
        onResize={resize}
        renderPane={(id) => <span>{id}</span>}
      />,
      {
        createNodeMock: (element) =>
          element.props["data-layout-path"] !== undefined
            ? {
                getBoundingClientRect: () => ({
                  left: 0,
                  top: 0,
                  width: 1000,
                  height: 500,
                }),
              }
            : target,
      },
    );
  });
}
function pointer(clientX = 500, clientY = 200) {
  return {
    pointerId: 7,
    button: 0,
    clientX,
    clientY,
    currentTarget: target,
    preventDefault: vi.fn(),
    stopPropagation: vi.fn(),
  };
}
it("renders nested pane branches with distinct paths and pane IDs", async () => {
  await mount();
  expect(
    renderer!.root
      .findAllByProps({ role: "separator" })
      .map((item) => item.props["aria-label"]),
  ).toEqual(["Resize panes horizontally", "Resize panes vertically"]);
  expect(
    renderer!.root
      .findAll((item) => typeof item.props["data-layout-pane"] === "string")
      .map((item) => item.props["data-layout-pane"]),
  ).toEqual(["one", "two", "three"]);
});
it("resizes live under pointer capture without selecting text and commits once on release", async () => {
  await mount();
  const divider = renderer!.root.findByProps({
    "aria-label": "Resize panes horizontally",
  });
  const down = pointer();
  await act(async () => divider.props.onPointerDown(down));
  expect(down.preventDefault).toHaveBeenCalled();
  expect(style.userSelect).toBe("none");
  await act(async () => divider.props.onPointerMove(pointer(700)));
  expect(divider.props["aria-valuenow"]).toBe(70);
  expect(resize).not.toHaveBeenCalled();
  await act(async () => divider.props.onPointerUp(pointer(700)));
  expect(resize).toHaveBeenCalledTimes(1);
  expect(resize).toHaveBeenCalledWith("", expect.closeTo(0.7, 2));
  expect(style.userSelect).toBe("text");
  expect(style.cursor).toBe("default");
});
it("restores the original ratio and selection behavior after cancellation or unmount", async () => {
  await mount();
  const divider = renderer!.root.findByProps({
    "aria-label": "Resize panes vertically",
  });
  await act(async () => {
    divider.props.onPointerDown(pointer());
    divider.props.onPointerMove(pointer(500, 450));
  });
  expect(divider.props["aria-valuenow"]).toBe(80);
  await act(async () => divider.props.onPointerCancel(pointer()));
  expect(divider.props["aria-valuenow"]).toBe(40);
  expect(resize).not.toHaveBeenCalled();
  expect(style.userSelect).toBe("text");
  await act(async () => divider.props.onPointerDown(pointer()));
  await act(async () => {
    renderer!.unmount();
    renderer = undefined;
  });
  expect(style.userSelect).toBe("text");
});
it("uses the nested path for keyboard changes and supports Home reset", async () => {
  await mount();
  const divider = renderer!.root.findByProps({
    "aria-label": "Resize panes vertically",
  });
  await act(async () =>
    divider.props.onKeyDown({
      key: "ArrowDown",
      preventDefault: vi.fn(),
      stopPropagation: vi.fn(),
    }),
  );
  expect(resize).toHaveBeenLastCalledWith("1", expect.closeTo(0.42, 12));
  await act(async () =>
    divider.props.onKeyDown({
      key: "Home",
      preventDefault: vi.fn(),
      stopPropagation: vi.fn(),
    }),
  );
  expect(resize).toHaveBeenLastCalledWith("1", 0.5);
});
