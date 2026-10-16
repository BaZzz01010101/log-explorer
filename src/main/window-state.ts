import {
  readFileSync,
  writeFileSync,
  renameSync,
  mkdirSync,
  statSync,
} from "node:fs";
import { dirname } from "node:path";

export interface WindowBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}
export interface WindowState {
  bounds: WindowBounds;
  maximized: boolean;
}
export function parseWindowState(value: unknown): WindowState | undefined {
  if (!value || typeof value !== "object") return;
  const state = value as WindowState;
  const b = state.bounds;
  if (
    !b ||
    ![b.x, b.y, b.width, b.height].every(
      (n) => Number.isSafeInteger(n) && Math.abs(n) <= 100_000,
    ) ||
    b.width < 300 ||
    b.height < 200 ||
    typeof state.maximized !== "boolean"
  )
    return;
  return {
    bounds: { x: b.x, y: b.y, width: b.width, height: b.height },
    maximized: state.maximized,
  };
}
export function restoreWindowBounds(
  bounds: WindowBounds,
  areas: WindowBounds[],
): WindowBounds {
  const area = areas.find(
    (a) =>
      Math.min(a.x + a.width, bounds.x + bounds.width) -
        Math.max(a.x, bounds.x) >=
        100 &&
      Math.min(a.y + a.height, bounds.y + bounds.height) -
        Math.max(a.y, bounds.y) >=
        60,
  ) ??
    areas[0] ?? { x: 0, y: 0, width: 1500, height: 980 };
  const width = Math.min(area.width, Math.max(860, bounds.width));
  const height = Math.min(area.height, Math.max(580, bounds.height));
  return {
    x: Math.max(area.x, Math.min(bounds.x, area.x + area.width - width)),
    y: Math.max(area.y, Math.min(bounds.y, area.y + area.height - height)),
    width,
    height,
  };
}
export function loadWindowState(path: string): WindowState | undefined {
  try {
    if (statSync(path).size > 8192) return;
    return parseWindowState(JSON.parse(readFileSync(path, "utf8")));
  } catch {
    return;
  }
}
export function saveWindowState(path: string, state: WindowState): void {
  const valid = parseWindowState(state);
  if (!valid) return;
  try {
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path + ".tmp", JSON.stringify(valid), { mode: 0o600 });
    renameSync(path + ".tmp", path);
  } catch (error) {
    console.error("Window geometry could not be saved", error);
  }
}
