import { afterEach, expect, it, vi } from "vitest";
import {
  clearEditControl,
  installScopedEditHistory,
} from "../src/renderer/scoped-edit-history";

class Input {
  tagName = "INPUT";
  type = "text";
  readOnly = false;
  disabled = false;
  selectionStart = 0;
  selectionEnd = 0;
  selectionDirection = "none";
  ownerDocument!: Document;
  onFocus?: () => void;
  onDispatch?: (event: Event) => boolean;
  attributes = new Map<string, string>();
  stored = "";
  getAttribute(name: string) {
    return this.attributes.get(name) ?? null;
  }
  setAttribute(name: string, value: string) {
    this.attributes.set(name, value);
  }
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
  focus() {
    this.onFocus?.();
  }
  dispatchEvent = vi.fn((event: Event) => this.onDispatch?.(event) ?? true);
}

function keyedTextarea(key: string, value: string) {
  const input = new Input();
  input.tagName = "TEXTAREA";
  input.setAttribute("data-edit-history-key", key);
  input.value = value;
  return input;
}

function setup() {
  const listeners = new Map<string, EventListener>();
  class TestInputEvent extends Event {
    inputType: string;
    constructor(type: string, options: InputEventInit) {
      super(type, options);
      this.inputType = options.inputType ?? "";
    }
  }
  const doc = {
    activeElement: null as Input | null,
    defaultView: { InputEvent: TestInputEvent },
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
  const attach = (target: Input) => {
    target.ownerDocument = doc as unknown as Document;
    target.onFocus = () => focus(target);
    target.onDispatch = (event) => {
      Object.defineProperty(event, "target", { value: target });
      listeners.get(event.type)?.(event);
      return !event.defaultPrevented;
    };
    return target;
  };
  const focus = (target: Input) => {
    attach(target);
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
  return { attach, emit, focus, edit, undo, dispose, listeners, doc };
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

it("undoes a clear in the same field with the original selection and redoes the clear", () => {
  const { focus, edit, undo, doc } = setup();
  const input = new Input();
  const other = new Input();
  focus(input);
  edit(input, "filter text");
  input.setSelectionRange(2, 6, "backward");
  focus(other);
  edit(other, "highlight");

  clearEditControl(input as unknown as HTMLInputElement);

  expect(input.value).toBe("");
  expect(doc.activeElement).toBe(input);
  undo(input);
  expect([
    input.value,
    input.selectionStart,
    input.selectionEnd,
    input.selectionDirection,
  ]).toEqual(["filter text", 2, 6, "backward"]);
  expect(other.value).toBe("highlight");
  undo(input, { shiftKey: true });
  expect([input.value, input.selectionStart, input.selectionEnd]).toEqual([
    "",
    0,
    0,
  ]);
  undo(input);
  undo(input);
  expect(input.value).toBe("");
});

it("records clearing an unfocused preset and bypasses a controlled value tracker", () => {
  const { attach, undo } = setup();
  const input = attach(new Input());
  input.value = "preset";
  input.setSelectionRange(1, 4, "forward");
  const trackedSetter = vi.fn((value: string) => {
    input.stored = value;
  });
  Object.defineProperty(input, "value", {
    get: () => input.stored,
    set: trackedSetter,
    configurable: true,
  });

  clearEditControl(input as unknown as HTMLInputElement);

  expect(input.value).toBe("");
  expect(trackedSetter).not.toHaveBeenCalled();
  expect(input.dispatchEvent.mock.calls.map(([event]) => event.type)).toEqual([
    "beforeinput",
    "input",
  ]);
  undo(input);
  expect([
    input.value,
    input.selectionStart,
    input.selectionEnd,
    input.selectionDirection,
  ]).toEqual(["preset", 1, 4, "forward"]);
});

it("does not merge a clear with preceding backspaces or later typing", () => {
  const { focus, edit, undo } = setup();
  const input = new Input();
  input.value = "abc";
  input.setSelectionRange(3, 3, "none");
  focus(input);
  edit(input, "ab", "deleteContentBackward");

  clearEditControl(input as unknown as HTMLInputElement);
  edit(input, "x", "insertText");

  undo(input);
  expect(input.value).toBe("");
  undo(input);
  expect(input.value).toBe("ab");
  undo(input);
  expect(input.value).toBe("abc");
});

it("keeps keyed textarea undo and selection when switching away and remounting", () => {
  const { focus, edit, undo } = setup();
  const sql = new Input();
  sql.tagName = "TEXTAREA";
  sql.setAttribute("data-edit-history-key", "insights-sql:tab-1");
  sql.value = "SELECT *";
  focus(sql);
  sql.setSelectionRange(7, 8, "backward");
  edit(sql, "SELECT @message");
  const filter = new Input();
  focus(filter);
  edit(filter, "local filter");

  const remounted = new Input();
  remounted.tagName = "TEXTAREA";
  remounted.setAttribute("data-edit-history-key", "insights-sql:tab-1");
  remounted.value = "SELECT @message";
  focus(remounted);
  undo(remounted);

  expect([
    remounted.value,
    remounted.selectionStart,
    remounted.selectionEnd,
    remounted.selectionDirection,
  ]).toEqual(["SELECT *", 7, 8, "backward"]);
  expect(filter.value).toBe("local filter");
  undo(remounted, { shiftKey: true });
  expect(remounted.value).toBe("SELECT @message");
  expect(remounted.selectionStart).toBe(15);
});

it("keeps tab histories separate when a textarea is reused for different keys", () => {
  const { focus, edit, undo } = setup();
  const sql = keyedTextarea("tab-1", "SELECT 1");
  focus(sql);
  edit(sql, "SELECT first");
  sql.setAttribute("data-edit-history-key", "tab-2");
  sql.value = "SELECT 2";
  focus(sql);
  edit(sql, "SELECT second");

  sql.setAttribute("data-edit-history-key", "tab-1");
  sql.value = "SELECT first";
  focus(sql);
  undo(sql);
  expect(sql.value).toBe("SELECT 1");

  sql.setAttribute("data-edit-history-key", "tab-2");
  sql.value = "SELECT second";
  focus(sql);
  undo(sql);
  expect(sql.value).toBe("SELECT 2");
  undo(sql, { shiftKey: true });
  expect(sql.value).toBe("SELECT second");
});

it("starts fresh when a keyed textarea remounts with an externally replaced query", () => {
  const { focus, edit, undo } = setup();
  const sql = keyedTextarea("tab-1", "SELECT *");
  focus(sql);
  edit(sql, "SELECT @message");

  const replaced = keyedTextarea("tab-1", "SELECT @timestamp");
  focus(replaced);
  undo(replaced);
  expect(replaced.value).toBe("SELECT @timestamp");
  edit(replaced, "SELECT @log");
  undo(replaced);
  expect(replaced.value).toBe("SELECT @timestamp");
  const remounted = keyedTextarea("tab-1", "SELECT @timestamp");
  focus(remounted);
  undo(remounted, { shiftKey: true });
  expect(remounted.value).toBe("SELECT @log");
  undo(remounted);
  undo(remounted);
  expect(remounted.value).toBe("SELECT @timestamp");
});

it("evicts the least recently used keyed history after 100 histories", () => {
  const { focus, edit, undo } = setup();
  const inputs: Input[] = [];
  for (let index = 0; index < 100; index++) {
    const sql = keyedTextarea(`tab-${index}`, `SELECT ${index}`);
    focus(sql);
    edit(sql, `SELECT edited-${index}`);
    inputs.push(sql);
  }
  focus(inputs[0]!);
  const added = keyedTextarea("tab-100", "SELECT 100");
  focus(added);
  edit(added, "SELECT edited-100");

  const retained = keyedTextarea("tab-0", "SELECT edited-0");
  focus(retained);
  undo(retained);
  expect(retained.value).toBe("SELECT 0");
  const evicted = keyedTextarea("tab-1", "SELECT edited-1");
  focus(evicted);
  undo(evicted);
  expect(evicted.value).toBe("SELECT edited-1");
});

it("isolates keyed history between documents and clears it when reinstalled", () => {
  const first = setup();
  const sql = keyedTextarea("tab-1", "SELECT *");
  first.focus(sql);
  first.edit(sql, "SELECT @message");

  const second = setup();
  const otherDocument = keyedTextarea("tab-1", "SELECT @message");
  second.focus(otherDocument);
  second.undo(otherDocument);
  expect(otherDocument.value).toBe("SELECT @message");

  first.dispose();
  expect(first.listeners.size).toBe(0);
  const dispose = installScopedEditHistory(first.doc as unknown as Document);
  const remounted = keyedTextarea("tab-1", "SELECT @message");
  first.focus(remounted);
  first.undo(remounted);
  expect(remounted.value).toBe("SELECT @message");
  dispose();
  second.dispose();
});
