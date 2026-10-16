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

it("reports explicit connection selection without resetting it on an unrelated parent render", async () => {
  const scroll = Object.assign(new EventTarget(), {
    clientHeight: 320,
    scrollHeight: 1000,
    scrollTop: 0,
    firstElementChild: null,
  });
  const initial = createWorkspace().connections[0];
  const second = {
    ...initial,
    id: "retained",
    name: "Retained connection",
    region: "us-east-1",
  };
  const onConnectionChange = vi.fn();
  const props = {
    connections: [initial, second],
    activeConnectionId: initial.id,
    favorites: [],
    recents: [],
    onOpen() {},
    onFavorite() {},
    onManage() {},
    onConnectionChange,
  };
  await act(async () => {
    renderer = create(<ResourceSidebar {...props} />, {
      createNodeMock: ({ props }) =>
        (props as { role?: string }).role === "tree" ? scroll : null,
    });
  });
  scroll.scrollTop = 600;
  await act(async () =>
    renderer!.root
      .findByProps({ "aria-label": "Explorer region" })
      .props.onChange(second.id),
  );
  expect(onConnectionChange).toHaveBeenCalledExactlyOnceWith(second.id);
  expect(scroll.scrollTop).toBe(0);
  await act(async () =>
    renderer!.update(<ResourceSidebar {...props} recents={[]} />),
  );
  expect(
    renderer!.root.findByProps({ "aria-label": "Explorer region" }).props.value,
  ).toBe(second.id);
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

it("previews resource clicks and Enter, while double click opens permanently", async () => {
  const connection = createWorkspace().connections[0];
  const onOpen = vi.fn();
  await act(async () => {
    renderer = create(
      <ResourceSidebar
        connections={[connection]}
        activeConnectionId={connection.id}
        favorites={[]}
        recents={[]}
        onOpen={onOpen}
        onFavorite={() => {}}
        onManage={() => {}}
      />,
      {
        createNodeMock: ({ props }) =>
          (props as { role?: string }).role === "tree" ? treeNode : null,
      },
    );
  });
  const label = renderer!.root.findAllByProps({
    className: "resource-label",
  })[0];
  await act(async () => label.props.onClick());
  expect(onOpen).toHaveBeenLastCalledWith(
    connection.id,
    [{ logGroup: "/one" }],
    "preview",
  );
  await act(async () => label.props.onDoubleClick());
  expect(onOpen).toHaveBeenLastCalledWith(
    connection.id,
    [{ logGroup: "/one" }],
    "permanent",
  );
  await act(async () =>
    renderer!.root.findByProps({ role: "tree" }).props.onKeyDown({
      target: treeNode,
      currentTarget: treeNode,
      key: "Enter",
      preventDefault() {},
    }),
  );
  expect(onOpen).toHaveBeenLastCalledWith(
    connection.id,
    [{ logGroup: "/one" }],
    "preview",
  );
});

it("uses the same preview and double-click behavior for favorites and recent sources", async () => {
  const connection = createWorkspace().connections[0];
  const favorite = {
    connectionId: connection.id,
    logGroup: "/favorite",
    logStream: "stream",
  };
  const recent = { connectionId: connection.id, logGroup: "/recent" };
  const onOpen = vi.fn();
  await act(async () => {
    renderer = create(
      <ResourceSidebar
        connections={[connection]}
        activeConnectionId={connection.id}
        favorites={[favorite]}
        recents={[recent]}
        onOpen={onOpen}
        onFavorite={() => {}}
        onManage={() => {}}
      />,
    );
  });
  const buttons = renderer!.root.findAllByProps({
    className: "quick-resource",
  });
  await act(async () => buttons[0].props.onClick());
  expect(onOpen).toHaveBeenLastCalledWith(
    connection.id,
    [{ logGroup: "/favorite", logStreams: ["stream"] }],
    "preview",
  );
  await act(async () => buttons[0].props.onDoubleClick());
  expect(onOpen).toHaveBeenLastCalledWith(
    connection.id,
    [{ logGroup: "/favorite", logStreams: ["stream"] }],
    "permanent",
  );
  await act(async () => buttons[1].props.onClick());
  expect(onOpen).toHaveBeenLastCalledWith(
    connection.id,
    [{ logGroup: "/recent", logStreams: undefined }],
    "preview",
  );
  await act(async () => buttons[1].props.onDoubleClick());
  expect(onOpen).toHaveBeenLastCalledWith(
    connection.id,
    [{ logGroup: "/recent", logStreams: undefined }],
    "permanent",
  );
});

it("keeps favorites for legacy duplicate IDs while offering a single region and no extra tree levels", async () => {
  const connection = createWorkspace().connections[0];
  const duplicate = { ...connection, id: "duplicate", name: "Second name" };
  const onOpen = vi.fn();
  await act(async () => {
    renderer = create(
      <ResourceSidebar
        connections={[connection, duplicate]}
        activeConnectionId={connection.id}
        favorites={[{ connectionId: duplicate.id, logGroup: "/saved" }]}
        recents={[]}
        onOpen={onOpen}
        onFavorite={() => {}}
        onManage={() => {}}
      />,
    );
  });
  expect(
    renderer!.root
      .findByProps({ "aria-label": "Explorer region" })
      .props.data.map((item: { value: string }) => item.value),
  ).toEqual([connection.id]);
  const favorite = renderer!.root.findAll(
    (node) => node.type === "button" && node.props.title === "/saved",
  )[0];
  expect(favorite).toBeDefined();
  await act(async () => favorite.props.onClick());
  expect(onOpen).toHaveBeenCalledWith(
    duplicate.id,
    [{ logGroup: "/saved", logStreams: undefined }],
    "preview",
  );
  expect(
    renderer!.root.findAllByProps({ "data-node-kind": "region" }),
  ).toHaveLength(0);
  expect(
    renderer!.root.findAllByProps({ "aria-label": "Filter loaded streams" }),
  ).toHaveLength(0);
  expect(
    renderer!.root.findByProps({ "aria-label": "Explorer profile" }),
  ).toBeDefined();
});

it("debounces substring searches through the server API and retains matching-page pagination", async () => {
  vi.useFakeTimers();
  try {
    const scroll = Object.assign(new EventTarget(), {
      clientHeight: 0,
      scrollHeight: 32,
      scrollTop: 0,
      firstElementChild: null,
    });
    const connection = createWorkspace().connections[0];
    const listGroups = vi.fn(
      async (_connection: unknown, search: string, cursor?: string) => ({
        items: [
          {
            name: search
              ? `/aws/lambda/${search}-${cursor ? "two" : "one"}`
              : "/initial",
          },
        ],
        cursor: cursor ? undefined : "next",
      }),
    );
    vi.stubGlobal("window", { explorer: { listGroups } });
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
            (props as { role?: string }).role === "tree" ? scroll : null,
        },
      );
    });
    const input = renderer!.root
      .findAllByProps({ "aria-label": "Search log groups" })
      .at(-1)!;
    await act(async () =>
      input.props.onChange({ currentTarget: { value: "orders" } }),
    );
    expect(listGroups).toHaveBeenCalledTimes(1);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(220);
    });
    expect(listGroups).toHaveBeenLastCalledWith(
      connection,
      "orders",
      undefined,
    );
    scroll.clientHeight = 320;
    await act(async () => {
      scroll.dispatchEvent(new Event("scroll"));
    });
    expect(listGroups).toHaveBeenLastCalledWith(connection, "orders", "next");
    expect(
      renderer!.root
        .findAllByProps({ role: "treeitem", "data-node-kind": "group" })
        .map((row) => row.props["aria-label"]),
    ).toEqual(["/aws/lambda/orders-one", "/aws/lambda/orders-two"]);
  } finally {
    vi.useRealTimers();
  }
});
