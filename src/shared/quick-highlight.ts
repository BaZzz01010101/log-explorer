/** Predefined highlight text colors; blue and green mark filter matches. */
export const HIGHLIGHT_TEXT_COLORS = [
  "yellow",
  "orange",
  "red",
  "pink",
  "grape",
  "violet",
  "indigo",
  "cyan",
  "teal",
  "lime",
] as const;
export type HighlightTextColor = (typeof HIGHLIGHT_TEXT_COLORS)[number];
export interface HighlightTextColors {
  light?: HighlightTextColor;
  dark?: HighlightTextColor;
}
export interface QuickHighlightOptions {
  regex?: boolean;
  caseSensitive?: boolean;
}
