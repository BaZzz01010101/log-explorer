import { expect, it } from "vitest";
import {
  compileServerFilter,
  filterCompletions,
  filterTokens,
  serverFilterMode,
} from "../src/shared/server-filter";
import { createWorkspace, restoreWorkspace } from "../src/renderer/workspace";
import {
  requestMatchesTab,
  resolveTimeRange,
} from "../src/renderer/query-state";

it.each([
  '"mediaId"',
  'line \\ "quoted"',
  "with spaces",
  '{ "id": 1 }',
  "100% done",
  "ordinary (text).*",
])("quotes literal text without changing its content: %s", (value) => {
  expect(compileServerFilter(value, "plain")).toBe(JSON.stringify(value));
  expect(JSON.parse(compileServerFilter(value, "plain"))).toBe(value);
  expect(serverFilterMode(value, "auto")).toBe("plain");
});
it.each([
  '{ $.level = "ERROR" }',
  "{ $.field NOT EXISTS }",
  "{ ($.user.id = 2) || $.actions[2] = GET }",
  "%error|failed%",
  "[ip, status = 5*]",
  "[..., request = *.html*, status_code = 4*, bytes]",
  "[w1]",
  "?ERROR ?WARN",
])("recognizes explicit AWS syntax and preserves it: %s", (value) => {
  expect(serverFilterMode(value, "auto")).toBe("pattern");
  expect(compileServerFilter(value, "auto")).toBe(value);
  expect(compileServerFilter(value, "pattern")).toBe(value);
  expect(compileServerFilter(value, "plain")).toBe(JSON.stringify(value));
});
it("keeps an empty filter clear and legacy drafts as AWS patterns", () => {
  for (const mode of ["plain", "pattern", "auto"] as const)
    expect(compileServerFilter("  ", mode)).toBe("");
  expect(compileServerFilter("ERROR WARN")).toBe("ERROR WARN");
});
it("colors syntax without changing text and completes keywords outside literals", () => {
  const value =
    "{ $.message = %error|failed% && $.absent NOT EXISTS || $.nil IS NULL }";
  const tokens = filterTokens(value);
  expect(tokens.map((token) => token.text).join("")).toBe(value);
  expect(
    tokens
      .filter((token) => token.kind === "keyword")
      .map((token) => token.text),
  ).toEqual(["NOT EXISTS", "IS NULL"]);
  expect(tokens.some((token) => token.kind === "regex")).toBe(true);
  const partial = "{ $.absent NOT EX";
  expect(
    filterCompletions(partial, partial.length).map((item) => item.value),
  ).toEqual(["NOT EXISTS"]);
  for (const literal of [
    '{ $.m = "NOT',
    "{ $.m = %NOT",
    '{ $.m = "quoted \\"NOT',
  ])
    expect(filterCompletions(literal, literal.length)).toEqual([]);
});
it("preserves new modes on restart and compares compiled request patterns", () => {
  const workspace = createWorkspace(),
    tab = workspace.tabs[0];
  expect(tab.filterMode).toBe("auto");
  tab.filterMode = "plain";
  tab.filterPattern = '"mediaId"';
  workspace.savedQueries = [
    {
      id: "plain",
      name: "Literal",
      kind: "events",
      text: tab.filterPattern,
      filterMode: "plain",
    },
  ];
  const restored = restoreWorkspace(workspace);
  expect(restored.tabs[0].filterMode).toBe("plain");
  expect(restored.savedQueries[0].filterMode).toBe("plain");
  const request = {
    requestId: "compiled",
    connection: workspace.connections[0],
    sources: tab.sources,
    kind: tab.kind,
    filterPattern: compileServerFilter(tab.filterPattern, tab.filterMode),
    query: "",
    limit: 100,
    ...resolveTimeRange(tab.timePreset),
  };
  expect(requestMatchesTab(request, tab, workspace.connections[0])).toBe(true);
  expect(
    requestMatchesTab(
      request,
      { ...tab, filterMode: "pattern" },
      workspace.connections[0],
    ),
  ).toBe(false);
  const legacy = { ...workspace, tabs: [{ ...tab, filterMode: undefined }] };
  expect(restoreWorkspace(legacy).tabs[0].filterMode).toBe("pattern");
});
