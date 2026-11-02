import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { ShortcutsEditor } from "../src/renderer/components/ShortcutsEditor";
import {
  DEFAULT_SHORTCUTS,
  findShortcutConflicts,
  validateShortcut,
} from "../src/renderer/shortcut-definitions";
import {
  normalizeShortcut,
  shortcutFromKeyboardEvent,
  shortcutMatches,
} from "../src/renderer/shortcuts";

const key = (value: string, patch: Record<string, unknown> = {}) => ({
  key: value,
  ctrlKey: false,
  metaKey: false,
  altKey: false,
  shiftKey: false,
  repeat: false,
  isComposing: false,
  preventDefault: vi.fn(),
  stopPropagation: vi.fn(),
  stopImmediatePropagation: vi.fn(),
  ...patch,
});

it("normalizes aliases and persisted shortcuts without losing punctuation or navigation", () => {
  expect(normalizeShortcut(" shift + ctrl + page down ")).toBe(
    "Control+Shift+PageDown",
  );
  expect(normalizeShortcut("Cmd+Option+left")).toBe("Meta+Alt+ArrowLeft");
  expect(normalizeShortcut("Ctrl++")).toBe("Control++");
  expect(normalizeShortcut("Control+Shift++")).toBe("Control+Shift++");
  expect(normalizeShortcut("+")).toBe("+");
  expect(normalizeShortcut("Control+space")).toBe("Control+Space");
  expect(normalizeShortcut("Alt+\\")).toBe("Alt+\\");
  expect(normalizeShortcut("")).toBe("");
  for (const invalid of [
    "Control",
    "Ctrl+Alt",
    "Control+K+C",
    "Ctrl++K",
    "Banana",
    "Ctrl+Ctrl+T",
    "constructor",
    "Ctrl+++",
    "toString+T",
  ])
    expect(normalizeShortcut(invalid)).toBeNull();
});

it("matches literal plus, spaces, navigation and aliases with exact modifiers", () => {
  expect(
    shortcutMatches(
      key("+", { ctrlKey: true, shiftKey: true }),
      "Ctrl+Shift++",
    ),
  ).toBe(true);
  expect(shortcutMatches(key(" ", { altKey: true }), "Alt+Space")).toBe(true);
  expect(
    shortcutMatches(key("ArrowLeft", { ctrlKey: true }), "Ctrl+Left"),
  ).toBe(true);
  expect(shortcutMatches(key("t", { ctrlKey: true }), "Control+T")).toBe(true);
  expect(
    shortcutMatches(key("t", { ctrlKey: true, shiftKey: true }), "Control+T"),
  ).toBe(false);
  expect(
    shortcutMatches(
      key("t", { ctrlKey: true, isComposing: true }),
      "Control+T",
    ),
  ).toBe(false);
  expect(shortcutMatches(key("+"), "+")).toBe(true);
});

it("captures Tab, navigation and punctuation while ignoring modifiers, IME and repeats", () => {
  expect(shortcutFromKeyboardEvent(key("Tab", { ctrlKey: true }))).toBe(
    "Control+Tab",
  );
  expect(shortcutFromKeyboardEvent(key("ArrowDown", { shiftKey: true }))).toBe(
    "Shift+ArrowDown",
  );
  expect(
    shortcutFromKeyboardEvent(key("+", { altKey: true, shiftKey: true })),
  ).toBe("Alt+Shift++");
  expect(shortcutFromKeyboardEvent(key(" ", { ctrlKey: true }))).toBe(
    "Control+Space",
  );
  for (const event of [
    key("Control", { ctrlKey: true }),
    key("Dead"),
    key("Process"),
    key("Unidentified"),
    key("t", { repeat: true }),
    key("t", { isComposing: true }),
  ])
    expect(shortcutFromKeyboardEvent(event)).toBeNull();
});

it("allows reused field shortcuts in distinct scopes and rejects simultaneous global conflicts", () => {
  expect(
    findShortcutConflicts("localFilterRegex", "Alt+E", DEFAULT_SHORTCUTS),
  ).toEqual([]);
  expect(
    findShortcutConflicts("localFilterRegex", "Alt+C", DEFAULT_SHORTCUTS).map(
      (item) => item.id,
    ),
  ).toEqual(["localFilterCaseSensitive"]);
  expect(
    findShortcutConflicts("newTab", "Alt+E", DEFAULT_SHORTCUTS).map(
      (item) => item.id,
    ),
  ).toEqual(["explorerRegex", "highlightRegex", "localFilterRegex"]);
  expect(
    findShortcutConflicts("localFilterRegex", "Ctrl+T", DEFAULT_SHORTCUTS).map(
      (item) => item.id,
    ),
  ).toEqual(["newTab"]);
  expect(validateShortcut("newTab", "", DEFAULT_SHORTCUTS)).toBeNull();
  expect(validateShortcut("newTab", "Control", DEFAULT_SHORTCUTS)).toMatch(
    /key/i,
  );
  expect(validateShortcut("newTab", "F11", DEFAULT_SHORTCUTS)).toMatch(
    /reserved/i,
  );
  expect(validateShortcut("newTab", "Ctrl++", DEFAULT_SHORTCUTS)).toMatch(
    /reserved/i,
  );
  expect(validateShortcut("newTab", "Alt+F4", DEFAULT_SHORTCUTS)).toMatch(
    /reserved/i,
  );
  expect(validateShortcut("newTab", "T", DEFAULT_SHORTCUTS)).toMatch(
    /Ctrl.*Alt.*Meta/,
  );
});

let renderer: ReactTestRenderer;
const listeners = new Map<string, EventListener>();
const onChange = vi.fn();
const button = (label: string) =>
  renderer.root.findByProps({ "aria-label": label });
const emit = (event: ReturnType<typeof key>) =>
  listeners.get("keydown")!(event as unknown as Event);
const mount = async (shortcuts = DEFAULT_SHORTCUTS) => {
  await act(async () => {
    renderer = create(
      <ShortcutsEditor shortcuts={shortcuts} onChange={onChange} />,
    );
  });
};

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("window", {
    addEventListener: vi.fn((type, callback) => listeners.set(type, callback)),
    removeEventListener: vi.fn((type) => listeners.delete(type)),
  });
  const original = console.error.bind(console);
  vi.spyOn(console, "error").mockImplementation((...args) => {
    if (!String(args[0]).includes("react-test-renderer is deprecated"))
      original(...args);
  });
  onChange.mockReset();
});

afterEach(async () => {
  await act(async () => renderer?.unmount());
  listeners.clear();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

it("searches command labels and scope without editing bindings", async () => {
  await mount();
  await act(async () =>
    renderer.root
      .findByProps({ "aria-label": "Search commands" })
      .props.onChange({ currentTarget: { value: "local filter" } }),
  );
  expect(renderer.root.findAll((node) => node.type === "li")).toHaveLength(2);
  expect(onChange).not.toHaveBeenCalled();
});

it("records with explicit Save and consumes navigation, repeat, IME and keyup events", async () => {
  await mount();
  await act(async () => button("Edit shortcut for New tab").props.onClick());
  expect(
    renderer.root.findByProps({ "data-shortcut-editor": true }).props[
      "data-shortcut-recording"
    ],
  ).toBe("true");
  for (const event of [
    key("Control", { ctrlKey: true }),
    key("t", { repeat: true }),
    key("Process", { isComposing: true }),
  ]) {
    await act(async () => emit(event));
    expect(event.preventDefault).toHaveBeenCalledOnce();
  }
  expect(button("Save shortcut for New tab").props.disabled).toBe(true);
  const event = key("Tab", { altKey: true });
  await act(async () => emit(event));
  expect(event.stopImmediatePropagation).toHaveBeenCalledOnce();
  expect(onChange).not.toHaveBeenCalled();
  const released = key("Tab", { altKey: true });
  await act(async () => listeners.get("keyup")!(released as unknown as Event));
  expect(released.preventDefault).toHaveBeenCalledOnce();
  expect(listeners.has("keydown")).toBe(true);
  await act(async () =>
    listeners.get("keyup")!(key("Alt") as unknown as Event),
  );
  expect(listeners.has("keydown")).toBe(false);
  expect(
    renderer.root.findByProps({ "data-shortcut-editor": true }).props[
      "data-shortcut-recording"
    ],
  ).toBeUndefined();
  await act(async () => button("Save shortcut for New tab").props.onClick());
  expect(onChange).toHaveBeenCalledExactlyOnceWith({
    ...DEFAULT_SHORTCUTS,
    newTab: "Alt+Tab",
  });
  expect(listeners.has("keydown")).toBe(false);
});

it("shows conflicts, refuses Save and lets Escape cancel without a mutation", async () => {
  await mount();
  await act(async () => button("Edit shortcut for New tab").props.onClick());
  await act(async () => emit(key("w", { ctrlKey: true })));
  expect(
    renderer.root.findByProps({ role: "alert" }).children.join(""),
  ).toContain("Close tab");
  expect(button("Save shortcut for New tab").props.disabled).toBe(true);
  await act(async () => emit(key("Escape")));
  expect(onChange).not.toHaveBeenCalled();
  expect(listeners.has("keydown")).toBe(false);
});

it("replaces conflicting shortcuts only through the explicit replacement action", async () => {
  await mount();
  await act(async () => button("Edit shortcut for New tab").props.onClick());
  await act(async () => emit(key("e", { altKey: true })));
  expect(onChange).not.toHaveBeenCalled();
  await act(async () =>
    button("Replace conflicting shortcuts for New tab").props.onClick(),
  );
  expect(onChange).toHaveBeenCalledExactlyOnceWith({
    ...DEFAULT_SHORTCUTS,
    newTab: "Alt+E",
    explorerRegex: "",
    highlightRegex: "",
    localFilterRegex: "",
  });
});

it("supports staged keyboard navigation, re-recording and cancelling on window blur", async () => {
  await mount();
  await act(async () => button("Edit shortcut for New tab").props.onClick());
  await act(async () => emit(key("Tab", { ctrlKey: true, shiftKey: true })));
  await act(async () =>
    listeners.get("keyup")!(key("Control") as unknown as Event),
  );
  expect(listeners.has("keydown")).toBe(true);
  await act(async () =>
    listeners.get("keyup")!(key("Tab") as unknown as Event),
  );
  expect(listeners.has("keydown")).toBe(false);
  expect(button("Save shortcut for New tab").props.disabled).toBe(true);
  await act(async () => button("Edit shortcut for New tab").props.onClick());
  expect(listeners.has("keydown")).toBe(true);
  await act(async () => listeners.get("blur")!(new Event("blur")));
  expect(listeners.has("keydown")).toBe(false);
  expect(onChange).not.toHaveBeenCalled();
});

it("stops recording when focus leaves the editor without stealing focus back", async () => {
  await mount();
  await act(async () => button("Edit shortcut for New tab").props.onClick());
  const editor = renderer.root.findByProps({ "data-shortcut-editor": true });
  const outside = {};
  await act(async () =>
    editor.props.onBlurCapture({
      currentTarget: { contains: (target: unknown) => target !== outside },
      relatedTarget: outside,
    }),
  );
  expect(listeners.has("keydown")).toBe(false);
  expect(onChange).not.toHaveBeenCalled();
  expect(
    renderer.root.findAllByProps({ "aria-label": "Save shortcut for New tab" }),
  ).toHaveLength(0);
});

it("cancels a staged shortcut with Escape and rejects reserved combinations", async () => {
  await mount();
  await act(async () => button("Edit shortcut for New tab").props.onClick());
  await act(async () => emit(key("F11")));
  await act(async () =>
    listeners.get("keyup")!(key("F11") as unknown as Event),
  );
  expect(button("Save shortcut for New tab").props.disabled).toBe(true);
  expect(
    renderer.root.findByProps({ role: "alert" }).children.join(""),
  ).toContain("reserved");
  const escape = key("Escape");
  await act(async () =>
    renderer.root
      .findByProps({ "data-shortcut-editor": true })
      .props.onKeyDownCapture(escape),
  );
  expect(escape.preventDefault).toHaveBeenCalledOnce();
  expect(
    renderer.root.findAllByProps({ "aria-label": "Save shortcut for New tab" }),
  ).toHaveLength(0);
  expect(onChange).not.toHaveBeenCalled();
});

it("clears a shortcut and confirms reset all before restoring defaults", async () => {
  await mount({ ...DEFAULT_SHORTCUTS, newTab: "Alt+N", explorerRegex: "" });
  await act(async () => button("Clear shortcut for New tab").props.onClick());
  expect(onChange).toHaveBeenLastCalledWith({
    ...DEFAULT_SHORTCUTS,
    newTab: "",
    explorerRegex: "",
  });
  onChange.mockClear();
  await act(async () => button("Reset all shortcuts").props.onClick());
  expect(onChange).not.toHaveBeenCalled();
  await act(async () => button("Cancel reset all shortcuts").props.onClick());
  expect(onChange).not.toHaveBeenCalled();
  await act(async () => button("Reset all shortcuts").props.onClick());
  await act(async () => button("Confirm reset all shortcuts").props.onClick());
  expect(onChange).toHaveBeenCalledExactlyOnceWith(DEFAULT_SHORTCUTS);
});

it("resets one action and prevents a reset that would conflict with a custom binding", async () => {
  await mount({ ...DEFAULT_SHORTCUTS, newTab: "Alt+N" });
  await act(async () => button("Reset shortcut for New tab").props.onClick());
  expect(onChange).toHaveBeenLastCalledWith(DEFAULT_SHORTCUTS);
  await act(async () =>
    renderer.update(
      <ShortcutsEditor
        shortcuts={{
          ...DEFAULT_SHORTCUTS,
          newTab: "Alt+N",
          closeTab: "Control+T",
        }}
        onChange={onChange}
      />,
    ),
  );
  onChange.mockClear();
  await act(async () => button("Reset shortcut for New tab").props.onClick());
  expect(onChange).not.toHaveBeenCalled();
  expect(
    renderer.root.findByProps({ role: "alert" }).children.join(""),
  ).toContain("Close tab");
});
