import { expect, it } from "vitest";
import {
  legacyLayout,
  normalizeLayout,
  removeLayoutPane,
  splitLayout,
  layoutPaneIds,
  nextSplitAxis,
} from "../src/shared/pane-layout";

it("migrates fixed layouts and rejects duplicate, missing and deeply nested pane references", () => {
  const layout = legacyLayout(["one", "two", "three"], {
    horizontal: 0.6,
    vertical: 0.4,
  });
  expect(layoutPaneIds(layout)).toEqual(["one", "two", "three"]);
  expect(normalizeLayout(layout, ["one", "two", "three"])).toEqual(layout);
  expect(
    normalizeLayout(
      {
        type: "split",
        axis: "horizontal",
        ratio: 0.5,
        first: { type: "leaf", paneId: "one" },
        second: { type: "leaf", paneId: "one" },
      },
      ["one", "two"],
    ),
  ).toBeUndefined();
});

it("splits the target pane at the requested edge and collapses it cleanly on close", () => {
  const initial = legacyLayout(["one", "two"]);
  expect(nextSplitAxis(initial, "two")).toBe("vertical");
  const layout = splitLayout(initial, "two", "three", "top");
  expect(layout.type).toBe("split");
  if (layout.type !== "split") throw new Error("Expected split");
  expect(layout.first).toEqual({ type: "leaf", paneId: "one" });
  expect(layout.second).toEqual({
    type: "split",
    axis: "vertical",
    ratio: 0.5,
    first: { type: "leaf", paneId: "three" },
    second: { type: "leaf", paneId: "two" },
  });
  expect(removeLayoutPane(layout, "three")).toEqual(initial);
});
