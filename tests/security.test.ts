import { describe, expect, it } from "vitest";
import { createWorkspace } from "../src/renderer/workspace";
import {
  connectionSchema,
  querySchema,
  workspaceSchema,
  AwsAccessGate,
} from "../src/main/security";

describe("desktop trust boundary", () => {
  it("preserves quick highlight modes and bounded field widths through workspace validation", () => {
    const workspace = createWorkspace();
    const settings = {
      highlightRegex: true,
      highlightCaseSensitive: true,
      localSearchWidth: 460,
      highlightTextWidth: 380,
    };
    Object.assign(workspace.tabs[0].view, settings);
    expect(workspaceSchema.parse(workspace).tabs[0].view).toMatchObject(
      settings,
    );
    workspace.tabs[0].view.localSearchWidth = 3000;
    expect(workspaceSchema.safeParse(workspace).success).toBe(false);
  });
  it("preserves bounded highlight profiles while rejecting CSS-shaped colors", () => {
    const workspace = createWorkspace();
    workspace.preferences.highlightProfiles = [
      {
        id: "p",
        name: "p",
        enabled: true,
        groupPattern: "orders$",
        groupIgnoreCase: false,
        rules: [
          {
            id: "r",
            enabled: true,
            scope: "structured",
            path: "/level",
            pattern: "ERROR",
            ignoreCase: false,
            target: "row",
            colors: { background: "#aa0000" },
            separateThemeColors: false,
          },
        ],
      },
    ];
    expect(
      workspaceSchema.parse(workspace).preferences.highlightProfiles,
    ).toEqual(workspace.preferences.highlightProfiles);
    workspace.preferences.highlightProfiles[0].rules[0].colors.background =
      "url(secret)";
    expect(workspaceSchema.safeParse(workspace).success).toBe(false);
  });
  it("preserves the selected tab layout through workspace validation", () => {
    const workspace = createWorkspace();
    workspace.preferences.tabBarLayout = "wrap";
    expect(workspaceSchema.parse(workspace).preferences.tabBarLayout).toBe(
      "wrap",
    );
  });
  it("cannot enable AWS in development regardless of requested state", () => {
    const gate = new AwsAccessGate(false);
    expect(() => gate.setEnabled(true)).toThrow(/packaged/);
    expect(gate.enabled).toBe(false);
  });
  it("starts every packaged process with AWS disabled", () => {
    const gate = new AwsAccessGate(true);
    expect(gate.enabled).toBe(false);
    gate.setEnabled(true);
    expect(gate.enabled).toBe(true);
    gate.setEnabled(false);
    expect(gate.enabled).toBe(false);
  });
  it("strips credential-shaped fields from connections", () => {
    const c = connectionSchema.parse({
      id: "a",
      name: "A",
      profile: "default",
      region: "eu-west-1",
      mode: "offline",
      secretAccessKey: "never-store",
    });
    expect(c).not.toHaveProperty("secretAccessKey");
  });
  it("rejects invalid time ranges and unbounded queries", () => {
    const request = {
      requestId: "q",
      connection: {
        id: "a",
        name: "A",
        profile: "default",
        region: "eu-west-1",
        mode: "offline",
      },
      sources: [{ logGroup: "/logs" }],
      startTime: 2,
      endTime: 1,
      kind: "events",
      filterPattern: "",
      query: "",
      limit: 10000,
    };
    expect(querySchema.safeParse(request).success).toBe(false);
    expect(
      querySchema.safeParse({ ...request, endTime: 3, limit: 10001 }).success,
    ).toBe(false);
    expect(querySchema.parse({ ...request, endTime: 3, direction: "older", gcpLocalFilter: { kind: "plain", value: "ERROR" } })).toMatchObject({ direction: "older", gcpLocalFilter: { kind: "plain", value: "ERROR" } });
    expect(querySchema.safeParse({ ...request, endTime: 3, direction: "newer" }).success).toBe(false);
  });
  it("rejects unsupported workspace versions before writing", () => {
    expect(workspaceSchema.safeParse({ version: 99 }).success).toBe(false);
  });
});
