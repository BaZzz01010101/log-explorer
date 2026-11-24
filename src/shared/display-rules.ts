import type { LogEvent } from "./contracts";

/** User format strings for source names; empty means the automatic name. */
export interface SourceNameFormats {
  aws?: string;
  gcp?: string;
}

/** A JSON path that supplies the Message column for matching sources. */
export interface MessageRule {
  id: string;
  /** Source name filter; empty matches every source. */
  source: string;
  /** The source filter is a regular expression. */
  regex?: boolean;
  /** The source filter matches case. */
  caseSensitive?: boolean;
  /** `$.message.summary`, `message.summary` or the pointer `/message/summary`. */
  path: string;
}

export const SOURCE_NAME_FORMAT_LIMIT = 200;
export const MESSAGE_RULE_LIMIT = 100;

export const SOURCE_NAME_PLACEHOLDERS = {
  aws: [
    ["NAME", "Log group without the folders shared by the view's sources"],
    ["FULL_NAME", "Full log group name"],
    ["STREAM", "Short log stream ID"],
    ["FULL_STREAM", "Full log stream name"],
    ["REGION", "Region"],
    ["PROFILE", "Profile"],
  ],
  gcp: [
    ["NAME", "Container or function name"],
    ["FULL_NAME", "Full source name"],
    ["CLUSTER", "Cluster"],
    ["NAMESPACE", "Namespace"],
    ["REGION", "Region"],
    ["PROJECT", "Project"],
  ],
} as const;

type FormatPart =
  { kind: "literal"; text: string } | { kind: "value"; text: string };

/**
 * Fills `{PLACEHOLDER}`s. An empty value drops the separator before it (or,
 * at the start, after it), so `{NAME} · {NAMESPACE} / {REGION}` without a
 * namespace reads `name / region`. Unknown placeholders stay literal.
 */
export function formatSourceName(
  format: string,
  values: Record<string, string | undefined>,
): string {
  const parts: (FormatPart | { kind: "empty" })[] = [];
  let last = 0;
  for (const match of format.matchAll(/\{([A-Z_]+)\}/g)) {
    if (match.index > last)
      parts.push({ kind: "literal", text: format.slice(last, match.index) });
    last = match.index + match[0].length;
    if (!Object.hasOwn(values, match[1]))
      parts.push({ kind: "literal", text: match[0] });
    else if (values[match[1]])
      parts.push({ kind: "value", text: values[match[1]]! });
    else parts.push({ kind: "empty" });
  }
  if (last < format.length)
    parts.push({ kind: "literal", text: format.slice(last) });
  const out: FormatPart[] = [];
  let dropNextLiteral = false;
  for (const part of parts) {
    if (part.kind === "literal") {
      if (!dropNextLiteral) out.push(part);
      dropNextLiteral = false;
    } else if (part.kind === "value") {
      out.push(part);
      dropNextLiteral = false;
    } else if (
      out.at(-1)?.kind === "literal" &&
      out.some((item) => item.kind === "value")
    )
      out.pop();
    else dropNextLiteral = true;
  }
  return out
    .map((part) => part.text)
    .join("")
    .trim();
}

/** Converts a message path to a JSON pointer, or undefined when invalid. */
export function messagePathPointer(path: string): string | undefined {
  const text = path.trim();
  if (!text) return undefined;
  if (text.startsWith("/")) return text;
  let rest = text.startsWith("$") ? text.slice(1) : `.${text}`;
  const segments: string[] = [];
  while (rest) {
    let match: RegExpExecArray | null;
    if ((match = /^\.([^.[\]]+)/.exec(rest))) segments.push(match[1]);
    else if ((match = /^\[(\d+)\]/.exec(rest))) segments.push(match[1]);
    else if ((match = /^\[\s*(['"])((?:\\.|(?!\1)[^\\])*)\1\s*\]/.exec(rest)))
      segments.push(match[2].replace(/\\(.)/g, "$1"));
    else return undefined;
    rest = rest.slice(match[0].length);
  }
  if (!segments.length) return undefined;
  return segments
    .map((segment) => "/" + segment.replace(/~/g, "~0").replace(/\//g, "~1"))
    .join("");
}

/** Shows a JSON pointer as a `$.a.b[0]` path. */
export function pointerMessagePath(pointer: string): string {
  return (
    "$" +
    pointer
      .split("/")
      .slice(1)
      .map((segment) => segment.replace(/~1/g, "/").replace(/~0/g, "~"))
      .map((segment) =>
        /^\d+$/.test(segment)
          ? `[${segment}]`
          : /^[A-Za-z_$][\w$-]*$/.test(segment)
            ? `.${segment}`
            : `['${segment.replace(/\\/g, "\\\\").replace(/'/g, "\\'")}']`,
      )
      .join("")
  );
}

/** The name a message rule uses for this event's source. */
export function eventSourceName(event: LogEvent): string {
  return (
    event.gcpSource?.container ||
    event.gcpSource?.functionName ||
    event.logGroup
  );
}

export interface CompiledMessageRule {
  pointer: string;
  matches(event: LogEvent): boolean;
}

/**
 * Matches source names like the local filter: text found anywhere in the name
 * (`*` is a wildcard), or a regular expression; case-insensitive unless the
 * rule matches case. Undefined for an invalid regular expression.
 */
function sourcePattern(rule: MessageRule): RegExp | undefined {
  const flags = rule.caseSensitive ? "u" : "iu";
  if (rule.regex)
    try {
      return new RegExp(rule.source, flags);
    } catch {
      return undefined;
    }
  return new RegExp(
    rule.source
      .trim()
      .split("*")
      .map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
      .join(".*"),
    flags,
  );
}

/** The error of a rule's source filter, if its regular expression is invalid. */
export function messageRuleSourceError(rule: MessageRule): string | undefined {
  if (!rule.regex || !rule.source.trim()) return undefined;
  try {
    new RegExp(rule.source, rule.caseSensitive ? "u" : "iu");
    return undefined;
  } catch (failure) {
    return failure instanceof Error ? failure.message : String(failure);
  }
}

const compiled = new WeakMap<readonly MessageRule[], CompiledMessageRule[]>();

export function compileMessageRules(
  rules: readonly MessageRule[] | undefined,
): CompiledMessageRule[] {
  if (!rules?.length) return [];
  const cached = compiled.get(rules);
  if (cached) return cached;
  const result = rules.flatMap((rule): CompiledMessageRule[] => {
    const pointer = messagePathPointer(rule.path);
    if (!pointer) return [];
    if (!rule.source.trim()) return [{ pointer, matches: () => true }];
    const pattern = sourcePattern(rule);
    if (!pattern) return [];
    // Views have few sources and many events.
    const tested = new Map<string, boolean>();
    const test = (name: string | undefined) => {
      if (name === undefined) return false;
      let result = tested.get(name);
      if (result === undefined) tested.set(name, (result = pattern.test(name)));
      return result;
    };
    return [
      {
        pointer,
        matches: (event) =>
          test(event.logGroup) ||
          test(event.gcpSource?.container) ||
          test(event.gcpSource?.functionName),
      },
    ];
  });
  compiled.set(rules, result);
  return result;
}
