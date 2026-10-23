import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { InspectorMessage } from "../src/renderer/components/InspectorMessage";

let renderer: ReactTestRenderer | undefined;
let frames: Map<number, FrameRequestCallback>;
let nextFrame: number;
let elements: any[];
let mutations: (() => void)[];
let resizes: (() => void)[];
let disconnects: ReturnType<typeof vi.fn>[];
let wheelListener: ((event: any) => void) | undefined;
const overview = {
  addEventListener: (_type: string, listener: (event: any) => void) => {
    wheelListener = listener;
  },
  removeEventListener: () => {
    wheelListener = undefined;
  },
};
const scroll = {
  clientHeight: 100,
  scrollHeight: 1000,
  clientTop: 1,
  clientLeft: 1,
  clientWidth: 400,
  scrollWidth: 3000,
  scrollTop: 0,
  scrollLeft: 0,
  getBoundingClientRect: () => ({ top: 20, left: 30 }),
};
const body = { querySelectorAll: () => elements, parentElement: null };

const fragment = (
  origins: string,
  tops: number[],
  profile = false,
  left = 15,
) => ({
  dataset: { highlightOrigins: origins },
  classList: {
    contains: (name: string) => profile && name === "profile-highlight-text",
  },
  getClientRects: () =>
    tops.map((top) => ({
      top: 21 + top - scroll.scrollTop,
      left: 31 + left - scroll.scrollLeft,
      height: 20,
      width: 30,
    })),
});

it("reveals an unwrapped late-column match horizontally using content coordinates", async () => {
  scroll.scrollLeft = 200;
  elements = [fragment("server", [700], false, 2200)];
  await mount();
  await flush();
  const lane = renderer!.root.findByProps({
    className: "inspector-message-lane",
    "data-match-origin": "server",
  });
  lane.props.onClick({
    clientY: 70,
    currentTarget: { getBoundingClientRect: () => ({ top: 0 }) },
  });
  expect(scroll.scrollTop).toBe(660);
  expect(scroll.scrollLeft).toBe(2015);
});

it("preserves horizontal position for visible fragments and clamps leftward navigation", async () => {
  scroll.scrollLeft = 200;
  elements = [
    fragment("server", [700], false, 250),
    fragment("manual", [800], false, 20),
  ];
  await mount();
  await flush();
  const click = (origin: string, clientY: number) =>
    renderer!.root
      .findByProps({
        className: "inspector-message-lane",
        "data-match-origin": origin,
      })
      .props.onClick({
        clientY,
        currentTarget: { getBoundingClientRect: () => ({ top: 0 }) },
      });
  click("server", 70);
  expect(scroll.scrollLeft).toBe(200);
  click("manual", 80);
  expect(scroll.scrollLeft).toBe(0);
});
const flush = async () => {
  await act(async () => {
    while (frames.size) {
      const batch = [...frames];
      frames.clear();
      batch.forEach(([, callback]) => callback(0));
    }
  });
};
const mount = async (eventId = "one") => {
  await act(async () => {
    renderer = create(
      <InspectorMessage
        eventId={eventId}
        className="raw-content"
        style={{ color: "red" }}
      >
        <mark>message text</mark>
      </InspectorMessage>,
      {
        createNodeMock: (node: { props: any }) =>
          node.props.className === "inspector-message-body"
            ? body
            : node.props.className?.includes("inspector-content")
              ? scroll
              : node.props.className === "inspector-message-overview"
                ? overview
                : null,
      },
    );
  });
};
beforeEach(() => {
  frames = new Map();
  nextFrame = 0;
  elements = [];
  mutations = [];
  resizes = [];
  disconnects = [];
  wheelListener = undefined;
  scroll.scrollTop = 0;
  scroll.scrollLeft = 0;
  scroll.clientHeight = 100;
  scroll.scrollHeight = 1000;
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
    frames.set(++nextFrame, callback);
    return nextFrame;
  });
  vi.stubGlobal("cancelAnimationFrame", (id: number) => frames.delete(id));
  vi.stubGlobal(
    "ResizeObserver",
    class {
      disconnect = vi.fn();
      constructor(callback: () => void) {
        resizes.push(callback);
        disconnects.push(this.disconnect);
      }
      observe() {}
    },
  );
  vi.stubGlobal(
    "MutationObserver",
    class {
      disconnect = vi.fn();
      constructor(callback: () => void) {
        mutations.push(callback);
        disconnects.push(this.disconnect);
      }
      observe() {}
    },
  );
  vi.stubGlobal("getComputedStyle", () => ({
    getPropertyValue: (name: string) =>
      ({
        "--filter-match-server": "blue",
        "--filter-match-local": "green",
        "--filter-match-manual": "gold",
      })[name],
    backgroundColor: "pink",
  }));
});
afterEach(async () => {
  await act(async () => renderer?.unmount());
  renderer = undefined;
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

it("maps every wrapped text fragment, combined origins, folded markers and profile colors", async () => {
  elements = [
    fragment("server manual", [100, 120], true),
    { ...fragment("", [700]), dataset: { matchOrigin: "local" } },
  ];
  await mount();
  await flush();
  const marks = renderer!.root.findAllByProps({
    className: "inspector-message-mark",
  });
  expect(new Set(marks.map((mark) => mark.props["data-match-origin"]))).toEqual(
    new Set(["server", "manual", "local", "profile"]),
  );
  expect(
    marks.find((mark) => mark.props["data-match-origin"] === "local")?.props
      .style.top,
  ).toBe(70);
  expect(
    marks.find((mark) => mark.props["data-match-origin"] === "profile")?.props
      .style.background,
  ).toBe("pink");
  const wrapped = marks.find(
    (mark) => mark.props["data-match-origin"] === "server",
  )!;
  expect(wrapped.props.style).toMatchObject({ top: 10, height: 4 });
  expect(wrapped.props["data-content-end"]).toBe(140);
  expect(
    renderer!.root.findByProps({ className: "inspector-content raw-content" })
      .props.style,
  ).toEqual({ color: "red" });
});

it("scrolls only the message on map click and wheel without focusing another surface", async () => {
  elements = [fragment("server", [700])];
  await mount();
  await flush();
  const lane = renderer!.root.findByProps({
    className: "inspector-message-lane",
    "data-match-origin": "server",
  });
  lane.props.onClick({
    clientY: 70,
    currentTarget: { getBoundingClientRect: () => ({ top: 0 }) },
  });
  expect(scroll.scrollTop).toBe(660);
  const stopPropagation = vi.fn();
  const preventDefault = vi.fn();
  expect(wheelListener).toBeTypeOf("function");
  wheelListener!({
    deltaY: 40,
    deltaX: 3,
    deltaMode: 0,
    stopPropagation,
    preventDefault,
  });
  expect(scroll.scrollTop).toBe(700);
  expect(scroll.scrollLeft).toBe(3);
  expect(stopPropagation).toHaveBeenCalledOnce();
  expect(preventDefault).toHaveBeenCalledOnce();
});

it("reprojects positions on resize and refreshes profile colors after theme changes", async () => {
  elements = [fragment("", [800], true)];
  await mount();
  await flush();
  scroll.clientHeight = 200;
  resizes[0]();
  await flush();
  let mark = renderer!.root.findByProps({
    className: "inspector-message-mark",
  });
  expect(mark.props.style.top).toBe(160);
  vi.stubGlobal("getComputedStyle", () => ({
    backgroundColor: "purple",
    getPropertyValue: () => "",
  }));
  mutations[0]();
  await flush();
  mark = renderer!.root.findByProps({ className: "inspector-message-mark" });
  expect(mark.props.style.background).toBe("purple");
});

it("maps foreground-only profile highlights and folded profile dots", async () => {
  elements = [
    fragment("", [100], true),
    { ...fragment("", [800]), dataset: { matchOrigin: "profile" } },
  ];
  vi.stubGlobal("getComputedStyle", () => ({
    backgroundColor: "rgba(0, 0, 0, 0)",
    color: "orange",
    getPropertyValue: () => "",
  }));
  await mount();
  await flush();
  const marks = renderer!.root.findAllByProps({
    className: "inspector-message-mark",
  });
  expect(marks).toHaveLength(2);
  expect(marks.map((mark) => mark.props["data-match-origin"])).toEqual([
    "profile",
    "profile",
  ]);
  expect(marks.map((mark) => mark.props.style.background)).toEqual([
    "orange",
    "orange",
  ]);
});

it("bounds each frame and cancels unfinished batches when changing events", async () => {
  const read = vi.fn();
  elements = Array.from({ length: 350 }, (_, index) => {
    const match = fragment("server", [index]);
    return {
      ...match,
      getClientRects: () => {
        read();
        return match.getClientRects();
      },
    };
  });
  await mount();
  await act(async () => {
    const batch = [...frames];
    frames.clear();
    batch.forEach(([, callback]) => callback(0));
  });
  expect(read).toHaveBeenCalledTimes(200);
  expect(frames.size).toBe(1);
  elements = [];
  await act(async () =>
    renderer!.update(
      <InspectorMessage eventId="two">next event</InspectorMessage>,
    ),
  );
  await flush();
  expect(read).toHaveBeenCalledTimes(200);
  expect(
    renderer!.root.findAllByProps({ className: "inspector-message-mark" }),
  ).toHaveLength(0);
});

it("clears previous event geometry before the next frame and ignores canceled measurement", async () => {
  elements = [fragment("server", [100])];
  await mount();
  await flush();
  expect(
    renderer!.root.findAllByProps({ className: "inspector-message-mark" }),
  ).toHaveLength(1);
  await act(async () =>
    renderer!.update(
      <InspectorMessage eventId="two">next message</InspectorMessage>,
    ),
  );
  expect(
    renderer!.root.findAllByProps({ className: "inspector-message-mark" }),
  ).toHaveLength(0);
  elements = [];
  await flush();
  expect(
    renderer!.root.findAllByProps({ className: "inspector-message-mark" }),
  ).toHaveLength(0);
});

it("coalesces fold and decoding mutations and disconnects pending observers on unmount", async () => {
  elements = [fragment("server", [100])];
  await mount();
  await flush();
  elements = [fragment("manual", [800])];
  mutations[0]();
  mutations[0]();
  mutations[0]();
  expect(frames.size).toBe(1);
  await flush();
  const marks = renderer!.root.findAllByProps({
    className: "inspector-message-mark",
  });
  expect(marks).toHaveLength(1);
  expect(marks[0].props["data-match-origin"]).toBe("manual");
  mutations[0]();
  await act(async () => renderer!.unmount());
  renderer = undefined;
  expect(frames.size).toBe(0);
  expect(
    disconnects.every((disconnect) => disconnect.mock.calls.length === 1),
  ).toBe(true);
});
