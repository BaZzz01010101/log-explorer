import { describe, expect, it } from "vitest";
import { decodeResourceDrop, mergeSources } from "../src/renderer/source-management";
import { eventSourceDisplay } from "../src/shared/source-labels";
import { createMultiSourceEvents } from "../src/main/multi-source-events";

describe("mixed Google Cloud sources", () => {
  it("preserves separate namespaces with the same container label", () => {
    const base = { logGroup: "/gcp/kubernetes/worker/dev", gcp: { kind: "kubernetes" as const, project: "demo-123", region: "europe-west2", cluster: "dev", namespace: "one", container: "worker" } };
    const other = { ...base, gcp: { ...base.gcp, namespace: "two" } };
    const payload = decodeResourceDrop(JSON.stringify({ connectionId: "gcp", sources: [base, other] }));
    expect(payload?.sources).toEqual([base, other]);
    expect(mergeSources([], payload!.sources)).toHaveLength(2);
    const event = { id: "1", timestamp: 1, message: "x", logGroup: base.logGroup, logStream: "pod", gcpSource: other.gcp };
    const display = eventSourceDisplay(event, [base, other], [{ id: "gcp", mode: "gcp", name: "Google", profile: "work", region: "europe-west2" }], "gcp");
    expect(display.detail).toContain("two");
  });
  it("merges AWS and GCP logs in timestamp order", async () => {
    const aws = { id: "aws", mode: "aws" as const, name: "AWS", profile: "default", region: "eu-west-1" };
    const google = { id: "gcp", mode: "gcp" as const, name: "Google", profile: "work", region: "europe-west2", gcpIdentity: { configuration: "work", account: "user@example.com" } };
    const sources = [{ logGroup: "/aws/lambda/example" }, { connectionId: "gcp", logGroup: "/gcp/functions/example", gcp: { kind: "function" as const, project: "demo-123", region: "europe-west2", generation: "v1" as const, functionName: "example" } }];
    const merger = createMultiSourceEvents((connection) => ({
      events: async (request) => ({ requestId: request.requestId, state: "complete", events: [{ id: connection.id, timestamp: connection.id === "aws" ? 200 : 100, message: connection.id, logGroup: request.sources[0].logGroup, logStream: "stream" }] }),
      live: async () => {}, listGroups: async () => { throw new Error("not used"); }, listStreams: async () => { throw new Error("not used"); }, destroy: () => {},
    }));
    const result = await merger.events({ requestId: "mixed", connection: aws, connections: [google], sources, startTime: 1, endTime: 1000, kind: "events", filterPattern: "", query: "", limit: 10 }, new AbortController().signal);
    expect(result.events?.map((event) => event.connectionId)).toEqual(["gcp", "aws"]);
  });
});
