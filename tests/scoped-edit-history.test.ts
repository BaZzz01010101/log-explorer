import { afterEach, expect, it, vi } from "vitest";
import { installScopedEditHistory } from "../src/renderer/scoped-edit-history";

class Input {
  tagName = "INPUT";
  type = "text";
  readOnly = false;
  disabled = false;
  selectionStart = 0;
  selectionEnd = 0;
  selectionDirection = "none";
  stored = "";
  get value() {
    return this.stored;
  }
  set value(value: string) {
    this.stored = value;
  }
  setSelectionRange(start: number, end: number, direction: string) {
    this.selectionStart = start;
    this.selectionEnd = end;
    this.selectionDirection = direction;
  }
  dispatchEvent = vi.fn(() => true);
}

function setup() {
  const listeners = new Map<string, EventListener>();
  const doc = {
    activeElement: null as Input | null,
    defaultView: { InputEvent: Event },
    addEventListener: (type: string, listener: EventListener) =>
      listeners.set(type, listener),
    removeEventListener: (type: string) => listeners.delete(type),
  };
  const dispose = installScopedEditHistory(doc as unknown as Document);
  const emit = (type: string, target: Input, fields = {}) => {
    const event = {
      target,
      preventDefault: vi.fn(),
      stopPropagation: vi.fn(),
      ...fields,
    };
    listeners.get(type)?.(event as unknown as Event);
    return event;
  };
  const focus = (target: Input) => {
    doc.activeElement = target;
    emit("focusin", target);
  };
  const edit = (
    target: Input,
    value: string,
    inputType = "insertFromPaste",
  ) => {
    emit("beforeinput", target, { inputType });
    target.value = value;
    target.setSelectionRange(value.length, value.length, "none");
    emit("input", target, { inputType });
  };
  const undo = (target: Input, extra = {}) =>
    emit("keydown", target, { key: "z", ctrlKey: true, ...extra });
  return { emit, focus, edit, undo, dispose, listeners };
}

afterEach(() => vi.restoreAllMocks());

it("undoes the focused control after editing another control without moving focus", () => {
  const { focus, edit, undo } = setup();
  const filter = new Input();
  const highlight = new Input();
  focus(filter);
  edit(filter, "local filter");
  focus(highlight);
  edit(highlight, "highlight");
  focus(filter);
  expect(undo(filter).preventDefault).toHaveBeenCalledOnce();
  expect(filter.value).toBe("");
  expect(highlight.value).toBe("highlight");
  expect(filter.selectionStart).toBe(0);
  undo(filter, { shiftKey: true });
  expect(filter.value).toBe("local filter");
  expect(filter.selectionStart).toBe(12);
  undo(filter);
  expect(undo(filter).preventDefault).toHaveBeenCalledOnce();
  expect(filter.value).toBe("");
});

it("restores replaced selections, invalidates redo after a new edit, and resets externally replaced values", () => {
  const { focus, edit, undo } = setup();
  const input = new Input();
  input.value = "abc";
  focus(input);
  input.setSelectionRange(1, 2, "backward");
  edit(input, "aXc");
  undo(input);
  expect([
    input.value,
    input.selectionStart,
    input.selectionEnd,
    input.selectionDirection,
  ]).toEqual(["abc", 1, 2, "backward"]);
  edit(input, "new");
  undo(input, { shiftKey: true });
  expect(input.value).toBe("new");
  input.value = "programmatic";
  undo(input);
  expect(input.value).toBe("programmatic");
});

it("groups contiguous typing and an IME composition into individual undo steps", () => {
  const { focus, edit, undo, emit } = setup();
  const input = new Input();
  focus(input);
  edit(input, "a", "insertText");
  edit(input, "ab", "insertText");
  undo(input);
  expect(input.value).toBe("");
  emit("compositionstart", input);
  edit(input, "n", "insertCompositionText");
  edit(input, "日本", "insertCompositionText");
  emit("compositionend", input);
  undo(input);
  expect(input.value).toBe("");
  undo(input, { key: "y" });
  expect(input.value).toBe("日本");
});

it("intercepts native undo beforeinput and blocks native undo on readonly inputs", () => {
  const { focus, edit, emit, undo, dispose, listeners } = setup();
  const input = new Input();
  focus(input);
  edit(input, "value");
  expect(
    emit("beforeinput", input, { inputType: "historyUndo" }).preventDefault,
  ).toHaveBeenCalledOnce();
  expect(input.value).toBe("");
  input.readOnly = true;
  expect(undo(input).preventDefault).toHaveBeenCalledOnce();
  dispose();
  expect(listeners.size).toBe(0);
});

it("supports textarea undo, limits retained history, and bypasses a controlled input value tracker", () => {
  const { focus, edit, undo } = setup();
  const input = new Input();
  input.tagName = "TEXTAREA";
  focus(input);
  for (let index = 1; index <= 110; index++) edit(input, String(index));
  const ownSetter = vi.fn((value: string) => {
    input.stored = value;
  });
  Object.defineProperty(input, "value", {
    get: () => input.stored,
    set: ownSetter,
    configurable: true,
  });
  undo(input);
  expect(input.value).toBe("109");
  expect(ownSetter).not.toHaveBeenCalled();
  expect(input.dispatchEvent).toHaveBeenCalled();
  for (let index = 0; index < 120; index++) undo(input);
  expect(input.value).toBe("11");
});
