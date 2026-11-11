import { describe, expect, it } from "vitest";
import { normalizeGcpRpcEntry } from "../src/main/gcp-live";
import { normalizeGcpEntry } from "../src/main/gcp-log-query";
import { Root } from "protobufjs";
import descriptor from "../src/main/gcp-audit-proto.json";

describe("Google live stream normalization", () => {
  it("preserves nanosecond identity and structured payload from gRPC", () => {
    const timestamp = "2026-11-11T10:00:00.123456789Z";
    const base = { insertId: "x", logName: "projects/p/logs/out", resource: { type: "cloud_function", labels: { function_name: "hello" } }, severity: "ERROR" as const };
    const rpc = { ...base, timestamp: { seconds: String(Date.parse(timestamp) / 1000 | 0), nanos: 123456789 }, payload: "jsonPayload", jsonPayload: { fields: { message: { stringValue: "hello", kind: "stringValue" } } } };
    const live = normalizeGcpRpcEntry(rpc, "group");
    const history = normalizeGcpEntry({ ...base, timestamp, jsonPayload: { message: "hello" } }, "group");
    expect(live.id).toBe(history.id);
    expect(JSON.parse(live.message)).toEqual({ message: "hello" });
    expect(live.severity).toBe("ERROR");
  });
  it("decodes streamed audit protobuf payloads into structured fields", () => {
    const audit = Root.fromJSON(descriptor).lookupType("google.cloud.audit.AuditLog");
    const value = audit.encode(audit.fromObject({ methodName: "UpdateFunction", authenticationInfo: { principalEmail: "person@example.com" } })).finish();
    const event = normalizeGcpRpcEntry({ timestamp: { seconds: 1, nanos: 0 }, protoPayload: { type_url: "type.googleapis.com/google.cloud.audit.AuditLog", value }, payload: "protoPayload" } as never, "group");
    expect(JSON.parse(event.message)).toMatchObject({ "@type": "type.googleapis.com/google.cloud.audit.AuditLog", methodName: "UpdateFunction", authenticationInfo: { principalEmail: "person@example.com" } });
  });
});
