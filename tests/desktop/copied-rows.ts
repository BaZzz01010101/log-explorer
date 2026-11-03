/** Parse readable table fixtures; these fixtures contain no literal column separators. */
export function copiedRows(text: string): string[][] {
  return text
    ? text
        .split("\n")
        .slice(2)
        .map((line) => line.split(" | ").map((cell) => cell.trim()))
    : [];
}

export function copiedMessages(
  text: string,
): { timestamp: string; level: string; source?: string; message: unknown }[] {
  return text ? text.split("\n").map((line) => JSON.parse(line)) : [];
}

/** Original payload, independent of the production clipboard builder. */
export function copiedMessage(raw: string): string {
  try {
    return JSON.stringify(JSON.parse(raw));
  } catch {
    return JSON.stringify(raw);
  }
}

export function messagePayloads(text: string): string {
  return copiedMessages(text)
    .map((record) => JSON.stringify(record.message))
    .join("\n");
}
