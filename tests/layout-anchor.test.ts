import { expect, it } from "vitest";
import { anchoredTop, layoutAnchor } from "../src/renderer/layout-anchor";

const rows = (...tops: [number, number][]) =>
  tops.map(([top, height], index) => ({ id: `row-${index}`, top, height }));
const list = rows([-60, 40], [-20, 40], [20, 40], [60, 40], [100, 40]);

it("anchors the selected row, the end of the list, or the first visible row", () => {
  expect(layoutAnchor(list, 120, { selectedId: "row-3" })).toEqual({
    kind: "row",
    id: "row-3",
    top: 60,
    cut: 0,
    whole: true,
  });
  // A selected row out of view, or barely in view, does not decide.
  expect(layoutAnchor(list, 120, { selectedId: "row-0" })?.id).toBe("row-1");
  expect(layoutAnchor(list, 110, { selectedId: "row-4" })?.id).toBe("row-1");
  expect(layoutAnchor(list, 120, { selectedId: null, endId: "row-4" })).toEqual(
    { kind: "end", id: "row-4" },
  );
  expect(
    layoutAnchor(list, 120, { selectedId: "row-2", endId: "row-4" })?.id,
  ).toBe("row-2");
  expect(layoutAnchor([], 120, {})).toBeNull();
  // One row fills the whole view.
  expect(layoutAnchor(rows([-300, 900]), 400, {})).toMatchObject({
    id: "row-0",
    cut: 1 / 3,
  });
});

it("keeps the place of a row whose height changes", () => {
  const anchor = layoutAnchor(list, 400, { selectedId: "row-3" })!;
  expect(anchoredTop(anchor, 40, 400)).toBe(60);
  expect(anchoredTop(anchor, 300, 400)).toBe(60);
  // It moves up only as far as it must to be fully visible.
  expect(anchoredTop(anchor, 380, 400)).toBe(20);
  expect(anchoredTop(anchor, 900, 400)).toBe(0);
});

it("keeps the cut-off share of a row at the top and shows enough of one at the bottom", () => {
  const top = layoutAnchor(list, 400, {})!;
  expect(top).toMatchObject({ id: "row-1", cut: 0.5, whole: false });
  expect(anchoredTop(top, 200, 400)).toBe(-100);
  const bottom = layoutAnchor(rows([300, 180]), 400, {})!;
  expect(bottom).toMatchObject({ top: 300, whole: false });
  expect(anchoredTop(bottom, 180, 400)).toBe(220);
  expect(anchoredTop(bottom, 60, 400)).toBe(300);
  expect(anchoredTop({ kind: "end", id: "row-0" }, 180, 400)).toBe(220);
});
