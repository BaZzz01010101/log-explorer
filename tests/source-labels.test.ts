import { expect, it } from "vitest";
import {
  sourceBadges,
  shortStreamId,
  removeSource,
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
