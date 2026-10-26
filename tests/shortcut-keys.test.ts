import { expect, it } from "vitest";
import { shortcutKeys } from "../src/renderer/shortcuts";

it("separates modifier and normal key badges", () => {
  expect(shortcutKeys("Control+Shift+T")).toEqual(["Ctrl", "Shift", "T"]);
  expect(shortcutKeys("Alt+F4")).toEqual(["Alt", "F4"]);
  expect(shortcutKeys("F11")).toEqual(["F11"]);
  expect(shortcutKeys("")).toEqual([]);
});

it("keeps a literal plus key distinct from shortcut separators", () => {
  expect(shortcutKeys("Ctrl++")).toEqual(["Ctrl", "+"]);
  expect(shortcutKeys("Control+Shift++")).toEqual(["Ctrl", "Shift", "+"]);
  expect(shortcutKeys("+")).toEqual(["+"]);
});
