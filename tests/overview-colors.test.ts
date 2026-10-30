import { describe, expect, it } from "vitest";
import { overviewHighlightColor } from "../src/renderer/overview-colors";

const channels = (color: string) => {
  const hex = color.replace(/^#/, "");
  return [0, 2, 4].map((offset) => parseInt(hex.slice(offset, offset + 2), 16));
};
const luminance = (color: string) =>
  channels(color)
    .map((value) => value / 255)
    .map((value) =>
      value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4,
    )
    .reduce(
      (sum, value, index) => sum + value * [0.2126, 0.7152, 0.0722][index],
      0,
    );
const contrast = (first: string, second: string) =>
  (Math.max(luminance(first), luminance(second)) + 0.05) /
  (Math.min(luminance(first), luminance(second)) + 0.05);

describe("overview highlight colors", () => {
  it.each(["#ffffff", "#f5f5f5", "#121a25", "#242424"])(
    "keeps low-contrast custom colors visible against track %s",
    (background) => {
      for (const color of [
        "#ffffff",
        "#fdf8ee",
        "#efe8ef",
        "#dedede",
        "#121212",
        "#242424",
        "#302d35",
        "#0000ff",
        "#00ff00",
        "#ffff00",
      ]) {
        const result = overviewHighlightColor(color, background);
        expect(
          contrast(result, background),
          `${color} → ${result}`,
        ).toBeGreaterThanOrEqual(3);
      }
    },
  );

  it("reduces bright yellow on dark tracks without reducing it below visible contrast", () => {
    const result = overviewHighlightColor("#ffe69a", "#242424");
    expect(luminance(result)).toBeLessThanOrEqual(0.31);
    expect(contrast(result, "#242424")).toBeGreaterThanOrEqual(3);
    const [red, green, blue] = channels(result);
    expect(red).toBeGreaterThan(green);
    expect(green).toBeGreaterThan(blue);
  });

  it("retains the hue and strengthens saturation of washed-out chromatic colors", () => {
    const [red, green, blue] = channels(
      overviewHighlightColor("#efe8ef", "#ffffff"),
    );
    expect(red).toBe(blue);
    expect(red).toBeGreaterThan(green);
    expect((red - green) / red).toBeGreaterThan(0.2);
  });

  it("keeps achromatic custom colors neutral", () => {
    const [red, green, blue] = channels(
      overviewHighlightColor("#242424", "#242424"),
    );
    expect(red).toBe(green);
    expect(green).toBe(blue);
  });

  it("preserves already readable colors within the dark brightness limit", () => {
    expect(overviewHighlightColor("#0077bb", "#ffffff")).toBe("#0077bb");
    expect(overviewHighlightColor("#a060c0", "#242424")).toBe("#a060c0");
  });

  it("makes translucent computed profile colors opaque and readable on the track", () => {
    const result = overviewHighlightColor(
      "rgba(240, 220, 240, 0.12)",
      "rgb(36, 36, 36)",
    );
    expect(result).toMatch(/^#[0-9a-f]{6}$/);
    expect(contrast(result, "#242424")).toBeGreaterThanOrEqual(3);
    const [red, green, blue] = channels(result);
    expect(red).toBe(blue);
    expect(red).toBeGreaterThan(green);
  });

  it("leaves unresolved or invalid CSS values for the browser instead of inventing a color", () => {
    expect(overviewHighlightColor("var(--missing)", "#ffffff")).toBe(
      "var(--missing)",
    );
    expect(overviewHighlightColor("#ffcc00", "unresolved")).toBe("#ffcc00");
  });
});
