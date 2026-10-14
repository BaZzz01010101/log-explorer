import { describe, expect, it } from "vitest";
import {
  connectionSchema,
  querySchema,
  workspaceSchema,
  AwsAccessGate,
} from "../src/main/security";

describe("desktop trust boundary", () => {
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
  });
  it("rejects unsupported workspace versions before writing", () => {
    expect(workspaceSchema.safeParse({ version: 99 }).success).toBe(false);
  });
});
