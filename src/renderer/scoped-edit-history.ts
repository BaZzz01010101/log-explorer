type EditControl = HTMLInputElement | HTMLTextAreaElement;
interface Snapshot {
  value: string;
  start: number | null;
  end: number | null;
  direction: "forward" | "backward" | "none" | null;
}
interface History {
  entries: Snapshot[];
  index: number;
  composing: boolean;
  group?: { type: string; at: number; end: number | null };
}

const MAX_ENTRIES = 100;
const MAX_CHARACTERS = 1_000_000;
const MAX_KEYED_HISTORIES = 100;

function editControl(target: EventTarget | null): EditControl | null {
  const element = target as EditControl | null;
  if (element?.tagName === "TEXTAREA") return element;
  if (element?.tagName !== "INPUT") return null;
  return [
    "text",
    "search",
    "url",
    "tel",
    "email",
    "password",
    "number",
    "date",
    "time",
    "datetime-local",
  ].includes(element.type)
    ? element
    : null;
}

function snapshot(control: EditControl): Snapshot {
  return {
    value: control.value,
    start: control.selectionStart,
    end: control.selectionEnd,
    direction: control.selectionDirection,
  };
}

/** Treat a clear button as an edit so it participates in the control's undo history. */
export function clearEditControl(control: EditControl | null): boolean {
  if (!control || control.readOnly || control.disabled || !control.value)
    return false;
  control.focus();
  const InputEventClass =
    control.ownerDocument.defaultView?.InputEvent ?? InputEvent;
  if (
    !control.dispatchEvent(
      new InputEventClass("beforeinput", {
        bubbles: true,
        cancelable: true,
        inputType: "deleteByCut",
      }),
    )
  )
    return false;
  // Bypass React's value tracker so the input event updates controlled state.
  const setter = Object.getOwnPropertyDescriptor(
    Object.getPrototypeOf(control),
    "value",
  )?.set;
  if (setter) setter.call(control, "");
  else control.value = "";
  if (control.selectionStart !== null) control.setSelectionRange(0, 0);
  control.dispatchEvent(
    new InputEventClass("input", {
      bubbles: true,
      inputType: "deleteByCut",
    }),
  );
  return true;
}

/** Keep undo scoped to each control, or an opt-in data-edit-history-key across remounts. */
export function installScopedEditHistory(doc: Document): () => void {
  const histories = new WeakMap<
    EditControl,
    { key: string | null; state: History }
  >();
  const keyedHistories = new Map<string, History>();
  let replaying = false;
  const historyKey = (control: EditControl) =>
    control.getAttribute("data-edit-history-key") || null;
  const currentHistory = (control: EditControl) => {
    const key = historyKey(control);
    if (key) return keyedHistories.get(key);
    const binding = histories.get(control);
    return binding?.key === null ? binding.state : undefined;
  };
  const history = (control: EditControl) => {
    const key = historyKey(control);
    let state = currentHistory(control);
    // A remounted control cannot continue the old DOM control's composition.
    if (state && histories.get(control)?.state !== state) {
      state.composing = false;
      state.group = undefined;
    }
    // A controlled value replaced by navigation, presets, or validation starts a fresh history.
    if (
      !state ||
      (!state.composing && state.entries[state.index]!.value !== control.value)
    ) {
      state = { entries: [snapshot(control)], index: 0, composing: false };
    }
    histories.set(control, { key, state });
    if (key) {
      // Refresh recency and retain only a bounded number of remountable histories.
      keyedHistories.delete(key);
      keyedHistories.set(key, state);
      if (keyedHistories.size > MAX_KEYED_HISTORIES)
        keyedHistories.delete(keyedHistories.keys().next().value!);
    }
    return state;
  };
  const record = (control: EditControl, state: History, type: string) => {
    const next = snapshot(control);
    const previous = state.entries[state.index]!;
    if (next.value === previous.value) return;
    const now = Date.now();
    const group = state.group;
    const merge =
      state.index > 0 &&
      state.index === state.entries.length - 1 &&
      ["insertText", "deleteContentBackward", "deleteContentForward"].includes(
        type,
      ) &&
      group?.type === type &&
      now - group.at < 1000 &&
      group.end === previous.start &&
      previous.start === previous.end;
    state.entries.splice(state.index + 1);
    if (merge) state.entries[state.index] = next;
    else {
      state.entries.push(next);
      state.index++;
    }
    state.group = { type, at: now, end: next.end };
    // Bound both entry count and retained text. The current value is always kept.
    let characters = state.entries.reduce(
      (sum, item) => sum + item.value.length,
      0,
    );
    while (
      state.entries.length > 1 &&
      (state.entries.length > MAX_ENTRIES || characters > MAX_CHARACTERS)
    ) {
      characters -= state.entries.shift()!.value.length;
      state.index--;
    }
  };
  const restore = (control: EditControl, redo: boolean) => {
    const state = history(control);
    state.group = undefined;
    if (control.readOnly || control.disabled || state.composing) return;
    const index = state.index + (redo ? 1 : -1);
    if (index < 0 || index >= state.entries.length) return;
    state.index = index;
    const next = state.entries[index]!;
    // Bypass React's own value tracker so the bubbling input event updates controlled state.
    const setter = Object.getOwnPropertyDescriptor(
      Object.getPrototypeOf(control),
      "value",
    )?.set;
    replaying = true;
    try {
      if (setter) setter.call(control, next.value);
      else control.value = next.value;
      const InputEventClass = doc.defaultView?.InputEvent ?? InputEvent;
      control.dispatchEvent(
        new InputEventClass("input", {
          bubbles: true,
          inputType: redo ? "historyRedo" : "historyUndo",
        }),
      );
      if (next.start !== null && next.end !== null)
        control.setSelectionRange(
          next.start,
          next.end,
          next.direction ?? "none",
        );
    } finally {
      replaying = false;
    }
  };
  const focus: EventListener = (event) => {
    const control = editControl(event.target);
    if (control) history(control).group = undefined;
  };
  const beforeInput: EventListener = (event) => {
    if (replaying) return;
    const control = editControl(event.target);
    if (!control) return;
    const type = (event as InputEvent).inputType;
    if (type === "historyUndo" || type === "historyRedo") {
      event.preventDefault();
      event.stopPropagation();
      restore(control, type === "historyRedo");
      return;
    }
    const state = history(control);
    if (!state.composing) state.entries[state.index] = snapshot(control);
  };
  const input: EventListener = (event) => {
    if (replaying) return;
    const control = editControl(event.target);
    if (!control) return;
    const state = currentHistory(control);
    if (state && !state.composing)
      record(control, state, (event as InputEvent).inputType);
    else if (!state) history(control);
  };
  const keydown: EventListener = (event) => {
    const key = event as KeyboardEvent;
    if (
      !(key.ctrlKey || key.metaKey) ||
      key.altKey ||
      !["z", "y"].includes(key.key.toLowerCase())
    )
      return;
    const control = editControl(doc.activeElement);
    if (!control || key.isComposing || currentHistory(control)?.composing)
      return;
    event.preventDefault();
    event.stopPropagation();
    restore(control, key.key.toLowerCase() === "y" || key.shiftKey);
  };
  const compositionStart: EventListener = (event) => {
    const control = editControl(event.target);
    if (!control) return;
    const state = history(control);
    state.entries[state.index] = snapshot(control);
    state.group = undefined;
    state.composing = true;
  };
  const compositionEnd: EventListener = (event) => {
    const control = editControl(event.target);
    if (!control) return;
    const state = currentHistory(control);
    if (!state) return;
    state.composing = false;
    record(control, state, "insertCompositionText");
    state.group = undefined;
  };
  const listeners: [string, EventListener][] = [
    ["focusin", focus],
    ["beforeinput", beforeInput],
    ["input", input],
    ["keydown", keydown],
    ["compositionstart", compositionStart],
    ["compositionend", compositionEnd],
  ];
  for (const [type, listener] of listeners)
    doc.addEventListener(type, listener, true);
  return () => {
    for (const [type, listener] of listeners)
      doc.removeEventListener(type, listener, true);
    keyedHistories.clear();
  };
}
