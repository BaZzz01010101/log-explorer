import { createElement, useState, type ReactNode } from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { HighlightTreeEditor } from "../src/renderer/components/HighlightTreeEditor";
import { createWorkspace } from "../src/renderer/workspace";
import type { HighlightProfile } from "../src/shared/highlights";

vi.mock("@mantine/core", () => {
  const component =
    (tag: string) =>
    ({ children, label, ...props }: any) =>
      createElement(
        tag,
        { "aria-label": label, ...props },
        children as ReactNode,
      );
  return Object.fromEntries(
    Object.entries({
      ActionIcon: "button",
      Button: "button",
      TextInput: "input",
      ColorInput: "input",
      Select: "select",
      Switch: "input",
      Text: "div",
      Group: "div",
      Stack: "div",
      Modal: "dialog",
    }).map(([name, tag]) => [name, component(tag)]),
  );
});
vi.mock("../src/renderer/components/AppMenu", () => {
  const wrapper = ({ children }: { children: ReactNode }) => children;
  return {
    Menu: Object.assign(wrapper, {
      ContextMenu: wrapper,
      Dropdown: wrapper,
      Divider: () => null,
      Item: ({ children, ...props }: any) =>
        createElement("button", props, children),
    }),
  };
});
vi.mock("../src/renderer/components/HighlightEventsPreview", () => ({
  HighlightEventsPreview: () => null,
}));
vi.mock("../src/renderer/components/HighlightPaneDivider", () => ({
  HighlightPaneDivider: () => null,
}));
vi.mock("@dnd-kit/core", () => ({
  DndContext: ({ children, ...props }: any) =>
    createElement("dnd-context", props, children),
  KeyboardSensor: class {},
  PointerSensor: class {},
  useSensor: vi.fn(),
  useSensors: vi.fn(),
  pointerWithin: vi.fn(),
  closestCenter: vi.fn(),
}));
vi.mock("@dnd-kit/sortable", () => ({
  SortableContext: ({ children }: { children: ReactNode }) => children,
  verticalListSortingStrategy: "vertical",
  arrayMove: (items: unknown[], from: number, to: number) => {
    const copy = [...items];
    copy.splice(to, 0, copy.splice(from, 1)[0]);
    return copy;
  },
  useSortable: () => ({
    attributes: {},
    listeners: {},
    setNodeRef: vi.fn(),
    setActivatorNodeRef: vi.fn(),
  }),
}));

const base = createWorkspace().preferences;
const fixture = (): HighlightProfile[] =>
  ["Alpha", "Beta"].map((name) => ({
    id: name,
    name,
    enabled: name === "Alpha",
    groupPattern: "",
    groupIgnoreCase: false,
    rules: [1, 2].map((n) => ({
      id: `${name}-${n}`,
      enabled: n === 1,
      scope: "text",
      path: "",
      pattern: `ERROR${n}`,
      ignoreCase: false,
      target: "row",
      colors: { background: "#713f12" },
      separateThemeColors: false,
    })),
  }));
let renderer: ReactTestRenderer, current: HighlightProfile[], changes: number;
function Host() {
  const [profiles, setProfiles] = useState(fixture);
  current = profiles;
  return (
    <HighlightTreeEditor
      preferences={{ ...base, highlightProfiles: profiles }}
      onChange={(next) => {
        changes++;
        // Preferences are schema-normalized in the app, recreating object refs.
        setProfiles(structuredClone(next));
      }}
      previewEnabled={false}
    />
  );
}
const control = (label: string) =>
  renderer.root.findAll(
    (node) =>
      typeof node.type === "string" && node.props["aria-label"] === label,
  )[0];
const click = (label: string) =>
  act(async () => control(label).props.onClick());
const confirm = (label: string, choice: "Delete" | "Cancel") =>
  act(async () =>
    control(label)
      .findAll(
        (node) => node.type === "button" && node.props.children === choice,
      )[0]
      .props.onClick({ stopPropagation: vi.fn() }),
  );
const type = (label: string, value: string) =>
  act(async () => control(label).props.onChange({ currentTarget: { value } }));
beforeEach(async () => {
  changes = 0;
  vi.stubGlobal("requestAnimationFrame", () => 1);
  vi.stubGlobal("cancelAnimationFrame", () => {});
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.spyOn(console, "error").mockImplementation(() => {});
  await act(async () => {
    renderer = create(<Host />);
  });
});
afterEach(async () => {
  await act(async () => renderer.unmount());
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

it("applies valid profile and rule fields immediately without Save while retaining invalid input locally", async () => {
  await type("Profile name", "Renamed");
  expect(current[0].name).toBe("Renamed");
  await type("Log group regex", "[");
  expect(control("Log group regex").props.value).toBe("[");
  expect(current[0].groupPattern).toBe("");
  await type("Log group regex", "orders$");
  expect(current[0].groupPattern).toBe("orders$");
  await click("Select rule ERROR1");
  await type("Match regex", "WARN");
  expect(current[0].rules[0].pattern).toBe("WARN");
  expect(
    renderer.root.findAll(
      (node) =>
        node.type === "button" && /^Save/.test(node.props["aria-label"] ?? ""),
    ),
  ).toHaveLength(0);
});

it("marks disabled profiles and rules gray without tree checkboxes", async () => {
  expect(control("Select profile Beta").props["data-disabled"]).toBe(true);
  expect(control("Select rule ERROR2").props["data-disabled"]).toBe(true);
  expect(control("Select rule ERROR1").props["data-disabled"]).toBe(false);
  expect(
    renderer.root.findAll(
      (node) => node.type === "input" && node.props.type === "checkbox",
    ),
  ).toHaveLength(0);
});

it("offers profile and rule additions at the proper context and reorders only siblings", async () => {
  const profile = control("Select profile Alpha").parent!.parent!;
  expect(
    profile.findAll(
      (node) => node.type === "button" && node.props.children === "Add profile",
    ),
  ).toHaveLength(1);
  await click("Move profile Alpha down");
  expect(current.map((p) => p.id)).toEqual(["Beta", "Alpha"]);
  await click("Move rule ERROR1 down");
  expect(current[1].rules.map((r) => r.id)).toEqual(["Alpha-2", "Alpha-1"]);
  await click("Add rule to Alpha");
  expect(current[1].rules).toHaveLength(3);
  expect(control("Match regex").props.readOnly).toBe(false);
  expect(changes).toBe(3);
});

it("confirms profile deletion inline and leaves items intact on Cancel", async () => {
  await click("Delete profile Alpha");
  const row = control("Select profile Alpha");
  expect(row.props["data-confirming-delete"]).toBe(true);
  const confirmation = control("Delete highlight profile Alpha");
  expect(confirmation.props.role).toBe("group");
  expect(
    confirmation.findAllByType("button").map((node) => node.props.children),
  ).toEqual(["Delete", "Cancel"]);
  expect(renderer.root.findAllByType("dialog")).toHaveLength(0);
  expect(current).toHaveLength(2);
  await confirm("Delete highlight profile Alpha", "Cancel");
  expect(current).toHaveLength(2);
  expect(
    control("Select profile Alpha").props["data-confirming-delete"],
  ).toBeUndefined();
  await click("Delete profile Alpha");
  await confirm("Delete highlight profile Alpha", "Delete");
  expect(current.map((p) => p.name)).toEqual(["Beta"]);
  expect(control("Profile name").props.value).toBe("Beta");
});

it("deletes only the chosen rule and selects its surviving neighbor", async () => {
  await click("Select rule ERROR1");
  await click("Delete rule ERROR1");
  await confirm("Delete highlight rule ERROR1", "Delete");
  expect(current[0].rules.map((r) => r.id)).toEqual(["Alpha-2"]);
  expect(current[1].rules).toHaveLength(2);
  expect(control("Match regex").props.value).toBe("ERROR2");
});

it("keeps each confirmation attached to its item while selection and sibling order change", async () => {
  await click("Delete rule ERROR1");
  await click("Delete profile Beta");
  await click("Select rule ERROR2");
  await click("Move profile Alpha down");
  expect(control("Select rule ERROR1").props["data-confirming-delete"]).toBe(
    true,
  );
  expect(control("Select profile Beta").props["data-confirming-delete"]).toBe(
    true,
  );
  await confirm("Delete highlight rule ERROR1", "Cancel");
  expect(control("Select profile Beta").props["data-confirming-delete"]).toBe(
    true,
  );
  await confirm("Delete highlight profile Beta", "Delete");
  expect(current.map((profile) => profile.id)).toEqual(["Alpha"]);
  expect(current[0].rules).toHaveLength(2);
  expect(control("Match regex").props.value).toBe("ERROR2");
});

it("drag reorders profiles with their rules and keeps the selected rule editor unchanged", async () => {
  await click("Select rule ERROR1");
  await type("Match regex", "[");
  const context = renderer.root
    .findAllByType("dnd-context" as any)
    .find((node) => node.props.id === "highlight-tree-profiles");
  expect(context, "profile items must support dragging").toBeDefined();
  await act(async () => context!.props.onDragStart());
  expect(current.map((p) => p.id)).toEqual(["Alpha", "Beta"]);
  await act(async () =>
    context!.props.onDragEnd({ active: { id: "Alpha" }, over: { id: "Beta" } }),
  );
  expect(current.map((p) => p.id)).toEqual(["Beta", "Alpha"]);
  expect(current[1].rules.map((r) => r.id)).toEqual(["Alpha-1", "Alpha-2"]);
  expect(control("Match regex").props.value).toBe("[");
  expect(changes).toBe(1);
});

it("drag reorders sibling rules, ignores foreign targets and leaves canceled drags unapplied", async () => {
  const context = renderer.root
    .findAllByType("dnd-context" as any)
    .find((node) => node.props.id === "highlight-tree-rules:Alpha");
  expect(context, "rule items must support dragging").toBeDefined();
  await act(async () => context!.props.onDragStart());
  await act(async () => context!.props.onDragCancel());
  expect(changes).toBe(0);
  await act(async () =>
    context!.props.onDragEnd({
      active: { id: "Alpha-1" },
      over: { id: "Beta-2" },
    }),
  );
  expect(changes).toBe(0);
  await act(async () =>
    context!.props.onDragEnd({
      active: { id: "Alpha-1" },
      over: { id: "Alpha-2" },
    }),
  );
  expect(current[0].rules.map((r) => r.id)).toEqual(["Alpha-2", "Alpha-1"]);
  expect(current[1].rules.map((r) => r.id)).toEqual(["Beta-1", "Beta-2"]);
  expect(changes).toBe(1);
});
