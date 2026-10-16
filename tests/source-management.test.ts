import { expect, it } from "vitest";
import {
  decodeResourceDrop,
  mergeSources,
  RESOURCE_MIME,
} from "../src/renderer/source-management";

it("merges stream selections and suppresses duplicate source drops", () => {
  expect(
    mergeSources(
      [{ logGroup: "a", logStreams: ["one"] }],
      [{ logGroup: "a", logStreams: ["two", "one"] }],
    ),
  ).toEqual([{ logGroup: "a", logStreams: ["one", "two"] }]);
  expect(
    mergeSources([{ logGroup: "a" }], [{ logGroup: "a", logStreams: ["two"] }]),
  ).toEqual([{ logGroup: "a" }]);
  expect(
    mergeSources(
      [{ logGroup: "a", logStreams: ["one"] }],
      [{ logGroup: "a" }, { logGroup: "b" }],
    ),
  ).toEqual([{ logGroup: "a" }, { logGroup: "b" }]);
});
it("validates drag payloads and refuses limits without truncating sources", () => {
  expect(RESOURCE_MIME).toContain("application/");
  expect(
    decodeResourceDrop('{"connectionId":"c","sources":[{"logGroup":"a"}]}'),
  ).toEqual({ connectionId: "c", sources: [{ logGroup: "a" }] });
  expect(
    decodeResourceDrop('{"connectionId":"c","sources":[{"logGroup":""}]}'),
  ).toBeNull();
  expect(decodeResourceDrop("other content")).toBeNull();
  expect(() =>
    mergeSources(
      Array.from({ length: 50 }, (_, n) => ({ logGroup: String(n) })),
      [{ logGroup: "extra" }],
    ),
  ).toThrow(/50/);
});
