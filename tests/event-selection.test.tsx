import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { useEventSelection } from "../src/renderer/useEventSelection";
let renderer: ReactTestRenderer;
let selection: ReturnType<typeof useEventSelection>;
function Harness({ ids }: { ids: string[] }) {
  selection = useEventSelection(ids);
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
    renderer = create(<Harness ids={["a", "b", "c"]} />);
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
it("navigates the displayed order and clamps at either end", async () => {
  await act(async () => {
    renderer = create(<Harness ids={["c", "a", "b"]} />);
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
