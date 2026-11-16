import { expect, it } from "vitest";
import {
  sourceBadges,
  shortStreamId,
  removeSource,
  tabTitle,
} from "../src/shared/source-labels";

it("shortens common directories without cutting shared basename text", () => {
  expect(
    sourceBadges([
      { logGroup: "/aws/lambda/stream-1-uk" },
      { logGroup: "/aws/lambda/stream-2-uk" },
    ]).map((source) => source.label),
  ).toEqual(["stream-1-uk", "stream-2-uk"]);
  expect(
    sourceBadges([{ logGroup: "/aws/lambda/a" }, { logGroup: "/ecs/b" }]).map(
      (source) => source.label,
    ),
  ).toEqual(["aws/lambda/a", "ecs/b"]);
});
it("uses the stream identifier rather than the date prefix and removes one stream precisely", () => {
  expect(shortStreamId("2026/10/16/[$LATEST]abcdef123456")).toBe("abcdef");
  const sources = [
    {
      connectionId: "east",
      logGroup: "/aws/lambda/worker",
      logStreams: ["abcdef123", "ghijkl456"],
    },
  ];
  expect(sourceBadges(sources).map((source) => source.label)).toEqual([
    "worker · abcdef",
    "worker · ghijkl",
  ]);
  expect(removeSource(sources, 0, "abcdef123")).toEqual([
    { ...sources[0], logStreams: ["ghijkl456"] },
  ]);
  expect(
    removeSource(removeSource(sources, 0, "abcdef123"), 0, "ghijkl456"),
  ).toEqual([]);
  expect(removeSource(sources, 0)).toEqual([]);
});

it("names Google Cloud badges after the workload or function, not the shared path", () => {
  const gke = (container: string, cluster: string) => ({
    logGroup: `/gcp/kubernetes/${container}/${cluster}`,
    gcp: { kind: "kubernetes" as const, project: "p", region: "europe-west2", cluster, namespace: "default", container },
  });
  // One source and two clusters of the same workload both kept only the cluster.
  expect(sourceBadges([gke("media-producer", "ap")]).map((b) => b.label)).toEqual(["media-producer · ap"]);
  expect(sourceBadges([gke("media-producer", "ap"), gke("media-producer", "dev")]).map((b) => b.label)).toEqual([
    "media-producer · ap",
    "media-producer · dev",
  ]);
  const fn = { logGroup: "/gcp/functions/orders", gcp: { kind: "function" as const, project: "p", region: "europe-west2", functionName: "orders", generation: "v2" as const } };
  // AWS names still lose their shared directories alongside Google sources.
  expect(sourceBadges([fn, gke("worker", "dev"), { logGroup: "/aws/lambda/a" }, { logGroup: "/aws/lambda/b" }]).map((b) => b.label)).toEqual([
    "orders",
    "worker · dev",
    "a",
    "b",
  ]);
});

it("separates a stream tab title with a plain middle dot", () => {
  expect(tabTitle([{ logGroup: "/aws/lambda/orders", logStreams: ["2026/01/01/[$LATEST]abcdef123"] }])).toBe("orders · abcdef");
});
