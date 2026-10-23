import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, expect, it, vi } from "vitest";
import { QueryPane } from "../src/renderer/components/QueryPane";
import { LogViewer } from "../src/renderer/components/LogViewer";
import { createWorkspace } from "../src/renderer/workspace";

vi.mock("../src/renderer/components/LogViewer", () => ({
  LogViewer: () => null,
}));
vi.mock("../src/renderer/components/TimeRangePicker", () => ({
  TimeRangePicker: () => null,
}));
vi.mock("@mantine/core", async () => {
  const React = await import("react");
  const component =
    (name: string) =>
    ({ children, ...props }: Record<string, unknown>) =>
      React.createElement("mock-" + name, props, children as React.ReactNode);
  return {
    ...Object.fromEntries(
      [
        "ActionIcon",
        "Alert",
        "Badge",
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
    Menu: Object.assign(
      component("Menu"),
      {
        Sub: Object.assign(component("MenuSub"), {
          Target: component("MenuSubTarget"),
          Item: component("MenuSubItem"),
          Dropdown: component("MenuSubDropdown"),
        }),
      },
      Object.fromEntries(
        ["Target", "Dropdown", "Label", "Item", "Divider"].map((name) => [
          name,
          component("Menu" + name),
        ]),
      ),
    ),
  };
});
let renderer: ReactTestRenderer;
afterEach(async () => {
  await act(async () => renderer?.unmount());
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

it("keeps executed source snapshots stable through Live updates and refreshes them for a new request", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const originalError = console.error.bind(console);
  vi.spyOn(console, "error").mockImplementation((...args) => {
    if (!String(args[0]).includes("react-test-renderer is deprecated"))
      originalError(...args);
  });
  const workspace = createWorkspace();
  const original = { ...workspace.connections[0] };
  const request = {
    requestId: "previous",
    connection: original,
    connections: [] as typeof workspace.connections,
    sources: [{ logGroup: "/old-a" }, { logGroup: "/old-b" }],
    startTime: 0,
    endTime: 100,
    kind: "events" as const,
    filterPattern: "",
    query: "",
    limit: 100,
  };
  workspace.connections[0] = { ...original, region: "us-east-1" };
  const tab = { ...workspace.tabs[0], sources: [{ logGroup: "/new-only" }] };
  const noop = () => {};
  await act(async () => {
    renderer = create(
      <QueryPane
        workspace={workspace}
        tab={tab}
        runtime={{
          events: [],
          state: "complete",
          live: false,
          evicted: 0,
          request,
        }}
        onPatch={noop}
        onTimezoneChange={noop}
        onRun={noop}
        onCancel={noop}
        onSaveQuery={noop}
        onSavePreset={noop}
        onContext={noop}
      />,
    );
  });
  const context = renderer.root.findByType(LogViewer).props.sourceContext;
  expect(context.sources).toEqual([
    { logGroup: "/old-a" },
    { logGroup: "/old-b" },
  ]);
  expect(context.connections).toEqual([original]);
  const props = renderer.root.findByType(QueryPane)
    .props as React.ComponentProps<typeof QueryPane>;
  await act(async () =>
    renderer.update(
      <QueryPane
        {...props}
        runtime={{
          ...props.runtime!,
          live: true,
          state: "running",
          liveState: "streaming",
          liveReceived: 2,
        }}
      />,
    ),
  );
  expect(renderer.root.findByType(LogViewer).props.sourceContext).toBe(context);
  await act(async () =>
    renderer.root.findByType(LogViewer).props.onPauseLiveFollow(),
  );
  expect(renderer.root.findByType(LogViewer).props.sourceContext).toBe(context);
  const extra = { ...original, id: "extra", region: "us-east-2" };
  await act(async () =>
    renderer.update(
      <QueryPane
        workspace={workspace}
        tab={tab}
        runtime={{
          events: [],
          state: "complete",
          live: false,
          evicted: 0,
          request: { ...request, connections: [extra] },
        }}
        onPatch={noop}
        onTimezoneChange={noop}
        onRun={noop}
        onCancel={noop}
        onSaveQuery={noop}
        onSavePreset={noop}
        onContext={noop}
      />,
    ),
  );
  expect(
    renderer.root.findByType(LogViewer).props.sourceContext.connections,
  ).toEqual([original, extra]);
});

it("describes Live and interpreter scope using selected sources rather than an unused offline anchor", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const original = console.error.bind(console);
  vi.spyOn(console, "error").mockImplementation((...args) => {
    if (!String(args[0]).includes("react-test-renderer is deprecated"))
      original(...args);
  });
  const workspace = createWorkspace(),
    aws = {
      ...workspace.connections[0],
      id: "aws",
      mode: "aws" as const,
      region: "us-east-1",
    };
  workspace.connections.push(aws);
  const tab = {
    ...workspace.tabs[0],
    sources: [{ connectionId: aws.id, logGroup: "/same" }],
  };
  const noop = () => {};
  const render = () => (
    <QueryPane
      workspace={workspace}
      tab={tab}
      onPatch={noop}
      onTimezoneChange={noop}
      onRun={noop}
      onCancel={noop}
      onSaveQuery={noop}
      onSavePreset={noop}
      onContext={noop}
    />
  );
  await act(async () => {
    renderer = create(render());
  });
  const hints = renderer.root
    .findAll((node) => String(node.type) === "mock-Tooltip")
    .map((node) => String(node.props.label));
  expect(hints.some((hint) => hint.includes("AWS charges apply"))).toBe(true);
  expect(
    renderer.root
      .findAll((node) => String(node.type) === "mock-Text")
      .flatMap((node) =>
        node.children.filter((child) => typeof child === "string"),
      )
      .join(" "),
  ).not.toContain("limited fixture interpreter");
  tab.sources.push({
    connectionId: workspace.connections[0].id,
    logGroup: "/other",
  });
  await act(async () => renderer.update(render()));
  const live = renderer.root.findAll(
    (node) =>
      String(node.type) === "mock-Button" && node.props.children === "Live",
  )[0];
  expect(live.props.disabled).toBe(true);
});
