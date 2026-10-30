import { createElement, type ReactNode } from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { QueryPane } from "../src/renderer/components/QueryPane";
import { ServerFilterInput } from "../src/renderer/components/ServerFilterInput";
import { createWorkspace } from "../src/renderer/workspace";
import type { SavedQuery } from "../src/shared/contracts";

vi.mock("../src/renderer/components/LogViewer", () => ({
  LogViewer: () => null,
}));
vi.mock("../src/renderer/components/TimeRangePicker", () => ({
  TimeRangePicker: () => null,
}));
vi.mock("../src/renderer/components/SourceBadges", () => ({
  SourceBadges: () => null,
}));
vi.mock("../src/renderer/components/ServerFilterInput", () => ({
  ServerFilterInput: () => null,
}));
vi.mock("@mantine/core", () => {
  const component =
    (name: string) =>
    ({ children, ...props }: Record<string, unknown>) =>
      createElement(
        "div",
        { ...props, "data-control": name },
        children as ReactNode,
      );
  return {
    ...Object.fromEntries(
      [
        "ActionIcon",
        "Alert",
        "Button",
        "Group",
        "Modal",
        "SegmentedControl",
        "Text",
        "Textarea",
        "TextInput",
        "Tooltip",
      ].map((name) => [name, component(name)]),
    ),
    Menu: Object.assign(component("Menu"), {
      ...Object.fromEntries(
        ["Target", "Dropdown", "Label", "Item", "Divider"].map((name) => [
          name,
          component(`Menu${name}`),
        ]),
      ),
      Sub: Object.assign(component("MenuSub"), {
        Target: component("MenuSubTarget"),
        Item: component("MenuSubItem"),
        Dropdown: component("MenuSubDropdown"),
      }),
    }),
  };
});

let renderer: ReactTestRenderer | undefined;
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const original = console.error.bind(console);
  vi.spyOn(console, "error").mockImplementation((...args) => {
    if (!String(args[0]).includes("react-test-renderer is deprecated"))
      original(...args);
  });
});
afterEach(async () => {
  await act(async () => renderer?.unmount());
  renderer = undefined;
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
const control = (type: string, text: string) =>
  renderer!.root.findAll(
    (node) =>
      node.type === "div" &&
      node.props["data-control"] === type &&
      node.children.includes(text),
  )[0];
function setup() {
  const workspace = createWorkspace();
  workspace.savedQueries = [
    {
      id: "legacy-saved",
      name: "Legacy SQL",
      kind: "insights",
      text: "fields @message | limit 10",
    },
    {
      id: "saved",
      name: "Failures",
      kind: "events",
      filterMode: "plain",
      text: "error",
    },
  ];
  workspace.history = Array.from({ length: 20 }, (_, index): SavedQuery[] => [
    {
      id: `legacy-recent-${index}`,
      name: "",
      kind: "insights",
      text: `fields @message | limit ${index + 1}`,
    },
    {
      id: `recent-${index}`,
      name: "",
      kind: "events",
      filterMode: "plain",
      text: `error ${index + 1}`,
    },
  ]).flat();
  workspace.preferences.recentSearchesLimit = 14;
  const tab = {
    ...workspace.tabs[0],
    kind: "events" as const,
    filterMode: "pattern" as const,
    filterPattern: '  { $.status = 500  &&\n  $.level = "error" }  ',
    query: "fields @message | limit 20",
  };
  return {
    workspace,
    tab,
    onPatch: vi.fn(),
    onTimezoneChange: vi.fn(),
    onRun: vi.fn(),
    onCancel: vi.fn(),
    onSaveQuery: vi.fn(),
    onSavePreset: vi.fn(),
    onDeleteQuery: vi.fn(),
    onContext: vi.fn(),
  };
}

it("places saved searches between the editor and Run and offers only search actions", async () => {
  const props = setup();
  await act(async () => {
    renderer = create(<QueryPane {...props} />);
  });
  const editor = renderer!.root.findByProps({
    className: "query-editor",
  });
  const descendants = editor.findAll((node) => typeof node.type === "string");
  const input = descendants.findIndex(
    (node) => node.props.className === "query-input",
  );
  const searches = descendants.findIndex(
    (node) => node.props["aria-label"] === "Saved and recent searches",
  );
  const run = descendants.findIndex(
    (node) => node.props["data-testid"] === "run-query",
  );
  expect(searches).toBeGreaterThan(input);
  expect(run).toBeGreaterThan(searches);
  expect(control("MenuItem", "Save search…")).toBeDefined();
  const labels = renderer!.root
    .findAll(
      (node) =>
        node.type === "div" && node.props["data-control"] === "MenuLabel",
    )
    .flatMap((node) => node.children);
  expect(labels).toEqual(["Saved searches", "Recent searches"]);
  expect(
    renderer!.root.findAll(
      (node) =>
        node.type === "div" &&
        node.props["data-control"] === "MenuItem" &&
        node.props["data-tooltip"] === "error 14",
    ),
  ).toHaveLength(1);
  expect(
    renderer!.root.findAll(
      (node) =>
        node.type === "div" &&
        node.props["data-control"] === "MenuItem" &&
        node.props["data-tooltip"] === "error 15",
    ),
  ).toHaveLength(0);
});

it("suggests a flattened Events filter name and saves the original filter", async () => {
  const props = setup();
  await act(async () => {
    renderer = create(<QueryPane {...props} />);
  });
  await act(async () => control("MenuItem", "Save search…").props.onClick());
  const name = renderer!.root.findByProps({ "data-control": "TextInput" });
  expect(name.props.value).toBe('{ $.status = 500 && $.level = "error" }');
  expect(name.props["data-autofocus"]).toBe(true);
  const select = vi.fn();
  await act(async () => name.props.onFocus({ currentTarget: { select } }));
  expect(select).toHaveBeenCalledOnce();
  await act(async () => control("Button", "Save").props.onClick());
  expect(props.onSaveQuery).toHaveBeenCalledWith(
    expect.objectContaining({
      name: '{ $.status = 500 && $.level = "error" }',
      kind: "events",
      text: props.tab.filterPattern,
      filterMode: "pattern",
    }),
  );
});

it("loads event filter semantics and deletes a saved search without loading it", async () => {
  const props = setup();
  await act(async () => {
    renderer = create(<QueryPane {...props} />);
  });
  await act(async () => control("MenuItem", "Failures").props.onClick());
  expect(props.onPatch).toHaveBeenCalledExactlyOnceWith({
    kind: "events",
    filterPattern: "error",
    filterMode: "plain",
  });
  expect(props.onRun).not.toHaveBeenCalled();
  props.onPatch.mockClear();
  const remove = renderer!.root.findByProps({
    "aria-label": "Delete saved search Failures",
  });
  expect(remove.props.closeMenuOnClick).not.toBe(false);
  await act(async () => remove.props.onClick({ stopPropagation: vi.fn() }));
  expect(props.onDeleteQuery).toHaveBeenCalledExactlyOnceWith("saved");
  expect(props.onPatch).not.toHaveBeenCalled();
});

it("binds Events editing to its own stable tab history", async () => {
  const props = setup();
  await act(async () => {
    renderer = create(<QueryPane {...props} />);
  });
  expect(renderer!.root.findByType(ServerFilterInput).props.historyKey).toBe(
    `events-filter:${props.tab.id}`,
  );
});

it("offers only Events editing and keeps legacy SQL out of saved and recent searches", async () => {
  const props = setup();
  await act(async () => {
    renderer = create(<QueryPane {...props} />);
  });
  expect(
    renderer!.root.findAllByProps({ "aria-label": "Server query type" }),
  ).toHaveLength(0);
  expect(
    renderer!.root.findAllByProps({
      "aria-label": "CloudWatch Logs Insights query",
    }),
  ).toHaveLength(0);
  expect(
    renderer!.root.findAllByProps({ "data-control": "Textarea" }),
  ).toHaveLength(0);
  expect(control("MenuItem", "Legacy SQL")).toBeUndefined();
  expect(
    renderer!.root.findAll(
      (node) =>
        node.type === "div" &&
        node.props["data-control"] === "MenuItem" &&
        String(node.props["data-tooltip"]).startsWith("fields @message"),
    ),
  ).toHaveLength(0);
  expect(renderer!.root.findAllByType(ServerFilterInput)).toHaveLength(1);
  expect(props.workspace.savedQueries[0].kind).toBe("insights");
  expect(props.workspace.history[0].kind).toBe("insights");
  expect(props.onRun).not.toHaveBeenCalled();
});

it("loads recent Events filters without obsolete query text or an automatic run", async () => {
  const props = setup();
  await act(async () => {
    renderer = create(<QueryPane {...props} />);
  });
  await act(async () => control("MenuItem", "error 2").props.onClick());
  expect(props.onPatch).toHaveBeenCalledExactlyOnceWith({
    kind: "events",
    filterPattern: "error 2",
    filterMode: "plain",
  });
  expect(props.onRun).not.toHaveBeenCalled();
});

it("keeps filter editing, clearing, Run and Live actions available", async () => {
  const props = setup();
  props.tab.sources = [{ logGroup: "/aws/lambda/orders" }];
  await act(async () => {
    renderer = create(<QueryPane {...props} />);
  });
  const input = renderer!.root.findByType(ServerFilterInput);
  expect(input.props.value).toBe(props.tab.filterPattern);
  expect(input.props.mode).toBe("pattern");
  await act(async () => input.props.onChange("failure"));
  expect(props.onPatch).toHaveBeenLastCalledWith({ filterPattern: "failure" });
  await act(async () => input.props.onModeChange("plain"));
  expect(props.onPatch).toHaveBeenLastCalledWith({ filterMode: "plain" });
  expect(props.onRun).not.toHaveBeenCalled();

  await act(async () => input.props.onClear());
  expect(props.onPatch).toHaveBeenLastCalledWith({ filterPattern: "" });
  expect(props.onRun).toHaveBeenLastCalledWith(false, false, "");
  await act(async () => control("Button", "Run").props.onClick());
  expect(props.onRun).toHaveBeenLastCalledWith();
  expect(control("Button", "Live").props.disabled).toBe(false);
  await act(async () => control("Button", "Live").props.onClick());
  expect(props.onRun).toHaveBeenLastCalledWith(true);
});

it("disables saving an empty Events filter even when a legacy query remains", async () => {
  const props = setup();
  props.tab.filterPattern = "  ";
  await act(async () => {
    renderer = create(<QueryPane {...props} />);
  });
  expect(control("MenuItem", "Save search…").props.disabled).toBe(true);
});

it.each([
  {
    sources: [],
    reason: "Live Tail requires sources from one connection and region.",
  },
  {
    sources: Array.from({ length: 11 }, (_, index) => ({
      logGroup: `/group-${index}`,
    })),
    reason: "Live Tail supports at most 10 log groups.",
  },
  {
    sources: [
      { logGroup: "/one", logStreams: ["stream"] },
      { logGroup: "/two" },
    ],
    reason: "Live Tail supports selected streams only with one log group.",
  },
])(
  "explains a disabled Live action inline: $reason",
  async ({ sources, reason }) => {
    const props = setup();
    props.tab.sources = sources;
    await act(async () => {
      renderer = create(<QueryPane {...props} />);
    });
    const live = control("Button", "Live");
    expect(live.props.disabled).toBe(true);
    expect(live.props["aria-describedby"]).toBe(
      `live-unavailable-${props.tab.id}`,
    );
    const status = renderer!.root.findByProps({
      id: live.props["aria-describedby"],
      role: "status",
      "data-control": "Text",
    });
    expect(status.children).toEqual([reason]);
    expect(props.onRun).not.toHaveBeenCalled();
  },
);

const searchSectionCases: {
  name: string;
  savedIds: string[];
  recentIds: string[];
  recentLimit?: number;
  labels: string[];
  dividerCount: number;
  itemCount: number;
}[] = [
  {
    name: "saved searches only",
    savedIds: ["saved"],
    recentIds: [],
    labels: ["Saved searches"],
    dividerCount: 1,
    itemCount: 3,
  },
  {
    name: "recent searches only",
    savedIds: [],
    recentIds: ["recent-0"],
    labels: ["Recent searches"],
    dividerCount: 1,
    itemCount: 2,
  },
  {
    name: "no saved or recent searches",
    savedIds: [],
    recentIds: [],
    labels: [],
    dividerCount: 0,
    itemCount: 1,
  },
  {
    name: "legacy searches only",
    savedIds: ["legacy-saved"],
    recentIds: ["legacy-recent-0"],
    labels: [],
    dividerCount: 0,
    itemCount: 1,
  },
  {
    name: "recent searches hidden by a zero limit",
    savedIds: [],
    recentIds: ["recent-0"],
    recentLimit: 0,
    labels: [],
    dividerCount: 0,
    itemCount: 1,
  },
];
it.each(searchSectionCases)(
  "omits empty search sections and keeps Save available with $name",
  async ({
    savedIds,
    recentIds,
    recentLimit,
    labels,
    dividerCount,
    itemCount,
  }) => {
    const props = setup();
    props.workspace.savedQueries = props.workspace.savedQueries.filter(
      (query) => savedIds.includes(query.id),
    );
    props.workspace.history = props.workspace.history.filter((query) =>
      recentIds.includes(query.id),
    );
    if (recentLimit !== undefined)
      props.workspace.preferences.recentSearchesLimit = recentLimit;
    await act(async () => {
      renderer = create(<QueryPane {...props} />);
    });
    const menu = renderer!.root.findByProps({
      className: "query-searches-menu",
      "data-control": "MenuDropdown",
    });
    const controls = (name: string) =>
      menu.findAll(
        (node) => node.type === "div" && node.props["data-control"] === name,
      );
    expect(controls("MenuLabel").flatMap((node) => node.children)).toEqual(
      labels,
    );
    expect(controls("MenuDivider")).toHaveLength(dividerCount);
    expect(controls("MenuItem")).toHaveLength(itemCount);
    const save = control("MenuItem", "Save search…");
    expect(save.props.disabled).toBe(false);
    await act(async () => save.props.onClick());
    expect(
      renderer!.root.findByProps({ "data-control": "Modal" }).props.opened,
    ).toBe(true);
  },
);
