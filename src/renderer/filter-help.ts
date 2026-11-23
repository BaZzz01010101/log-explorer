import type { FilterProvider, ServerFilterMode } from "../shared/server-filter";

const ARROWS: Record<string, string> = {
  ArrowUp: "↑",
  ArrowDown: "↓",
  ArrowLeft: "←",
  ArrowRight: "→",
};

/** "Control+Shift+ArrowDown" → "Ctrl+Shift+↓"; empty → "unassigned". */
export function shortcutText(shortcut: string | undefined): string {
  if (!shortcut) return "unassigned";
  return shortcut
    .split("+")
    .map((key) => (key === "Control" ? "Ctrl" : (ARROWS[key] ?? key)))
    .join("+");
}

const SYNTAX_NAMES = {
  plain: "Text",
  aws: "AWS Pattern",
  gcp: "GCP Pattern",
  unified: "Unified",
} as const;

const MODE_NAMES: Record<ServerFilterMode, string> = {
  plain: "Text",
  pattern: "Pattern",
  "aws-pattern": "AWS Pattern",
  "gcp-pattern": "GCP Pattern",
  unified: "Unified",
  auto: "Auto",
};

export function serverFilterHelp(
  mode: ServerFilterMode,
  syntax: keyof typeof SYNTAX_NAMES,
  provider: FilterProvider,
): string {
  const current =
    mode === "auto"
      ? `Auto → ${SYNTAX_NAMES[syntax]}`
      : MODE_NAMES[mode] === "Pattern"
        ? SYNTAX_NAMES[syntax]
        : MODE_NAMES[mode];
  return [
    `Query filter mode: ${current}. Enter runs the query.`,
    "",
    "MODES",
    "• Text: finds the exact text in log lines.",
    '• AWS Pattern: CloudWatch filter pattern, e.g. ERROR -DEBUG, "exact phrase", ?ERROR ?WARN, { $.status >= 500 }. Only for views where every source is AWS.',
    '• GCP Pattern: Cloud Logging query, e.g. severity>=ERROR AND jsonPayload.user="ann". Only for views where every source is Google Cloud.',
    "• Unified: one JSON filter for AWS and Google Cloud, translated for each provider. Available in every view, including mixed ones.",
    `• Auto: picks the mode from the text: $.… is Unified, Cloud Logging fields are GCP Pattern${provider === "gcp" ? "" : ", pattern syntax is AWS Pattern"}, anything else is Text.`,
    ...(provider === "mixed"
      ? [
          "This view mixes AWS and Google Cloud sources, so the pattern modes are hidden.",
        ]
      : []),
    "",
    "UNIFIED SYNTAX",
    "$.path OPERATOR value, combined with AND, OR and ( ).",
    "• Numbers: = != > >= < <=",
    '• "Quoted strings": = !=',
    "• true / false: =",
    "• Missing values: IS NULL, IS UNDEFINED",
    "",
    "EXAMPLES",
    '$.level = "ERROR"',
    '$.status >= 500 AND $.path != "/health"',
    "($.user.id = 42 OR $.retry = true) AND $.error IS NULL",
  ].join("\n");
}

export function localFilterHelp(shortcuts: Record<string, string>): string {
  return [
    "Filters the loaded events; nothing is queried again.",
    "",
    "SYNTAX",
    "• word another: every word must appear in the message or stream name",
    '• "exact phrase": text with spaces',
    "• @/user/id: the JSON field exists",
    '• @/level=ERROR or @/user/name="Ann Lee": the field has this value',
    "• Regex mode: a regular expression, use a|b for OR",
    "",
    "SHORTCUTS",
    `${shortcutText(shortcuts.focusLogLocalFilter)}: focus this field`,
    "Enter / Esc: back to the event list",
    `${shortcutText(shortcuts.localFilterCaseSensitive)}: match case`,
    `${shortcutText(shortcuts.localFilterRegex)}: regular expression`,
  ].join("\n");
}

export function highlightHelp(shortcuts: Record<string, string>): string {
  return [
    "Highlights matching text in the loaded events without hiding any.",
    "",
    "SHORTCUTS",
    `${shortcutText(shortcuts.focusLogHighlight)}: focus this field`,
    "Ctrl+↓ / Ctrl+↑: next / previous event with a match (here or in the event list)",
    "Enter / Esc: back to the event list",
    `${shortcutText(shortcuts.highlightCaseSensitive)}: match case`,
    `${shortcutText(shortcuts.highlightRegex)}: regular expression`,
  ].join("\n");
}
