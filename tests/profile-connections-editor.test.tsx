import { createElement, useState, type ReactNode } from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { ProfileConnectionsEditor } from "../src/renderer/components/ProfileConnectionsEditor";
import { createWorkspace } from "../src/renderer/workspace";
import type { Connection } from "../src/shared/contracts";
vi.mock("@mantine/core", () => {
  const component = ({ children, ...props }: Record<string, unknown>) =>
    createElement("div", props, children as ReactNode);
  return Object.fromEntries(
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
    ].map((name) => [name, component]),
  );
});
let renderer: ReactTestRenderer;
let saved: Connection[];
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
    (node) => node.type === "div" && node.props["aria-label"] === label,
  )[0];
const cards = () =>
  renderer.root.findAll(
    (node) =>
      node.type === "div" && typeof node.props["data-profile"] === "string",
  );
beforeEach(() => {
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
  await act(async () =>
    control("Known profile to add").props.onChange(profile),
  );
  await act(async () => control("Add profile").props.onClick());
}
async function addRegion(profile: string, region: string) {
  await act(async () =>
    control(`Add region for ${profile}`).props.onChange(region),
  );
  await act(async () =>
    control(`Confirm add region for ${profile}`).props.onClick(),
  );
}
it("shows known profiles only in the add picker and persists a profile before adding a region", async () => {
  await act(async () => {
    renderer = create(
      <Editor connections={[]} known={["production", "development"]} />,
    );
  });
  expect(cards()).toHaveLength(0);
  expect(control("Known profile to add").props.data).toHaveLength(2);
  await addProfile("production");
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
  expect(
    control("Add region for constructor").props.data.some(
      (item: { value: string }) => item.value === "eu-west-1",
    ),
  ).toBe(false);
  await addRegion("constructor", "us-east-1");
  expect(saved.filter((item) => item.enabled !== false)).toHaveLength(2);
});
