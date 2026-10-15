import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { useRef } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import {
  useScrollPagination,
  type ScrollPageTarget,
} from "../src/renderer/useScrollPagination";

class ScrollElement extends EventTarget {
  clientHeight = 300;
  scrollHeight = 600;
  scrollTop = 0;
  firstElementChild = null;
}
let renderer: ReactTestRenderer | undefined;
let element: ScrollElement;
let resize: (() => void) | undefined;
let disconnected: ReturnType<typeof vi.fn>;
function Harness({
  scope = "query-1",
  targets,
}: {
  scope?: string;
  targets: ScrollPageTarget[];
}) {
  const ref = useRef(element as unknown as HTMLDivElement);
  useScrollPagination(ref, { scope, targets });
  return null;
}

beforeEach(() => {
  element = new ScrollElement();
  disconnected = vi.fn();
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal(
    "ResizeObserver",
    class {
      constructor(callback: () => void) {
        resize = callback;
      }
      observe() {}
      disconnect = disconnected;
    },
  );
  const original = console.error.bind(console);
  vi.spyOn(console, "error").mockImplementation((...args) => {
    if (String(args[0]).startsWith("react-test-renderer is deprecated")) return;
    original(...args);
  });
});
afterEach(async () => {
  await act(async () => renderer?.unmount());
  renderer = undefined;
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

it("loads near the bottom and consumes the cursor synchronously before duplicate scroll events", async () => {
  const load = vi.fn();
  await act(async () => {
    renderer = create(<Harness targets={[{ key: "cursor-1", load }]} />);
  });
  expect(load).not.toHaveBeenCalled();
  element.scrollTop = 300;
  await act(async () => {
    element.dispatchEvent(new Event("scroll"));
    element.dispatchEvent(new Event("scroll"));
    resize?.();
  });
  expect(load).toHaveBeenCalledTimes(1);
  await act(async () => {
    renderer!.update(<Harness targets={[{ key: "cursor-1", load }]} />);
  });
  expect(load).toHaveBeenCalledTimes(1);
});

it("fills an underfull viewport and loads new cursor pages without a scroll event", async () => {
  element.scrollHeight = 200;
  const load = vi.fn();
  await act(async () => {
    renderer = create(<Harness targets={[{ key: "one", load }]} />);
  });
  expect(load).toHaveBeenCalledTimes(1);
  await act(async () => {
    renderer!.update(<Harness targets={[{ key: "two", load }]} />);
  });
  expect(load).toHaveBeenCalledTimes(2);
  element.scrollHeight = 900;
  await act(async () => {
    renderer!.update(<Harness targets={[{ key: "three", load }]} />);
  });
  expect(load).toHaveBeenCalledTimes(2);
});

it("triggers only reached expanded-stream sentinels", async () => {
  const first = vi.fn(),
    second = vi.fn(),
    groups = vi.fn();
  await act(async () => {
    renderer = create(
      <Harness
        targets={[
          { key: "stream-1", end: 100, load: first },
          { key: "stream-2", end: 800, load: second },
          { key: "groups", end: 1200, load: groups },
        ]}
      />,
    );
  });
  expect(first).toHaveBeenCalledTimes(1);
  expect(second).not.toHaveBeenCalled();
  expect(groups).not.toHaveBeenCalled();
  element.scrollTop = 500;
  await act(async () => {
    element.dispatchEvent(new Event("scroll"));
  });
  expect(second).toHaveBeenCalledTimes(1);
  expect(groups).not.toHaveBeenCalled();
});

it("allows the same cursor only after a new query generation", async () => {
  element.scrollHeight = 200;
  const load = vi.fn();
  await act(async () => {
    renderer = create(<Harness targets={[{ key: "one", load }]} />);
  });
  await act(async () => {
    renderer!.update(
      <Harness scope="query-2" targets={[{ key: "one", load }]} />,
    );
  });
  expect(load).toHaveBeenCalledTimes(2);
});

it("ignores busy or stale pages represented by no enabled targets", async () => {
  element.scrollHeight = 200;
  const load = vi.fn();
  await act(async () => {
    renderer = create(<Harness targets={[]} />);
  });
  expect(load).not.toHaveBeenCalled();
  await act(async () => {
    renderer!.update(<Harness targets={[{ key: "one", load }]} />);
  });
  expect(load).toHaveBeenCalledTimes(1);
  await act(async () => {
    renderer!.update(<Harness targets={[]} />);
  });
  await act(async () => {
    element.dispatchEvent(new Event("scroll"));
  });
  expect(load).toHaveBeenCalledTimes(1);
  await act(async () => {
    renderer!.update(<Harness targets={[{ key: "one", load }]} />);
  });
  expect(load).toHaveBeenCalledTimes(1);
});

it("bounds empty-page chaining and resumes after explicit scrolling", async () => {
  element.scrollHeight = 100;
  const load = vi.fn();
  await act(async () => {
    renderer = create(<Harness targets={[]} />);
  });
  for (let page = 0; page < 30; page++)
    await act(async () => {
      renderer!.update(<Harness targets={[{ key: String(page), load }]} />);
    });
  expect(load).toHaveBeenCalledTimes(20);
  await act(async () => {
    element.dispatchEvent(new Event("scroll"));
  });
  expect(load).toHaveBeenCalledTimes(21);
});

it("waits until a hidden viewport becomes visible and cleans observers", async () => {
  element.clientHeight = 0;
  const load = vi.fn();
  await act(async () => {
    renderer = create(<Harness targets={[{ key: "one", load }]} />);
  });
  expect(load).not.toHaveBeenCalled();
  element.clientHeight = 700;
  await act(async () => resize?.());
  expect(load).toHaveBeenCalledTimes(1);
  await act(async () => renderer!.unmount());
  renderer = undefined;
  expect(disconnected).toHaveBeenCalledTimes(1);
});

it.each(["wheel", "keydown"])(
  "resumes an underfilled bounded search using %s when no scroll event can fire",
  async (kind) => {
    element.scrollHeight = 100;
    const load = vi.fn();
    await act(async () => {
      renderer = create(<Harness targets={[]} />);
    });
    for (let page = 0; page < 21; page++)
      await act(async () => {
        renderer!.update(<Harness targets={[{ key: String(page), load }]} />);
      });
    expect(load).toHaveBeenCalledTimes(20);
    const event = Object.assign(
      new Event(kind),
      kind === "wheel" ? { deltaY: 100 } : { key: "PageDown" },
    );
    await act(async () => {
      element.dispatchEvent(event);
    });
    expect(load).toHaveBeenCalledTimes(21);
  },
);
