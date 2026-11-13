import { compileUnifiedFilter } from "./unified-filter";
export type ServerFilterMode =
  "plain" | "pattern" | "aws-pattern" | "gcp-pattern" | "unified" | "auto";
export type FilterProvider = "aws" | "gcp" | "mixed";
export function availableFilterModes(
  provider: FilterProvider,
): ServerFilterMode[] {
  return [
    "plain",
    "unified",
    ...(provider === "aws"
      ? ["aws-pattern" as const]
      : provider === "gcp"
        ? ["gcp-pattern" as const]
        : []),
    "auto",
  ];
}

export function resolveFilterSyntax(
  text: string,
  mode: ServerFilterMode = "auto",
  legacyProvider: "aws" | "gcp" = "aws",
): "plain" | "aws" | "gcp" | "unified" {
  if (mode === "plain") return "plain";
  if (mode === "aws-pattern") return "aws";
  if (mode === "gcp-pattern") return "gcp";
  if (mode === "unified") return "unified";
  if (mode === "pattern") return legacyProvider;
  if (/^(?:\s*\()*\s*\$\./.test(text)) return "unified";
  if (
    /(?:^|\s|\()(?:resource|jsonPayload|protoPayload|textPayload|labels|severity|logName|timestamp|insertId|trace|httpRequest)(?:\.[\w".-]+)*\s*(?:=~|!~|!=|>=|<=|=|>|<|:)/i.test(
      text,
    )
  )
    return "gcp";
  return serverFilterMode(text, "auto") === "pattern" ? "aws" : "plain";
}

export function compileAwsViewFilter(
  text: string,
  mode: ServerFilterMode = "auto",
): string {
  if (!text.trim()) return "";
  const syntax = resolveFilterSyntax(text, mode);
  if (syntax === "plain") return JSON.stringify(text);
  if (syntax === "aws") return text;
  if (syntax === "unified") return compileUnifiedFilter(text, "aws");
  throw new Error(
    "GCP Pattern is not available for views containing AWS sources. Use Unified or Text.",
  );
}

export function serverFilterMode(
  text: string,
  mode: ServerFilterMode = "pattern",
): "plain" | "pattern" {
  if (mode !== "auto") return mode === "plain" ? "plain" : "pattern";
  const input = text.trim();
  // Recognize explicit AWS syntax, never punctuation in ordinary prose or JSON
  // records. Incomplete explicit openers stay editable as patterns.
  return /^\{\s*(?:\(\s*)*(?:\$|$)/.test(input) ||
    /^\[\s*(?:\.\.\.|[A-Za-z_*]\w*\s*(?:,|=|!=|>|<|\])|$)/.test(input) ||
    /^%/.test(input) ||
    /(?:^|\s)%[^%]+%(?:\s|$)/.test(input) ||
    /^(?:\?|-)\w/.test(input)
    ? "pattern"
    : "plain";
}

export function compileServerFilter(
  text: string,
  mode: ServerFilterMode = "pattern",
): string {
  if (!text.trim()) return "";
  return serverFilterMode(text, mode) === "plain" ? JSON.stringify(text) : text;
}

export interface FilterToken {
  text: string;
  kind: "plain" | "keyword" | "string" | "property" | "regex" | "operator";
}
export function filterTokens(text: string): FilterToken[] {
  const tokens: FilterToken[] = [];
  const lex =
    /"(?:[^"\\]|\\.)*(?:"|$)|'(?:[^'\\]|\\.)*(?:'|$)|%[^%]*(?:%|$)|\$(?:[\w.*]|\[[^\]]*\])+|\b(?:NOT EXISTS|IS NULL|NOT|IS|NULL)\b|&&|\|\||!=|>=|<=|[=<>]|\s+|[A-Za-z_]\w*|./g;
  for (const match of text.matchAll(lex)) {
    const value = match[0];
    const kind = /^["']/.test(value)
      ? "string"
      : value[0] === "%"
        ? "regex"
        : value[0] === "$"
          ? "property"
          : /^(?:NOT EXISTS|IS NULL|NOT|IS|NULL)$/.test(value)
            ? "keyword"
            : /^(?:&&|\|\||!=|>=|<=|[=<>])$/.test(value)
              ? "operator"
              : "plain";
    tokens.push({ text: value, kind });
  }
  return tokens;
}

const completions = [
  { value: "NOT EXISTS", description: "Property is absent" },
  { value: "IS NULL", description: "Property is null" },
  { value: "NULL", description: "Null value" },
  { value: "&&", description: "Both conditions match" },
  { value: "||", description: "Either condition matches" },
];
export function filterCompletions(text: string, caret: number) {
  const before = text.slice(0, caret);
  // Do not complete keywords inside string literals or regexes.
  const tail = filterTokens(before).at(-1);
  if (
    tail &&
    ((tail.kind === "regex" && !/^%[^%]*%$/.test(tail.text)) ||
      (tail.kind === "string" &&
        !/^(?:"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*')$/.test(tail.text)))
  )
    return [];
  const match = before.match(
    /(?:NOT\s+EX\w*|IS\s+NU\w*|[A-Za-z]+|[&|]{1,2})$/i,
  );
  if (!match) return [];
  const prefix = match[0].toUpperCase();
  return completions
    .filter((item) => item.value.startsWith(prefix) && item.value !== prefix)
    .map((item) => ({ ...item, start: caret - match[0].length, end: caret }));
}
