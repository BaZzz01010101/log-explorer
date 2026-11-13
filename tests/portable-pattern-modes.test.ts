import { expect, it } from "vitest";
import {
  resolveFilterSyntax,
  compileAwsViewFilter,
} from "../src/shared/server-filter";
import { compileGcpViewFilter } from "../src/shared/gcp-server-filter";
import { createWorkspace, restoreWorkspace, workspaceReducer } from "../src/renderer/workspace";
import { workspaceSchema } from "../src/main/security";

it("detects both provider pattern syntaxes and text", () => {
  expect(resolveFilterSyntax("{ $.count >= 3 }", "auto")).toBe("aws");
  expect(resolveFilterSyntax("jsonPayload.count >= 3", "auto")).toBe("gcp");
  expect(resolveFilterSyntax("normal message", "auto")).toBe("plain");
});

it("rejects GCP patterns for AWS sources", () => {
  expect(() => compileAwsViewFilter("jsonPayload.count >= 3", "gcp-pattern")).toThrow(/GCP Pattern.*not available/i);
});

it("rejects AWS patterns for Google sources", () => {
  expect(() => compileGcpViewFilter("{ $.count >= 3 }", "aws-pattern", "execution", false)).toThrow(/AWS Pattern.*not available/i);
});

it("retains both explicit modes in persisted workspaces", () => {
  for (const mode of ["aws-pattern", "gcp-pattern", "unified"] as const) {
    const original = createWorkspace();
    const state = workspaceReducer(original, { type: "tab/update", tabId: original.tabs[0].id, patch: { filterMode: mode } });
    expect(workspaceSchema.safeParse(state).success).toBe(true);
    expect(restoreWorkspace(state).tabs[0].filterMode).toBe(mode);
  }
});

it("runs unified comparisons natively in mixed views", () => {
  const result = compileGcpViewFilter('$.count >= 3', 'auto', 'execution', true);
  expect(result.local).toBeUndefined();
  expect(result.pattern).toContain('jsonPayload.count >= 3');
});
