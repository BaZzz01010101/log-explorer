import { createElement, type ReactNode } from "react";
import {
  act,
  create,
  type ReactTestInstance,
  type ReactTestRenderer,
} from "react-test-renderer";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { ViewFavorites } from "../src/renderer/components/ViewFavorites";
import { Menu } from "../src/renderer/components/AppMenu";
import { createWorkspace } from "../src/renderer/workspace";

vi.mock("@mantine/core", () => {
  const component =
    (name: string) =>
    ({ children, ...props }: Record<string, unknown>) =>
      createElement(
        "div",
        { ...props, "data-control": name },
        children as ReactNode,
      );
  return {
    ...Object.fromEntries(
      ["Button", "Group", "Modal", "Text", "TextInput"].map((name) => [
        name,
        component(name),
      ]),
    ),
    Menu: Object.assign(component("Menu"), {
      ...Object.fromEntries(
        ["Target", "ContextMenu", "Dropdown", "Label", "Divider", "Item"].map(
          (name) => [name, component(`Menu${name}`)],
        ),
      ),
      Sub: Object.assign(component("MenuSub"), {
        Target: component("MenuSubTarget"),
        Item: component("MenuSubItem"),
        Dropdown: component("MenuSubDropdown"),
      }),
    }),
  };
});

let renderer: ReactTestRenderer | undefined;
let outside: EventTarget;
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  outside = new EventTarget();
  vi.stubGlobal("document", outside);
  vi.stubGlobal("window", new EventTarget());
  vi.stubGlobal("Element", class {});
  const original = console.error.bind(console);
  vi.spyOn(console, "error").mockImplementation((...args) => {
    if (!String(args[0]).includes("react-test-renderer is deprecated"))
      original(...args);
  });
});
afterEach(async () => {
  await act(async () => renderer?.unmount());
  renderer = undefined;
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function setup() {
  const workspace = createWorkspace();
  return {
    favorites: ["Orders view", "Media view"].map((title, index) => ({
      id: `favorite-${index}`,
      title,
      tabs: [structuredClone(workspace.tabs[0])],
      connections: structuredClone(workspace.connections),
      timezone: workspace.preferences.timezone,
    })),
    onOpen: vi.fn(),
    onRemove: vi.fn(),
    onRename: vi.fn(),
  };
}
const row = (id = "favorite-0") =>
  renderer!.root.findByProps({ "data-favorite-id": id });
const button = (name: string) =>
  renderer!.root.findByProps({ "aria-label": name });
const menuItem = (name: string, index = 0) =>
  renderer!.root.findAll(
    (node) =>
      node.type === "div" &&
      node.props["data-control"] === "MenuItem" &&
      node.children.includes(name),
  )[index];
const confirmation = () =>
  renderer!.root.findByProps({
    role: "group",
    "aria-label": "Delete favorite Orders view",
  });
const textButton = (name: string) =>
  confirmation()
    .findAllByType("button")
    .find((node) => node.children.includes(name))!;
async function click(node: ReactTestInstance) {
  const event = { preventDefault: vi.fn(), stopPropagation: vi.fn() };
  await act(async () => node.props.onClick(event));
  return event;
}

it("offers concise favorite actions, preserves whole-row opening and keeps rename in its modal", async () => {
  const props = setup();
  await act(async () => {
    renderer = create(<ViewFavorites {...props} />);
  });
  const items = renderer!.root.findAll(
    (node) => node.type === "div" && node.props["data-control"] === "MenuItem",
  );
  expect(items.map((node) => node.children)).toEqual([
    ["Open"],
    ["Rename"],
    ["Delete"],
    ["Open"],
    ["Rename"],
    ["Delete"],
  ]);
  await click(button("Orders view"));
  await click(menuItem("Open"));
  expect(props.onOpen.mock.calls).toEqual([["favorite-0"], ["favorite-0"]]);
  await click(menuItem("Rename"));
  const modal = renderer!.root.findAllByProps({ "data-control": "Modal" })[0];
  expect(modal.props.opened).toBe(true);
  const name = modal.findByProps({ label: "Favorite name" });
  await act(async () =>
    name.props.onChange({ currentTarget: { value: " Revised view " } }),
  );
  await act(async () =>
    modal.findByType("form").props.onSubmit({ preventDefault() {} }),
  );
  expect(props.onRename).toHaveBeenCalledExactlyOnceWith(
    "favorite-0",
    "Revised view",
  );
  expect(modal.props.opened).toBe(false);
  expect(props.onRemove).not.toHaveBeenCalled();
});

it("keeps context-menu deletion pending through outside clicks and mouseleave until Cancel", async () => {
  const props = setup();
  await act(async () => {
    renderer = create(<ViewFavorites {...props} />);
  });
  await act(async () =>
    renderer!.root.findAllByType(Menu)[0].props.onChange(true),
  );
  await click(menuItem("Delete"));
  expect(renderer!.root.findAllByType(Menu)[0].props.opened).toBe(false);
  expect(
    confirmation()
      .findAllByType("button")
      .map((node) => node.children),
  ).toEqual([["Delete"], ["Cancel"]]);
  expect(button("Orders view")).toBeDefined();
  expect(
    renderer!.root.findAllByProps({
      "aria-label": "Delete favorite Orders view",
      type: "button",
    }),
  ).toHaveLength(0);
  expect(props.onOpen).not.toHaveBeenCalled();
  expect(props.onRemove).not.toHaveBeenCalled();
  await act(async () => {
    outside.dispatchEvent(new Event("pointerdown"));
    outside.dispatchEvent(new Event("click"));
    row().props.onMouseLeave?.({});
  });
  await act(async () =>
    renderer!.update(
      <ViewFavorites {...props} favorites={[...props.favorites]} />,
    ),
  );
  expect(confirmation()).toBeDefined();
  expect(row().props["data-confirming-delete"]).toBe(true);
  const event = await click(textButton("Cancel"));
  expect(row().props["data-confirming-delete"]).toBeUndefined();
  expect(event.stopPropagation).toHaveBeenCalledOnce();
  expect(
    renderer!.root.findAllByProps({
      role: "group",
      "aria-label": "Delete favorite Orders view",
    }),
  ).toHaveLength(0);
  expect(button("Delete favorite Orders view")).toBeDefined();
  expect(props.onOpen).not.toHaveBeenCalled();
  expect(props.onRemove).not.toHaveBeenCalled();
});

it("uses the hover/focus trash to request confirmation and removes only after explicit Delete", async () => {
  const props = setup();
  await act(async () => {
    renderer = create(<ViewFavorites {...props} />);
  });
  const event = await click(button("Delete favorite Orders view"));
  expect(event.stopPropagation).toHaveBeenCalledOnce();
  expect(props.onOpen).not.toHaveBeenCalled();
  expect(props.onRemove).not.toHaveBeenCalled();
  expect(button("Orders view")).toBeDefined();
  await act(async () => {
    outside.dispatchEvent(new Event("click"));
  });
  expect(confirmation()).toBeDefined();
  const confirmEvent = await click(textButton("Delete"));
  expect(confirmEvent.stopPropagation).toHaveBeenCalledOnce();
  expect(props.onRemove).toHaveBeenCalledExactlyOnceWith("favorite-0");
  expect(props.onOpen).not.toHaveBeenCalled();
});

it("keeps favorite context menus exclusive while a row retains its inline confirmation", async () => {
  const props = setup();
  await act(async () => {
    renderer = create(<ViewFavorites {...props} />);
  });
  await act(async () =>
    renderer!.root.findAllByType(Menu)[0].props.onChange(true),
  );
  expect(
    renderer!.root.findAllByType(Menu).map((node) => node.props.opened),
  ).toEqual([true, false]);
  await click(menuItem("Delete"));
  await act(async () =>
    renderer!.root.findAllByType(Menu)[1].props.onChange(true),
  );
  expect(
    renderer!.root.findAllByType(Menu).map((node) => node.props.opened),
  ).toEqual([false, true]);
  expect(confirmation()).toBeDefined();
  expect(button("Orders view")).toBeDefined();
  expect(props.onOpen).not.toHaveBeenCalled();
  expect(props.onRemove).not.toHaveBeenCalled();
});
