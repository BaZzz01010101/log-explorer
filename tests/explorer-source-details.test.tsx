import {
  act,
  create,
  type ReactTestInstance,
  type ReactTestRenderer,
} from "react-test-renderer";
import type { ReactNode } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { ExplorerSidebar } from "../src/renderer/components/ExplorerSidebar";
import type { Connection, LogGroup } from "../src/shared/contracts";

// Keep Explorer's resource fetching, selection, keyboard handling and details real.
// Presentation and virtual row geometry do not require a browser for these checks.
vi.mock("@mantine/core", async () => {
  const { createElement } = await import("react");
  const component = ({ children, ...props }: Record<string, unknown>) =>
    createElement("div", props, children as ReactNode);
  const input = ({ rightSection, ...props }: Record<string, unknown>) =>
    createElement("div", props, rightSection as ReactNode);
  return {
    ActionIcon: component,
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
        index,
        size: 32,
        start: index * 32,
      })),
    getTotalSize: () => count * 32,
    scrollToIndex() {},
  }),
}));

const east: Connection = {
  id: "east",
  name: "East",
  profile: "test",
  region: "us-east-1",
  mode: "offline",
};
const west: Connection = { ...east, id: "west", region: "eu-west-1" };
const group: LogGroup = {
  name: "/aws/lambda/orders/full-untruncated-name",
  arn: "arn:aws:logs:us-east-1:123456789012:log-group:/aws/lambda/orders/full-untruncated-name:*",
  storedBytes: 5242880,
  retentionDays: 30,
  logClass: "STANDARD",
};
const second: LogGroup = { name: "/other", storedBytes: 0 };
const streamName = "2026/10/29/[$LATEST]full-stream-name";
let renderer: ReactTestRenderer | undefined;
const onOpen = vi.fn(),
  copy = vi.fn(),
  onResourceAction = vi.fn();
const props = {
  connections: [east, west],
  activeConnectionId: east.id,
  favorites: [],
  recents: [{ connectionId: east.id, logGroup: "/legacy-recent" }],
  onOpen,
  onResourceAction,
  onManage() {},
};
const textOf = (node: ReactTestInstance): string =>
  node.children
    .map((child) => (typeof child === "string" ? child : textOf(child)))
    .join("");
const details = () =>
  renderer!.root.findByProps({ "aria-label": "Current source details" });
const row = (name: string) =>
  renderer!.root.findByProps({ role: "treeitem", "aria-label": name });
const label = (name: string) =>
  row(name).findByProps({ className: "resource-label" });
const check = (name: string) =>
  renderer!.root.findByProps({
    type: "checkbox",
    "aria-label": `Select ${name}`,
  });
async function mount(
  overrides: Partial<Parameters<typeof ExplorerSidebar>[0]> = {},
) {
  await act(async () => {
    renderer = create(<ExplorerSidebar {...props} {...overrides} />);
  });
}

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal(
    "Element",
    class {
      closest() {
        return null;
      }
    },
  );
  vi.stubGlobal("window", {
    explorer: {
      listGroups: async () => ({ items: [group, second] }),
      listStreams: async () => ({
        items: [{ name: streamName, lastEventTime: 1793257200123 }],
      }),
      copy: copy.mockResolvedValue(undefined),
    },
  });
  const original = console.error.bind(console);
  vi.spyOn(console, "error").mockImplementation((...args) => {
    if (!String(args[0]).startsWith("react-test-renderer is deprecated"))
      original(...args);
  });
});
afterEach(async () => {
  await act(async () => renderer?.unmount());
  renderer = undefined;
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  onOpen.mockReset();
  copy.mockReset();
  onResourceAction.mockReset();
});

it("replaces recent sources with one current group and copyable full metadata without hover popups", async () => {
  await mount();
  expect(textOf(details())).toContain("Choose a log group or stream");
  expect(textOf(renderer!.root)).not.toContain("Recent sources");
  expect(textOf(renderer!.root)).not.toContain("/legacy-recent");
  expect(textOf(renderer!.root)).not.toContain("Arrow keys navigate");
  expect(
    renderer!.root.findByProps({ role: "tree" }).props["aria-describedby"],
  ).toBeUndefined();
  expect(details().props.style.height).toBe(220);
  await act(async () => label(group.name).props.onClick({}));
  expect(details().props.style.height).toBe(220);
  const pane = textOf(details());
  for (const value of [
    group.name,
    group.arn!,
    "test",
    "us-east-1",
    "30 days",
    "Standard",
    "5 MiB",
    "5,242,880 bytes",
  ])
    expect(pane).toContain(value);
  expect(onOpen).toHaveBeenLastCalledWith(
    "east",
    [{ logGroup: group.name }],
    "preview",
  );
  expect(label(group.name).props["data-tooltip"]).toBeUndefined();
  await act(async () =>
    details().findByProps({ "aria-label": "Copy ARN" }).props.onClick(),
  );
  expect(copy).toHaveBeenLastCalledWith(group.arn);
  expect(textOf(renderer!.root.findByProps({ role: "status" }))).toBe(
    "Resource copied",
  );
});

it("shows only the last interacted source while preserving multi-selection and action payloads", async () => {
  await mount();
  await act(async () => check(group.name).props.onClick({}));
  await act(async () => check(second.name).props.onClick({}));
  expect(check(group.name).props.checked).toBe(true);
  expect(check(second.name).props.checked).toBe(true);
  expect(textOf(details())).toContain(second.name);
  expect(textOf(details())).not.toContain(group.name);
  expect(textOf(details())).toContain("0 B");
  expect(textOf(details())).toContain("Not provided");
  await act(async () => row(group.name).props.onContextMenu());
  expect(textOf(details())).toContain(group.name);
  expect(check(second.name).props.checked).toBe(true);
  const open = renderer!.root.findAll(
    (node) =>
      node.props.children === "Open in new multi-source tab" &&
      typeof node.props.onClick === "function",
  )[0];
  await act(async () => open.props.onClick());
  expect(onResourceAction).toHaveBeenLastCalledWith(
    {
      connectionId: "east",
      sources: [{ logGroup: group.name }, { logGroup: second.name }],
    },
    "new-multisource",
  );
});

it("follows stream clicks and branch expansion with stream time and containing group metadata", async () => {
  await mount();
  await act(async () =>
    row(group.name)
      .findByProps({ "aria-label": `Expand ${group.name}` })
      .props.onClick(),
  );
  expect(textOf(details())).toContain(group.name);
  expect(onOpen).not.toHaveBeenCalled();
  await act(async () => label(streamName).props.onClick({}));
  const pane = textOf(details());
  expect(details().props.style.height).toBe(220);
  expect(pane).toContain(streamName);
  expect(pane).toContain(group.name);
  expect(pane).toContain("2026-10-29 07:00:00.123 UTC");
  expect(pane).toContain("30 days");
  expect(label(streamName).props["data-tooltip"]).toBeUndefined();
  await act(async () =>
    details().findByProps({ "aria-label": "Copy ARN" }).props.onClick(),
  );
  expect(copy).toHaveBeenLastCalledWith(
    "arn:aws:logs:us-east-1:123456789012:log-group:/aws/lambda/orders/full-untruncated-name:log-stream:" +
      streamName,
  );
  await act(async () =>
    row(group.name)
      .findByProps({ "aria-label": `Expand ${group.name}` })
      .props.onClick(),
  );
  expect(textOf(details())).not.toContain(streamName);
});

it("updates on keyboard navigation without changing the checked sources", async () => {
  await mount();
  await act(async () => check(group.name).props.onClick({}));
  const tree = renderer!.root.findByProps({ role: "tree" });
  await act(async () =>
    tree.props.onKeyDown({
      target: tree,
      currentTarget: tree,
      key: "ArrowDown",
      preventDefault() {},
    }),
  );
  expect(textOf(details())).toContain(second.name);
  expect(check(group.name).props.checked).toBe(true);
  expect(check(second.name).props.checked).toBe(false);
});

it("clears details after region changes and after a connection identity changes in place", async () => {
  await mount();
  await act(async () => label(group.name).props.onClick({}));
  await act(async () =>
    renderer!.root
      .findByProps({ "aria-label": "Explorer region" })
      .props.onChange("west"),
  );
  expect(textOf(details())).toContain("Choose a log group or stream");
  await act(async () => label(group.name).props.onClick({}));
  await act(async () =>
    renderer!.update(
      <ExplorerSidebar
        {...props}
        connections={[east, { ...west, profile: "another-profile" }]}
      />,
    ),
  );
  expect(textOf(details())).toContain("Choose a log group or stream");
});

it("keeps a collapsed pane collapsed as the current source changes", async () => {
  await mount();
  const toggle = () =>
    renderer!.root.findByProps({ "aria-label": "Toggle source details" });
  await act(async () => toggle().props.onClick());
  expect(toggle().props["aria-expanded"]).toBe(false);
  await act(async () => label(group.name).props.onClick({}));
  expect(toggle().props["aria-expanded"]).toBe(false);
  expect(
    details().findAllByProps({ className: "source-details-body" }),
  ).toHaveLength(0);
  await act(async () => toggle().props.onClick());
  expect(textOf(details())).toContain(group.name);
});

it("restores the saved details height and forwards committed changes for persistence", async () => {
  const onSourceDetailsHeightChange = vi.fn();
  await mount({
    preferences: { sourceDetailsHeight: 360 },
    onSourceDetailsHeightChange,
  });
  expect(details().props.style.height).toBe(360);
  await act(async () =>
    renderer!.root
      .findByProps({ "aria-label": "Resize source details" })
      .props.onKeyDown({
        key: "ArrowUp",
        preventDefault() {},
        stopPropagation() {},
      }),
  );
  expect(onSourceDetailsHeightChange).toHaveBeenLastCalledWith(380);
  await act(async () =>
    renderer!.update(
      <ExplorerSidebar
        {...props}
        preferences={{ sourceDetailsHeight: 380 }}
        onSourceDetailsHeightChange={onSourceDetailsHeightChange}
      />,
    ),
  );
  await act(async () => label(group.name).props.onClick({}));
  expect(details().props.style.height).toBe(380);
});
