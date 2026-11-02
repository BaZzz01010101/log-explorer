import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import {
  SourceDetails,
  type SourceDetailsResource,
} from "../src/renderer/components/SourceDetails";

const group: SourceDetailsResource = {
  kind: "group",
  connection: {
    id: "test",
    name: "Test",
    profile: "test",
    region: "us-east-1",
    mode: "offline",
  },
  group: { name: "/orders" },
};
const stream: SourceDetailsResource = {
  ...group,
  kind: "stream",
  stream: { name: "latest" },
};
let renderer: ReactTestRenderer | undefined;
let sidebarHeight: number;
let resized: () => void;
let view: EventTarget;
let style: { userSelect: string; cursor: string };
let capture: Set<number>;
const changed = vi.fn();
const copy = vi.fn();
const panel = () => renderer!.root.findByType("section");
const separator = () => renderer!.root.findByProps({ role: "separator" });
const height = () => panel().props.style?.height;
const target = () => ({
  ownerDocument: { documentElement: { style }, defaultView: view },
  focus() {},
  setPointerCapture(id: number) {
    capture.add(id);
  },
  hasPointerCapture: (id: number) => capture.has(id),
  releasePointerCapture(id: number) {
    capture.delete(id);
  },
});
const pointer = (clientY: number, pointerId = 1) => ({
  clientY,
  pointerId,
  button: 0,
  currentTarget: target(),
  preventDefault() {},
  stopPropagation() {},
});
const key = async (value: string, shiftKey = false) => {
  const event = {
    key: value,
    shiftKey,
    preventDefault: vi.fn(),
    stopPropagation: vi.fn(),
  };
  await act(async () => separator().props.onKeyDown(event));
  return event;
};
const render = (resource?: SourceDetailsResource, requested?: number) => (
  <SourceDetails
    resource={resource}
    height={requested}
    onHeightChange={changed}
    onCopy={copy}
  />
);
async function mount(requested?: number) {
  const fixed = {
    classList: { contains: () => false },
    getBoundingClientRect: () => ({ height: 180 }),
  };
  const tree = {
    classList: { contains: (name: string) => name === "resource-tree" },
  };
  const section = {
    parentElement: {
      get clientHeight() {
        return sidebarHeight;
      },
      children: [] as unknown[],
    },
    getBoundingClientRect: () => ({ height: renderer ? height() : 220 }),
  };
  section.parentElement.children = [fixed, tree, section];
  await act(async () => {
    renderer = create(render(undefined, requested), {
      createNodeMock: (element) =>
        element.type === "section" ? section : null,
    });
  });
}

beforeEach(() => {
  sidebarHeight = 900;
  view = new EventTarget();
  style = { userSelect: "text", cursor: "auto" };
  capture = new Set();
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("getComputedStyle", () => ({
    marginTop: "0",
    marginBottom: "0",
  }));
  vi.stubGlobal(
    "ResizeObserver",
    class {
      constructor(callback: () => void) {
        resized = callback;
      }
      observe() {}
      disconnect() {}
    },
  );
  const original = console.error.bind(console);
  vi.spyOn(console, "error").mockImplementation((...args) => {
    if (!String(args[0]).startsWith("react-test-renderer is deprecated"))
      original(...args);
  });
});
afterEach(async () => {
  await act(async () => renderer?.unmount());
  renderer = undefined;
  changed.mockReset();
  copy.mockReset();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

it("retains its chosen expanded height across empty, group, stream and collapsed selections", async () => {
  await mount();
  expect(height()).toBe(220);
  expect(
    panel().findByProps({ className: "source-details-heading" }).children,
  ).toContainEqual(
    expect.objectContaining({ props: { children: "Source details" } }),
  );
  await key("ArrowUp");
  expect(height()).toBe(240);
  await act(async () => renderer!.update(render(group)));
  expect(height()).toBe(240);
  expect(panel().findAllByProps({ children: "Group details" })).toHaveLength(1);
  expect(
    panel().findAllByProps({ className: "source-details-kind" }),
  ).toHaveLength(0);
  await act(async () => renderer!.update(render(stream)));
  expect(height()).toBe(240);
  expect(panel().findAllByProps({ children: "Stream details" })).toHaveLength(
    1,
  );
  await act(async () =>
    panel()
      .findByProps({ "aria-label": "Toggle source details" })
      .props.onClick(),
  );
  expect(height()).toBe(31);
  expect(panel().findAllByProps({ role: "separator" })).toHaveLength(0);
  await act(async () => renderer!.update(render()));
  await act(async () =>
    panel()
      .findByProps({ "aria-label": "Toggle source details" })
      .props.onClick(),
  );
  expect(height()).toBe(240);
});

it("adjusts the separator with keys, constrains it to available space and resets to the default", async () => {
  await mount();
  const handled = await key("ArrowUp", true);
  expect(height()).toBe(270);
  expect(handled.preventDefault).toHaveBeenCalledOnce();
  expect(handled.stopPropagation).toHaveBeenCalledOnce();
  await key("ArrowDown");
  expect(height()).toBe(250);
  await key("End");
  expect(height()).toBe(640);
  await key("ArrowUp");
  expect(height()).toBe(640);
  for (let index = 0; index < 15; index++) await key("ArrowDown", true);
  expect(height()).toBe(80);
  await key("Home");
  expect(height()).toBe(220);
  await key("ArrowUp");
  await act(async () => separator().props.onDoubleClick(pointer(0)));
  expect(height()).toBe(220);
  const ignored = await key("ArrowRight");
  expect(ignored.preventDefault).not.toHaveBeenCalled();
});

it("previews a drag and commits only its bounded height on pointer release", async () => {
  await mount();
  await act(async () => separator().props.onPointerDown(pointer(300)));
  expect(separator().props["data-resizing"]).toBe(true);
  expect(style).toEqual({ userSelect: "none", cursor: "row-resize" });
  expect(capture.has(1)).toBe(true);
  await act(async () => separator().props.onPointerMove(pointer(-1000, 2)));
  expect(height()).toBe(220);
  await act(async () => separator().props.onPointerMove(pointer(-1000)));
  expect(height()).toBe(640);
  expect(changed).not.toHaveBeenCalled();
  await act(async () => separator().props.onPointerUp(pointer(-1000)));
  expect(changed).toHaveBeenLastCalledWith(640);
  expect(height()).toBe(640);
  expect(capture.size).toBe(0);
  expect(style).toEqual({ userSelect: "text", cursor: "auto" });
  await act(async () => separator().props.onPointerDown(pointer(300)));
  await act(async () => separator().props.onPointerUp(pointer(2000)));
  expect(height()).toBe(80);
  expect(changed).toHaveBeenLastCalledWith(80);
});

it.each(["onPointerCancel", "onLostPointerCapture", "Escape", "blur"])(
  "discards an unfinished drag after %s and restores selection and cursor behavior",
  async (reason) => {
    await mount();
    await act(async () => separator().props.onPointerDown(pointer(300)));
    await act(async () => separator().props.onPointerMove(pointer(200)));
    expect(height()).toBe(320);
    await act(async () => {
      if (reason === "Escape") {
        const event = new Event("keydown", { cancelable: true });
        Object.defineProperty(event, "key", { value: "Escape" });
        view.dispatchEvent(event);
      } else if (reason === "blur") view.dispatchEvent(new Event("blur"));
      else separator().props[reason](pointer(200));
    });
    expect(height()).toBe(220);
    expect(changed).not.toHaveBeenCalled();
    expect(capture.size).toBe(0);
    expect(style).toEqual({ userSelect: "text", cursor: "auto" });
  },
);

it("temporarily fits a short sidebar without replacing the requested height", async () => {
  await mount(500);
  expect(height()).toBe(500);
  sidebarHeight = 400;
  await act(async () => resized());
  expect(height()).toBe(140);
  expect(separator().props["aria-valuemax"]).toBe(140);
  expect(changed).not.toHaveBeenCalled();
  await key("ArrowUp");
  expect(changed).not.toHaveBeenCalled();
  await act(async () => separator().props.onPointerDown(pointer(300)));
  await act(async () => separator().props.onPointerUp(pointer(300)));
  expect(changed).not.toHaveBeenCalled();
  sidebarHeight = 900;
  await act(async () => resized());
  expect(height()).toBe(500);
  expect(changed).not.toHaveBeenCalled();
});

it("leaves the header accessible when there is too little room for both panel minimums", async () => {
  sidebarHeight = 280;
  await mount(500);
  expect(height()).toBe(39);
  expect(separator().props["aria-valuenow"]).toBe(39);
  expect(separator().props["aria-valuemin"]).toBe(39);
  expect(changed).not.toHaveBeenCalled();
});

it("releases a drag when the panel unmounts", async () => {
  await mount();
  await act(async () => separator().props.onPointerDown(pointer(300)));
  await act(async () => renderer!.unmount());
  renderer = undefined;
  expect(capture.size).toBe(0);
  expect(style).toEqual({ userSelect: "text", cursor: "auto" });
  expect(changed).not.toHaveBeenCalled();
});
