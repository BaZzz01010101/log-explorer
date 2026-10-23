import { createElement, type ReactNode } from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { Settings } from "../src/renderer/components/Settings";
import { createWorkspace } from "../src/renderer/workspace";

vi.mock("@mantine/core", () => {
  const component = ({ children, ...props }: Record<string, unknown>) =>
    createElement("div", props, children as ReactNode);
  const Tabs = Object.assign(component, {
    List: component,
    Tab: component,
    Panel: component,
  });
  return {
    ...Object.fromEntries(
      [
        "ActionIcon",
        "Alert",
        "Badge",
        "Button",
        "Checkbox",
        "Group",
        "NumberInput",
        "Paper",
        "Select",
        "Stack",
        "Switch",
        "Text",
        "Textarea",
        "TextInput",
      ].map((name) => [name, component]),
    ),
    Tabs,
    Modal: ({ opened, children, ...props }: Record<string, unknown>) =>
      opened
        ? createElement(
            "div",
            { ...props, role: "dialog" },
            children as ReactNode,
          )
        : null,
  };
});
vi.mock("@mantine/notifications", () => ({ notifications: { show: vi.fn() } }));
vi.mock("../src/renderer/components/AppTooltip", () => ({
  Tooltip: ({ children, label }: { children: ReactNode; label: string }) =>
    createElement("div", { "data-tooltip": label }, children),
}));
vi.mock("../src/renderer/components/EventMessage", () => ({
  MessageContent: () => null,
}));
vi.mock(
  "../src/renderer/components/HighlightProfilesEditor",
  async (importOriginal) => ({
    ...(await importOriginal<
      typeof import("../src/renderer/components/HighlightProfilesEditor")
    >()),
    HighlightProfilesEditor: ({
      onChange,
    }: {
      onChange(value: unknown[]): void;
    }) =>
      createElement("button", {
        "aria-label": "Update highlight profiles",
        onClick: () => onChange([]),
      }),
  }),
);

let renderer: ReactTestRenderer;
const workspace = createWorkspace();
const dispatch = vi.fn();
const onClose = vi.fn();
const onOpenModal = vi.fn();
const props = {
  opened: true,
  onClose,
  workspace,
  dispatch,
  environment: null,
  onEnvironment: vi.fn(),
  onOpenModal,
};
const control = (label: string) =>
  renderer.root.findAll(
    (node) => node.type === "div" && node.props.label === label,
  )[0];
const paneButton = () =>
  renderer.root.findAll(
    (node) =>
      node.type === "div" &&
      node.props["aria-label"] === "Open settings in window",
  );
const tabs = () =>
  renderer.root.findAll(
    (node) => node.type === "div" && node.props.className === "settings-tabs",
  )[0];

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const original = console.error.bind(console);
  vi.spyOn(console, "error").mockImplementation((...args) => {
    if (!String(args[0]).includes("react-test-renderer is deprecated"))
      original(...args);
  });
  vi.clearAllMocks();
});
afterEach(async () => {
  await act(async () => renderer?.unmount());
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

it.each(["pane", "modal"] as const)(
  "edits the same preferences, connections and workspace in %s presentation",
  async (presentation) => {
    await act(async () => {
      renderer = create(<Settings {...props} presentation={presentation} />);
    });
    expect(
      renderer.root.findAllByProps({ "aria-label": "Settings categories" })
        .length,
    ).toBeGreaterThan(0);
    await act(async () => control("Theme").props.onChange("light"));
    expect(dispatch).toHaveBeenLastCalledWith({
      type: "preferences/update",
      patch: { theme: "light" },
    });
    const numeric = control("Maximum events per view");
    dispatch.mockClear();
    await act(async () => numeric.props.onChange(1000));
    expect(dispatch).not.toHaveBeenCalled();
    expect(control("Maximum events per view").props.value).toBe(1000);
    await act(async () => control("Maximum events per view").props.onBlur());
    expect(dispatch).toHaveBeenLastCalledWith({
      type: "preferences/update",
      patch: { maxEvents: 1000 },
    });
    await act(async () =>
      control("Workspace name").props.onChange({
        currentTarget: { value: "Investigation" },
      }),
    );
    expect(dispatch).toHaveBeenLastCalledWith({
      type: "workspace/update",
      patch: { name: "Investigation" },
    });
    const fixture = renderer.root.findAll(
      (node) =>
        node.type === "div" &&
        node.props["aria-label"] ===
          `Show fixture connection ${workspace.connections[0].id}`,
    )[0];
    await act(async () =>
      fixture.props.onChange({ currentTarget: { checked: false } }),
    );
    expect(dispatch).toHaveBeenLastCalledWith({
      type: "connections/set",
      connections: expect.arrayContaining([
        expect.objectContaining({
          id: workspace.connections[0].id,
          enabled: false,
        }),
      ]),
    });
    await act(async () => renderer.root.findByType("button").props.onClick());
    expect(dispatch).toHaveBeenLastCalledWith({
      type: "preferences/update",
      patch: { highlightProfiles: [] },
    });
    expect(paneButton()).toHaveLength(presentation === "pane" ? 1 : 0);
  },
);

it("opens the modal from the pane header and retains the category and import draft when presentation changes", async () => {
  await act(async () => {
    renderer = create(<Settings {...props} presentation="pane" />);
  });
  expect(
    renderer.root.findAllByProps({ "data-tooltip": "Open settings in window" })
      .length,
  ).toBeGreaterThan(0);
  await act(async () => tabs().props.onChange("workspace"));
  await act(async () =>
    control("Import workspace JSON").props.onChange({
      currentTarget: { value: '{"unfinished":' },
    }),
  );
  await act(async () => paneButton()[0].props.onClick());
  expect(onOpenModal).toHaveBeenCalledOnce();
  expect(onClose).not.toHaveBeenCalled();
  await act(async () =>
    renderer.update(<Settings {...props} presentation="modal" />),
  );
  expect(tabs().props.value).toBe("workspace");
  expect(control("Import workspace JSON").props.value).toBe('{"unfinished":');
  expect(renderer.root.findAllByProps({ role: "dialog" })).toHaveLength(1);
  await act(async () =>
    renderer.update(<Settings {...props} presentation="pane" />),
  );
  expect(tabs().props.value).toBe("workspace");
  expect(control("Import workspace JSON").props.value).toBe('{"unfinished":');
});

it("defaults to the existing modal and hides an inactive pane", async () => {
  await act(async () => {
    renderer = create(<Settings {...props} />);
  });
  expect(renderer.root.findAllByProps({ role: "dialog" })).toHaveLength(1);
  await act(async () =>
    renderer.update(<Settings {...props} presentation="pane" opened={false} />),
  );
  expect(renderer.root.findByType("section").props.hidden).toBe(true);
});
