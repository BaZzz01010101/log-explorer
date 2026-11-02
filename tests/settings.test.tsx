import { createElement, type ReactNode } from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { Settings } from "../src/renderer/components/Settings";
import { createWorkspace } from "../src/renderer/workspace";
vi.mock("../src/renderer/components/AppMenu", () => ({
  MENU_OPEN_EVENT: "explorer:menu-open",
}));
vi.mock("../src/renderer/components/HighlightTreeEditor", () => ({
  createHighlightTreeEditorState: () => ({}),
  HighlightTreeEditor: ({ onChange }: { onChange(value: unknown[]): void }) =>
    createElement("button", {
      "aria-label": "Update highlight profiles",
      onClick: () => onChange([]),
    }),
}));
vi.mock("../src/renderer/components/ProfileConnectionsEditor", () => ({
  createProfileConnectionsEditorState: () => ({}),
  ProfileConnectionsEditor: () => null,
}));
vi.mock("../src/renderer/components/ShortcutsEditor", () => ({
  ShortcutsEditor: ({
    shortcuts,
    onChange,
  }: {
    shortcuts: Record<string, string>;
    onChange(value: Record<string, string>): void;
  }) => createElement("div", { "data-shortcuts": shortcuts, onChange }),
}));

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
    Modal: ({ opened, children, title, ...props }: Record<string, unknown>) =>
      opened
        ? createElement(
            "div",
            { ...props, role: "dialog" },
            title as ReactNode,
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
vi.mock("../src/renderer/components/HighlightEventsPreview", () => ({
  HighlightEventsPreview: () => null,
}));

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
    (node) =>
      node.type === "div" &&
      (node.props.label === label || node.props["aria-label"] === label),
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

it("commits the search history limit only after the preference edit is finished", async () => {
  await act(async () => {
    renderer = create(<Settings {...props} presentation="pane" />);
  });
  expect(control("Search history limit")).toBeDefined();
  expect(control("Search history limit").props.min).toBe(1);
  expect(control("Search history limit").props.max).toBe(100);
  await act(async () => control("Search history limit").props.onChange(23));
  expect(dispatch).not.toHaveBeenCalled();
  await act(async () => control("Search history limit").props.onBlur());
  expect(dispatch).toHaveBeenCalledExactlyOnceWith({
    type: "preferences/update",
    patch: { recentSearchesLimit: 23 },
  });
});

it("exposes independent configurable shortcuts for local filtering and highlighting", async () => {
  await act(async () => {
    renderer = create(<Settings {...props} presentation="pane" />);
  });
  await act(async () => tabs().props.onChange("shortcuts"));
  for (const [action, initial] of [
    ["localFilterRegex", "Alt+E"],
    ["localFilterCaseSensitive", "Alt+C"],
    ["highlightRegex", "Alt+E"],
    ["highlightCaseSensitive", "Alt+C"],
  ] as const) {
    const editor = renderer.root.findAll(
      (node) => node.type === "div" && node.props["data-shortcuts"],
    )[0];
    expect(editor.props["data-shortcuts"][action]).toBe(initial);
    await act(async () =>
      editor.props.onChange({
        ...workspace.preferences.shortcuts,
        [action]: "Alt+R",
      }),
    );
    expect(dispatch).toHaveBeenLastCalledWith({
      type: "preferences/update",
      patch: {
        shortcuts: { ...workspace.preferences.shortcuts, [action]: "Alt+R" },
      },
    });
  }
});

it.each(["pane", "modal"] as const)(
  "edits preferences, fixture visibility and the sole Highlights editor in %s presentation",
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
    const fixture = renderer.root.findAll(
      (node) =>
        node.type === "div" && node.props["aria-label"] === "Offline fixtures",
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
    await act(async () =>
      renderer.root
        .findByProps({ "aria-label": "Update highlight profiles" })
        .props.onClick(),
    );
    expect(dispatch).toHaveBeenLastCalledWith({
      type: "preferences/update",
      patch: { highlightProfiles: [] },
    });
    expect(paneButton()).toHaveLength(presentation === "pane" ? 1 : 0);
  },
);

it("opens the modal from the pane header and retains the selected category when presentation changes", async () => {
  await act(async () => {
    renderer = create(<Settings {...props} presentation="pane" />);
  });
  expect(
    renderer.root.findAllByProps({ "data-tooltip": "Open settings in window" })
      .length,
  ).toBeGreaterThan(0);
  await act(async () => tabs().props.onChange("highlights"));
  await act(async () => paneButton()[0].props.onClick());
  expect(onOpenModal).toHaveBeenCalledOnce();
  expect(onClose).not.toHaveBeenCalled();
  await act(async () =>
    renderer.update(<Settings {...props} presentation="modal" />),
  );
  expect(tabs().props.value).toBe("highlights");
  expect(renderer.root.findAllByProps({ role: "dialog" })).toHaveLength(1);
  await act(async () =>
    renderer.update(<Settings {...props} presentation="pane" />),
  );
  expect(tabs().props.value).toBe("highlights");
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

it("returns detached settings to its pane and opens the requested time-ranges category", async () => {
  const onReturnToPane = vi.fn();
  await act(async () => {
    renderer = create(
      <Settings
        {...props}
        presentation="modal"
        onReturnToPane={onReturnToPane}
        requestedTab="time-ranges"
      />,
    );
  });
  expect(tabs().props.value).toBe("time-ranges");
  const dock = renderer.root.findAll(
    (node) =>
      node.type === "div" &&
      node.props["aria-label"] === "Return settings to pane",
  )[0];
  await act(async () => dock.props.onClick());
  expect(onReturnToPane).toHaveBeenCalledOnce();
  expect(onClose).not.toHaveBeenCalled();
});

it("edits fixed quick slots and pushes following values without changing dropdown slots", async () => {
  await act(async () => {
    renderer = create(<Settings {...props} presentation="pane" />);
  });
  const label = renderer.root.findAll(
    (node) =>
      node.type === "div" &&
      node.props["aria-label"] === "Quick toolbar Minutes slot 1",
  )[0];
  await act(async () => label.props.onChange(9));
  const patch = dispatch.mock.lastCall![0].patch;
  expect(patch.relativeTimeTemplates.quick[0]).toMatchObject({
    label: "9m",
    duration: 9,
    unit: "m",
  });
  expect(patch.relativeTimeTemplates.dropdown[0]).toMatchObject({
    duration: 5,
    unit: "m",
  });
  expect(
    dispatch.mock
      .lastCall![0].patch.relativeTimeTemplates.quick.slice(0, 2)
      .map((entry: { duration: number }) => entry.duration),
  ).toEqual([9, 10]);
});

it("renders only fixed numeric slots and synchronously cascades dropdown collisions", async () => {
  await act(async () => {
    renderer = create(<Settings {...props} presentation="pane" />);
  });
  const input = (label: string) =>
    renderer.root.findAll(
      (node) => node.type === "div" && node.props["aria-label"] === label,
    )[0];
  await act(async () =>
    input("Relative dropdown Minutes slot 2").props.onChange(40),
  );
  expect(
    dispatch.mock
      .lastCall![0].patch.relativeTimeTemplates.dropdown.slice(0, 5)
      .map((entry: { duration: number }) => entry.duration),
  ).toEqual([5, 40, 41, 42, 45]);
  const editor = renderer.root
    .findAllByProps({ className: "time-template-editor" })
    .find((node) => node.type === "div")!;
  const numericInputs = editor.findAll(
    (node) => node.type === "div" && node.props.allowDecimal === false,
  );
  expect(numericInputs).toHaveLength(27);
  const actions = editor.findAll(
    (node) => typeof node.props.onClick === "function",
  );
  expect(actions).toHaveLength(2);
  expect(
    actions.every((node) => node.props.className === "settings-label-help"),
  ).toBe(true);
  expect(editor.findAll((node) => node.props.data !== undefined)).toHaveLength(
    0,
  );
});

it("reopens the time-ranges category for a repeated settings request", async () => {
  await act(async () => {
    renderer = create(
      <Settings {...props} requestedTab="time-ranges" requestedTabKey={1} />,
    );
  });
  await act(async () => tabs().props.onChange("appearance"));
  expect(tabs().props.value).toBe("appearance");
  await act(async () =>
    renderer.update(
      <Settings {...props} requestedTab="time-ranges" requestedTabKey={2} />,
    ),
  );
  expect(tabs().props.value).toBe("time-ranges");
});

it.each(["pane", "modal"] as const)(
  "edits the maximum closed-tab history age in %s preferences",
  async (presentation) => {
    await act(async () => {
      renderer = create(
        <Settings
          {...props}
          presentation={presentation}
          workspace={{
            ...workspace,
            preferences: {
              ...workspace.preferences,
              closedTabHistoryDays: undefined,
            },
          }}
        />,
      );
    });
    const history = () => control("Closed tab history (days)");
    expect(history()?.props).toMatchObject({
      value: 7,
      min: 1,
      max: 365,
      allowDecimal: false,
      allowNegative: false,
    });
    await act(async () => history().props.onChange(14));
    expect(dispatch).not.toHaveBeenCalled();
    await act(async () => history().props.onBlur());
    expect(dispatch).toHaveBeenLastCalledWith({
      type: "preferences/update",
      patch: { closedTabHistoryDays: 14 },
    });
    await act(async () =>
      renderer.update(
        <Settings
          {...props}
          presentation={presentation}
          workspace={{
            ...workspace,
            preferences: {
              ...workspace.preferences,
              closedTabHistoryDays: 14,
            },
          }}
        />,
      ),
    );
    expect(history().props.value).toBe(14);
  },
);
