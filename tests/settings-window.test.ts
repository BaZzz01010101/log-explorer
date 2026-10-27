import { expect, it } from "vitest";
import {
  constrainSettingsFrame,
  initialSettingsFrame,
  moveSettingsFrame,
  settingsResizeEdges,
} from "../src/renderer/components/settings-window";

const view = { width: 1500, height: 900 };
const frame = { x: 200, y: 100, width: 800, height: 500 };

it("centers the initial frame and contains it even in very small viewports", () => {
  expect(initialSettingsFrame(view)).toEqual({
    x: 200,
    y: 70,
    width: 1100,
    height: 760,
  });
  for (const viewport of [
    { width: 680, height: 440 },
    { width: 30, height: 20 },
  ]) {
    const fitted = constrainSettingsFrame(frame, viewport);
    expect(fitted.x).toBeGreaterThanOrEqual(0);
    expect(fitted.y).toBeGreaterThanOrEqual(0);
    expect(fitted.x + fitted.width).toBeLessThanOrEqual(viewport.width);
    expect(fitted.y + fitted.height).toBeLessThanOrEqual(viewport.height);
  }
});

it.each(settingsResizeEdges)(
  "resizes from %s without moving the opposite edge",
  (edge) => {
    const next = moveSettingsFrame(frame, edge, 40, 30, view);
    if (edge.includes("w")) {
      expect(next.x).toBe(frame.x + 40);
      expect(next.x + next.width).toBe(frame.x + frame.width);
    } else expect(next.x).toBe(frame.x);
    if (edge.includes("n")) {
      expect(next.y).toBe(frame.y + 30);
      expect(next.y + next.height).toBe(frame.y + frame.height);
    } else expect(next.y).toBe(frame.y);
    expect(next.width).toBe(
      frame.width + (edge.includes("e") ? 40 : edge.includes("w") ? -40 : 0),
    );
    expect(next.height).toBe(
      frame.height + (edge.includes("s") ? 30 : edge.includes("n") ? -30 : 0),
    );
  },
);

it("constrains huge drags and resizes without shrinking below a usable minimum", () => {
  expect(moveSettingsFrame(frame, "move", 10000, -10000, view)).toEqual({
    ...frame,
    x: 684,
    y: 16,
  });
  expect(moveSettingsFrame(frame, "nw", 10000, 10000, view)).toEqual({
    x: 440,
    y: 240,
    width: 560,
    height: 360,
  });
  expect(moveSettingsFrame(frame, "se", 10000, 10000, view)).toEqual({
    ...frame,
    width: 1284,
    height: 784,
  });
  expect(frame).toEqual({ x: 200, y: 100, width: 800, height: 500 });
});
