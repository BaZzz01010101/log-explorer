export function shortcutKeys(shortcut: string): string[] {
  const keys =
    shortcut === "+"
      ? ["+"]
      : shortcut.endsWith("++")
        ? [...shortcut.slice(0, -2).split("+").filter(Boolean), "+"]
        : shortcut.split("+").filter(Boolean);
  return keys.map((key) => (key === "Control" ? "Ctrl" : key));
}

export function shortcutMatches(
  event: Pick<
    KeyboardEvent,
    "key" | "ctrlKey" | "metaKey" | "shiftKey" | "altKey"
  >,
  shortcut: string,
): boolean {
  const parts = shortcut.split("+");
  const key = parts.pop()?.toLowerCase();
  return (
    Boolean(key) &&
    event.key.toLowerCase() === key &&
    event.ctrlKey === parts.includes("Control") &&
    event.metaKey === parts.includes("Meta") &&
    event.shiftKey === parts.includes("Shift") &&
    event.altKey === parts.includes("Alt")
  );
}
