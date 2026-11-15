import { normalizeShortcut, shortcutKeys } from "./shortcuts";

export type ShortcutScope =
  "global" | "explorer" | "highlight" | "local-filter" | "log-view";
export interface ShortcutDefinition {
  id: string;
  label: string;
  defaultShortcut: string;
  scope: ShortcutScope;
}

export const SHORTCUT_SCOPE_LABELS: Record<ShortcutScope, string> = {
  global: "Application",
  explorer: "Explorer filter",
  highlight: "Highlight field",
  "local-filter": "Local filter",
  "log-view": "Log view",
};

export const SHORTCUT_DEFINITIONS: readonly ShortcutDefinition[] = [
  {
    id: "newTab",
    label: "New tab",
    defaultShortcut: "Control+T",
    scope: "global",
  },
  {
    id: "openSettings",
    label: "Open settings",
    defaultShortcut: "Control+,",
    scope: "global",
  },
  {
    id: "toggleTheme",
    label: "Toggle theme",
    defaultShortcut: "Control+Shift+L",
    scope: "global",
  },
  {
    id: "closeTab",
    label: "Close tab",
    defaultShortcut: "Control+W",
    scope: "global",
  },
  {
    id: "reopenTab",
    label: "Reopen closed tab",
    defaultShortcut: "Control+Shift+T",
    scope: "global",
  },
  {
    id: "nextTab",
    label: "Next tab in tab bar",
    defaultShortcut: "Control+PageDown",
    scope: "global",
  },
  {
    id: "previousTab",
    label: "Previous tab in tab bar",
    defaultShortcut: "Control+PageUp",
    scope: "global",
  },
  {
    id: "recentTab",
    label: "Next recent tab",
    defaultShortcut: "Control+Tab",
    scope: "global",
  },
  {
    id: "previousRecentTab",
    label: "Previous recent tab",
    defaultShortcut: "Control+Shift+Tab",
    scope: "global",
  },
  {
    id: "splitPane",
    label: "Split pane",
    defaultShortcut: "Control+\\",
    scope: "global",
  },
  {
    id: "toggleSidebar",
    label: "Toggle sidebar",
    defaultShortcut: "Control+B",
    scope: "global",
  },
  {
    id: "runQuery",
    label: "Run query",
    defaultShortcut: "Control+Enter",
    scope: "global",
  },
  { id: "focusLogLocalFilter", label: "Focus local filter", defaultShortcut: "Control+F", scope: "log-view" },
  { id: "focusLogQuery", label: "Focus query filter", defaultShortcut: "Control+Q", scope: "log-view" },
  { id: "focusLogHighlight", label: "Focus text highlight", defaultShortcut: "Control+H", scope: "log-view" },
  {
    id: "explorerRegex",
    label: "Explorer regex",
    defaultShortcut: "Alt+E",
    scope: "explorer",
  },
  {
    id: "explorerCaseSensitive",
    label: "Explorer match case",
    defaultShortcut: "Alt+C",
    scope: "explorer",
  },
  {
    id: "highlightRegex",
    label: "Highlight regex",
    defaultShortcut: "Alt+E",
    scope: "highlight",
  },
  {
    id: "highlightCaseSensitive",
    label: "Highlight match case",
    defaultShortcut: "Alt+C",
    scope: "highlight",
  },
  {
    id: "localFilterRegex",
    label: "Local filter regex",
    defaultShortcut: "Alt+E",
    scope: "local-filter",
  },
  {
    id: "localFilterCaseSensitive",
    label: "Local filter match case",
    defaultShortcut: "Alt+C",
    scope: "local-filter",
  },
];

export const DEFAULT_SHORTCUTS: Record<string, string> = Object.fromEntries(
  SHORTCUT_DEFINITIONS.map(({ id, defaultShortcut }) => [id, defaultShortcut]),
);

export function findShortcutConflicts(
  action: string,
  shortcut: string,
  shortcuts: Record<string, string>,
): ShortcutDefinition[] {
  const definition = SHORTCUT_DEFINITIONS.find((item) => item.id === action);
  const normalized = normalizeShortcut(shortcut);
  if (!definition || !normalized) return [];
  return SHORTCUT_DEFINITIONS.filter(
    (item) =>
      item.id !== action &&
      (item.scope === definition.scope ||
        item.scope === "global" ||
        definition.scope === "global") &&
      normalizeShortcut(shortcuts[item.id] ?? item.defaultShortcut) ===
        normalized,
  );
}

export function validateShortcut(
  action: string,
  shortcut: string,
  shortcuts: Record<string, string>,
): string | null {
  if (!SHORTCUT_DEFINITIONS.some((item) => item.id === action))
    return "Unknown command.";
  const normalized = normalizeShortcut(shortcut);
  if (normalized === null)
    return "Choose one key with optional Ctrl, Alt, Shift or Meta modifiers.";
  if (!normalized) return null;
  const keys = shortcutKeys(normalized);
  const key = keys.at(-1)!;
  if (key === "Escape")
    return "Escape is reserved for cancelling shortcut recording.";
  if (
    key === "F11" ||
    (keys.some((part) => ["Ctrl", "Meta"].includes(part)) &&
      ["0", "+", "=", "-"].includes(key)) ||
    (keys.includes("Alt") && key === "F4")
  )
    return "This shortcut is reserved for window or zoom controls.";
  if (
    ([...key].length === 1 ||
      ["Space", "Enter", "Tab", "Backspace", "Delete"].includes(key)) &&
    !keys.some((part) => ["Ctrl", "Alt", "Meta"].includes(part))
  )
    return "Add Ctrl, Alt or Meta so typing and focus navigation stay available.";
  const conflicts = findShortcutConflicts(action, normalized, shortcuts);
  return conflicts.length
    ? `Already used by ${conflicts.map((item) => item.label).join(", ")}.`
    : null;
}
