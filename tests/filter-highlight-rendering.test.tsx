import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { Activity } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, expect, it, vi } from "vitest";
import {
  HighlightText,
  JsonTree,
} from "../src/renderer/components/EventMessage";
import { EventHighlightContext } from "../src/renderer/useEventHighlights";
import { createWorkspace, restoreWorkspace } from "../src/renderer/workspace";
import type { EventHighlights } from "../src/renderer/highlight-engine";

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

it("preserves a manually folded match after Activity reveal and expands newly matched paths", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.spyOn(console, "error").mockImplementation(() => {});
  const value = {
    outer: { deep: { value: "needle" } },
    other: { nested: { value: "new needle" } },
  };
  const content = (
    mode: "visible" | "hidden",
    paths: EventHighlights["paths"] = { "/outer/deep/value": ["local"] },
    matchKey = "query-one",
  ) => (
    <Activity mode={mode}>
      <EventHighlightContext.Provider
        value={{ row: {}, text: {}, paths, matchKey }}
      >
        <JsonTree value={value} highlight="" autoExpandMatches />
      </EventHighlightContext.Provider>
    </Activity>
  );
  const rowsAt = (path: string) =>
    renderer!.root.findAllByProps({ "data-json-path": path });
  await act(async () => {
    renderer = create(content("visible"));
  });
  expect(rowsAt("/outer/deep/value")).toHaveLength(1);
  await act(async () =>
    renderer!.root
      .findByProps({ "aria-label": "Collapse /outer" })
      .props.onClick(),
  );
  await act(async () => renderer!.update(content("hidden")));
  await act(async () => renderer!.update(content("visible")));
  expect(rowsAt("/outer/deep/value")).toHaveLength(0);
  expect(
    renderer!.root.findAllByProps({ "aria-label": "Expand /outer" }),
  ).toHaveLength(1);
  await act(async () =>
    renderer!.update(
      content(
        "visible",
        { "/outer/deep/value": ["server"] },
        "query-recomputed",
      ),
    ),
  );
  expect(rowsAt("/outer/deep/value")).toHaveLength(0);
  await act(async () =>
    renderer!.update(
      content("hidden", { "/other/nested/value": ["local"] }, "query-two"),
    ),
  );
  await act(async () =>
    renderer!.update(
      content("visible", { "/other/nested/value": ["local"] }, "query-two"),
    ),
  );
  expect(rowsAt("/other/nested/value")).toHaveLength(1);
  expect(rowsAt("/outer/deep/value")).toHaveLength(0);
});

it("expands current match paths again when automatic expansion is reenabled", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.spyOn(console, "error").mockImplementation(() => {});
  const value = { outer: { deep: { value: "needle" } } };
  const content = (enabled: boolean) => (
    <EventHighlightContext.Provider
      value={{ row: {}, text: {}, paths: { "/outer/deep/value": ["local"] } }}
    >
      <JsonTree value={value} highlight="" autoExpandMatches={enabled} />
    </EventHighlightContext.Provider>
  );
  await act(async () => {
    renderer = create(content(true));
  });
  await act(async () =>
    renderer!.root
      .findByProps({ "aria-label": "Collapse /outer" })
      .props.onClick(),
  );
  await act(async () => renderer!.update(content(false)));
  expect(
    renderer!.root.findAllByProps({ "data-json-path": "/outer/deep/value" }),
  ).toHaveLength(0);
  await act(async () => renderer!.update(content(true)));
  expect(
    renderer!.root.findAllByProps({ "data-json-path": "/outer/deep/value" }),
  ).toHaveLength(1);
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
