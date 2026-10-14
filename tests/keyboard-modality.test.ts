import { expect, it } from "vitest";
import { installKeyboardModality } from "../src/renderer/useKeyboardModality";

class DocumentTarget extends EventTarget {
  attributes = new Map<string, string>();
  documentElement = {
    getAttribute: (name: string) => this.attributes.get(name) ?? null,
    setAttribute: (name: string, value: string) =>
      this.attributes.set(name, value),
    removeAttribute: (name: string) => this.attributes.delete(name),
  };
  document(): Document {
    return this as unknown as Document;
  }
  get modality() {
    return this.documentElement.getAttribute("data-input-modality");
  }
  press(key: string) {
    const event = Object.assign(new Event("keydown", { cancelable: true }), {
      key,
    });
    this.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(false);
  }
}

it("starts in pointer mode and ignores each pure modifier key", () => {
  const target = new DocumentTarget();
  const cleanup = installKeyboardModality(target.document());
  expect(target.modality).toBe("pointer");
  for (const key of ["Shift", "Control", "Alt", "Meta", "AltGraph"]) {
    target.press(key);
    expect(target.modality).toBe("pointer");
  }
  cleanup();
});

it("preserves keyboard indication for navigation while pointer input resets it", () => {
  const target = new DocumentTarget();
  const cleanup = installKeyboardModality(target.document());
  for (const key of ["Tab", "ArrowDown", "ArrowRight", "Enter", " "]) {
    target.dispatchEvent(new Event("pointerdown"));
    expect(target.modality).toBe("pointer");
    target.press(key);
    expect(target.modality).toBe("keyboard");
    target.press("Shift");
    expect(target.modality).toBe("keyboard");
  }
  cleanup();
});

it("removes its marker and event listeners when unmounted", () => {
  const target = new DocumentTarget();
  const cleanup = installKeyboardModality(target.document());
  target.press("Tab");
  cleanup();
  expect(target.modality).toBeNull();
  target.press("ArrowDown");
  target.dispatchEvent(new Event("pointerdown"));
  expect(target.modality).toBeNull();
});

it("restores a pre-existing marker rather than overwriting its owner on cleanup", () => {
  const target = new DocumentTarget();
  target.documentElement.setAttribute("data-input-modality", "existing");
  const cleanup = installKeyboardModality(target.document());
  target.press("Tab");
  expect(target.modality).toBe("keyboard");
  cleanup();
  expect(target.modality).toBe("existing");
});
