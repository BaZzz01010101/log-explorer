import { expect, it } from "vitest";
import type { LogEvent, LogSource } from "../src/shared/contracts";
import {
  hiddenSourcePredicate,
  pruneHiddenSources,
  sourceBadgeKey,
} from "../src/shared/source-labels";

const sources: LogSource[] = [
  { logGroup: "/app/orders" },
  { logGroup: "/app/billing", logStreams: ["a", "b"] },
  { logGroup: "/app/orders", connectionId: "west" },
];
const event = (
  logGroup: string,
  logStream = "s",
  connectionId?: string,
): LogEvent => ({
  id: `${connectionId ?? ""}${logGroup}${logStream}`,
  timestamp: 1,
  message: "m",
  logGroup,
  logStream,
  ...(connectionId ? { connectionId } : {}),
});

it("hides only the events of hidden badges, by group, stream and connection", () => {
  expect(hiddenSourcePredicate(sources, [], "main")).toBeUndefined();
  expect(hiddenSourcePredicate(sources, ["stale"], "main")).toBeUndefined();
  const hidden = hiddenSourcePredicate(
    sources,
    [
      sourceBadgeKey(sources[0]!, undefined, "main"),
      sourceBadgeKey(sources[1]!, "b", "main"),
    ],
    "main",
  )!;
  expect(hidden(event("/app/orders"))).toBe(true);
  expect(hidden(event("/app/orders", "s", "west"))).toBe(false);
  expect(hidden(event("/app/billing", "a"))).toBe(false);
  expect(hidden(event("/app/billing", "b"))).toBe(true);
});

it("keys a source the same with or without the default connection id", () => {
  expect(
    sourceBadgeKey({ logGroup: "/x", connectionId: "main" }, undefined, "main"),
  ).toBe(sourceBadgeKey({ logGroup: "/x" }, undefined, "main"));
});

it("drops hidden keys of removed badges", () => {
  const keys = [
    sourceBadgeKey(sources[1]!, "a", "main"),
    sourceBadgeKey(sources[0]!, undefined, "main"),
  ];
  expect(pruneHiddenSources([sources[0]!], keys, "main")).toEqual([keys[1]]);
});
