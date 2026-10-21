import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { JsonTree } from "../src/renderer/components/EventMessage";
import { Menu } from "../src/renderer/components/AppMenu";
vi.mock("@mantine/core", async () => {
  const { createElement } = await import("react");
  const component = ({ children, ...props }: any) =>
    createElement("div", props, children);
  const item = ({ children, ...props }: any) =>
    createElement("button", { ...props, role: "menuitem" }, children);
  return {
    Menu: Object.assign(component, {
      Target: component,
      ContextMenu: component,
      Dropdown: component,
      Item: item,
      Label: component,
      Divider: component,
    }),
  };
});

let renderer: ReactTestRenderer;
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const original = console.error.bind(console);
  vi.spyOn(console, "error").mockImplementation((...args) => {
    if (!String(args[0]).startsWith("react-test-renderer is deprecated"))
      original(...args);
  });
});
afterEach(async () => {
  await act(async () => renderer?.unmount());
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
const button = (label: string) =>
  renderer.root
    .findAllByType("button")
    .find((node) => node.props["aria-label"] === label);
const openField = async (path: string) =>
  act(async () =>
    renderer.root
      .findByProps({ "data-json-path": path })
      .findByType(Menu)
      .props.onChange(true),
  );

it("unfolds nested structured values and folds the entire object", async () => {
  await act(async () => {
    renderer = create(
      <JsonTree value={{ request: { ids: [7, 8] } }} highlight="" controls />,
    );
  });
  expect(button("Unfold structured object")).toBeDefined();
  await act(async () => button("Unfold structured object")!.props.onClick());
  expect(button("Collapse /request/ids")).toBeDefined();
  expect(
    renderer.root.findAll((node) => node.props.className === "json-key"),
  ).toHaveLength(5);
  await act(async () => button("Fold structured object")!.props.onClick());
  expect(button("Expand root")).toBeDefined();
  expect(
    renderer.root.findAll((node) => node.props.className === "json-key"),
  ).toHaveLength(1);
});

it("adds the exact property value to filtering without losing JSON Pointer escaping", async () => {
  const filtered = vi.fn();
  await act(async () => {
    renderer = create(
      <JsonTree
        value={{ "a/b": { "~id": "needle", count: 7 } }}
        highlight=""
        onAddFilter={filtered}
      />,
    );
  });
  await act(async () => button("Expand /a~1b")!.props.onClick());
  await openField("/a~1b/~0id");
  expect(button("Add /a~1b/~0id to filter")).toBeDefined();
  await act(async () => button("Add /a~1b/~0id to filter")!.props.onClick());
  expect(filtered).toHaveBeenCalledExactlyOnceWith("/a~1b/~0id", "needle");
  await openField("/a~1b/count");
  await act(async () => button("Add /a~1b/count to filter")!.props.onClick());
  expect(filtered).toHaveBeenLastCalledWith("/a~1b/count", 7);
});

it("keeps existing column actions available beside filtering", async () => {
  const column = vi.fn();
  const filtered = vi.fn();
  await act(async () => {
    renderer = create(
      <JsonTree
        value={{ level: "INFO" }}
        highlight=""
        onAddFilter={filtered}
        onAddColumn={column}
      />,
    );
  });
  expect(button("Field actions for /level")).toBeDefined();
  await openField("/level");
  await act(async () => button("Add /level column")!.props.onClick());
  expect(column).toHaveBeenCalledExactlyOnceWith("/level");
  expect(filtered).not.toHaveBeenCalled();
});

it("uses one menu before each property and only permits bounded valid JSON values to deserialize", async () => {
  const deserialize = vi.fn();
  await act(async () => {
    renderer = create(
      <JsonTree
        value={{ encoded: '{"value":1}', bad: "{bad", number: 42 }}
        highlight=""
        onDeserialize={deserialize}
      />,
    );
  });
  expect(button("Field actions for /encoded")).toBeDefined();
  await openField("/bad");
  expect(button("Deserialize /bad")!.props.disabled).toBe(true);
  await openField("/number");
  expect(button("Deserialize /number")!.props.disabled).toBe(true);
  await openField("/encoded");
  expect(button("Deserialize /encoded")!.props.disabled).toBe(false);
  await act(async () => button("Deserialize /encoded")!.props.onClick());
  expect(deserialize).toHaveBeenCalledExactlyOnceWith("/encoded");
});
