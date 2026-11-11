import { describe, expect, it } from "vitest";
import { gcpSourceFilter, normalizeGcpEntry } from "../src/main/gcp-log-query";
import { inferLevel, parseLogMessage } from "../src/shared/log-data";

describe("Google Cloud log source queries", () => {
  it("selects a first generation function by project, region and name", () => {
    const filter = gcpSourceFilter({ kind: "function", project: "demo-123", region: "europe-west2", functionName: "orders", generation: "v1" });
    expect(filter).toContain('resource.labels.function_name="orders"');
    expect(filter).toContain('resource.labels.project_id="demo-123"');
  });
  it("does not compare a numeric project number with the resource project ID", () => {
    expect(gcpSourceFilter({ kind: "function", project: "12345", region: "europe-west2", functionName: "orders", generation: "v1" })).not.toContain("resource.labels.project_id");
  });
  it("selects the actual Cloud Run service for a second generation function", () => {
    const filter = gcpSourceFilter({ kind: "function", project: "demo-123", region: "europe-west2", functionName: "orders", generation: "v2", service: "orders-service" });
    expect(filter).toContain('resource.type="cloud_run_revision"');
    expect(filter).toContain('resource.labels.service_name="orders-service"');
  });
  it("selects a Kubernetes container with cluster, location and namespace", () => {
    const filter = gcpSourceFilter({ kind: "kubernetes", project: "demo-123", region: "europe-west2", cluster: "dev", namespace: "default", container: "worker" });
    expect(filter).toContain('resource.labels.namespace_name="default"');
    expect(filter).toContain('resource.labels.container_name="worker"');
    expect(filter).toContain('resource.labels.cluster_name="dev"');
    expect(filter).toContain('resource.labels.location="europe-west2"');
  });
  it("preserves structured payload, severity and unique Google identity", () => {
    const entry = { insertId: "id", timestamp: "2026-11-11T10:00:00.123456789Z", receiveTimestamp: "2026-11-11T10:00:01Z", logName: "projects/demo-123/logs/stdout", severity: "ERROR", jsonPayload: { message: "failure", user: { id: 2 } }, resource: { labels: { pod_name: "worker-123" } } };
    const event = normalizeGcpEntry(entry, "/gcp/kubernetes/worker/dev");
    expect(JSON.parse(event.message)).toEqual(entry.jsonPayload);
    expect(event.severity).toBe("ERROR");
    expect(inferLevel(parseLogMessage(event.message), event.message, event.severity)).toBe("error");
    expect(event.logStream).toBe("worker-123");
    expect(normalizeGcpEntry({ ...entry, timestamp: "2026-11-11T10:00:00.123456790Z" }, event.logGroup).id).not.toBe(event.id);
  });
  it("keeps an event identity stable when resource labels arrive in a different order", () => {
    const entry = { insertId: "id", timestamp: "2026-11-11T10:00:00Z", logName: "projects/p/logs/l", textPayload: "hello", resource: { type: "k8s_container", labels: { cluster_name: "one", container_name: "two" } } };
    const reordered = { ...entry, resource: { type: "k8s_container", labels: { container_name: "two", cluster_name: "one" } } };
    expect(normalizeGcpEntry(entry, "group").id).toBe(normalizeGcpEntry(reordered, "group").id);
  });
});
