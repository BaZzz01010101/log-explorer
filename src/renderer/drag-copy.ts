/**
 * Holding Ctrl (Cmd on macOS) while dragging a tab, a split panel or a source
 * badge copies it on drop instead of moving it. While the modifier is held a
 * "+" badge sits on the top-right corner of the dragged item.
 */
let modifier = false;
let lastDropCopy = false;
let point: { x: number; y: number } | null = null;
let badge: HTMLElement | null = null;
let frame = 0;

/** What follows the pointer, most specific first. */
const DRAGGED_ITEM =
  ".workspace-drag-preview, .resource-drag-preview, .workspace-tab.is-dragging";
const PLUS =
  '<svg viewBox="0 0 12 12" width="10" height="10" aria-hidden="true"><path d="M6 1.5v9M1.5 6h9" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>';

// The dragged item moves after the pointer event that moved it, so the badge
// follows it frame by frame while it is shown.
function place() {
  frame = 0;
  if (!badge || !point) return;
  const item = DRAGGED_ITEM.split(", ")
    .map((selector) => document.querySelector(selector))
    .find(Boolean);
  const rect = item?.getBoundingClientRect();
  const x = rect ? rect.right - 9 : point.x + 12;
  const y = rect ? rect.top - 9 : point.y + 8;
  badge.style.transform = `translate(${Math.round(x)}px, ${Math.round(y)}px)`;
  frame = requestAnimationFrame(place);
}

function render() {
  if (typeof document === "undefined") return;
  if (!point || !modifier) {
    if (frame) cancelAnimationFrame(frame);
    frame = 0;
    badge?.remove();
    badge = null;
    return;
  }
  if (!badge) {
    badge = document.createElement("div");
    badge.className = "drag-copy-badge";
    badge.setAttribute("aria-hidden", "true");
    badge.innerHTML = PLUS;
    document.body.append(badge);
  }
  if (!frame) place();
}

const sync = (event: Event) => {
  const { ctrlKey, metaKey } = event as KeyboardEvent | PointerEvent;
  const next = ctrlKey || metaKey;
  if (next === modifier) return;
  modifier = next;
  render();
};
const reset = () => {
  modifier = false;
  render();
};

function listen(active: boolean) {
  if (typeof window === "undefined") return;
  const method = active ? "addEventListener" : "removeEventListener";
  window[method]("keydown", sync, true);
  window[method]("keyup", sync, true);
  window[method]("pointermove", sync, true);
  window[method]("blur", reset);
}

/** Starts tracking the copy modifier for a move-type drag. */
export function startCopyDrag(start: { x: number; y: number }, ctrl: boolean) {
  if (!point) listen(true);
  modifier = ctrl;
  point = start;
  render();
}

export function moveCopyDrag(next: { x: number; y: number }) {
  if (!point) return;
  point = next;
  render();
}

/** Ends the drag and returns whether its drop copies. */
export function endCopyDrag(): boolean {
  if (point) listen(false);
  lastDropCopy = point !== null && modifier;
  point = null;
  modifier = false;
  render();
  return lastDropCopy;
}

/** Whether the drag that ended last was a copy (for its drop handlers). */
export const lastDragWasCopy = () => lastDropCopy;

/** Whether the active drag would currently copy. */
export const copyDragActive = () => point !== null && modifier;
