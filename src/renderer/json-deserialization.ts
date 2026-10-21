import {
  getPointer,
  parseLogMessage,
  type JsonValue,
} from "../shared/log-data";

export function deserializeJsonField(
  value: JsonValue,
  path: string,
): { value: JsonValue } | undefined {
  const source = getPointer(value, path);
  if (typeof source !== "string") return undefined;
  const parsed = parseLogMessage(source);
  if (parsed.kind !== "json") return undefined;
  if (path === "") return { value: parsed.value! };
  const tokens = path
    .slice(1)
    .split("/")
    .map((token) => token.replace(/~1/g, "/").replace(/~0/g, "~"));
  if (tokens.length > 32) return undefined;
  const replace = (node: JsonValue, depth: number): JsonValue => {
    if (depth === tokens.length) return parsed.value!;
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
