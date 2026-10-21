import { act, create, type ReactTestRenderer } from "react-test-renderer";
import type { ReactNode } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { ResourceSidebar } from "../src/renderer/components/ResourceSidebar";
import { createWorkspace } from "../src/renderer/workspace";

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
    scrollToIndex() {},
  }),
}));

class Tree extends EventTarget {
  clientHeight = 320;
  scrollHeight = 0;
  scrollTop = 0;
  firstElementChild = null;
}
let renderer: ReactTestRenderer | undefined;
let tree: Tree;
const listGroups = vi.fn();
const listStreams = vi.fn();
beforeEach(() => {
  tree = new Tree();
  listGroups.mockReset();
  listStreams.mockReset();
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("window", { explorer: { listGroups, listStreams } });
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
async function mount(connection = createWorkspace().connections[0]) {
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
          (props as { role?: string }).role === "tree" ? tree : null,
      },
    );
  });
}

it("fills short group lists automatically and removes the normal pagination button", async () => {
  listGroups
    .mockResolvedValueOnce({ items: [{ name: "/one" }], cursor: "groups-2" })
    .mockResolvedValueOnce({ items: [{ name: "/two" }] });
  await mount();
  expect(listGroups).toHaveBeenCalledTimes(2);
  expect(listGroups.mock.calls[1][2]).toBe("groups-2");
  expect(
    renderer!.root.findAllByProps({ role: "treeitem", "aria-level": 1 }),
  ).toHaveLength(2);
  expect(
    renderer!.root.findAll(
      (node) => node.props.children === "Load more groups",
    ),
  ).toHaveLength(0);
});

it("waits for the group list bottom before requesting another page", async () => {
  listGroups
    .mockResolvedValueOnce({
      items: Array.from({ length: 30 }, (_, index) => ({
        name: `/group-${index}`,
      })),
      cursor: "groups-2",
    })
    .mockResolvedValueOnce({ items: [{ name: "/last" }] });
  await mount();
  expect(listGroups).toHaveBeenCalledTimes(1);
  tree.scrollTop = 800;
  await act(async () => {
    tree.dispatchEvent(new Event("scroll"));
  });
  expect(listGroups).toHaveBeenCalledTimes(2);
});

it("automatically loads stream pages once their expanded sentinel is reached", async () => {
  listGroups.mockResolvedValue({ items: [{ name: "/one" }] });
  listStreams
    .mockResolvedValueOnce({ items: [{ name: "first" }], cursor: "streams-2" })
    .mockResolvedValueOnce({ items: [{ name: "second" }] });
  await mount();
  await act(async () =>
    renderer!.root.findByProps({ "aria-label": "Expand /one" }).props.onClick(),
  );
  expect(listStreams).toHaveBeenCalledTimes(2);
  expect(listStreams.mock.calls[1][3]).toBe("streams-2");
  expect(
    renderer!.root.findAll(
      (node) => node.props.children === "Load more streams",
    ),
  ).toHaveLength(0);
});

it("does not repeat a cursor when the service returns it unchanged", async () => {
  listGroups.mockResolvedValue({ items: [{ name: "/one" }], cursor: "same" });
  await mount();
  await act(async () => {
    tree.dispatchEvent(new Event("scroll"));
    tree.dispatchEvent(new Event("scroll"));
  });
  expect(listGroups).toHaveBeenCalledTimes(2);
});

it("reloads an expanded group's streams after refreshing its region", async () => {
  listGroups.mockResolvedValue({ items: [{ name: "/one" }] });
  listStreams
    .mockResolvedValueOnce({ items: [{ name: "before-refresh" }] })
    .mockResolvedValueOnce({ items: [{ name: "after-refresh" }] });
  await mount();
  await act(async () =>
    renderer!.root.findByProps({ "aria-label": "Expand /one" }).props.onClick(),
  );
  expect(listStreams).toHaveBeenCalledTimes(1);
  await act(async () =>
    renderer!.root
      .findByProps({ "aria-label": "Refresh resources" })
      .props.onClick(),
  );
  expect(listStreams).toHaveBeenCalledTimes(2);
  expect(
    renderer!.root.findAllByProps({ title: "after-refresh" }),
  ).not.toHaveLength(0);
});

it("refreshes ordinary AWS group names that also match object prototype keys", async () => {
  listGroups.mockResolvedValue({ items: [{ name: "constructor" }] });
  listStreams.mockResolvedValue({ items: [{ name: "stream" }] });
  await mount();
  await act(async () =>
    renderer!.root
      .findByProps({ "aria-label": "Expand constructor" })
      .props.onClick(),
  );
  await act(async () =>
    renderer!.root
      .findByProps({ "aria-label": "Refresh resources" })
      .props.onClick(),
  );
  expect(listStreams).toHaveBeenCalledTimes(2);
});

it("supports a restored connection ID that matches an object prototype key", async () => {
  listGroups.mockResolvedValue({ items: [{ name: "/one" }] });
  await mount({ ...createWorkspace().connections[0], id: "constructor" });
  expect(
    renderer!.root.findAllByProps({ "data-node-kind": "group" }),
  ).toHaveLength(1);
});

it("guards overlapping refreshes before React can commit loading state", async () => {
  let resolve: (page: unknown) => void = () => {};
  listGroups.mockImplementation(
    () =>
      new Promise((done) => {
        resolve = done;
      }),
  );
  await mount();
  const refresh = renderer!.root.findByProps({
    "aria-label": "Refresh resources",
  });
  await act(async () => {
    refresh.props.onClick();
    refresh.props.onClick();
  });
  expect(listGroups).toHaveBeenCalledTimes(1);
  await act(async () => resolve({ items: [{ name: "/one" }] }));
});

it("preserves loaded streams and retries a failed continuation without restarting the list", async () => {
  listGroups.mockResolvedValue({ items: [{ name: "/one" }] });
  listStreams
    .mockResolvedValueOnce({ items: [{ name: "first" }], cursor: "next" })
    .mockRejectedValueOnce(new Error("temporary failure"))
    .mockResolvedValueOnce({ items: [{ name: "second" }] });
  await mount();
  await act(async () =>
    renderer!.root.findByProps({ "aria-label": "Expand /one" }).props.onClick(),
  );
  expect(listStreams).toHaveBeenCalledTimes(2);
  expect(renderer!.root.findAllByProps({ title: "first" })).not.toHaveLength(0);
  const retry = renderer!.root.findAll(
    (node) =>
      node.type === "button" &&
      node.props["data-tooltip"] === "temporary failure",
  )[0];
  await act(async () => retry.props.onClick());
  expect(listStreams).toHaveBeenCalledTimes(3);
  expect(listStreams.mock.calls[2][3]).toBe("next");
  expect(renderer!.root.findAllByProps({ title: "first" })).not.toHaveLength(0);
  expect(renderer!.root.findAllByProps({ title: "second" })).not.toHaveLength(
    0,
  );
});

it("discards an old connection's pending page and never feeds its cursor to the new connection", async () => {
  const connection = createWorkspace().connections[0];
  const second = {
    ...connection,
    id: "second",
    name: "Second",
    region: "us-east-1",
  };
  let oldPage: (page: unknown) => void = () => {};
  listGroups.mockImplementation(
    async (selected: { id: string }, _search: string, cursor?: string) => {
      if (selected.id === second.id) return { items: [{ name: "/new" }] };
      if (cursor)
        return new Promise((done) => {
          oldPage = done;
        });
      return { items: [{ name: "/old" }], cursor: "old-next" };
    },
  );
  await act(async () => {
    renderer = create(
      <ResourceSidebar
        connections={[connection, second]}
        activeConnectionId={connection.id}
        favorites={[]}
        recents={[]}
        onOpen={() => {}}
        onRemoveFavorite={() => {}}
        onManage={() => {}}
      />,
      {
        createNodeMock: ({ props }) =>
          (props as { role?: string }).role === "tree" ? tree : null,
      },
    );
  });
  expect(listGroups).toHaveBeenCalledTimes(2);
  await act(async () =>
    renderer!.root
      .findByProps({ "aria-label": "Explorer region" })
      .props.onChange(second.id),
  );
  expect(listGroups).toHaveBeenCalledTimes(3);
  expect(listGroups.mock.calls[2][0].id).toBe(second.id);
  expect(listGroups.mock.calls[2][2]).toBeUndefined();
  await act(async () =>
    oldPage({ items: [{ name: "/stale" }], cursor: "wrong" }),
  );
  expect(renderer!.root.findAllByProps({ "aria-label": "/new" })).toHaveLength(
    1,
  );
  expect(
    renderer!.root.findAllByProps({ "aria-label": "/stale" }),
  ).toHaveLength(0);
  expect(listGroups).toHaveBeenCalledTimes(3);
});
