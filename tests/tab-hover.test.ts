import { expect, it } from "vitest";
import { tabOverlapTarget } from "../src/renderer/tab-hover";

const rect = (left: number, width: number, top = 0, height = 40) => ({
  left,
  top,
  width,
  height,
});

it.each([
  [310, 130],
  [130, 310],
])(
  "requires 20 percent of the smaller width for %s over %s",
  (sourceWidth, targetWidth) => {
    const threshold = Math.min(sourceWidth, targetWidth) * 0.2;
    const target = [{ id: "target", rect: rect(sourceWidth, targetWidth) }];
    expect(
      tabOverlapTarget(rect(threshold - 0.01, sourceWidth), target),
    ).toBeNull();
    expect(tabOverlapTarget(rect(threshold, sourceWidth), target)).toBe(
      "target",
    );
    expect(tabOverlapTarget(rect(threshold + 0.01, sourceWidth), target)).toBe(
      "target",
    );
  },
);

it("uses shifted tab rectangles and keeps the same target across the gap swap", () => {
  expect(
    tabOverlapTarget(rect(39, 310), [{ id: "small", rect: rect(310, 130) }]),
  ).toBe("small");
  expect(
    tabOverlapTarget(rect(66, 310), [
      { id: "small", rect: rect(0, 130) },
      { id: "right", rect: rect(440, 167) },
    ]),
  ).toBe("small");
  expect(
    tabOverlapTarget(rect(220, 167), [
      { id: "first", rect: rect(0, 310) },
      { id: "old-neighbor", rect: rect(477, 130) },
    ]),
  ).toBe("first");
});

it("ignores other rows and barely touching row transitions", () => {
  const targets = [{ id: "other-row", rect: rect(0, 130, 40) }];
  expect(tabOverlapTarget(rect(0, 310), targets)).toBeNull();
  expect(tabOverlapTarget(rect(0, 310, 1), targets)).toBeNull();
  expect(tabOverlapTarget(rect(0, 310, 40), targets)).toBe("other-row");
});

it("selects the strongest overlap and retains a pending target at equal coverage", () => {
  const targets = [
    { id: "left", rect: rect(0, 130) },
    { id: "right", rect: rect(130, 130) },
  ];
  expect(tabOverlapTarget(rect(0, 310), targets, "right")).toBe("right");
  expect(tabOverlapTarget(rect(0, 310), targets)).toBe("right");
  expect(tabOverlapTarget(rect(-50, 130), targets)).toBe("left");
  expect(tabOverlapTarget(rect(190, 130), targets, "left")).toBe("right");
});

it("excludes portions clipped outside the visible tab strip", () => {
  const targets = [{ id: "hidden", rect: rect(0, 130), clip: rect(100, 400) }];
  expect(tabOverlapTarget(rect(-20, 100), targets)).toBeNull();
  expect(tabOverlapTarget(rect(50, 100), targets)).toBe("hidden");
});
