import { describe, expect, it, vi } from "vitest";
import { createSourceDiscovery } from "../src/main/gcp-sources";

const identity = { configuration: "work", account: "a@example.com" };

describe("GCP source discovery", () => {
  it("lists function pages across regions and preserves location and cursor", async () => {
    const request = vi.fn().mockResolvedValue({
      data: {
        functions: [
          {
            name: "projects/demo-123/locations/europe-west2/functions/orders-api",
          },
        ],
        nextPageToken: "next",
        unreachable: ["us-west1"],
      },
    });
    const discovery = createSourceDiscovery(request, vi.fn());
    const page = await discovery.functions("demo-123", "v1", "previous");
    expect(page.items).toMatchObject([
      {
        kind: "function",
        label: "/gcp/functions/orders-api",
        region: "europe-west2",
      },
    ]);
    expect(page.cursor).toBe("next");
    expect(page.warnings).toHaveLength(1);
    expect(request).toHaveBeenCalledWith(
      expect.objectContaining({
        url: "https://cloudfunctions.googleapis.com/v1/projects/demo-123/locations/-/functions",
        params: { pageSize: 100, pageToken: "previous" },
      }),
    );
  });

  it("accepts only existing contexts belonging to the selected project", async () => {
    const run = vi
      .fn()
      .mockResolvedValue(
        "gke_demo-123_europe-west2_test\ngke_other-123_us-west1_prod\n",
      );
    const discovery = createSourceDiscovery(vi.fn(), run);
    expect(await discovery.contexts("demo-123", identity)).toEqual([
      {
        name: "gke_demo-123_europe-west2_test",
        location: "europe-west2",
        cluster: "test",
      },
    ]);
    await expect(
      discovery.workloads("demo-123", "gke_other-123_us-west1_prod", identity),
    ).rejects.toThrow();
  });

  it("lists GKE clusters across regions so missing contexts can be reported", async () => {
    const request = vi
      .fn()
      .mockResolvedValue({
        data: { clusters: [{ name: "dev", location: "europe-west2" }] },
      });
    const discovery = createSourceDiscovery(request, vi.fn());
    expect(await discovery.clusters("demo-123")).toEqual([
      { cluster: "dev", location: "europe-west2" },
    ]);
    expect(request).toHaveBeenCalledWith(
      expect.objectContaining({
        url: "https://container.googleapis.com/v1/projects/demo-123/locations/-/clusters",
      }),
    );
  });

  it("groups containers by cluster and namespace without assuming a workload name", async () => {
    const run = vi.fn().mockResolvedValue(
      JSON.stringify({
        items: [
          {
            kind: "Deployment",
            metadata: { name: "api", namespace: "default" },
            spec: { template: { spec: { containers: [{ name: "worker" }] } } },
          },
          {
            kind: "Deployment",
            metadata: { name: "api-two", namespace: "other" },
            spec: { template: { spec: { containers: [{ name: "worker" }] } } },
          },
        ],
      }),
    );
    const discovery = createSourceDiscovery(vi.fn(), run);
    const { items } = await discovery.workloads(
      "demo-123",
      "gke_demo-123_europe-west2_dev",
      identity,
    );
    expect(items).toHaveLength(2);
    expect(items[0]).toMatchObject({
      label: "/gcp/kubernetes/worker/dev",
      namespace: "default",
      cluster: "dev",
      region: "europe-west2",
      workloads: ["api"],
    });
    expect(items[0].name).not.toBe(items[1].name);
    expect(run.mock.calls[0][0]).toContain("--chunk-size=100");
    expect(run.mock.calls[0][1]).toEqual(identity);
  });

  it("keeps accessible workload kinds when one kind is forbidden", async () => {
    const run = vi.fn(async (args: string[]) => {
      const kinds = args[3];
      if (kinds.includes(",") || kinds === "pods") throw new Error("forbidden");
      return JSON.stringify({
        items:
          kinds === "deployments"
            ? [
                {
                  kind: "Deployment",
                  metadata: { name: "api", namespace: "default" },
                  spec: {
                    template: { spec: { containers: [{ name: "worker" }] } },
                  },
                },
              ]
            : [],
      });
    });
    const discovery = createSourceDiscovery(vi.fn(), run);
    const result = await discovery.workloads(
      "demo-123",
      "gke_demo-123_europe-west2_dev",
      identity,
    );
    expect(result.items).toHaveLength(1);
    expect(result.warnings?.join(" ")).toContain("pods");
  });
});
