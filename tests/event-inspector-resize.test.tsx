import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { EventInspector } from "../src/renderer/components/EventInspector";

let renderer: ReactTestRenderer | undefined;
let parentWidth = 1000;
let notifyResize: ResizeObserverCallback;
let view: EventTarget;
let capture = false;
const disconnect = vi.fn();
const observe = vi.fn();
const selection = vi.fn();
const style = { userSelect: "text", cursor: "default" };
const parent = { getBoundingClientRect: () => ({ width: parentWidth }) };
const target = {
  ownerDocument: {
    documentElement: { style },
    defaultView: {
      addEventListener: (
        ...args: Parameters<EventTarget["addEventListener"]>
      ) => view.addEventListener(...args),
      removeEventListener: (
        ...args: Parameters<EventTarget["removeEventListener"]>
      ) => view.removeEventListener(...args),
      getSelection: () => ({ removeAllRanges: selection }),
    },
  },
  focus: vi.fn(),
  setPointerCapture: vi.fn(() => {
    capture = true;
  }),
  hasPointerCapture: () => capture,
  releasePointerCapture: vi.fn(() => {
    capture = false;
  }),
};

beforeEach(() => {
  parentWidth = 1000;
  capture = false;
  style.userSelect = "text";
  style.cursor = "default";
  view = new EventTarget();
  vi.clearAllMocks();
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal(
    "ResizeObserver",
    class {
      constructor(callback: ResizeObserverCallback) {
        notifyResize = callback;
      }
      observe = observe;
      disconnect = disconnect;
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
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function content(opened = true) {
  return (
    <EventInspector opened={opened} eventId="event-two">
      <button type="button">Copy event</button>
    </EventInspector>
  );
}

async function mount() {
  await act(async () => {
    renderer = create(content(), {
      createNodeMock: (element) =>
        element.type === "aside" ? { parentElement: parent } : target,
    });
  });
}

function divider() {
  return renderer!.root.findByProps({
    role: "separator",
    "aria-label": "Resize event inspector",
  });
}

it("defaults to 30 percent of its event area and follows parent resizing until manually resized", async () => {
  await mount();
  expect(divider().props["aria-valuenow"]).toBe(300);
  await resizeParent(1500);
  expect(divider().props["aria-valuenow"]).toBe(450);
  await resizeParent(500);
  expect(divider().props["aria-valuenow"]).toBe(150);
  await resizeParent(1000);
  await act(async () => divider().props.onKeyDown(key("ArrowLeft")));
  expect(divider().props["aria-valuenow"]).toBe(320);
  await resizeParent(1500);
  expect(divider().props["aria-valuenow"]).toBe(320);
});

function pointer(clientX = 500, pointerId = 7) {
  return {
    pointerId,
    button: 0,
    clientX,
    currentTarget: target,
    preventDefault: vi.fn(),
    stopPropagation: vi.fn(),
  };
}

function key(name: string) {
  return { key: name, preventDefault: vi.fn(), stopPropagation: vi.fn() };
}

async function resizeParent(width: number) {
  parentWidth = width;
  await act(async () => notifyResize([], {} as ResizeObserver));
}

it("exposes a nonmodal inspector with an accessible resize handle and no duplicate hide action", async () => {
  await mount();
  const region = renderer!.root.findByType("aside");
  expect(region.props.role).toBe("region");
  expect(region.props["aria-label"]).toBe("Event inspector");
  expect(region.props["data-event-id"]).toBe("event-two");
  expect(region.props.style.width).toBe(300);
  expect(renderer!.root.findAllByProps({ role: "dialog" })).toHaveLength(0);
  expect(divider().props["aria-orientation"]).toBe("vertical");
  expect(divider().props["aria-valuenow"]).toBe(300);
  expect(divider().props["aria-valuemin"]).toBe(260);
  expect(divider().props["aria-valuemax"]).toBe(860);
  expect(
    renderer!.root.findAllByProps({ "aria-label": "Hide inspector" }),
  ).toHaveLength(0);
});

it("resizes the right dock live under pointer capture and restores selection on release", async () => {
  await mount();
  const down = pointer();
  await act(async () => divider().props.onPointerDown(down));
  expect(down.preventDefault).toHaveBeenCalledOnce();
  expect(target.setPointerCapture).toHaveBeenCalledWith(7);
  expect(style.userSelect).toBe("none");
  expect(style.cursor).toBe("col-resize");
  await act(async () => divider().props.onPointerMove(pointer(300)));
  expect(divider().props["aria-valuenow"]).toBe(500);
  await act(async () => divider().props.onPointerUp(pointer(280)));
  expect(divider().props["aria-valuenow"]).toBe(520);
  expect(target.releasePointerCapture).toHaveBeenCalledWith(7);
  expect(style.userSelect).toBe("text");
  expect(style.cursor).toBe("default");
});

it("clamps live dragging to parent bounds and ignores other pointers", async () => {
  await mount();
  await act(async () => divider().props.onPointerDown(pointer()));
  await act(async () => divider().props.onPointerMove(pointer(300, 8)));
  expect(divider().props["aria-valuenow"]).toBe(300);
  await act(async () => divider().props.onPointerMove(pointer(-2000)));
  expect(divider().props["aria-valuenow"]).toBe(860);
  await act(async () => divider().props.onPointerMove(pointer(2000)));
  expect(divider().props["aria-valuenow"]).toBe(260);
});

it.each(["Escape", "pointercancel", "blur", "lostcapture"])(
  "restores the previous width and pointer state on %s",
  async (reason) => {
    await mount();
    await act(async () => divider().props.onPointerDown(pointer()));
    await act(async () => divider().props.onPointerMove(pointer(300)));
    expect(divider().props["aria-valuenow"]).toBe(500);
    await act(async () => {
      if (reason === "Escape") divider().props.onKeyDown(key("Escape"));
      if (reason === "pointercancel")
        divider().props.onPointerCancel(pointer(300));
      if (reason === "blur") view.dispatchEvent(new Event("blur"));
      if (reason === "lostcapture")
        divider().props.onLostPointerCapture(pointer(300));
    });
    expect(divider().props["aria-valuenow"]).toBe(300);
    expect(style.userSelect).toBe("text");
    expect(style.cursor).toBe("default");
    expect(capture).toBe(false);
  },
);

it("supports keyboard resizing and Home/End bounds", async () => {
  await mount();
  await act(async () => divider().props.onKeyDown(key("ArrowLeft")));
  expect(divider().props["aria-valuenow"]).toBe(320);
  await act(async () => divider().props.onKeyDown(key("ArrowRight")));
  expect(divider().props["aria-valuenow"]).toBe(300);
  await act(async () => divider().props.onKeyDown(key("Home")));
  expect(divider().props["aria-valuenow"]).toBe(260);
  await act(async () => divider().props.onKeyDown(key("End")));
  expect(divider().props["aria-valuenow"]).toBe(860);
});

it("retains the chosen width when hidden and restores it after temporary parent narrowing", async () => {
  await mount();
  await act(async () => divider().props.onKeyDown(key("ArrowLeft")));
  await resizeParent(500);
  expect(divider().props["aria-valuenow"]).toBe(320);
  await resizeParent(300);
  expect(divider().props["aria-valuenow"]).toBe(160);
  expect(divider().props["aria-valuemin"]).toBe(90);
  await act(async () => renderer!.update(content(false)));
  expect(renderer!.root.findAllByType("aside")).toHaveLength(0);
  parentWidth = 1000;
  await act(async () => renderer!.update(content()));
  expect(divider().props["aria-valuenow"]).toBe(320);
});

it.each(["hide", "unmount"])(
  "releases capture, selection state, and resize observation on %s",
  async (reason) => {
    await mount();
    await act(async () => divider().props.onPointerDown(pointer()));
    await act(async () => divider().props.onPointerMove(pointer(300)));
    await act(async () => {
      if (reason === "hide") renderer!.update(content(false));
      else {
        renderer!.unmount();
        renderer = undefined;
      }
    });
    expect(target.releasePointerCapture).toHaveBeenCalledWith(7);
    expect(style.userSelect).toBe("text");
    expect(style.cursor).toBe("default");
    expect(disconnect).toHaveBeenCalledOnce();
    if (reason === "hide") {
      await act(async () => renderer!.update(content()));
      expect(divider().props["aria-valuenow"]).toBe(300);
    }
  },
);
