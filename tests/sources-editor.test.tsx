import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { createWorkspace } from "../src/renderer/workspace";
import { SourcesEditor } from "../src/renderer/components/SourcesEditor";

vi.mock("@mantine/core", async () => {
  const React = await import("react");
  return Object.fromEntries(
    [
      "ActionIcon",
      "Alert",
      "Badge",
      "Button",
      "Group",
      "Modal",
      "Paper",
      "Select",
      "Stack",
      "Switch",
      "Text",
      "Textarea",
      "TextInput",
    ].map((name) => [
      name,
      ({ children, ...props }: Record<string, unknown>) =>
        React.createElement("mock-" + name, props, children as React.ReactNode),
    ]),
  );
});
let renderer: ReactTestRenderer;
const workspace = createWorkspace();
const tab = {
  ...workspace.tabs[0],
  sources: [{ logGroup: "a", logStreams: ["one"] }],
};
const connections = [
  workspace.connections[0],
  {
    ...workspace.connections[0],
    id: "other",
    name: "Other",
    region: "us-east-1",
  },
];
const apply = vi.fn(),
  close = vi.fn(),
  groups = vi.fn();
const byLabel = (label: string) =>
  renderer.root.findAll(
    (node) =>
      String(node.type) === "mock-TextInput" && node.props.label === label,
  )[0];
const button = (text: string) =>
  renderer.root.findAll(
    (node) =>
      String(node.type) === "mock-Button" && node.props.children === text,
  )[0];
beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  groups.mockResolvedValue({ items: [] });
  apply.mockReset();
  close.mockReset();
  vi.stubGlobal("window", {
    explorer: {
      listGroups: groups,
      listStreams: vi.fn().mockResolvedValue({ items: [] }),
    },
  });
  const error = console.error.bind(console);
  vi.spyOn(console, "error").mockImplementation((...args) => {
    if (!String(args[0]).includes("react-test-renderer is deprecated"))
      error(...args);
  });
});
afterEach(async () => {
  await act(async () => renderer?.unmount());
  groups.mockReset();
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
it("stages source edits, preserves streams when selecting an existing group, and applies once", async () => {
  await act(async () => {
    renderer = create(
      <SourcesEditor
        tab={tab}
        connections={connections}
        onApply={apply}
        onClose={close}
      />,
    );
  });
  await act(async () =>
    byLabel("Find or enter a log group").props.onChange({
      currentTarget: { value: "a" },
    }),
  );
  await act(async () => button("Add group").props.onClick());
  expect(apply).not.toHaveBeenCalled();
  await act(async () => button("Apply sources").props.onClick());
  expect(apply).toHaveBeenCalledExactlyOnceWith({
    connectionId: tab.connectionId,
    sources: [{ logGroup: "a", logStreams: ["one"] }],
  });
  expect(close).toHaveBeenCalledOnce();
});
it("ignores browse responses from a previous connection and discards Cancel edits", async () => {
  let resolveOld: (value: unknown) => void = () => {};
  groups
    .mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveOld = resolve;
        }),
    )
    .mockResolvedValue({ items: [{ name: "new-group" }] });
  await act(async () => {
    renderer = create(
      <SourcesEditor
        tab={tab}
        connections={connections}
        onApply={apply}
        onClose={close}
      />,
    );
  });
  await act(async () => {
    vi.advanceTimersByTime(201);
  });
  const select = renderer.root.findAll(
    (node) => String(node.type) === "mock-Select",
  )[0];
  await act(async () => select.props.onChange("other"));
  await act(async () => {
    vi.advanceTimersByTime(201);
  });
  await act(async () => resolveOld({ items: [{ name: "stale-group" }] }));
  const choices = renderer.root.findAll(
    (node) =>
      node.type === "button" && node.props.className === "source-choice",
  );
  expect(choices.map((node) => node.findByType("span").props.children)).toEqual(
    ["new-group"],
  );
  await act(async () => button("Cancel").props.onClick());
  expect(apply).not.toHaveBeenCalled();
  expect(close).toHaveBeenCalledOnce();
});
