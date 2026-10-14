import { act, create, type ReactTestRenderer } from "react-test-renderer";
import type { ReactNode } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { ResourceSidebar } from "../src/renderer/components/ResourceSidebar";
import { createWorkspace } from "../src/renderer/workspace";

// Keep the actual component state and handlers. Presentation and layout need no
// browser for this regression: focus() must synchronously dispatch focus before
// React commits the batched key handler's pending active-row state.
vi.mock("@mantine/core", async () => {
  const { createElement } = await import("react");
  const component = ({ children, ...props }: Record<string, unknown>) =>
    createElement("div", props, children as ReactNode);
  return {
    ActionIcon: component,
    Alert: component,
    Badge: component,
    Button: component,
    Group: component,
    Loader: component,
    Select: component,
    Text: component,
    TextInput: component,
    Tooltip: component,
    Menu: Object.assign(component, {
      Target: component,
      Dropdown: component,
      Label: component,
      Divider: component,
      Item: component,
    }),
  };
});
vi.mock("@tanstack/react-virtual", () => ({
  defaultRangeExtractor: () => [],
  useVirtualizer: ({ count }: { count: number }) => ({
    getVirtualItems: () =>
      Array.from({ length: count }, (_, index) => ({
        key: index,
        index,
        size: 32,
        start: index * 32,
      })),
    getTotalSize: () => count * 32,
    scrollToIndex: () => {},
  }),
}));

let renderer: ReactTestRenderer | undefined;
class FocusTarget {
  closest() {
    return null;
  }
}
const treeNode = {
  clientHeight: 320,
  focus() {
    const tree = renderer!.root.findByProps({ role: "tree" });
    tree.props.onFocusCapture();
    tree.props.onFocus({ target: treeNode, currentTarget: treeNode });
  },
};

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("Element", FocusTarget);
  vi.stubGlobal("window", {
    explorer: {
      listGroups: async () => ({ items: [{ name: "/one" }, { name: "/two" }] }),
    },
  });
  const original = console.error.bind(console);
  vi.spyOn(console, "error").mockImplementation((...args) => {
    if (String(args[0]).startsWith("react-test-renderer is deprecated")) return;
    original(...args);
  });
});
afterEach(async () => {
  await act(async () => renderer?.unmount());
  renderer = undefined;
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

it("advances the active row when ArrowDown transfers focus from a child control", async () => {
  const connection = createWorkspace().connections[0];
  await act(async () => {
    renderer = create(
      <ResourceSidebar
        connections={[connection]}
        activeConnectionId={connection.id}
        favorites={[]}
        recents={[]}
        onOpen={() => {}}
        onFavorite={() => {}}
        onManage={() => {}}
      />,
      {
        createNodeMock: ({ props }) =>
          (props as { role?: string }).role === "tree" ? treeNode : null,
      },
    );
  });
  const firstRow = renderer!.root.findByProps({
    role: "treeitem",
    "aria-label": "/one",
  });
  await act(async () => {
    firstRow.parent!.props.onFocusCapture();
  });
  await act(async () => {
    const tree = renderer!.root.findByProps({ role: "tree" });
    tree.props.onKeyDown({
      target: new FocusTarget(),
      currentTarget: treeNode,
      key: "ArrowDown",
      preventDefault() {},
    });
  });
  const tree = renderer!.root.findByProps({ role: "tree" });
  const secondRow = renderer!.root.findByProps({
    role: "treeitem",
    "aria-label": "/two",
  });
  expect(tree.props["aria-activedescendant"]).toBe(secondRow.props.id);
});
