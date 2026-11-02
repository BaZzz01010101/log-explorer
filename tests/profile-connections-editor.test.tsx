import { createElement, useState, type ReactNode } from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { ProfileConnectionsEditor } from "../src/renderer/components/ProfileConnectionsEditor";
import { createWorkspace } from "../src/renderer/workspace";
import type { Connection } from "../src/shared/contracts";
import { AWS_REGIONS } from "../src/shared/aws-regions";
import { MENU_OPEN_EVENT } from "../src/renderer/components/AppMenu";
vi.mock("@mantine/core", () => {
  const component = ({ children, ...props }: Record<string, unknown>) =>
    createElement("div", props, children as ReactNode);
  const Menu = Object.assign(
    ({ children, opened }: { children: ReactNode; opened: boolean }) =>
      createElement("section", { "data-menu-open": opened }, children),
    {
      Target: ({ children }: { children: ReactNode }) => children,
      ContextMenu: ({ children }: { children: ReactNode }) => children,
      Dropdown: component,
      Item: component,
      Label: component,
      Divider: component,
      Sub: Object.assign(component, {
        Target: component,
        Item: component,
        Dropdown: component,
      }),
    },
  );
  return {
    ...Object.fromEntries(
      [
        "ActionIcon",
        "Alert",
        "Badge",
        "Button",
        "Checkbox",
        "Group",
        "Paper",
        "Select",
        "Stack",
        "Switch",
        "Text",
        "TextInput",
        "Tooltip",
      ].map((name) => [name, component]),
    ),
    Menu,
  };
});
let renderer: ReactTestRenderer;
let saved: Connection[];
let documentEvents: EventTarget;
let windowEvents: EventTarget;
class PickerElement {
  constructor(private readonly owner: string | null) {}
  closest() {
    return this;
  }
  getAttribute() {
    return this.owner;
  }
  hasAttribute() {
    return false;
  }
}
function Editor({
  connections,
  known = [],
}: {
  connections: Connection[];
  known?: string[];
}) {
  const [items, setItems] = useState(connections);
  const [visibility, setVisibility] = useState<Record<string, boolean>>({});
  saved = items;
  return (
    <ProfileConnectionsEditor
      connections={items}
      preferences={{
        ...createWorkspace().preferences,
        profileVisibility: visibility,
      }}
      knownProfiles={known}
      discoveryEnabled={false}
      onConnections={setItems}
      onVisibility={setVisibility}
    />
  );
}
const control = (label: string) =>
  renderer.root.findAll(
    (node) =>
      typeof node.type === "string" && node.props["aria-label"] === label,
  )[0];
const options = () =>
  renderer.root.findAll(
    (node) => node.type === "button" && node.props.role === "option",
  );
const choice = (value: string) =>
  options().find((node) => node.props["data-add-value"] === value)!;
const openPicker = async (label: string) =>
  act(async () => control(label).props.onClick());
const filter = async (label: string, value: string) =>
  act(async () => control(label).props.onChange({ currentTarget: { value } }));
const key = async (label: string, value: string) => {
  const event = {
    key: value,
    preventDefault: vi.fn(),
    stopPropagation: vi.fn(),
    nativeEvent: { isComposing: false },
  };
  await act(async () => control(label).props.onKeyDown(event));
  return event;
};
const cards = () =>
  renderer.root.findAll(
    (node) =>
      node.type === "div" && typeof node.props["data-profile"] === "string",
  );
beforeEach(() => {
  documentEvents = new EventTarget();
  windowEvents = new EventTarget();
  vi.stubGlobal("document", documentEvents);
  vi.stubGlobal("window", windowEvents);
  vi.stubGlobal("Element", PickerElement);
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const original = console.error.bind(console);
  vi.spyOn(console, "error").mockImplementation((...args) => {
    if (!String(args[0]).includes("react-test-renderer is deprecated"))
      original(...args);
  });
});
afterEach(async () => {
  await act(async () => renderer?.unmount());
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
async function addProfile(profile: string) {
  await openPicker("Add profile");
  await act(async () => choice(profile).props.onClick());
}
async function addRegion(profile: string, region: string) {
  await openPicker(`Add region for ${profile}`);
  await act(async () => choice(region).props.onClick());
}
it("shows known profiles only in the add picker and persists a profile before adding a region", async () => {
  await act(async () => {
    renderer = create(
      <Editor connections={[]} known={["production", "development"]} />,
    );
  });
  expect(cards()).toHaveLength(0);
  await openPicker("Add profile");
  expect(options()).toHaveLength(2);
  await act(async () => choice("production").props.onClick());
  expect(cards().map((card) => card.props["data-profile"])).toEqual([
    "production",
  ]);
  expect(saved).toEqual([]);
  await addRegion("production", "eu-west-1");
  expect(saved).toEqual([
    expect.objectContaining({
      mode: "aws",
      profile: "production",
      region: "eu-west-1",
      enabled: true,
    }),
  ]);
  const id = saved[0].id;
  await act(async () =>
    control("Remove production region eu-west-1").props.onClick(),
  );
  expect(saved[0].enabled).toBe(false);
  await addRegion("production", "eu-west-1");
  expect(saved).toHaveLength(1);
  expect(saved[0].id).toBe(id);
});
it("removes and re-adds a configured profile without deleting its custom regions or connection IDs", async () => {
  const connection = {
    ...createWorkspace().connections[0],
    mode: "aws" as const,
    profile: "production",
    region: "custom-region-1",
  };
  await act(async () => {
    renderer = create(
      <Editor connections={[connection]} known={["unadded"]} />,
    );
  });
  expect(cards()).toHaveLength(1);
  expect(control("Remove production region custom-region-1")).toBeDefined();
  await act(async () => control("Remove profile production").props.onClick());
  expect(cards()).toHaveLength(0);
  expect(saved).toEqual([connection]);
  await addProfile("production");
  expect(cards()).toHaveLength(1);
  expect(control("Remove production region custom-region-1")).toBeDefined();
  expect(saved[0].id).toBe(connection.id);
});
it("edits regions for profiles named like object properties and excludes selected choices from the picker", async () => {
  const connection = {
    ...createWorkspace().connections[0],
    mode: "aws" as const,
    profile: "constructor",
  };
  await act(async () => {
    renderer = create(<Editor connections={[connection]} />);
  });
  await openPicker("Add region for constructor");
  expect(choice("eu-west-1")).toBeUndefined();
  await act(async () => choice("us-east-1").props.onClick());
  expect(saved.filter((item) => item.enabled !== false)).toHaveLength(2);
});
it("filters profiles without case sensitivity and adds the keyboard selection immediately", async () => {
  await act(async () => {
    renderer = create(
      <Editor
        connections={[]}
        known={["production", "Production-admin", "development"]}
      />,
    );
  });
  await openPicker("Add profile");
  expect(control("Search profiles").props["data-autofocus"]).toBe(true);
  await filter("Search profiles", "PROD");
  expect(options().map((node) => node.props["data-add-value"])).toEqual([
    "production",
    "Production-admin",
  ]);
  await key("Search profiles", "ArrowDown");
  const enter = await key("Search profiles", "Enter");
  expect(enter.preventDefault).toHaveBeenCalledOnce();
  expect(cards().map((node) => node.props["data-profile"])).toEqual([
    "Production-admin",
  ]);
  expect(saved).toEqual([]);
  expect(control("Add profile").props["aria-expanded"]).toBe(false);
});
it("filters regions by name and ID and adds the highlighted result without confirmation", async () => {
  const connection = {
    ...createWorkspace().connections[0],
    mode: "aws" as const,
    profile: "production",
  };
  await act(async () => {
    renderer = create(<Editor connections={[connection]} />);
  });
  await openPicker("Add region for production");
  await filter("Search regions for production", "N. VIRGINIA");
  expect(options().map((node) => node.props["data-add-value"])).toEqual([
    "us-east-1",
  ]);
  await filter("Search regions for production", "US-EAST-1");
  await key("Search regions for production", "Enter");
  expect(saved.map((item) => item.region)).toEqual(["eu-west-1", "us-east-1"]);
  expect(control("Add region for production").props["aria-expanded"]).toBe(
    false,
  );
});
it("keeps empty profile and region pickers enabled and allows searching without adding anything", async () => {
  await act(async () => {
    renderer = create(<Editor connections={[]} />);
  });
  expect(control("Add profile").props.disabled).not.toBe(true);
  await openPicker("Add profile");
  expect(control("Search profiles")).toBeDefined();
  expect(options()).toHaveLength(0);
  await key("Search profiles", "Enter");
  expect(cards()).toHaveLength(0);
  expect(control("Add profile").props["aria-expanded"]).toBe(true);
  await key("Search profiles", "Escape");
  expect(control("Add profile").props["aria-expanded"]).toBe(false);
  await act(async () => {
    renderer.update(<Editor connections={[]} known={["production"]} />);
  });
  await addProfile("production");
  expect(control("Add region for production").props.disabled).not.toBe(true);
  await openPicker("Add region for production");
  await filter("Search regions for production", "no-such-region");
  expect(options()).toHaveLength(0);
  expect(
    renderer.root.findAllByProps({ role: "status" })[0].props.children,
  ).toContain("No regions match");
  await key("Search regions for production", "ArrowUp");
  await key("Search regions for production", "Enter");
  expect(saved).toEqual([]);
});
it("opens an enabled region picker when every known region is already configured", async () => {
  const base = createWorkspace().connections[0];
  const connections = AWS_REGIONS.map((region) => ({
    ...base,
    id: `saved-${region.id}`,
    mode: "aws" as const,
    profile: "production",
    region: region.id,
  }));
  await act(async () => {
    renderer = create(<Editor connections={connections} />);
  });
  expect(control("Add region for production").props.disabled).not.toBe(true);
  await openPicker("Add region for production");
  expect(options()).toHaveLength(0);
  expect(
    renderer.root.findAllByProps({ role: "status" })[0].props.children,
  ).toContain("All known regions");
  await key("Search regions for production", "Enter");
  expect(saved).toEqual(connections);
});
it("keeps only one picker open and dismisses it outside or when another app menu opens", async () => {
  const connection = {
    ...createWorkspace().connections[0],
    mode: "aws" as const,
    profile: "production",
  };
  await act(async () => {
    renderer = create(
      <Editor connections={[connection]} known={["development"]} />,
    );
  });
  await openPicker("Add profile");
  await openPicker("Add region for production");
  expect(control("Add profile").props["aria-expanded"]).toBe(false);
  expect(control("Add region for production").props["aria-expanded"]).toBe(
    true,
  );
  const inside = new Event("pointerdown");
  Object.defineProperty(inside, "target", {
    value: new PickerElement(
      control("Add region for production").props["data-app-menu-id"],
    ),
  });
  await act(async () => {
    documentEvents.dispatchEvent(inside);
  });
  expect(control("Add region for production").props["aria-expanded"]).toBe(
    true,
  );
  await act(async () => {
    documentEvents.dispatchEvent(new Event("pointerdown"));
  });
  expect(control("Add region for production").props["aria-expanded"]).toBe(
    false,
  );
  await openPicker("Add profile");
  await filter("Search profiles", "development");
  await act(async () => {
    windowEvents.dispatchEvent(
      new CustomEvent(MENU_OPEN_EVENT, { detail: "other-menu" }),
    );
  });
  expect(control("Add profile").props["aria-expanded"]).toBe(false);
  await openPicker("Add profile");
  expect(control("Search profiles").props.value).toBe("");
});
