import { createElement, useState, type ReactNode } from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { HighlightProfilesEditor } from "../src/renderer/components/HighlightProfilesEditor";
import { createWorkspace } from "../src/renderer/workspace";
import type { HighlightProfile } from "../src/shared/highlights";

// Browser geometry and drag sensors are exercised by the native table tests.
// Keep the real editor/state transitions here, replacing only UI primitives.
vi.mock("@mantine/core", () => {
  const component =
    (tag: string) =>
    ({ children, label, ...props }: any) =>
      createElement(
        tag,
        { "aria-label": label, ...props },
        children as ReactNode,
      );
  return {
    ActionIcon: component("button"),
    Button: component("button"),
    TextInput: component("input"),
    ColorInput: component("input"),
    Select: component("select"),
    Switch: component("input"),
    Text: component("div"),
    Group: component("div"),
    Stack: component("div"),
  };
});
vi.mock("@dnd-kit/core", () => ({
  DndContext: ({ children }: { children: ReactNode }) => children,
  closestCenter: vi.fn(),
  KeyboardSensor: class {},
  PointerSensor: class {},
  useSensor: vi.fn(),
  useSensors: vi.fn(),
}));
vi.mock("@dnd-kit/sortable", () => ({
  SortableContext: ({ children }: { children: ReactNode }) => children,
  sortableKeyboardCoordinates: vi.fn(),
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
vi.mock("../src/renderer/components/HighlightEventsPreview", () => ({
  HighlightEventsPreview: () => null,
}));

const base = createWorkspace().preferences;
function fixture(): HighlightProfile[] {
  return ["Alpha", "Beta"].map((name) => ({
    id: name,
    name,
    enabled: true,
    groupPattern: "",
    groupIgnoreCase: false,
    rules: [1, 2].map((n) => ({
      id: `${name}-${n}`,
      enabled: true,
      scope: "text",
      path: "",
      pattern: `ERROR${n}`,
      ignoreCase: false,
      target: "row",
      colors: { foreground: "#ffffff", background: "#713f12" },
      separateThemeColors: false,
    })),
  }));
}
let renderer: ReactTestRenderer;
let current: HighlightProfile[];
let published: HighlightProfile[][];
let replaceProfiles: (next: HighlightProfile[]) => void;
function Host() {
  const [profiles, setProfiles] = useState(fixture);
  current = profiles;
  replaceProfiles = setProfiles;
  return (
    <HighlightProfilesEditor
      preferences={{ ...base, highlightProfiles: profiles }}
      onChange={(next) => {
        published.push(next);
        setProfiles(next);
      }}
    />
  );
}
const controls = (label: string) =>
  renderer.root.findAll(
    (node) =>
      typeof node.type === "string" && node.props["aria-label"] === label,
  );
const control = (label: string) => {
  const result = controls(label)[0];
  if (!result) throw new Error(`Missing control: ${label}`);
  return result;
};
const click = async (label: string, shiftKey = false) =>
  act(async () => control(label).props.onClick({ shiftKey }));
const type = async (label: string, value: string) =>
  act(async () => control(label).props.onChange({ currentTarget: { value } }));
beforeEach(async () => {
  published = [];
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const error = console.error.bind(console);
  vi.spyOn(console, "error").mockImplementation((...args) => {
    if (!String(args[0]).includes("react-test-renderer is deprecated"))
      error(...args);
  });
  await act(async () => {
    renderer = create(<Host />);
  });
});
afterEach(async () => {
  await act(async () => renderer?.unmount());
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

it("keeps expanded rules read-only until Edit, then commits only on Save and discards Cancel", async () => {
  await click("Expand rule 1");
  expect(control("Match regex").props.readOnly).toBe(true);
  await click("Edit rule 1");
  await type("Match regex", "changed");
  expect(current[0].rules[0].pattern).toBe("ERROR1");
  await click("Cancel rule edit");
  expect(current[0].rules[0].pattern).toBe("ERROR1");
  await click("Edit rule 1");
  expect(control("Match regex").props.value).toBe("ERROR1");
  await type("Match regex", "saved");
  await click("Save rule");
  expect(current[0].rules[0].pattern).toBe("saved");
  expect(control("Match regex").props.readOnly).toBe(true);
});

it("does not save invalid regex or structured paths", async () => {
  await click("Expand rule 1");
  await click("Edit rule 1");
  await type("Match regex", "[");
  expect(control("Save rule").props.disabled).toBe(true);
  await type("Match regex", "ok");
  await act(async () => control("Search in").props.onChange("structured"));
  await type("JSON Pointer path", "missing-slash");
  expect(control("Save rule").props.disabled).toBe(true);
  await type("JSON Pointer path", "/bad~escape");
  expect(control("Save rule").props.disabled).toBe(true);
  await type("JSON Pointer path", "/message");
  expect(control("Save rule").props.disabled).toBe(false);
  await click("Save rule");
  expect(current[0].rules[0]).toMatchObject({
    scope: "structured",
    path: "/message",
    pattern: "ok",
  });
});

it("rejects unfinished colors instead of silently saving the previous color", async () => {
  await click("Expand rule 1");
  await click("Edit rule 1");
  await act(async () => control("Shared background").props.onChange("#12"));
  expect(control("Save rule").props.disabled).toBe(true);
  await act(async () => control("Shared background").props.onChange("#123456"));
  expect(control("Save rule").props.disabled).toBe(false);
  await click("Save rule");
  expect(current[0].rules[0].colors.background).toBe("#123456");
});

it("keeps numeric priority out of details while preserving header reordering", async () => {
  await click("Expand profile Alpha");
  expect(controls("Priority")).toHaveLength(0);
  await click("Edit profile Alpha");
  expect(controls("Priority")).toHaveLength(0);
  await click("Cancel profile edit");
  await click("Move profile 1 down");
  expect(current.map((p) => p.id)).toEqual(["Beta", "Alpha"]);
  expect(current[1].rules.map((r) => r.id)).toEqual(["Alpha-1", "Alpha-2"]);
});

it("selects the item being edited when another unfolded item's row is active", async () => {
  await click("Expand profile Alpha");
  await act(async () =>
    renderer.root.findByProps({ "data-profile-id": "Beta" }).props.onClick(),
  );
  await click("Edit profile Alpha");
  expect(
    renderer.root.findByProps({ "data-profile-id": "Alpha" }).props[
      "aria-selected"
    ],
  ).toBe(true);
  await click("Expand rule 1");
  await act(async () =>
    renderer.root.findByProps({ "data-rule-id": "Alpha-2" }).props.onClick(),
  );
  await click("Edit rule 1");
  expect(
    renderer.root.findByProps({ "data-rule-id": "Alpha-1" }).props[
      "aria-selected"
    ],
  ).toBe(true);
});

it("saves profile configuration without overwriting rules or a summary enable toggle", async () => {
  await click("Expand profile Alpha");
  await click("Edit profile Alpha");
  await type("Profile name", "Renamed");
  await act(async () =>
    control("Profile Alpha enabled").props.onChange({
      currentTarget: { checked: false },
    }),
  );
  await click("Add rule");
  expect(current[0].rules).toHaveLength(2);
  await click("Save profile");
  expect(current[0]).toMatchObject({ name: "Renamed", enabled: false });
  expect(current[0].rules).toHaveLength(2);
  expect(control("Match regex").props.readOnly).toBe(false);
  await type("Match regex", "saved separately");
  await click("Save rule");
  expect(current[0].rules).toHaveLength(3);
  expect(current[0].rules[2].pattern).toBe("saved separately");
  expect(current[1].name).toBe("Beta");
});

it("requires explicit confirmation for deletion and preserves items on cancellation", async () => {
  await click("Delete rule 1");
  expect(current[0].rules).toHaveLength(2);
  await click("Cancel deletion");
  expect(current[0].rules).toHaveLength(2);
  await click("Delete rule 1");
  await click("Confirm delete rule");
  expect(current[0].rules.map((r) => r.id)).toEqual(["Alpha-2"]);
  await click("Delete profile Alpha");
  expect(current).toHaveLength(2);
  await click("Confirm delete profile");
  expect(current.map((p) => p.id)).toEqual(["Beta"]);
});

it("retains a rule draft when changing profiles and preserves direct enable changes when saved", async () => {
  await click("Expand rule 1");
  await click("Edit rule 1");
  await type("Match regex", "pending");
  await act(async () =>
    renderer.root.findByProps({ "data-profile-id": "Beta" }).props.onClick(),
  );
  await act(async () =>
    renderer.root.findByProps({ "data-profile-id": "Alpha" }).props.onClick(),
  );
  expect(control("Match regex").props.value).toBe("pending");
  await act(async () =>
    control("Rule 1 enabled").props.onChange({
      currentTarget: { checked: false },
    }),
  );
  await click("Save rule");
  expect(current[0].rules[0]).toMatchObject({
    pattern: "pending",
    enabled: false,
  });
});

it("folds other items by default and preserves them only with Shift", async () => {
  await click("Expand rule 1");
  await click("Expand rule 2");
  expect(controls("Collapse rule 1")).toHaveLength(0);
  expect(controls("Collapse rule 2")).toHaveLength(1);
  await click("Expand rule 1", true);
  expect(controls("Collapse rule 1")).toHaveLength(1);
  expect(controls("Collapse rule 2")).toHaveLength(1);
  await click("Expand profile Alpha");
  await click("Expand profile Beta");
  expect(controls("Collapse profile Alpha")).toHaveLength(0);
  await click("Expand profile Alpha", true);
  expect(controls("Collapse profile Beta")).toHaveLength(1);
});

it("keeps delete confirmation in the folded summary and orders Delete before Cancel", async () => {
  await click("Delete rule 1");
  expect(
    renderer.root.findAllByProps({ className: "highlight-detail-row" }),
  ).toHaveLength(0);
  const actions = renderer.root.findAll(
    (node) =>
      node.type === "button" &&
      ["Confirm delete rule", "Cancel deletion"].includes(
        node.props["aria-label"],
      ),
  );
  expect(actions.map((node) => node.props["aria-label"])).toEqual([
    "Confirm delete rule",
    "Cancel deletion",
  ]);
});

it("starts new items as editable blue rows and removes them on Cancel", async () => {
  await click("Add rule");
  const row = renderer.root.findAll(
    (node) =>
      node.type === "tr" &&
      node.props["data-rule-id"] &&
      node.props["data-rule-id"] !== "Alpha-1" &&
      node.props["data-rule-id"] !== "Alpha-2",
  )[0];
  expect(row.parent?.props["data-row-state"]).toBe("new");
  expect(current[0].rules).toHaveLength(2);
  expect(published).toHaveLength(0);
  expect(control("Match regex").props.readOnly).toBe(false);
  await click("Cancel rule edit");
  expect(current[0].rules.map((r) => r.id)).toEqual(["Alpha-1", "Alpha-2"]);
  await click("Add profile");
  expect(current).toHaveLength(2);
  expect(published).toHaveLength(0);
  expect(control("Profile name").props.readOnly).toBe(false);
  await click("Cancel profile edit");
  expect(current.map((p) => p.id)).toEqual(["Alpha", "Beta"]);
  expect(published).toHaveLength(0);
});

it("keeps a new rule's toggles and position local until that rule is saved", async () => {
  await click("Add rule");
  await type("Match regex", "newly saved");
  await act(async () =>
    control("Rule 3 enabled").props.onChange({
      currentTarget: { checked: false },
    }),
  );
  await click("Move rule 3 up");
  expect(current[0].rules.map((rule) => rule.id)).toEqual([
    "Alpha-1",
    "Alpha-2",
  ]);
  expect(published).toHaveLength(0);
  await click("Save rule");
  expect(published).toHaveLength(1);
  expect(current[0].rules).toHaveLength(3);
  expect(current[0].rules[1]).toMatchObject({
    pattern: "newly saved",
    enabled: false,
  });
  expect(current[0].rules[0].id).toBe("Alpha-1");
  expect(current[0].rules[2].id).toBe("Alpha-2");
  expect(control("Match regex").props.readOnly).toBe(true);
});

it("keeps a new profile and its saved rule edits local until the profile is saved", async () => {
  await click("Add profile");
  await type("Profile name", "Local profile");
  await act(async () =>
    control("Profile New profile enabled").props.onChange({
      currentTarget: { checked: false },
    }),
  );
  await click("Edit rule 1");
  await type("Match regex", "default edited");
  await act(async () =>
    control("Rule 1 enabled").props.onChange({
      currentTarget: { checked: false },
    }),
  );
  await click("Save rule");
  await click("Add rule");
  await type("Match regex", "second edited");
  await click("Save rule");
  await click("Move rule 2 up");
  await click("Move profile 3 up");
  expect(current.map((profile) => profile.id)).toEqual(["Alpha", "Beta"]);
  expect(published).toHaveLength(0);
  await click("Save profile");
  expect(published).toHaveLength(1);
  expect(current).toHaveLength(3);
  expect(current[1]).toMatchObject({ name: "Local profile", enabled: false });
  expect(current[1].rules.map((rule) => [rule.pattern, rule.enabled])).toEqual([
    ["second edited", true],
    ["default edited", false],
  ]);
});

it("discards every nested edit when cancelling an unsaved profile", async () => {
  await click("Add profile");
  await click("Edit rule 1");
  await type("Match regex", "discard this");
  await click("Save rule");
  await click("Add rule");
  await type("Match regex", "discard this too");
  await click("Save rule");
  await click("Move rule 2 up");
  expect(published).toHaveLength(0);
  await click("Cancel profile edit");
  expect(current.map((profile) => profile.id)).toEqual(["Alpha", "Beta"]);
  expect(published).toHaveLength(0);
  expect(
    renderer.root.findAll(
      (node) => node.type === "tr" && node.props["data-profile-id"],
    ),
  ).toHaveLength(2);
  await click("Expand rule 1");
  expect(control("Match regex").props.value).toBe("ERROR1");
});

it("saves a new profile without committing its still-editing new rule", async () => {
  await click("Add profile");
  await type("Profile name", "Profile saved first");
  await click("Add rule");
  await type("Match regex", "still provisional");
  await click("Save profile");
  expect(current).toHaveLength(3);
  expect(current[2].rules).toHaveLength(1);
  expect(published).toHaveLength(1);
  expect(control("Match regex").props.value).toBe("still provisional");
  expect(control("Match regex").props.readOnly).toBe(false);
  await click("Cancel rule edit");
  expect(current[2].rules).toHaveLength(1);
  expect(published).toHaveLength(1);
});

it("follows ordering changed by the other editor without publishing unfinished additions", async () => {
  await click("Add rule");
  await type("Match regex", "local pending");
  await click("Move rule 3 up");
  await act(async () =>
    replaceProfiles([
      current[1],
      { ...current[0], rules: [...current[0].rules].reverse() },
    ]),
  );
  const rowIds = (kind: string) =>
    renderer.root
      .findAll((node) => node.type === "tr" && node.props[`data-${kind}-id`])
      .map((node) => node.props[`data-${kind}-id`]);
  expect(rowIds("profile")).toEqual(["Beta", "Alpha"]);
  const rules = rowIds("rule");
  expect(rules[0]).toBe("Alpha-2");
  expect(rules[2]).toBe("Alpha-1");
  expect(control("Match regex").props.value).toBe("local pending");
  expect(published).toHaveLength(0);
});
