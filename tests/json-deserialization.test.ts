import { expect, it } from "vitest";
import { deserializeJsonField } from "../src/renderer/json-deserialization";
import { getPointer, MESSAGE_LIMIT } from "../src/shared/log-data";

it("replaces a JSON string at its exact escaped path without changing the event value", () => {
  const original = Object.freeze({
    "a/b": Object.freeze({ "~payload": '{"items":[1,{"ok":true}]}' }),
    sibling: 3,
  });
  const result = deserializeJsonField(original, "/a~1b/~0payload")!;
  expect(getPointer(result.value, "/a~1b/~0payload/items/1/ok")).toBe(true);
  expect(original["a/b"]["~payload"]).toBe('{"items":[1,{"ok":true}]}');
  expect(getPointer(result.value, "/sibling")).toBe(3);
});

it("decodes array entries and the root, including valid JSON primitives", () => {
  expect(deserializeJsonField(['["child"]'], "/0")?.value).toEqual([["child"]]);
  expect(deserializeJsonField('{"key":1}', "")?.value).toEqual({ key: 1 });
  expect(
    deserializeJsonField({ flag: "false", empty: "null" }, "/flag")?.value,
  ).toEqual({ flag: false, empty: "null" });
  expect(deserializeJsonField({ empty: "null" }, "/empty")?.value).toEqual({
    empty: null,
  });
});

it("rejects malformed JSON, non-string or missing fields, excessive input and nesting", () => {
  for (const [value, path] of [
    [{ bad: "{bad" }, "/bad"],
    [{ n: 42 }, "/n"],
    [{}, "/absent"],
    [{ x: "0" }, "/bad~2"],
    [{ x: '"' + "x".repeat(MESSAGE_LIMIT) + '"' }, "/x"],
    [{ x: "[".repeat(33) + "0" + "]".repeat(33) }, "/x"],
  ] as const) {
    expect(deserializeJsonField(value, path)).toBeUndefined();
  }
});

it("retains dangerous-looking keys as own data properties without prototype mutation", () => {
  const value = JSON.parse('{"__proto__":"{\\"polluted\\":true}"}');
  const result = deserializeJsonField(value, "/__proto__")!;
  expect(Object.hasOwn(result.value as object, "__proto__")).toBe(true);
  expect(getPointer(result.value, "/__proto__/polluted")).toBe(true);
  expect(({} as Record<string, unknown>).polluted).toBeUndefined();
});
