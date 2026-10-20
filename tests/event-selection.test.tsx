import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { useEventSelection } from "../src/renderer/useEventSelection";
let renderer: ReactTestRenderer;
let selection: ReturnType<typeof useEventSelection>;
function Harness({
  ids,
  initiallyOpened,
}: {
  ids: string[];
  initiallyOpened?: boolean;
}) {
  selection = useEventSelection(ids, initiallyOpened);
  return null;
}
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const original = console.error.bind(console);
  vi.spyOn(console, "error").mockImplementation((...args) => {
    if (!String(args[0]).startsWith("react-test-renderer is deprecated"))
      original(...args);
  });
});
afterEach(async () => {
  await act(async () => renderer?.unmount());
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
it("selects without opening and follows selection while the inspector is open", async () => {
  await act(async () => {
    renderer = create(
      <Harness ids={["a", "b", "c"]} initiallyOpened={false} />,
    );
  });
  await act(async () => selection.select("a"));
  expect(selection.selectedId).toBe("a");
  expect(selection.opened).toBe(false);
  await act(async () => selection.inspect("b"));
  expect(selection.selectedId).toBe("b");
  expect(selection.opened).toBe(true);
  await act(async () => selection.select("c"));
  expect(selection.selectedId).toBe("c");
  expect(selection.opened).toBe(true);
  await act(async () => selection.close());
  expect(selection.selectedId).toBe("c");
  expect(selection.opened).toBe(false);
});
it("opens by default, selects the first arrival and toggles while retaining selection", async () => {
  await act(async () => {
    renderer = create(<Harness ids={[]} />);
  });
  expect(selection.opened).toBe(true);
  await act(async () => renderer.update(<Harness ids={["a", "b"]} />));
  expect(selection.selectedId).toBe("a");
  await act(async () => selection.select("b"));
  await act(async () => selection.toggle());
  expect(selection.opened).toBe(false);
  await act(async () => selection.toggle());
  expect(selection.opened).toBe(true);
  expect(selection.selectedId).toBe("b");
});
it("navigates the displayed order and clamps at either end", async () => {
  await act(async () => {
    renderer = create(
      <Harness ids={["c", "a", "b"]} initiallyOpened={false} />,
    );
  });
  await act(async () => {
    selection.move("next");
  });
  expect(selection.selectedId).toBe("c");
  await act(async () => {
    selection.move("previous");
  });
  expect(selection.selectedId).toBe("c");
  await act(async () => {
    selection.move("last");
  });
  expect(selection.selectedId).toBe("b");
  await act(async () => {
    selection.move("next");
  });
  expect(selection.selectedId).toBe("b");
  await act(async () => {
    selection.move("first");
  });
  expect(selection.selectedId).toBe("c");
});
it("retains selection through sorting and chooses a surviving neighbor after filtering", async () => {
  await act(async () => {
    renderer = create(<Harness ids={["a", "b", "c"]} />);
  });
  await act(async () => selection.inspect("b"));
  await act(async () => renderer.update(<Harness ids={["c", "b", "a"]} />));
  expect(selection.selectedId).toBe("b");
  await act(async () => renderer.update(<Harness ids={["c", "a"]} />));
  expect(selection.selectedId).toBe("a");
  expect(selection.opened).toBe(true);
  await act(async () => renderer.update(<Harness ids={[]} />));
  expect(selection.selectedId).toBeNull();
  await act(async () => renderer.update(<Harness ids={["new"]} />));
  expect(selection.selectedId).toBe("new");
  expect(selection.opened).toBe(true);
});

it("toggles additive rows while retaining the current row when multi-selection starts", async () => {
  await act(async () => {
    renderer = create(<Harness ids={["a", "b", "c"]} />);
  });
  await act(async () => selection.select("c", { additive: true }));
  expect(selection.selectedIds).toEqual(["a", "c"]);
  expect(selection.selectedId).toBe("c");
  await act(async () => selection.select("a", { additive: true }));
  expect(selection.selectedIds).toEqual(["c"]);
  expect(selection.selectedId).toBe("a");
  await act(async () => selection.select("b"));
  expect(selection.selectedIds).toEqual(["b"]);
  expect(selection.opened).toBe(true);
});

it("extends anchored ranges in displayed order and supports additive ranges", async () => {
  await act(async () => {
    renderer = create(<Harness ids={["d", "a", "c", "b", "e"]} />);
  });
  await act(async () => selection.select("a"));
  await act(async () => selection.select("b", { range: true }));
  expect(selection.selectedIds).toEqual(["a", "c", "b"]);
  await act(async () => selection.select("c", { range: true }));
  expect(selection.selectedIds).toEqual(["a", "c"]);
  await act(async () => selection.select("e", { additive: true }));
  await act(async () => selection.select("b", { additive: true, range: true }));
  expect(selection.selectedIds).toEqual(["a", "c", "b", "e"]);
});

it("selects all displayed rows and retains surviving selection in sorted and filtered order", async () => {
  await act(async () => {
    renderer = create(<Harness ids={["a", "b", "c", "d"]} />);
  });
  await act(async () => selection.selectAll());
  expect(selection.selectedIds).toEqual(["a", "b", "c", "d"]);
  await act(async () =>
    renderer.update(<Harness ids={["d", "b", "c", "a"]} />),
  );
  expect(selection.selectedIds).toEqual(["d", "b", "c", "a"]);
  await act(async () => renderer.update(<Harness ids={["d", "c"]} />));
  expect(selection.selectedIds).toEqual(["d", "c"]);
  expect(selection.selectedId).toBe("c");
  await act(async () => renderer.update(<Harness ids={[]} />));
  expect(selection.selectedIds).toEqual([]);
});

it("extends keyboard ranges from the anchor and keeps multi-selection when inspecting a selected row", async () => {
  await act(async () => {
    renderer = create(<Harness ids={["a", "b", "c", "d"]} />);
  });
  await act(async () => {
    selection.move("next", { range: true });
  });
  await act(async () => {
    selection.move("next", { range: true });
  });
  expect(selection.selectedIds).toEqual(["a", "b", "c"]);
  await act(async () => selection.inspect("b"));
  expect(selection.selectedIds).toEqual(["a", "b", "c"]);
  expect(selection.selectedId).toBe("b");
  await act(async () => {
    selection.move("next");
  });
  expect(selection.selectedIds).toEqual(["c"]);
});
