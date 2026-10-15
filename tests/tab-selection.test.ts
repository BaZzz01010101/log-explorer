import { expect, it } from "vitest";
import { selectWorkspaceEntry } from "../src/renderer/tab-selection";

const order = ["a", "b", "c", "d", "e"];
it("starts Ctrl selection with the active entry and toggles only the clicked entry", () => {
  const first = selectWorkspaceEntry(
    { ids: [], anchorId: null },
    order,
    "b",
    "d",
    { toggle: true },
  );
  expect(first).toEqual({ ids: ["b", "d"], anchorId: "d" });
  expect(
    selectWorkspaceEntry(first, order, "b", "b", { toggle: true }),
  ).toEqual({ ids: ["d"], anchorId: "b" });
});
it("Shift selects every entry inclusively from the active entry when no anchor exists", () => {
  expect(
    selectWorkspaceEntry({ ids: [], anchorId: null }, order, "b", "e", {
      shift: true,
    }),
  ).toEqual({ ids: ["b", "c", "d", "e"], anchorId: "b" });
});
it("Shift preserves its anchor when extending or shrinking in either direction", () => {
  const first = selectWorkspaceEntry(
    { ids: [], anchorId: "c" },
    order,
    "c",
    "a",
    { shift: true },
  );
  expect(first).toEqual({ ids: ["a", "b", "c"], anchorId: "c" });
  expect(selectWorkspaceEntry(first, order, "c", "d", { shift: true })).toEqual(
    { ids: ["c", "d"], anchorId: "c" },
  );
});
it("Ctrl+Shift adds a range to an existing disjoint selection", () => {
  expect(
    selectWorkspaceEntry({ ids: ["a", "c"], anchorId: "c" }, order, "a", "e", {
      shift: true,
      toggle: true,
    }),
  ).toEqual({ ids: ["a", "c", "d", "e"], anchorId: "c" });
});
it("normal click clears multi-selection and records a new range anchor", () => {
  expect(
    selectWorkspaceEntry(
      { ids: ["a", "c"], anchorId: "a" },
      order,
      "a",
      "d",
      {},
    ),
  ).toEqual({ ids: [], anchorId: "d" });
});
it("ignores removed entries and falls back from a removed anchor", () => {
  expect(
    selectWorkspaceEntry(
      { ids: ["gone", "a"], anchorId: "gone" },
      order,
      "c",
      "e",
      { shift: true },
    ),
  ).toEqual({ ids: ["c", "d", "e"], anchorId: "c" });
});
