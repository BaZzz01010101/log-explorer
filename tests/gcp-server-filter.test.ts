import { describe, expect, it } from "vitest";
import { compileGcpServerFilter } from "../src/shared/gcp-server-filter";

describe("Google Cloud server filter", () => {
  it("escapes plain text as a global Cloud Logging search", () => {
    expect(compileGcpServerFilter('say "hello"', "plain")).toBe('"say \\"hello\\""');
  });
  it("preserves Google query language expressions in pattern mode", () => {
    expect(compileGcpServerFilter('severity>=ERROR AND jsonPayload.user="joe"', "pattern")).toBe('severity>=ERROR AND jsonPayload.user="joe"');
  });
  it("recognizes common Google query expressions in auto mode", () => {
    expect(compileGcpServerFilter('severity>=ERROR', "auto")).toBe('severity>=ERROR');
    expect(compileGcpServerFilter('payment failed', "auto")).toBe('"payment failed"');
  });
  it("combines the optional audit filter with the user query", () => {
    expect(compileGcpServerFilter("", "auto", "all")).toBe("");
    expect(compileGcpServerFilter("failure", "plain", "execution")).toContain('NOT protoPayload."@type"=');
    expect(compileGcpServerFilter("failure", "plain", "audit")).toContain('(\"failure\") AND (protoPayload.');
  });
});
