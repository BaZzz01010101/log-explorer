import { expect, it } from "vitest";
import {
  restoreWindowBounds,
  parseWindowState,
  loadWindowState,
  saveWindowState,
} from "../src/main/window-state";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { resolve, join, sep } from "node:path";

const primary = { x: 0, y: 0, width: 1920, height: 1040 };
it("atomically preserves normal bounds and maximized state and ignores damaged state files", () => {
  const root = resolve(".tmp/window-state-unit");
  mkdirSync(root, { recursive: true });
  const directory = mkdtempSync(join(root, "case-")),
    path = join(directory, "window-state.json");
  try {
    const state = {
      bounds: { x: 45, y: 60, width: 1200, height: 800 },
      maximized: true,
    };
    saveWindowState(path, state);
    expect(loadWindowState(path)).toEqual(state);
    saveWindowState(path, { ...state, maximized: false });
    expect(loadWindowState(path)?.maximized).toBe(false);
    writeFileSync(path, "broken");
    expect(loadWindowState(path)).toBeUndefined();
    writeFileSync(path, " ".repeat(9000));
    expect(loadWindowState(path)).toBeUndefined();
  } finally {
    if (!directory.startsWith(root + sep + "case-"))
      throw new Error("Unsafe cleanup");
    rmSync(directory, { recursive: true, force: true });
  }
});
it("restores normal bounds and maximized state", () => {
  const state = {
    bounds: { x: 42, y: 60, width: 1200, height: 800 },
    maximized: true,
  };
  expect(parseWindowState(state)).toEqual(state);
  expect(restoreWindowBounds(state.bounds, [primary])).toEqual(state.bounds);
});
it("moves removed-monitor windows onto the primary work area and clamps oversized windows", () => {
  expect(
    restoreWindowBounds({ x: -5000, y: -2000, width: 2400, height: 1500 }, [
      primary,
    ]),
  ).toEqual(primary);
  expect(
    restoreWindowBounds({ x: -1600, y: 0, width: 1200, height: 800 }, [
      { x: -1920, y: 0, width: 1920, height: 1080 },
      primary,
    ]).x,
  ).toBe(-1600);
});
it("rejects corrupt bounds and maximized values", () => {
  expect(
    parseWindowState({
      bounds: { x: 0, y: 0, width: 0, height: 800 },
      maximized: true,
    }),
  ).toBeUndefined();
  expect(
    parseWindowState({
      bounds: { x: Infinity, y: 0, width: 1000, height: 800 },
      maximized: false,
    }),
  ).toBeUndefined();
  expect(parseWindowState({})).toBeUndefined();
});
