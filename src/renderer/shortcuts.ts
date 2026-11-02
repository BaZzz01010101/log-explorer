const MODIFIERS = ["Control", "Meta", "Alt", "Shift"] as const;
const modifierAliases: Record<string, string> = {
  control: "Control",
  ctrl: "Control",
  meta: "Meta",
  cmd: "Meta",
  command: "Meta",
  win: "Meta",
  windows: "Meta",
  super: "Meta",
  alt: "Alt",
  option: "Alt",
  shift: "Shift",
};
const keyAliases: Record<string, string> = {
  esc: "Escape",
  escape: "Escape",
  space: "Space",
  spacebar: "Space",
  enter: "Enter",
  return: "Enter",
  tab: "Tab",
  backspace: "Backspace",
  delete: "Delete",
  del: "Delete",
  insert: "Insert",
  ins: "Insert",
  home: "Home",
  end: "End",
  pageup: "PageUp",
  pagedown: "PageDown",
  pgup: "PageUp",
  pgdn: "PageDown",
  left: "ArrowLeft",
  right: "ArrowRight",
  up: "ArrowUp",
  down: "ArrowDown",
  arrowleft: "ArrowLeft",
  arrowright: "ArrowRight",
  arrowup: "ArrowUp",
  arrowdown: "ArrowDown",
  capslock: "CapsLock",
  numlock: "NumLock",
  scrolllock: "ScrollLock",
  printscreen: "PrintScreen",
  pause: "Pause",
  contextmenu: "ContextMenu",
};

function modifierName(value: string): string | undefined {
  const name = value.toLowerCase();
  return Object.hasOwn(modifierAliases, name)
    ? modifierAliases[name]
    : undefined;
}

function normalizeKey(key: string): string | null {
  if (key === " ") return "Space";
  if ([...key].length === 1) return key.toUpperCase();
  const name = key.toLowerCase().replace(/\s/g, "");
  if (Object.hasOwn(keyAliases, name)) return keyAliases[name];
  if (/^f(?:[1-9]|1\d|2[0-4])$/i.test(key)) return key.toUpperCase();
  return null;
}

/** Canonical, persisted form. Empty means disabled; null means malformed. */
export function normalizeShortcut(shortcut: string): string | null {
  if (shortcut === " ") return "Space";
  const value = shortcut.trim();
  if (!value) return "";
  if (value.length > 80) return null;
  const parts =
    value === "+"
      ? ["+"]
      : value.endsWith("++")
        ? [...value.slice(0, -2).split("+"), "+"]
        : value.split("+");
  const rawKey = parts.pop()?.trim() ?? "";
  if (!rawKey || modifierName(rawKey)) return null;
  const key = normalizeKey(rawKey);
  if (!key) return null;
  const modifiers = parts.map((part) => modifierName(part.trim()));
  if (
    modifiers.some((part) => !part) ||
    new Set(modifiers).size !== modifiers.length
  )
    return null;
  return [
    ...MODIFIERS.filter((modifier) => modifiers.includes(modifier)),
    key,
  ].join("+");
}

function shortcutParts(shortcut: string): string[] {
  if (!shortcut) return [];
  if (shortcut === "+") return ["+"];
  return shortcut.endsWith("++")
    ? [...shortcut.slice(0, -2).split("+").filter(Boolean), "+"]
    : shortcut.split("+").filter(Boolean);
}

export function shortcutKeys(shortcut: string): string[] {
  return shortcutParts(normalizeShortcut(shortcut) ?? shortcut).map((key) =>
    key === "Control" ? "Ctrl" : key,
  );
}

export type ShortcutKeyboardEvent = Pick<
  KeyboardEvent,
  "key" | "ctrlKey" | "metaKey" | "shiftKey" | "altKey"
> &
  Partial<Pick<KeyboardEvent, "isComposing" | "repeat" | "keyCode">>;

export function shortcutFromKeyboardEvent(
  event: ShortcutKeyboardEvent,
): string | null {
  if (
    event.repeat ||
    event.isComposing ||
    event.keyCode === 229 ||
    modifierName(event.key)
  )
    return null;
  const key = normalizeKey(event.key);
  if (!key) return null;
  return [
    event.ctrlKey && "Control",
    event.metaKey && "Meta",
    event.altKey && "Alt",
    event.shiftKey && "Shift",
    key,
  ]
    .filter(Boolean)
    .join("+");
}

export function shortcutMatches(
  event: ShortcutKeyboardEvent,
  shortcut: string,
): boolean {
  if (event.isComposing || event.keyCode === 229) return false;
  const normalized = normalizeShortcut(shortcut);
  if (!normalized) return false;
  const parts = shortcutParts(normalized);
  const key = parts.pop();
  return (
    normalizeKey(event.key) === key &&
    event.ctrlKey === parts.includes("Control") &&
    event.metaKey === parts.includes("Meta") &&
    event.shiftKey === parts.includes("Shift") &&
    event.altKey === parts.includes("Alt")
  );
}
