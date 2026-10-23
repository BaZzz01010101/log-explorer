import { act, create, type ReactTestRenderer } from "react-test-renderer";
import type { ReactNode } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { ResourceSidebar } from "../src/renderer/components/ResourceSidebar";
import { Menu } from "../src/renderer/components/AppMenu";
import { createWorkspace, restoreWorkspace } from "../src/renderer/workspace";

// Keep the actual component state and handlers. Presentation and layout need no
// browser for this regression: focus() must synchronously dispatch focus before
// React commits the batched key handler's pending active-row state.
vi.mock("@mantine/core", async () => {
  const { createElement } = await import("react");
  const component = ({ children, ...props }: Record<string, unknown>) =>
    createElement("div", props, children as ReactNode);
  const input = ({ rightSection, ...props }: Record<string, unknown>) =>
    createElement("div", props, rightSection as ReactNode);
  return {
    ActionIcon: component,
    Alert: component,
    Badge: component,
    Button: component,
    Group: component,
    Loader: component,
    Modal: component,
    Select: component,
    Text: component,
    TextInput: input,
    Tooltip: component,
    Menu: Object.assign(component, {
      Sub: Object.assign(component, {
        Target: component,
        Item: component,
        Dropdown: component,
      }),
      Target: component,
      ContextMenu: component,
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
    onRemoveFavorite() {},
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

it("offers non-editable profile and region choosers and an accessible inner regex toggle", async () => {
  const connection = createWorkspace().connections[0];
  await act(async () => {
    renderer = create(
      <ResourceSidebar
        connections={[connection]}
        activeConnectionId={connection.id}
        favorites={[]}
        recents={[]}
        onOpen={() => {}}
        onManage={() => {}}
      />,
    );
  });
  expect(
    renderer!.root.findByProps({ "aria-label": "Explorer profile" }).props
      .searchable,
  ).not.toBe(true);
  expect(
    renderer!.root.findByProps({ "aria-label": "Explorer region" }).props
      .searchable,
  ).not.toBe(true);
  const toggle = renderer!.root
    .findAllByProps({ "aria-label": "Use regular expression" })
    .at(-1)!;
  expect(toggle.props["aria-pressed"]).toBe(false);
  await act(async () => toggle.props.onClick());
  expect(
    renderer!.root
      .findAllByProps({ "aria-label": "Use regular expression" })
      .at(-1)!.props["aria-pressed"],
  ).toBe(true);
});

it("selects mixed rows with modifiers, preserves a context batch and supplies every context action", async () => {
  const connection = createWorkspace().connections[0],
    onOpen = vi.fn(),
    onResourceAction = vi.fn();
  vi.stubGlobal("window", {
    explorer: {
      listGroups: async () => ({ items: [{ name: "/one" }, { name: "/two" }] }),
      listStreams: async () => ({
        items: [{ name: "stream-a" }, { name: "stream-b" }],
      }),
    },
  });
  await act(async () => {
    renderer = create(
      <ResourceSidebar
        connections={[connection]}
        activeConnectionId={connection.id}
        favorites={[]}
        recents={[]}
        onOpen={onOpen}
        onResourceAction={onResourceAction}
        onManage={() => {}}
      />,
    );
  });
  await act(async () =>
    renderer!.root.findByProps({ "aria-label": "Expand /one" }).props.onClick(),
  );
  const labels = () =>
    renderer!.root
      .findAllByProps({ className: "resource-label" })
      .filter((node) => node.type === "button");
  await act(async () => labels()[1].props.onClick({ ctrlKey: true }));
  await act(async () => labels()[3].props.onClick({ shiftKey: true }));
  await act(async () => labels()[1].props.onDoubleClick({ ctrlKey: true }));
  expect(onOpen).not.toHaveBeenCalled();
  expect(
    renderer!.root
      .findAllByProps({ role: "treeitem", "aria-selected": true })
      .map((row) => row.props["aria-label"]),
  ).toEqual(["stream-a", "stream-b", "/two"]);
  await act(async () =>
    renderer!.root
      .findByProps({ role: "treeitem", "aria-label": "stream-b" })
      .props.onContextMenu(),
  );
  const action = renderer!.root
    .findAll(
      (node) =>
        node.type === "div" &&
        node.props.children === "Open in new split tab" &&
        typeof node.props.onClick === "function",
    )
    .at(2)!;
  await act(async () => action.props.onClick());
  expect(onResourceAction).toHaveBeenLastCalledWith(
    {
      connectionId: connection.id,
      sources: [
        { logGroup: "/one", logStreams: ["stream-a", "stream-b"] },
        { logGroup: "/two" },
      ],
    },
    "new-split",
  );
  const streamLabel = labels()[1].parent!;
  expect(streamLabel.props.payload.sources).toHaveLength(2);
  await act(async () =>
    renderer!.root
      .findByProps({ role: "treeitem", "aria-label": "/one" })
      .props.onContextMenu(),
  );
  expect(
    renderer!.root
      .findAllByProps({ role: "treeitem", "aria-selected": true })
      .map((row) => row.props["aria-label"]),
  ).toEqual(["/one"]);
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
        onRemoveFavorite={() => {}}
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
    let ancestor = firstRow.parent!;
    while (!ancestor.props.onFocusCapture) ancestor = ancestor.parent!;
    ancestor.props.onFocusCapture();
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

it("leaves navigation inside a context menu with the menu instead of moving the resource tree", async () => {
  const connection = createWorkspace().connections[0];
  await act(async () => {
    renderer = create(
      <ResourceSidebar
        connections={[connection]}
        activeConnectionId={connection.id}
        favorites={[]}
        recents={[]}
        onOpen={() => {}}
        onManage={() => {}}
      />,
    );
  });
  const tree = renderer!.root.findByProps({ role: "tree" });
  const before = tree.props["aria-activedescendant"];
  await act(async () =>
    tree.props.onKeyDown({
      target: Object.assign(new FocusTarget(), {
        closest: () => ({ role: "menu" }),
      }),
      currentTarget: treeNode,
      key: "ArrowDown",
      preventDefault() {},
    }),
  );
  expect(
    renderer!.root.findByProps({ role: "tree" }).props["aria-activedescendant"],
  ).toBe(before);
});

it("keeps one resource context menu open and ignores a stale menu close", async () => {
  const connection = createWorkspace().connections[0];
  await act(async () => {
    renderer = create(
      <ResourceSidebar
        connections={[connection]}
        activeConnectionId={connection.id}
        favorites={[]}
        recents={[]}
        onOpen={() => {}}
        onManage={() => {}}
      />,
    );
  });
  const menus = () =>
    renderer!.root.findAll(
      (node) =>
        node.type === Menu &&
        node.props.position === "bottom-start" &&
        node.props.width === 240,
    );
  await act(async () =>
    renderer!.root
      .findByProps({ role: "treeitem", "aria-label": "/one" })
      .props.onContextMenu(),
  );
  expect(menus().map((menu) => menu.props.opened)).toEqual([true, false]);
  const prior = menus()[0];
  await act(async () =>
    renderer!.root
      .findByProps({ role: "treeitem", "aria-label": "/two" })
      .props.onContextMenu(),
  );
  expect(menus().map((menu) => menu.props.opened)).toEqual([false, true]);
  await act(async () => prior.props.onChange(false));
  expect(menus().map((menu) => menu.props.opened)).toEqual([false, true]);
});

it("stops the handled context key before document outside-key listeners can close its menu", async () => {
  const connection = createWorkspace().connections[0];
  await act(async () => {
    renderer = create(
      <ResourceSidebar
        connections={[connection]}
        activeConnectionId={connection.id}
        favorites={[]}
        recents={[]}
        onOpen={() => {}}
        onManage={() => {}}
      />,
    );
  });
  vi.stubGlobal("document", { getElementById: () => null });
  const stopPropagation = vi.fn();
  await act(async () =>
    renderer!.root.findByProps({ role: "tree" }).props.onKeyDown({
      key: "ContextMenu",
      preventDefault() {},
      stopPropagation,
    }),
  );
  expect(stopPropagation).toHaveBeenCalledOnce();
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
        onRemoveFavorite={() => {}}
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

it("opens and removes saved views while retaining preview behavior for recent sources", async () => {
  const state = restoreWorkspace({
    ...createWorkspace(),
    favorites: [
      { connectionId: "offline", logGroup: "/favorite", logStream: "stream" },
    ],
  });
  const recent = { connectionId: "offline", logGroup: "/recent" },
    onOpen = vi.fn(),
    onOpenFavorite = vi.fn(),
    onRemoveFavorite = vi.fn();
  await act(async () => {
    renderer = create(
      <ResourceSidebar
        connections={state.connections}
        activeConnectionId="offline"
        favorites={state.favorites}
        recents={[recent]}
        onOpen={onOpen}
        onOpenFavorite={onOpenFavorite}
        onRemoveFavorite={onRemoveFavorite}
        onManage={() => {}}
      />,
    );
  });
  const saved = renderer!.root.findByProps({
    "data-favorite-id": state.favorites[0].id,
  });
  await act(async () => saved.props.onClick());
  expect(onOpenFavorite).toHaveBeenCalledWith(state.favorites[0].id);
  expect(onOpen).not.toHaveBeenCalled();
  const remove = renderer!.root
    .findAll(
      (node) =>
        node.props.children === "Remove favorite" &&
        typeof node.props.onClick === "function",
    )
    .at(-1)!;
  await act(async () => remove.props.onClick());
  expect(onRemoveFavorite).toHaveBeenCalledWith(state.favorites[0].id);
  const button = renderer!.root.findByProps({ className: "quick-resource" });
  await act(async () => button.props.onClick());
  expect(onOpen).toHaveBeenLastCalledWith(
    "offline",
    [{ logGroup: "/recent", logStreams: undefined }],
    "preview",
  );
  await act(async () => button.props.onDoubleClick());
  expect(onOpen).toHaveBeenLastCalledWith(
    "offline",
    [{ logGroup: "/recent", logStreams: undefined }],
    "permanent",
  );
});

it("keeps favorites for legacy duplicate IDs while offering a single region and no extra tree levels", async () => {
  const connection = createWorkspace().connections[0],
    duplicate = { ...connection, id: "duplicate", name: "Second name" };
  const state = restoreWorkspace({
    ...createWorkspace(),
    connections: [connection, duplicate],
    favorites: [{ connectionId: duplicate.id, logGroup: "/saved" }],
  });
  const onOpenFavorite = vi.fn();
  await act(async () => {
    renderer = create(
      <ResourceSidebar
        connections={state.connections}
        activeConnectionId={connection.id}
        favorites={state.favorites}
        recents={[]}
        onOpen={() => {}}
        onOpenFavorite={onOpenFavorite}
        onManage={() => {}}
      />,
    );
  });
  expect(
    renderer!.root
      .findByProps({ "aria-label": "Explorer region" })
      .props.data.map((item: { value: string }) => item.value),
  ).toEqual([connection.id]);
  const favorite = renderer!.root.findByProps({
    "data-favorite-id": state.favorites[0].id,
  });
  await act(async () => favorite.props.onClick());
  expect(onOpenFavorite).toHaveBeenCalledWith(state.favorites[0].id);
  expect(state.favorites[0].connections[0].id).toBe(duplicate.id);
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
          onRemoveFavorite={() => {}}
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
      renderer!.root
        .findAllByProps({ "aria-label": "Match case" })
        .at(-1)!
        .props.onClick(),
    );
    await act(async () =>
      input.props.onChange({ currentTarget: { value: "orders" } }),
    );
    expect(listGroups).toHaveBeenCalledTimes(2);
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
