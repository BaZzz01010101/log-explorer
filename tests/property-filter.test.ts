import { expect, it } from "vitest";
import type { LogEvent } from "../src/shared/contracts";
import {
  matchesLocalFilter,
  parseLogMessage,
  propertyFilterTerm,
  MESSAGE_LIMIT,
  type JsonValue,
} from "../src/shared/log-data";

function matches(value: JsonValue, query: string) {
  const event: LogEvent = {
    id: "property-filter",
    timestamp: 1000,
    message: JSON.stringify(value),
    logGroup: "/app/test",
    logStream: "stream-a",
  };
  return matchesLocalFilter(
    event,
    parseLogMessage(event.message),
    query,
    "all",
  );
}

it("matches JSON-quoted pointer keys and decodes escaped quoted values", () => {
  const query = '@"/request = \\"id\\""="line one\\nline \\"two\\" \\\\ end"';
  expect(
    matches({ 'request = "id"': 'line one\nline "two" \\ end' }, query),
  ).toBe(true);
  expect(
    matches(
      {
        'request = "id"': "different",
        distractor: 'line one\nline "two" \\ end',
      },
      query,
    ),
  ).toBe(false);
});

it("keeps legacy pointer terms and ordinary quoted or unquoted free text", () => {
  const value = {
    user: { id: 7 },
    message: "Request failed with spaces",
  };
  expect(matches(value, '@/user/id=7 "with spaces" failed')).toBe(true);
  expect(matches(value, "@/user/id=8 failed")).toBe(false);
  expect(matches(value, "@/user/id")).toBe(true);
  expect(matches(value, "missing")).toBe(false);
});

it("accepts quoted empty pointers for scalar root values", () => {
  expect(matches("Root value", '@""="root VALUE"')).toBe(true);
  expect(matches({ distractor: "Root value" }, '@""="root VALUE"')).toBe(false);
  expect(matches(null, '@""=null')).toBe(true);
});

it.each([
  '@"/unterminated=value',
  '@"/key"="unterminated',
  '@"/key"="invalid\\q"',
  '@"/key"extra="value"',
  '@"not-a-pointer"="value"',
])(
  "fails closed without throwing on malformed quoted property term %s",
  (query) => {
    expect(matches({ key: "value" }, query)).toBe(false);
  },
);

it.each([
  null,
  false,
  true,
  0,
  7,
  -1,
  3.5,
  "",
  "value with spaces",
  'quote " and backslash \\ and\nnewline',
  'value\" @/other=wrong "tail',
] as const)(
  "generates a property filter that matches the exact scalar property %j",
  (value) => {
    const query = propertyFilterTerm('/field = "key"', value);
    expect(matches({ 'field = "key"': value, other: "wrong" }, query)).toBe(
      true,
    );
    expect(matches({ 'field = "key"': "different", other: value }, query)).toBe(
      false,
    );
  },
);

it("preserves encoded JSON Pointer tokens without selecting lookalike keys", () => {
  const query = propertyFilterTerm("/a~1b/~0id", "target");
  expect(matches({ "a/b": { "~id": "target" } }, query)).toBe(true);
  expect(
    matches(
      { "a/b": { "~id": "different" }, a: { b: { "~id": "target" } } },
      query,
    ),
  ).toBe(false);
});

it("keeps quoted property existence, legacy quoted values, and case-insensitive equality", () => {
  const value = { "some key": "Case VALUE", user: { id: 7 } };
  expect(matches(value, '@"/some key"')).toBe(true);
  expect(matches(value, '@/some key="case value"')).toBe(false);
  expect(matches(value, '@"/some key"="case value"')).toBe(true);
  expect(matches({ key: "case value" }, '@/key="CASE VALUE"')).toBe(true);
  expect(matches({ key: "7" }, propertyFilterTerm("/key", 7))).toBe(true);
  expect(matches("scalar root", propertyFilterTerm("", "scalar root"))).toBe(
    true,
  );
});

it("rejects oversized local queries within the bounded parser", () => {
  expect(matches("value", "x".repeat(MESSAGE_LIMIT * 2 + 1))).toBe(false);
});
