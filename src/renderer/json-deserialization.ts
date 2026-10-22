import {
  getPointer,
  MESSAGE_LIMIT,
  parseLogMessage,
  type JsonValue,
} from "../shared/log-data";

export type FieldDecoding = "url" | "base64";

export function decodeFieldText(
  value: JsonValue,
  encoding: FieldDecoding,
): string | undefined {
  if (typeof value !== "string" || !value || value.length > MESSAGE_LIMIT)
    return undefined;
  try {
    if (encoding === "url") {
      if (!/%[0-9a-f]{2}/i.test(value)) return undefined;
      const decoded = decodeURIComponent(value);
      return decoded !== value ? decoded : undefined;
    }
    // Strict syntax and a round trip reject malformed padding and unused tail
    // bits. No whitespace stripping or character guessing is performed.
    if (
      !/^[A-Za-z0-9+/_-]+={0,2}$/.test(value) ||
      (/[+\/]/.test(value) && /[-_]/.test(value))
    )
      return undefined;
    const standard = value.replace(/-/g, "+").replace(/_/g, "/");
    const unpadded = standard.replace(/=+$/, "");
    if (
      unpadded.length % 4 === 1 ||
      (standard.includes("=") && standard.length % 4 !== 0)
    )
      return undefined;
    const binary = atob(standard);
    if (btoa(binary).replace(/=+$/, "") !== unpadded) return undefined;
    const bytes = Uint8Array.from(binary, (character) =>
      character.charCodeAt(0),
    );
    // Preserve a leading BOM rather than silently changing the payload.
    const decoded = new TextDecoder("utf-8", {
      fatal: true,
      ignoreBOM: true,
    }).decode(bytes);
    if (/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f]/.test(decoded))
      return undefined;
    return decoded;
  } catch {
    return undefined;
  }
}

export function deserializeJsonField(
  value: JsonValue,
  path: string,
  encoding?: FieldDecoding,
): { value: JsonValue } | undefined {
  const source = getPointer(value, path);
  if (typeof source !== "string") return undefined;
  let replacement: JsonValue;
  if (encoding) {
    const decoded = decodeFieldText(source, encoding);
    if (decoded === undefined) return undefined;
    replacement = decoded;
  } else {
    const parsed = parseLogMessage(source);
    if (parsed.kind !== "json") return undefined;
    replacement = parsed.value!;
  }
  if (path === "") return { value: replacement };
  const tokens = path
    .slice(1)
    .split("/")
    .map((token) => token.replace(/~1/g, "/").replace(/~0/g, "~"));
  if (tokens.length > 32) return undefined;
  const replace = (node: JsonValue, depth: number): JsonValue => {
    if (depth === tokens.length) return replacement;
    const key = tokens[depth];
    if (Array.isArray(node)) {
      const copy = node.slice();
      copy[Number(key)] = replace(node[Number(key)], depth + 1);
      return copy;
    }
    const object = node as Record<string, JsonValue>;
    return { ...object, [key]: replace(object[key], depth + 1) };
  };
  return { value: replace(value, 0) };
}
