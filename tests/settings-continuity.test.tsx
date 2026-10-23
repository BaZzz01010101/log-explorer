import { createContext, createElement, type ReactNode } from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { Settings } from "../src/renderer/components/Settings";
import { createWorkspace } from "../src/renderer/workspace";
import type { HighlightProfile } from "../src/shared/highlights";

vi.mock("@mantine/core", () => {
  const component = ({ children, ...props }: Record<string, unknown>) =>
    createElement("div", props, children as ReactNode);
  return {
    ...Object.fromEntries(
      [
        "ActionIcon",
        "Alert",
        "Badge",
        "Button",
        "Checkbox",
        "Collapse",
        "ColorInput",
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
    Tabs: Object.assign(component, {
      List: component,
      Tab: component,
      Panel: component,
    }),
    Modal: ({ opened, children }: { opened: boolean; children: ReactNode }) =>
      opened ? createElement("div", { role: "dialog" }, children) : null,
  };
});
vi.mock("@mantine/notifications", () => ({ notifications: { show: vi.fn() } }));
vi.mock("../src/renderer/components/AppTooltip", () => ({
  Tooltip: ({ children }: { children: ReactNode }) => children,
}));
vi.mock("@dnd-kit/core", () => ({
  DndContext: ({ children }: { children: ReactNode }) => children,
  closestCenter: vi.fn(),
  KeyboardSensor: class {},
  PointerSensor: class {},
  useSensor: vi.fn(),
  useSensors: vi.fn(),
}));
vi.mock("@dnd-kit/sortable", () => ({
  SortableContext: ({ children }: { children: ReactNode }) => children,
  sortableKeyboardCoordinates: vi.fn(),
  verticalListSortingStrategy: "vertical",
  useSortable: () => ({
    attributes: {},
    listeners: {},
    setNodeRef: vi.fn(),
    setActivatorNodeRef: vi.fn(),
  }),
}));
vi.mock("../src/renderer/useEventHighlights", () => ({
  EventHighlightContext: createContext(undefined),
  useEventHighlights: () => ({ results: new Map() }),
}));
vi.mock("../src/renderer/components/EventMessage", () => ({
  MessageContent: () => null,
}));

let renderer: ReactTestRenderer;
const dispatch = vi.fn();
const base = createWorkspace();
const profile = (id: string): HighlightProfile => ({
  id,
  name: id,
  enabled: true,
  groupPattern: "",
  groupIgnoreCase: false,
  rules: [1, 2].map((index) => ({
    id: `${id}-${index}`,
    enabled: true,
    scope: "text",
    path: "",
    pattern: `${id}-${index}`,
    ignoreCase: false,
    target: "row",
    colors: {},
    separateThemeColors: false,
  })),
});
const workspace = {
  ...base,
  connections: [
    {
      ...base.connections[0],
      mode: "aws" as const,
      profile: "production",
      region: "eu-west-1",
    },
  ],
  preferences: {
    ...base.preferences,
    highlightProfiles: [profile("first"), profile("second")],
    profileVisibility: { production: true, staging: false },
  },
};
const props = {
  opened: true,
  onClose: vi.fn(),
  workspace,
  dispatch,
  environment: null,
  onEnvironment: vi.fn(),
  onOpenModal: vi.fn(),
};
const control = (label: string) =>
  renderer.root.findAll(
    (node) => node.type === "div" && node.props.label === label,
  )[0];
const ariaControl = (label: string) =>
  renderer.root.findAll(
    (node) => node.type === "div" && node.props["aria-label"] === label,
  )[0];
const previewToggle = () =>
  renderer.root.findAll(
    (node) =>
      node.type === "button" &&
      node.props.className === "highlight-preview-toggle",
  )[0];
async function expand() {
  await act(async () => ariaControl("Open settings in window").props.onClick());
  await act(async () =>
    renderer.update(<Settings {...props} presentation="modal" />),
  );
}
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

it("keeps the selected highlight profile, rule and preview drafts when expanding settings", async () => {
  await act(async () => {
    renderer = create(<Settings {...props} presentation="pane" />);
  });
  await act(async () => control("Highlight profile").props.onChange("second"));
  await act(async () =>
    renderer.root.findByProps({ "data-rule-id": "second-2" }).props.onClick(),
  );
  await act(async () => previewToggle().props.onClick());
  await act(async () =>
    control("Preview log group").props.onChange({
      currentTarget: { value: "/aws/custom" },
    }),
  );
  await act(async () =>
    control("Preview event").props.onChange({
      currentTarget: { value: "custom preview draft" },
    }),
  );
  await expand();
  expect(control("Highlight profile").props.value).toBe("second");
  expect(control("Match regex").props.value).toBe("second-2");
  expect(
    renderer.root.findByProps({ "data-rule-id": "second-2" }).props[
      "aria-selected"
    ],
  ).toBe(true);
  expect(previewToggle().props["aria-expanded"]).toBe(true);
  expect(control("Preview log group").props.value).toBe("/aws/custom");
  expect(control("Preview event").props.value).toBe("custom preview draft");
  expect(dispatch).not.toHaveBeenCalled();
  await act(async () =>
    renderer.update(<Settings {...props} presentation="pane" />),
  );
  expect(control("Match regex").props.value).toBe("second-2");
  expect(control("Preview event").props.value).toBe("custom preview draft");
});

it("keeps pending connection profile and region choices when expanding settings", async () => {
  await act(async () => {
    renderer = create(<Settings {...props} presentation="pane" />);
  });
  await act(async () =>
    ariaControl("Known profile to add").props.onChange("staging"),
  );
  await act(async () =>
    ariaControl("Add region for production").props.onChange("us-west-2"),
  );
  await expand();
  expect(ariaControl("Known profile to add").props.value).toBe("staging");
  expect(ariaControl("Add region for production").props.value).toBe(
    "us-west-2",
  );
  expect(dispatch).not.toHaveBeenCalled();
});
