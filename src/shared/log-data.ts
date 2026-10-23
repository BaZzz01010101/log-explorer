import type { ColumnConfig, LogEvent, Preferences } from "./contracts";

export type JsonValue =
  null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue };
export interface ParsedMessage {
  kind: "json" | "text" | "limited";
  value?: JsonValue;
  reason?: string;
}
export type LogLevel =
  "trace" | "debug" | "info" | "warn" | "error" | "fatal" | "unknown";
export const LOG_LEVELS: readonly LogLevel[] = [
  "trace",
  "debug",
  "info",
  "warn",
  "error",
  "fatal",
  "unknown",
];
export const MESSAGE_LIMIT = 524_288;
export const INSPECTION_LIMIT = 800;
export const EXPORT_LIMIT = 20_000_000;
export const META_COLUMNS = [
  "@timestamp",
  "@level",
  "@message",
  "@logGroup",
  "@logStream",
  "@source",
] as const;

/** Reject pathological nesting before parsing, respecting quoted/escaped delimiters. */
export function parseLogMessage(message: string): ParsedMessage {
  if (message.length > MESSAGE_LIMIT)
    return {
      kind: "limited",
      reason:
        "Message exceeds the 524,288-character structured inspection limit. Raw data is retained.",
    };
  const trimmed = message.trim();
  if (!trimmed || !/^[\[\{"\-\dntf]/.test(trimmed)) return { kind: "text" };
  let depth = 0;
  let quoted = false;
  let escaped = false;
  for (const character of trimmed) {
    if (quoted) {
      if (escaped) escaped = false;
      else if (character === "\\") escaped = true;
      else if (character === '"') quoted = false;
    } else if (character === '"') quoted = true;
    else if (character === "{" || character === "[") {
      if (++depth > 32)
        return {
          kind: "limited",
          reason:
            "JSON exceeds the 32-level structured inspection limit. Raw data is retained.",
        };
    } else if (character === "}" || character === "]") depth--;
  }
  try {
    return { kind: "json", value: JSON.parse(trimmed) as JsonValue };
  } catch {
    return { kind: "text" };
  }
}

export function pointerToken(key: string): string {
  return key.replace(/~/g, "~0").replace(/\//g, "~1");
}

export function getPointer(
  value: JsonValue | undefined,
  pointer: string,
): JsonValue | undefined {
  if (pointer === "") return value;
  if (!pointer.startsWith("/")) return undefined;
  let current = value;
  for (const encoded of pointer.slice(1).split("/")) {
    if (/~(?:[^01]|$)/.test(encoded)) return undefined;
    const key = encoded.replace(/~1/g, "/").replace(/~0/g, "~");
    if (
      current === null ||
      typeof current !== "object" ||
      !Object.hasOwn(current, key)
    )
      return undefined;
    current = (current as Record<string, JsonValue>)[key];
  }
  return current;
}

export function flattenJson(
  value: JsonValue,
  options: { maxFields?: number; maxDepth?: number; maxNodes?: number } = {},
): { fields: Record<string, JsonValue>; truncated: boolean } {
  const fields: Record<string, JsonValue> = Object.create(null) as Record<
    string,
    JsonValue
  >;
  const pending = [{ value, path: "", depth: 0 }];
  const maxFields = Math.max(1, options.maxFields ?? 256);
  const maxDepth = Math.max(1, options.maxDepth ?? 24);
  const maxNodes = Math.max(1, options.maxNodes ?? 4096);
  let nodes = 0;
  let truncated = false;
  while (
    pending.length &&
    nodes < maxNodes &&
    Object.keys(fields).length < maxFields
  ) {
    const item = pending.pop()!;
    nodes++;
    if (item.value !== null && typeof item.value === "object") {
      const keys = Object.keys(item.value);
      if (keys.length && item.depth < maxDepth) {
        const remaining = maxNodes - nodes - pending.length;
        const selected = keys.slice(0, Math.max(0, remaining));
        if (selected.length < keys.length) truncated = true;
        for (let index = selected.length - 1; index >= 0; index--) {
          const key = selected[index]!;
          pending.push({
            value: (item.value as Record<string, JsonValue>)[key]!,
            path: `${item.path}/${pointerToken(key)}`,
            depth: item.depth + 1,
          });
        }
        continue;
      }
      if (keys.length) truncated = true;
    }
    fields[item.path] = item.value;
  }
  return { fields, truncated: truncated || pending.length > 0 };
}

export function summarizeValue(
  value: JsonValue | undefined,
  maxLength = 400,
): string {
  if (value === undefined) return "";
  const text = typeof value === "string" ? value : JSON.stringify(value);
  return text.length > maxLength ? `${text.slice(0, maxLength)}…` : text;
}

export function formatColumnValue(
  value: JsonValue | undefined,
  format: ColumnConfig["format"] = "auto",
  timezone: Preferences["timezone"] = "local",
): string {
  if (value === undefined) return "";
  const raw =
    typeof value === "number" && !Number.isFinite(value)
      ? String(value)
      : summarizeValue(value, 1500);
  if (format === "auto" || !format) return raw;
  if (format === "json") {
    // String fields can be larger than the bounded structured-message parser limit.
    const text = JSON.stringify(
      typeof value === "string" ? value.slice(0, 1501) : value,
    );
    return text.length > 1500 ? text.slice(0, 1500) + "…" : text;
  }
  const text = typeof value === "string" ? value.trim() : "";
  const number =
    typeof value === "number"
      ? value
      : text &&
          /^[+-]?(?:[0-9]+(?:[.][0-9]*)?|[.][0-9]+)(?:e[+-]?[0-9]+)?$/i.test(
            text,
          )
        ? Number(text)
        : undefined;
  const numeric =
    number !== undefined && Number.isFinite(number) ? number : undefined;
  if (format === "bytes") {
    if (numeric === undefined || numeric < 0) return raw;
    const units = ["B", "KiB", "MiB", "GiB", "TiB", "PiB", "EiB", "ZiB", "YiB"];
    const unit =
      numeric === 0
        ? 0
        : Math.min(
            units.length - 1,
            Math.max(0, Math.floor(Math.log2(numeric) / 10)),
          );
    const scaled = numeric / 1024 ** unit;
    return Number(scaled.toPrecision(4)).toString() + " " + units[unit];
  }
  if (format === "milliseconds") {
    if (numeric === undefined) return raw;
    const seconds = Math.abs(numeric) >= 1000;
    const scaled = seconds ? numeric / 1000 : numeric;
    return Number(scaled.toPrecision(4)).toString() + (seconds ? " s" : " ms");
  }
  if (format === "datetime") {
    const timestamp =
      numeric ?? (typeof value === "string" && text ? Date.parse(text) : NaN);
    if (
      !Number.isFinite(timestamp) ||
      Math.abs(timestamp) > 8_640_000_000_000_000
    )
      return raw;
    const date = new Date(timestamp);
    if (timezone === "utc")
      return date.toISOString().replace("T", " ").replace("Z", " UTC");
    const pad = (part: number, length = 2) =>
      String(part).padStart(length, "0");
    const year = date.getFullYear();
    const yearText =
      year >= 0 && year <= 9999
        ? pad(year, 4)
        : (year < 0 ? "-" : "+") + pad(Math.abs(year), 6);
    return (
      yearText +
      "-" +
      pad(date.getMonth() + 1) +
      "-" +
      pad(date.getDate()) +
      " " +
      pad(date.getHours()) +
      ":" +
      pad(date.getMinutes()) +
      ":" +
      pad(date.getSeconds()) +
      "." +
      pad(date.getMilliseconds(), 3)
    );
  }
  return raw;
}

export function compareLogValues(
  first: JsonValue | undefined,
  second: JsonValue | undefined,
): number {
  const rank = (value: JsonValue | undefined): number =>
    value === undefined
      ? 0
      : value === null
        ? 1
        : typeof value === "number"
          ? 2
          : typeof value === "string"
            ? 3
            : typeof value === "boolean"
              ? 4
              : Array.isArray(value)
                ? 5
                : 6;
  const difference = rank(first) - rank(second);
  if (difference) return difference;
  if (first === second) return 0;
  if (typeof first === "number" && typeof second === "number") {
    if (Number.isNaN(first)) return Number.isNaN(second) ? 0 : -1;
    if (Number.isNaN(second)) return 1;
    return first < second ? -1 : 1;
  }
  if (typeof first === "boolean" && typeof second === "boolean")
    return Number(first) - Number(second);
  const firstText =
    typeof first === "string" ? first : (JSON.stringify(first) ?? "");
  const secondText =
    typeof second === "string" ? second : (JSON.stringify(second) ?? "");
  const result = firstText.localeCompare(secondText, undefined, {
    numeric: true,
  });
  return (
    result || (firstText === secondText ? 0 : firstText < secondText ? -1 : 1)
  );
}

export function inferLevel(parsed: ParsedMessage, raw: string): LogLevel {
  const numeric: Record<number, LogLevel> = {
    10: "trace",
    20: "debug",
    30: "info",
    40: "warn",
    50: "error",
    60: "fatal",
  };
  const aliases: Record<string, LogLevel> = {
    trace: "trace",
    debug: "debug",
    info: "info",
    information: "info",
    warn: "warn",
    warning: "warn",
    error: "error",
    err: "error",
    fatal: "fatal",
    critical: "fatal",
  };
  if (parsed.kind === "json") {
    for (const path of ["/level", "/severity", "/severityText", "/log/level"]) {
      const value = getPointer(parsed.value, path);
      if (typeof value === "number" && Object.hasOwn(numeric, value))
        return numeric[value]!;
      if (typeof value === "string") {
        const normalized = value.toLowerCase();
        if (Object.hasOwn(aliases, normalized)) return aliases[normalized]!;
        const number = Number(normalized);
        if (Object.hasOwn(numeric, number)) return numeric[number]!;
      }
    }
  }
  const match = raw
    .slice(0, 2000)
    .match(
      /(?:^|[\s\[\]:])(TRACE|DEBUG|INFO|WARN(?:ING)?|ERROR|FATAL|CRITICAL)(?=[\s\]:]|$)/i,
    );
  const key = match?.[1]?.toLowerCase();
  return key && Object.hasOwn(aliases, key) ? aliases[key]! : "unknown";
}

function localFilterTokens(query: string): string[] | undefined {
  if (query.length > MESSAGE_LIMIT * 2) return undefined;
  const tokens: string[] = [];
  let start = -1;
  let quoted = false;
  let escaped = false;
  for (let index = 0; index < query.length; index++) {
    const character = query[index]!;
    if (!quoted && /\s/.test(character)) {
      if (start !== -1) tokens.push(query.slice(start, index));
      start = -1;
      continue;
    }
    if (start === -1) start = index;
    if (escaped) escaped = false;
    else if (quoted && character === "\\") escaped = true;
    else if (character === '"') quoted = !quoted;
  }
  if (quoted) return undefined;
  if (start !== -1) tokens.push(query.slice(start));
  return tokens;
}

function quotedFilterText(
  token: string,
  start: number,
): { value: string; end: number } | undefined {
  if (token[start] !== '"') return undefined;
  let escaped = false;
  for (let index = start + 1; index < token.length; index++) {
    const character = token[index]!;
    if (escaped) escaped = false;
    else if (character === "\\") escaped = true;
    else if (character === '"') {
      try {
        return {
          value: JSON.parse(token.slice(start, index + 1)) as string,
          end: index + 1,
        };
      } catch {
        return undefined;
      }
    }
  }
  return undefined;
}

/** Quote the exact JSON Pointer and value so property actions cannot add extra filter terms. */
export function propertyFilterTerm(path: string, value: JsonValue): string {
  return `@${JSON.stringify(path)}=${JSON.stringify(value)}`;
}

export type LocalFilterTerm =
  | { kind: "literal"; text: string }
  | { kind: "property"; path: string; expected?: string };

/** The local filter grammar is shared by filtering and match evidence. */
export function parseLocalFilter(query: string): LocalFilterTerm[] | undefined {
  const tokens = localFilterTokens(query);
  if (!tokens) return undefined;
  const terms: LocalFilterTerm[] = [];
  for (const token of tokens) {
    let path: string | undefined;
    let expected: string | undefined;
    if (token.startsWith('@"')) {
      const quoted = quotedFilterText(token, 1);
      if (!quoted || (quoted.value !== "" && !quoted.value.startsWith("/")))
        return undefined;
      path = quoted.value;
      if (quoted.end < token.length) {
        if (token[quoted.end] !== "=") return undefined;
        expected = token.slice(quoted.end + 1);
      }
    } else if (token.startsWith("@/")) {
      const equals = token.indexOf("=");
      path = token.slice(1, equals < 0 ? undefined : equals);
      if (equals !== -1) expected = token.slice(equals + 1);
    }
    if (path !== undefined) {
      if (expected?.startsWith('"')) {
        const quoted = quotedFilterText(expected, 0);
        if (!quoted || quoted.end !== expected.length) return undefined;
        expected = quoted.value;
      }
      terms.push({ kind: "property", path, expected });
    } else {
      // Preserve the legacy literal behavior, including its quote handling.
      terms.push({ kind: "literal", text: token.replace(/^"|"$/g, "") });
    }
  }
  return terms;
}

/** @/json/pointer=value and @"/quoted pointer"="value" match properties; other terms search message and source. */
export function matchesLocalFilter(
  event: LogEvent,
  parsed: ParsedMessage,
  query: string,
  level: string | readonly string[],
): boolean {
  if (
    Array.isArray(level)
      ? !level.includes(inferLevel(parsed, event.message))
      : level && level !== "all" && inferLevel(parsed, event.message) !== level
  )
    return false;
  const terms = parseLocalFilter(query);
  if (!terms) return false;
  const searchable =
    `${event.message}\n${event.logGroup}\n${event.logStream}`.toLowerCase();
  for (const term of terms) {
    if (term.kind === "property") {
      if (parsed.kind !== "json") return false;
      const value = getPointer(parsed.value, term.path);
      if (value === undefined) return false;
      if (
        term.expected !== undefined &&
        summarizeValue(value, MESSAGE_LIMIT).toLowerCase() !==
          term.expected.toLowerCase()
      )
        return false;
    } else if (!searchable.includes(term.text.toLowerCase())) return false;
  }
  return true;
}

/** The automatic message cell prefers meaningful msg text, then message. */
export function messagePreview(
  parsed: ParsedMessage,
): { path: string; value: string } | undefined {
  if (parsed.kind !== "json") return undefined;
  for (const path of ["/msg", "/message"]) {
    const value = getPointer(parsed.value, path);
    if (typeof value === "string" && value.trim()) return { path, value };
  }
  return undefined;
}

export function eventColumnValue(
  event: LogEvent,
  parsed: ParsedMessage,
  path: string,
): JsonValue | undefined {
  switch (path) {
    case "@timestamp":
      return Number.isFinite(event.timestamp) &&
        Math.abs(event.timestamp) <= 8_640_000_000_000_000
        ? event.timestamp
        : null;
    case "@level":
      return inferLevel(parsed, event.message);
    case "@message":
      return event.message;
    case "@source":
      return [event.connectionId, event.logGroup, event.logStream]
        .filter(Boolean)
        .join(" · ");
    case "@logGroup":
      return event.logGroup;
    case "@logStream":
      return event.logStream;
    default:
      return parsed.kind === "json"
        ? getPointer(parsed.value, path)
        : undefined;
  }
}

export interface InspectionRow {
  path: string;
  label: string;
  value: JsonValue;
  depth: number;
  childCount: number;
  expanded: boolean;
  depthLimited: boolean;
}
export function inspectionRows(
  value: JsonValue,
  expanded: Set<string>,
  options: { maxNodes?: number; maxDepth?: number } = {},
): { rows: InspectionRow[]; truncated: boolean } {
  const rows: InspectionRow[] = [];
  const pending = [{ path: "", label: "$", value, depth: 0 }];
  const maxNodes = Math.max(1, options.maxNodes ?? INSPECTION_LIMIT);
  const maxDepth = Math.max(1, options.maxDepth ?? 24);
  let truncated = false;
  while (pending.length && rows.length < maxNodes) {
    const item = pending.pop()!;
    const keys =
      item.value !== null && typeof item.value === "object"
        ? Object.keys(item.value)
        : [];
    const isExpanded = expanded.has(item.path);
    const depthLimited = keys.length > 0 && item.depth >= maxDepth;
    rows.push({
      ...item,
      childCount: keys.length,
      expanded: isExpanded,
      depthLimited,
    });
    if (depthLimited && isExpanded) truncated = true;
    if (keys.length && isExpanded && !depthLimited) {
      const selected = keys.slice(
        0,
        Math.max(0, maxNodes - rows.length - pending.length),
      );
      if (selected.length < keys.length) truncated = true;
      for (let index = selected.length - 1; index >= 0; index--) {
        const key = selected[index]!;
        pending.push({
          path: `${item.path}/${pointerToken(key)}`,
          label: key,
          value: (item.value as Record<string, JsonValue>)[key]!,
          depth: item.depth + 1,
        });
      }
    }
  }
  return { rows, truncated: truncated || pending.length > 0 };
}

/** Export never silently cuts content. The desktop bridge applies its own IPC size bound. */
export function serializeEvents(
  events: LogEvent[],
  format: "json" | "jsonl" | "csv",
  columns: string[] = [...META_COLUMNS],
  parsedFor?: (event: LogEvent) => ParsedMessage,
): string {
  const chunks: string[] = [];
  let length = 0;
  const append = (chunk: string) => {
    length += chunk.length;
    if (length > EXPORT_LIMIT)
      throw new Error(
        "Export exceeds the 20 MB text limit. Narrow the local selection and export again.",
      );
    chunks.push(chunk);
  };
  if (format === "csv") {
    const escape = (value: string) => `"${value.replace(/"/g, '""')}"`;
    append(columns.map(escape).join(","));
    for (const event of events) {
      const parsed = parsedFor?.(event) ?? parseLogMessage(event.message);
      const values = columns.map((path) => {
        const value = eventColumnValue(event, parsed, path);
        const text =
          path === "@timestamp" && typeof value === "number"
            ? new Date(value).toISOString()
            : value === undefined
              ? ""
              : typeof value === "string"
                ? value
                : JSON.stringify(value);
        // Prevent untrusted log text from becoming a spreadsheet formula.
        return escape(/^[\s]*[=+@-]|^[\t\r]/.test(text) ? `'${text}` : text);
      });
      append(`\r\n${values.join(",")}`);
    }
  } else {
    if (format === "json") append("[");
    events.forEach((event, index) => {
      append(
        `${index ? (format === "json" ? "," : "\n") : ""}${JSON.stringify(event)}`,
      );
    });
    if (format === "json") append("]");
  }
  return chunks.join("");
}
