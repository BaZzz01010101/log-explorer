import { expect, it, vi } from "vitest";
import type { LogEvent } from "../src/shared/contracts";
import { matchesLocalFilter, parseLogMessage } from "../src/shared/log-data";
import { evaluateFilterEvidence } from "../src/shared/filter-evidence";
import { createWorkspace, restoreWorkspace } from "../src/renderer/workspace";
import { workspaceSchema } from "../src/main/security";

const event: LogEvent = {
  id: "hidden-event-id",
  timestamp: 123456789,
  ingestionTime: 987654321,
  connectionId: "hidden-profile-region",
  logGroup: "/hidden-group",
  logStream: "2026/10/30/[$LATEST]Worker-Alpha42",
  message: '{"message":"Request FAILED","Status":"Case Value"}',
};
const parsed = parseLogMessage(event.message);

it("finishes Unicode zero-width regex evidence without re-entering a surrogate pair", () => {
  const item = { ...event, message: "😀", logStream: "id" };
  const original = RegExp.prototype.exec;
  let calls = 0;
  const bounded = vi
    .spyOn(RegExp.prototype, "exec")
    .mockImplementation(function (this: RegExp, text: string) {
      if (this.source === "(?=.)" && this.unicode && ++calls > 32)
        throw new Error("Zero-width regex did not advance");
      return original.call(this, text);
    });
  try {
    expect(
      evaluateFilterEvidence(
        item,
        parseLogMessage(item.message),
        "(?=.)",
        "local",
        { regex: true },
      ),
    ).toEqual({ supported: true, matched: true, matches: [], paths: [] });
  } finally {
    bounded.mockRestore();
  }
});

it("matches message terms and complete stream IDs without searching Lambda prefixes or hidden metadata", () => {
  for (const query of [
    "failed",
    "alpha42",
    "FAILED Worker",
    '"Request FAILED"',
  ])
    expect(matchesLocalFilter(event, parsed, query, "all")).toBe(true);
  for (const query of [
    "2026/10/30",
    "$LATEST",
    "hidden-group",
    "hidden-event-id",
    "hidden-profile-region",
    "123456789",
    "987654321",
  ])
    expect(matchesLocalFilter(event, parsed, query, "all")).toBe(false);
  expect(
    matchesLocalFilter(
      { ...event, logStream: "2026/10/30/[17]version-Id" },
      parsed,
      "version-id",
      "all",
    ),
  ).toBe(true);
  for (const logStream of [
    "ecs/service/opaque-id",
    "2026/10/30/opaque-id",
    "2026/10/30/[$LATEST]/opaque-id",
    "2026/10/30/[17]opaque-id",
    "ecs/service/opaque-id/",
  ]) {
    const item = { ...event, logStream };
    expect(matchesLocalFilter(item, parsed, "opaque-id", "all")).toBe(true);
    for (const query of ["ecs", "service", "2026", "$LATEST", "[17]"])
      expect(matchesLocalFilter(item, parsed, query, "all")).toBe(false);
  }
  const content = {
    ...event,
    message:
      "Recorded 2026/10/30 $LATEST hidden-group hidden-event-id 123456789",
  };
  expect(
    matchesLocalFilter(
      content,
      parseLogMessage(content.message),
      "2026/10/30 $LATEST hidden-group hidden-event-id 123456789",
      "all",
    ),
  ).toBe(true);
});

it("preserves property syntax and applies the case option to literal and property values", () => {
  expect(
    matchesLocalFilter(event, parsed, 'failed @/Status="case value"', "all"),
  ).toBe(true);
  expect(
    matchesLocalFilter(event, parsed, 'failed @/Status="Case Value"', "all", {
      caseSensitive: true,
    }),
  ).toBe(false);
  expect(
    matchesLocalFilter(event, parsed, 'FAILED @/Status="case value"', "all", {
      caseSensitive: true,
    }),
  ).toBe(false);
  expect(
    matchesLocalFilter(event, parsed, 'FAILED @/Status="Case Value"', "all", {
      caseSensitive: true,
    }),
  ).toBe(true);
  expect(matchesLocalFilter(event, parsed, "@/status", "all")).toBe(false);
  expect(
    matchesLocalFilter(event, parsed, "worker", "all", { caseSensitive: true }),
  ).toBe(false);
});

it("uses the whole regex against message and stream ID separately with matching case and level options", () => {
  expect(
    matchesLocalFilter(event, parsed, "request.*failed", "all", {
      regex: true,
    }),
  ).toBe(true);
  expect(
    matchesLocalFilter(event, parsed, "request.*failed", "all", {
      regex: true,
      caseSensitive: true,
    }),
  ).toBe(false);
  expect(
    matchesLocalFilter(event, parsed, "^Worker-Alpha\\d+$", "all", {
      regex: true,
      caseSensitive: true,
    }),
  ).toBe(true);
  expect(
    matchesLocalFilter(event, parsed, "2026|LATEST|hidden-group", "all", {
      regex: true,
    }),
  ).toBe(false);
  expect(
    matchesLocalFilter(event, parsed, "FAILED.*Worker", "all", { regex: true }),
  ).toBe(false);
  expect(
    matchesLocalFilter(event, parsed, "request", ["error"], { regex: true }),
  ).toBe(false);
  expect(matchesLocalFilter(event, parsed, "[", "all", { regex: true })).toBe(
    false,
  );
});

it("uses identical local filter options for evidence and marks only stream ID ranges", () => {
  const options = { regex: true, caseSensitive: true };
  const query = "^Worker-Alpha\\d+$";
  const evidence = evaluateFilterEvidence(
    event,
    parsed,
    query,
    "local",
    options,
  );
  expect(evidence).toMatchObject({ supported: true, matched: true, paths: [] });
  expect(evidence.matches).toEqual([
    {
      path: "@logStream",
      text: event.logStream,
      start: event.logStream.indexOf("Worker"),
      end: event.logStream.length,
    },
  ]);
  for (const [query, options] of [
    ["failed", { caseSensitive: true }],
    ["2026|LATEST", { regex: true }],
    ["[", { regex: true }],
  ] as const) {
    expect(
      evaluateFilterEvidence(event, parsed, query, "local", options).matched,
    ).toBe(matchesLocalFilter(event, parsed, query, "all", options));
    expect(
      evaluateFilterEvidence(event, parsed, query, "local", options).matches,
    ).toEqual([]);
  }
});

it("maps case-sensitive and regex message evidence to the actual structured field", () => {
  const result = evaluateFilterEvidence(
    event,
    parsed,
    "Request.*FAILED",
    "local",
    { regex: true, caseSensitive: true },
  );
  expect(result.matched).toBe(true);
  expect(result.paths).toEqual(["/message"]);
  expect(
    result.matches
      .filter((match) => match.path === "/message")
      .map((match) => match.text.slice(match.start, match.end)),
  ).toEqual(["Request FAILED"]);
});

it("round trips local filter options and adds context-specific shortcut defaults without replacing custom bindings", () => {
  const workspace = createWorkspace();
  workspace.tabs[0].view.localSearchRegex = true;
  workspace.tabs[0].view.localSearchCaseSensitive = true;
  const stored = workspaceSchema.parse(workspace);
  expect(restoreWorkspace(stored).tabs[0].view).toMatchObject({
    localSearchRegex: true,
    localSearchCaseSensitive: true,
  });
  expect(
    restoreWorkspace({
      ...workspace,
      preferences: {
        ...workspace.preferences,
        shortcuts: {
          localFilterRegex: "Alt+R",
          highlightCaseSensitive: "Alt+H",
        },
      },
    }).preferences.shortcuts,
  ).toMatchObject({
    localFilterRegex: "Alt+R",
    localFilterCaseSensitive: "Alt+C",
    highlightRegex: "Alt+E",
    highlightCaseSensitive: "Alt+H",
  });
});
