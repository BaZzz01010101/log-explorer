import { describe, expect, it } from "vitest";
import {
  matchAwsCompatibleFilter,
  parseAwsCompatibleFilter,
} from "../src/shared/aws-compatible-filter";
import { compileGcpViewFilter } from "../src/shared/gcp-server-filter";

describe("AWS-compatible mixed source filters", () => {
  it("excludes audit logs for Google sources regardless of saved log type", () => {
    for (const saved of ["all", "audit", "execution"] as const)
      expect(compileGcpViewFilter("", "auto", saved, false).pattern).toContain("NOT protoPayload");
  });
  const values = [
    5,
    "5",
    [5],
    "ERROR",
    "error",
    null,
    undefined,
    true,
    false,
    "05",
    "5.0",
  ];
  const match = (pattern: string) =>
    values
      .map((value) => (value === undefined ? "{}" : JSON.stringify({ value })))
      .map((message) =>
        matchAwsCompatibleFilter(parseAwsCompatibleFilter(pattern), message),
      );
  it("matches AWS scalar equality and inequality, without matching arrays, nulls or booleans", () => {
    expect(match("{ $.value = 5 }")).toEqual([
      true,
      true,
      false,
      false,
      false,
      false,
      false,
      false,
      false,
      false,
      false,
    ]);
    expect(match('{ $.value != "ERROR" }')).toEqual([
      true,
      true,
      false,
      false,
      true,
      false,
      false,
      false,
      false,
      true,
      true,
    ]);
  });
  it("supports numeric ordering and explicit null, boolean and missing checks", () => {
    expect(match("{ $.value > 4 }")).toEqual([
      true,
      false,
      false,
      false,
      false,
      false,
      false,
      false,
      false,
      false,
      false,
    ]);
    expect(match("{ $.value IS TRUE }")[7]).toBe(true);
    expect(match("{ $.value IS NULL }")[5]).toBe(true);
    expect(match("{ $.value NOT EXISTS }")[6]).toBe(true);
  });
  it("distinguishes numeric literals from quoted strings using AWS comparison behavior", () => {
    expect(match("{ $.value = 5.0 }")).toEqual([
      true,
      false,
      false,
      false,
      false,
      false,
      false,
      false,
      false,
      false,
      true,
    ]);
    expect(match('{ $.value = "5.0" }')).toEqual([
      false,
      false,
      false,
      false,
      false,
      false,
      false,
      false,
      false,
      false,
      true,
    ]);
  });
  it("matches nested object fields and treats plain text as non-JSON", () => {
    const rule = parseAwsCompatibleFilter('{ $.request.level = "ERROR" }');
    expect(
      matchAwsCompatibleFilter(rule, '{"request":{"level":"ERROR"}}'),
    ).toBe(true);
    expect(matchAwsCompatibleFilter(rule, "ERROR")).toBe(false);
  });
  it("rejects unsupported operators and multiple terms rather than silently changing meaning", () => {
    for (const pattern of [
      "{ $.value = %err% }",
      '{ $.value = "ERR*" }',
      "{ $.value = 5 && $.other = 2 }",
      "{ $.value[0] = 5 }",
    ])
      expect(() => parseAwsCompatibleFilter(pattern)).toThrow(
        /mixed.*support/i,
      );
  });
  it("compiles mixed AWS JSON patterns without misinterpreting them as Google syntax", () => {
    const compiled = compileGcpViewFilter(
      '{ $.value = "ERROR" }',
      "auto",
      "all",
      true,
    );
    expect(compiled.pattern).toContain('(textPayload:* OR protoPayload:* OR jsonPayload."value":*)');
    expect(compiled.pattern).toContain("NOT protoPayload");
    expect(compiled.local).toEqual({ kind: "aws-json", value: '{ $.value = "ERROR" }' });
    expect(
      compileGcpViewFilter("{ $.value NOT EXISTS }", "pattern", "all", true)
        .pattern,
    ).toContain("NOT protoPayload");
    expect(compileGcpViewFilter("ERROR", "auto", "all", true)).toMatchObject({
      local: { kind: "plain", value: "ERROR" },
    });
    expect(() =>
      compileGcpViewFilter("{ $.value = %err% }", "auto", "all", true),
    ).toThrow(/mixed/i);
  });
});
