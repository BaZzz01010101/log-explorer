import { expect, it, vi } from "vitest";
import { highlightTableKeyboardCoordinates } from "../src/renderer/highlight-table-keyboard";

function move(code: string, over = "a", translation = 0, disabled?: string) {
  const entries = ["a", "b", "c"].map((id, index) => ({
    id,
    disabled: id === disabled,
    data: {
      current: {
        sortable: { containerId: "list", items: ["a", "b", "c"], index },
      },
    },
  }));
  const rects = new Map([
    ["a", { top: 0, left: 0, height: 260, width: 100 }],
    ["b", { top: 260, left: 0, height: 52, width: 100 }],
    ["c", { top: 312, left: 0, height: 80, width: 100 }],
  ]);
  return highlightTableKeyboardCoordinates(
    { code, preventDefault: vi.fn() } as unknown as KeyboardEvent,
    {
      currentCoordinates: { x: 0, y: translation },
      context: {
        active: entries[0],
        over: entries.find((item) => item.id === over),
        collisionRect: { ...rects.get("a")!, top: translation },
        droppableContainers: new Map(entries.map((item) => [item.id, item])),
        droppableRects: rects,
      },
    } as unknown as Parameters<typeof highlightTableKeyboardCoordinates>[1],
  );
}

it("moves an expanded row onto the next short row's center instead of keeping the old collision", () => {
  expect(move("ArrowDown")).toEqual({ x: 0, y: 156 });
});
it("moves repeatedly through logical siblings and back to the original position", () => {
  expect(move("ArrowDown", "b", 156)).toEqual({ x: 0, y: 222 });
  expect(move("ArrowUp", "b", 156)).toEqual({ x: 0, y: 0 });
  expect(move("ArrowDown", "c", 222)).toBeUndefined();
  expect(move("ArrowUp")).toBeUndefined();
});
it("skips disabled siblings and ignores unrelated keys", () => {
  expect(move("ArrowDown", "a", 0, "b")).toEqual({ x: 0, y: 222 });
  expect(move("ArrowRight")).toBeUndefined();
});
