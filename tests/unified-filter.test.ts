import { describe, expect, it } from "vitest";
import { compileUnifiedFilter } from "../src/shared/unified-filter";
import {
  availableFilterModes,
  resolveFilterSyntax,
  compileAwsViewFilter,
} from "../src/shared/server-filter";
import { compileGcpViewFilter } from "../src/shared/gcp-server-filter";

describe("unified JSON filter", () => {
  it("detects the unified syntax, even with leading parentheses", () => {
    expect(
      resolveFilterSyntax("($.count > 10 OR $.seller IS NULL)", "auto"),
    ).toBe("unified");
    expect(resolveFilterSyntax("( ( $.count > 10 ) )", "auto")).toBe("unified");
    expect(resolveFilterSyntax("{ $.count > 10 }", "auto")).toBe("aws");
    expect(resolveFilterSyntax("jsonPayload.count > 10", "auto")).toBe("gcp");
  });
  it("compiles AND before OR and preserves explicit parentheses", () => {
    const q = '$.count > 10 AND ($.domain = "we" OR $.seller IS NULL)';
    expect(compileUnifiedFilter(q, "aws")).toBe(
      '{ (($.count > 10) && (($.domain = "we") || ($.seller IS NULL))) }',
    );
    expect(compileUnifiedFilter(q, "gcp")).toBe(
      '((jsonPayload.count > 10) AND ((jsonPayload.domain = "we") OR (jsonPayload.seller = NULL_VALUE)))',
    );
  });
  it("keeps logical words inside strings and applies AND before OR", () => {
    expect(
      compileUnifiedFilter('$.name = "A AND B" OR $.x = 1 AND $.y = 2', "gcp"),
    ).toBe(
      '((jsonPayload.name = "A AND B") OR ((jsonPayload.x = 1) AND (jsonPayload.y = 2)))',
    );
  });
  it("quotes GCP field names containing hyphens", () => {
    expect(compileUnifiedFilter('$.request-id = "abc"', 'gcp')).toBe('(jsonPayload."request-id" = "abc")');
  });
  it("compiles missing and boolean fields without local filtering", () => {
    expect(compileUnifiedFilter("$.seller IS UNDEFINED", "aws")).toBe(
      "{ ($.seller NOT EXISTS) }",
    );
    expect(compileUnifiedFilter("$.seller IS UNDEFINED", "gcp")).toBe(
      "(jsonPayload:* AND NOT jsonPayload.seller:*)",
    );
    expect(compileUnifiedFilter("$.enabled = true", "aws")).toBe(
      "{ ($.enabled IS TRUE) }",
    );
    expect(compileUnifiedFilter('$.empty = ""', "aws")).toBe(
      '{ ($.empty = "") }',
    );
    expect(compileUnifiedFilter('$.progress = "100%"', "aws")).toBe(
      '{ ($.progress = "100%") }',
    );
    expect(
      compileGcpViewFilter("$.count > 1", "unified", "execution", true).local,
    ).toBeUndefined();
  });
  it("rejects unsupported or malformed expressions", () => {
    for (const q of [
      "$.seller != null",
      "$.a IS NOT NULL",
      "$.foo[0] = 1",
      '$.a = "x*"',
      "$.a > 2 trailing",
      "$.a = 1 OR",
      "$.a = 1; DROP",
    ])
      expect(() => compileUnifiedFilter(q, "aws"), q).toThrow();
    expect(() => compileUnifiedFilter('$.seller != null', 'aws')).toThrow(/null and undefined only with = or IS/i);
  });
  it("limits native pattern modes to compatible providers", () => {
    expect(availableFilterModes("aws")).toEqual([
      "plain",
      "unified",
      "aws-pattern",
      "auto",
    ]);
    expect(availableFilterModes("gcp")).toEqual([
      "plain",
      "unified",
      "gcp-pattern",
      "auto",
    ]);
    expect(availableFilterModes("mixed")).toEqual(["plain", "unified", "auto"]);
    expect(() => compileAwsViewFilter("jsonPayload.count > 1", "auto")).toThrow(
      /GCP.*not available/i,
    );
    expect(() =>
      compileGcpViewFilter("{ $.count > 1 }", "auto", "execution", true),
    ).toThrow(/AWS.*not available/i);
  });
});
