/** Native caption geometry and colors shared with the renderer's compact chrome. */
export const WINDOW_CHROME_HEIGHT = 40;
export const WINDOW_CHROME_COLORS = {
  light: { color: "#ffffff", symbolColor: "#243149" },
  dark: { color: "#18212e", symbolColor: "#d6dce7" },
} as const;
export type WindowAction =
  "close" | "toggle-fullscreen" | "zoom-in" | "zoom-out" | "reset-zoom";
