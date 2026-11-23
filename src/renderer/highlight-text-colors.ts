import type { CSSProperties } from "react";
import type { Preferences } from "../shared/contracts";
import type { HighlightTextColor } from "../shared/quick-highlight";

/** Match backgrounds: pale behind dark text, deep behind light text. */
const matches: Record<HighlightTextColor, { light: string; dark: string }> = {
  yellow: { light: "#ffe69a", dark: "#806019" },
  orange: { light: "#ffd0a0", dark: "#8a4b12" },
  red: { light: "#ffc2c2", dark: "#8f2f2f" },
  pink: { light: "#fcc2d7", dark: "#8c2f55" },
  grape: { light: "#eebefa", dark: "#73338a" },
  violet: { light: "#d0bfff", dark: "#553a9e" },
  indigo: { light: "#bac8ff", dark: "#37489b" },
  cyan: { light: "#99e9f2", dark: "#17656f" },
  teal: { light: "#96f2d7", dark: "#136a52" },
  lime: { light: "#d3f295", dark: "#4f6a16" },
};

export function highlightTextPalette(
  theme: Preferences["theme"],
  color: HighlightTextColor,
) {
  return {
    /** The icon and its swatch. */
    accent: `var(--mantine-color-${color}-${theme === "dark" ? 5 : 6})`,
    match: matches[color][theme],
    marker: `var(--mantine-color-${color}-5)`,
    map: `var(--mantine-color-${color}-3)`,
  };
}

/** Variables read by matches, row markers, field dots and scrollbar maps. */
export function highlightTextStyle(
  theme: Preferences["theme"],
  color: HighlightTextColor,
): CSSProperties {
  const palette = highlightTextPalette(theme, color);
  return {
    "--quick-highlight-match": palette.match,
    "--quick-highlight-marker": palette.marker,
    "--quick-highlight-map": palette.map,
  } as CSSProperties;
}
