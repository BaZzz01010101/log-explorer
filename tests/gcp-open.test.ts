import { describe, expect, it } from "vitest";
import { gcpResourceToLogSource } from "../src/renderer/gcp-open";
import { tabTitle } from "../src/shared/source-labels";

describe("opening Google Cloud sources", () => {
  it("preserves exact identity and gives the tab the container name", () => {
    const source = gcpResourceToLogSource({ name: "id", label: "/gcp/kubernetes/worker/dev", kind: "kubernetes", project: "demo-123", region: "europe-west2", cluster: "dev", namespace: "default", container: "worker" });
    expect(source.gcp).toMatchObject({ cluster: "dev", namespace: "default", container: "worker" });
    expect(tabTitle([source])).toContain("worker");
  });
});
