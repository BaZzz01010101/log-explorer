import { act, create, type ReactTestRenderer } from "react-test-renderer";
import type { MouseEvent, PointerEvent } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { useColumnHeaderDrag } from "../src/renderer/useColumnHeaderDrag";
import type { ColumnConfig } from "../src/shared/contracts";

const columns: ColumnConfig[] = [
  { path: "@timestamp", width: 194, pinned: true },
  { path: "@level", width: 84 },
  { path: "@logGroup", width: 240, hidden: true },
  { path: "/service/name", width: 150 },
  { path: "@message", width: 420 },
];
let renderer: ReactTestRenderer | undefined;
let drag: ReturnType<typeof useColumnHeaderDrag>;
let changed = vi.fn<(columns: ColumnConfig[]) => void>();
const classes = new Set<string>();
const listeners = new Map<string, (event: unknown) => void>();
const frames = new Map<number, () => void>();
let sequence = 0;
const row = {
  contains: () => true,
  getBoundingClientRect: () => ({ top: 0, bottom: 33 }),
};
class ElementStub {
  constructor(
    readonly path = "@level",
    readonly controlled = false,
  ) {}
  ownerDocument = doc;
  setPointerCapture = vi.fn();
  hasPointerCapture = () => true;
  releasePointerCapture = vi.fn();
  focus = vi.fn();
  closest(selector: string): unknown {
    return selector === ".log-table-header"
      ? row
      : selector.startsWith(".log-header-cell")
        ? this
        : this.controlled
          ? {}
          : null;
  }
  getAttribute() {
    return this.path;
  }
  getBoundingClientRect() {
    return this.path === "@timestamp"
      ? { left: 0, width: 194 }
      : this.path === "/service/name"
        ? { left: 278, width: 150 }
        : { left: 428, width: 420 };
  }
}
const doc = {
  body: {
    classList: {
      add: (value: string) => classes.add(value),
      remove: (value: string) => classes.delete(value),
    },
  },
  defaultView: { getSelection: () => ({ removeAllRanges: vi.fn() }) },
  elementFromPoint: (x: number, y: number): ElementStub | null =>
    y > 33 || y < 0
      ? null
      : new ElementStub(
          x < 194 ? "@timestamp" : x < 428 ? "/service/name" : "@message",
        ),
};
const scroll = {
  scrollLeft: 0,
  getBoundingClientRect: () => ({ left: 0, right: 800 }),
};
let element: ElementStub;
function event(x = 236, y = 16, target = element) {
  return {
    pointerId: 1,
    isPrimary: true,
    button: 0,
    clientX: x,
    clientY: y,
    currentTarget: target,
    target,
    preventDefault: vi.fn(),
    stopPropagation: vi.fn(),
  } as unknown as PointerEvent<HTMLElement>;
}
function click() {
  return {
    detail: 1,
    preventDefault: vi.fn(),
    stopPropagation: vi.fn(),
  } as unknown as MouseEvent<HTMLElement>;
}
function Harness() {
  drag = useColumnHeaderDrag(columns, changed, {
    current: scroll as unknown as HTMLDivElement,
  });
  return null;
}
beforeEach(async () => {
  changed = vi.fn<(columns: ColumnConfig[]) => void>();
  classes.clear();
  listeners.clear();
  frames.clear();
  scroll.scrollLeft = 0;
  element = new ElementStub();
  vi.stubGlobal("Element", ElementStub);
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("requestAnimationFrame", (callback: () => void) => {
    const id = ++sequence;
    frames.set(id, callback);
    return id;
  });
  vi.stubGlobal("cancelAnimationFrame", (id: number) => frames.delete(id));
  vi.stubGlobal("window", {
    addEventListener: (name: string, handler: (event: unknown) => void) =>
      listeners.set(name, handler),
    removeEventListener: (name: string) => listeners.delete(name),
  });
  const original = console.error.bind(console);
  vi.spyOn(console, "error").mockImplementation((...args) => {
    if (!String(args[0]).startsWith("react-test-renderer is deprecated"))
      original(...args);
  });
  await act(async () => {
    renderer = create(<Harness />);
  });
});
afterEach(async () => {
  await act(async () => renderer?.unmount());
  renderer = undefined;
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
it("retains click sorting below the drag threshold and excludes header controls", async () => {
  await act(async () => {
    drag.begin("@level", event());
    drag.move(event(240));
    drag.end(event(240));
  });
  expect(changed).not.toHaveBeenCalled();
  const sorting = click();
  drag.onClickCapture(sorting);
  expect(sorting.preventDefault).not.toHaveBeenCalled();
  const control = new ElementStub("@level", true);
  await act(async () => drag.begin("@level", event(236, 16, control)));
  expect(control.setPointerCapture).not.toHaveBeenCalled();
});
it("commits an active drag once and suppresses its click without blocking the next simple click", async () => {
  await act(async () => {
    drag.begin("@level", event());
    drag.move(event(400));
  });
  expect(drag.visual).toEqual({
    sourcePath: "@level",
    targetPath: "/service/name",
    edge: "after",
  });
  expect(classes.has("reordering-columns")).toBe(true);
  await act(async () => drag.end(event(400)));
  expect(changed).toHaveBeenCalledTimes(1);
  expect(
    changed.mock.calls[0][0].map((column: ColumnConfig) => column.path),
  ).toEqual(["@timestamp", "/service/name", "@logGroup", "@level", "@message"]);
  const trailing = click();
  drag.onClickCapture(trailing);
  expect(trailing.preventDefault).toHaveBeenCalled();
  await act(async () => {
    drag.begin("@level", event());
    drag.end(event());
  });
  const next = click();
  drag.onClickCapture(next);
  expect(next.preventDefault).not.toHaveBeenCalled();
  expect(classes.size).toBe(0);
});
it("cancels Escape and outside/pinned-section drops without changing order or leaking capture styles", async () => {
  await act(async () => {
    drag.begin("@level", event());
    drag.move(event(400));
    listeners.get("keydown")!({
      key: "Escape",
      preventDefault: vi.fn(),
      stopPropagation: vi.fn(),
    });
    drag.end(event(400));
  });
  expect(changed).not.toHaveBeenCalled();
  expect(classes.size).toBe(0);
  const trailing = click();
  drag.onClickCapture(trailing);
  expect(trailing.preventDefault).toHaveBeenCalled();
  for (const destination of [event(400, 70), event(100)]) {
    await act(async () => {
      drag.begin("@level", event());
      drag.move(destination);
      drag.end(destination);
    });
    expect(changed).not.toHaveBeenCalled();
    expect(classes.size).toBe(0);
  }
});
it("scrolls horizontally near the viewport edge and stops scheduled scrolling when cancelled", async () => {
  await act(async () => {
    drag.begin("@level", event());
    drag.move(event(795));
  });
  expect(scroll.scrollLeft).toBeGreaterThan(0);
  expect(frames.size).toBe(1);
  await act(async () => drag.cancel());
  expect(frames.size).toBe(0);
  expect(classes.size).toBe(0);
});

it("releases pointer capture and scrolling styles when its view unmounts during a drag", async () => {
  await act(async () => {
    drag.begin("@level", event());
    drag.move(event(795));
  });
  expect(classes.has("reordering-columns")).toBe(true);
  await act(async () => {
    renderer!.unmount();
    renderer = undefined;
  });
  expect(classes.size).toBe(0);
  expect(frames.size).toBe(0);
  expect(element.releasePointerCapture).toHaveBeenCalledWith(1);
  expect(changed).not.toHaveBeenCalled();
});
