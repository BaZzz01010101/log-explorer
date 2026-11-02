import { createElement, type ReactNode } from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { Settings } from "../src/renderer/components/Settings";
import { createWorkspace } from "../src/renderer/workspace";
vi.mock("../src/renderer/components/AppMenu", () => ({
  MENU_OPEN_EVENT: "explorer:menu-open",
}));

vi.mock("@mantine/core", () => {
  const component = ({ children, ...props }: Record<string, unknown>) =>
    createElement("div", props, children as ReactNode);
  return {
    ActionIcon: component,
    Group: component,
    Stack: component,
    Switch: component,
    Text: component,
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
vi.mock("../src/renderer/components/PreferencesEditor", () => ({
  PreferencesEditor: () => null,
}));
vi.mock("../src/renderer/components/RelativeTimeTemplatesEditor", () => ({
  RelativeTimeTemplatesEditor: () => null,
}));
vi.mock("../src/renderer/components/ShortcutsEditor", () => ({
  ShortcutsEditor: () => createElement("div", { "data-shortcut-editor": true }),
}));
vi.mock("../src/renderer/components/ProfileConnectionsEditor", () => ({
  createProfileConnectionsEditorState: () => ({ error: "" }),
  ProfileConnectionsEditor: (props: Record<string, unknown>) =>
    createElement("div", { ...props, "data-connection-editor": true }),
}));
vi.mock("../src/renderer/components/HighlightTreeEditor", () => ({
  createHighlightTreeEditorState: (id: string) => ({
    selected: { profileId: id },
    expanded: [id],
    previewOpened: false,
    widthRatio: 0.33,
    heightRatio: 0.4,
    tablesRatio: 0.5,
  }),
  HighlightTreeEditor: (props: Record<string, unknown>) =>
    createElement("div", { ...props, "data-highlight-editor": true }),
}));
let renderer: ReactTestRenderer;
const workspace = createWorkspace();
const props = {
  opened: true,
  onClose: vi.fn(),
  workspace,
  dispatch: vi.fn(),
  environment: null,
  onEnvironment: vi.fn(),
  onOpenModal: vi.fn(),
};
const node = (attribute: string) =>
  renderer.root.findAll((n) => n.type === "div" && n.props[attribute])[0];
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.clearAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(async () => {
  await act(async () => renderer?.unmount());
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

it("retains tree selection, expansion, preview and pane ratios across docking", async () => {
  await act(async () => {
    renderer = create(
      <Settings {...props} presentation="pane" requestedTab="highlights" />,
    );
  });
  const state = {
    selected: { profileId: "second", ruleId: "second-rule" },
    expanded: ["first", "second"],
    previewOpened: true,
    widthRatio: 0.41,
    heightRatio: 0.57,
    tablesRatio: 0.5,
  };
  await act(async () =>
    node("data-highlight-editor").props.onUiStateChange(state),
  );
  expect(node("data-highlight-editor").props.previewEnabled).toBe(false);
  await act(async () =>
    renderer.update(<Settings {...props} presentation="modal" />),
  );
  expect(node("data-highlight-editor").props.uiState).toEqual(state);
  expect(node("data-highlight-editor").props.previewEnabled).toBe(true);
  await act(async () =>
    renderer.update(<Settings {...props} presentation="pane" />),
  );
  expect(node("data-highlight-editor").props.uiState).toEqual(state);
  expect(node("data-highlight-editor").props.previewEnabled).toBe(false);
  expect(props.dispatch).not.toHaveBeenCalled();
});
it("retains connection editor feedback and unmounts shortcut capture when hidden or leaving its category", async () => {
  await act(async () => {
    renderer = create(<Settings {...props} presentation="pane" />);
  });
  await act(async () =>
    node("data-connection-editor").props.onUiStateChange({
      error: "Cannot add another profile",
    }),
  );
  await act(async () =>
    renderer.update(
      <Settings {...props} presentation="modal" requestedTab="shortcuts" />,
    ),
  );
  expect(node("data-connection-editor").props.uiState.error).toBe(
    "Cannot add another profile",
  );
  expect(node("data-shortcut-editor")).toBeDefined();
  await act(async () =>
    renderer.update(
      <Settings {...props} opened={false} requestedTab="shortcuts" />,
    ),
  );
  expect(node("data-shortcut-editor")).toBeUndefined();
  await act(async () =>
    renderer.update(<Settings {...props} requestedTab="highlights-tree" />),
  );
  expect(node("data-shortcut-editor")).toBeUndefined();
  expect(
    renderer.root.findAll(
      (n) => n.type === "div" && n.props.className === "settings-tabs",
    )[0].props.value,
  ).toBe("highlights");
});
