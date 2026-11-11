import { describe, expect, it, vi } from "vitest";
import { discoverGcpSources } from "../src/renderer/gcp-source-scan";

const identity = { configuration: "work", account: "test@example.com" };
const func = {
  name: "function:demo-123:x:a",
  label: "/gcp/functions/a",
  kind: "function" as const,
  project: "demo-123",
  region: "x",
};
const worker = {
  name: "k:1",
  label: "/gcp/kubernetes/worker/dev",
  kind: "kubernetes" as const,
  project: "demo-123",
  region: "x",
};

describe("GCP source scan", () => {
  it("combines function pages and cluster results while retaining partial failures", async () => {
    const api = {
      gcpFunctions: vi.fn(async (_i, _p, generation, cursor) =>
        generation === "v1"
          ? cursor
            ? { items: [func] }
            : { items: [], cursor: "next" }
          : Promise.reject(new Error("v2 denied")),
      ),
      gcpContexts: vi.fn(async () => [
        { name: "ok", cluster: "dev", location: "x" },
        { name: "bad", cluster: "bad", location: "x" },
      ]),
      gcpClusters: vi.fn(async () => [
        { cluster: "dev", location: "x" },
        { cluster: "bad", location: "x" },
      ]),
      gcpWorkloads: vi.fn(async (_i, _p, context) =>
        context === "ok"
          ? { items: [worker] }
          : Promise.reject(new Error("cluster denied")),
      ),
    };
    const updates = vi.fn();
    const result = await discoverGcpSources(api, identity, "demo-123", updates);
    expect(result.items.map((x) => x.name).sort()).toEqual(
      [func.name, worker.name].sort(),
    );
    expect(result.warnings).toHaveLength(2);
    expect(api.gcpFunctions).toHaveBeenCalledTimes(3);
    expect(updates).toHaveBeenCalled();
  });
  it("warns when a discovered cluster has no configured context", async () => {
    const api = {
      gcpFunctions: vi.fn(async () => ({ items: [] })),
      gcpContexts: vi.fn(async () => []),
      gcpClusters: vi.fn(async () => [{ cluster: "dev", location: "x" }]),
      gcpWorkloads: vi.fn(async () => ({ items: [] })),
    };
    const result = await discoverGcpSources(api, identity, "demo-123", vi.fn());
    expect(result.warnings.join(" ")).toContain("dev");
    expect(result.warnings.join(" ")).toContain("context");
  });
});
