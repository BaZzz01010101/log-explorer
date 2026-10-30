import { expect, it } from "vitest";
import { createWorkspace, restoreWorkspace } from "../src/renderer/workspace";
import { matchesLocalFilter, parseLogMessage } from "../src/shared/log-data";
import { evaluateFilterEvidence } from "../src/shared/filter-evidence";
import type { LogEvent } from "../src/shared/contracts";

it("restores legacy Insights tabs, closed tabs and favorite views as Events without changing their source or filters", () => {
  const state = createWorkspace();
  const tab = state.tabs[0];
  Object.assign(tab, {
    kind: "insights",
    query: "fields @message",
    filterPattern: "preserved",
    customTitle: "My view",
  });
  state.closedTabs = [{ ...structuredClone(tab), id: "closed" }];
  state.favorites = [
    {
      id: "saved",
      title: "Saved view",
      tabs: [structuredClone(tab)],
      connections: structuredClone(state.connections),
      timezone: "utc",
    },
  ];
  const result = restoreWorkspace(state);
  for (const restored of [
    result.tabs[0],
    result.closedTabs[0],
    result.favorites[0].tabs[0],
  ]) {
    expect(restored.kind).toBe("events");
    expect(restored.filterPattern).toBe("preserved");
    expect(restored.sources).toEqual(tab.sources);
    expect(restored.view).toEqual(tab.view);
    expect(restored.customTitle).toBe("My view");
  }
});

it("local literals search message content, not a Lambda stream containing $LATEST", () => {
  const event: LogEvent = {
    id: "e",
    timestamp: 0,
    logGroup: "/aws/lambda/app",
    logStream: "2026/10/29/[$LATEST]worker",
    message: "Processing request",
  };
  expect(
    matchesLocalFilter(event, parseLogMessage(event.message), "$latest", "all"),
  ).toBe(false);
  expect(
    evaluateFilterEvidence(
      event,
      parseLogMessage(event.message),
      "$latest",
      "local",
    ).matched,
  ).toBe(false);
  for (const message of [
    "START RequestId: test Version: $LATEST",
    '{"message":"Using $latest"}',
  ]) {
    const matching = { ...event, message };
    expect(
      matchesLocalFilter(matching, parseLogMessage(message), "$latest", "all"),
    ).toBe(true);
    expect(
      evaluateFilterEvidence(
        matching,
        parseLogMessage(message),
        "$latest",
        "local",
      ).matched,
    ).toBe(true);
  }
  expect(
    matchesLocalFilter(
      { ...event, logGroup: "/app/$latest" },
      parseLogMessage(event.message),
      "$latest",
      "all",
    ),
  ).toBe(false);
});
