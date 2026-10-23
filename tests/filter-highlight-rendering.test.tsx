import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, expect, it, vi } from "vitest";
import {
  HighlightText,
  JsonTree,
} from "../src/renderer/components/EventMessage";
import { EventHighlightContext } from "../src/renderer/useEventHighlights";
import { createWorkspace, restoreWorkspace } from "../src/renderer/workspace";

let renderer: ReactTestRenderer | undefined;
afterEach(async () => {
  await act(async () => renderer?.unmount());
  renderer = undefined;
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});
const evidence = {
  row: {},
  text: {},
  matchKey: "query-one",
  paths: { "/outer/deep/value": ["local"] },
  filters: {
    server: {
      supported: true,
      matched: true,
      targets: [{ path: "@message", text: "failed", ranges: [[0, 6]] }],
      paths: [],
    },
    local: {
      supported: true,
      matched: true,
      targets: [{ path: "@message", text: "failed", ranges: [[0, 6]] }],
      paths: ["/outer/deep/value"],
    },
  },
};

it("combines distinct server, local and manual text match layers without changing text", () => {
  const markup = renderToStaticMarkup(
    <EventHighlightContext.Provider value={evidence as any}>
      <HighlightText text="failed" needle="ail" />
    </EventHighlightContext.Provider>,
  );
  expect(markup).toContain('data-highlight-origins="server local manual"');
  expect(markup.replace(/<[^>]*>/g, "")).toBe("failed");
});

it("marks a folded branch and opens only matching inspector paths once", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.spyOn(console, "error").mockImplementation(() => {});
  const value = {
    outer: { deep: { value: "needle" }, unrelated: { other: "no" } },
  };
  const render = (autoExpandMatches: boolean) => (
    <EventHighlightContext.Provider value={evidence as any}>
      <JsonTree
        value={value}
        highlight=""
        controls
        {...{ autoExpandMatches }}
      />
    </EventHighlightContext.Provider>
  );
  await act(async () => {
    renderer = create(render(false));
  });
  expect(
    renderer!.root.findAll(
      (node) => node.props.className === "json-match-indicator",
    ),
  ).toHaveLength(1);
  await act(async () => renderer!.update(render(true)));
  expect(
    renderer!.root.findAllByProps({ "data-json-path": "/outer/deep/value" }),
  ).toHaveLength(1);
  expect(
    renderer!.root.findAllByProps({
      "data-json-path": "/outer/unrelated/other",
    }),
  ).toHaveLength(0);
  const collapse = renderer!.root.findByProps({
    "aria-label": "Collapse /outer",
  });
  await act(async () => collapse.props.onClick());
  await act(async () => renderer!.update(render(true)));
  expect(
    renderer!.root.findAllByProps({ "data-json-path": "/outer/deep/value" }),
  ).toHaveLength(0);
});

it("defaults automatic match expansion on and removes only the stock fixture columns", () => {
  const workspace = createWorkspace();
  expect((workspace.preferences as any).autoExpandFilterMatches).toBe(true);
  workspace.preferences.autoExpandFilterMatches = false;
  expect(
    restoreWorkspace(JSON.parse(JSON.stringify(workspace))).preferences
      .autoExpandFilterMatches,
  ).toBe(false);
  expect(workspace.tabs[0].view.columns.map((column) => column.path)).toEqual([
    "@timestamp",
    "@level",
    "@message",
  ]);
  workspace.tabs[0].view.columns = [
    { path: "@timestamp", width: 194, pinned: true },
    { path: "@level", width: 84 },
    { path: "/service/name", width: 150 },
    { path: "@message", width: 420 },
    { path: "/request/id", width: 220 },
  ];
  expect(
    restoreWorkspace(workspace).tabs[0].view.columns.map(
      (column) => column.path,
    ),
  ).toEqual(["@timestamp", "@level", "@message"]);
  workspace.tabs[0].view.columns = [{ path: "/request/id", width: 240 }];
  expect(restoreWorkspace(workspace).tabs[0].view.columns[0].path).toBe(
    "/request/id",
  );
});
