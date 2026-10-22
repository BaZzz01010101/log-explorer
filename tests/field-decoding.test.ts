import { expect, it } from "vitest";
import {
  decodeFieldText,
  deserializeJsonField,
} from "../src/renderer/json-deserialization";
import { MESSAGE_LIMIT, getPointer } from "../src/shared/log-data";

it("decodes percent-encoded Unicode once and preserves literal plus characters", () => {
  expect(
    decodeFieldText("%7B%22message%22%3A%22caf%C3%A9%20%2B%22%7D", "url"),
  ).toBe('{"message":"café +"}');
  expect(decodeFieldText("a+b%20c", "url")).toBe("a+b c");
  expect(decodeFieldText("%2520", "url")).toBe("%20");
  for (const value of [
    "plain",
    "a+b",
    "%",
    "%0G",
    "%20%",
    "%FF",
    "%C0%AF",
    5,
    null,
  ])
    expect(decodeFieldText(value, "url")).toBeUndefined();
});

it("accepts canonical padded, unpadded and URL-safe Base64 containing UTF-8 text", () => {
  for (const value of ["aGVsbG8=", "aGVsbG8"])
    expect(decodeFieldText(value, "base64")).toBe("hello");
  const text = "café 😀\n\tHello";
  const encoded = Buffer.from(text).toString("base64");
  expect(decodeFieldText(encoded, "base64")).toBe(text);
  expect(
    decodeFieldText(
      Buffer.from("\u083e\u083f").toString("base64url"),
      "base64",
    ),
  ).toBe("\u083e\u083f");
  expect(decodeFieldText("77u/aGk=", "base64")).toBe("\uFEFFhi");
});

it("rejects malformed Base64, noncanonical trailing bits and binary data", () => {
  for (const value of [
    "",
    "a",
    "aG=V",
    "aGVsbG8==",
    "aGVsbG8=\n",
    "aGVsbG8 ",
    "aGVsbG9=",
    "aGVsbG9",
    "ab-_+/==",
    "/w==",
    "AA==",
    "fw==",
    "woA=",
    "wK8=",
    {},
    true,
  ])
    expect(decodeFieldText(value as any, "base64")).toBeUndefined();
});

it("bounds work and replaces only the exact field without mutating raw input", () => {
  expect(decodeFieldText("%20".repeat(MESSAGE_LIMIT), "url")).toBeUndefined();
  expect(
    decodeFieldText("a".repeat(MESSAGE_LIMIT + 1), "base64"),
  ).toBeUndefined();
  expect(
    decodeFieldText("YWJj".repeat(MESSAGE_LIMIT / 4), "base64")?.length,
  ).toBe(393216);
  const original = { "a/b": ["eyJvayI6dHJ1ZX0="] };
  Object.freeze(original["a/b"]);
  Object.freeze(original);
  const decoded = deserializeJsonField(original, "/a~1b/0", "base64")!;
  expect(getPointer(decoded.value, "/a~1b/0")).toBe('{"ok":true}');
  const parsed = deserializeJsonField(decoded.value, "/a~1b/0")!;
  expect(getPointer(parsed.value, "/a~1b/0/ok")).toBe(true);
  expect(original["a/b"][0]).toBe("eyJvayI6dHJ1ZX0=");
  expect(deserializeJsonField({}, "/missing", "url")).toBeUndefined();
});
