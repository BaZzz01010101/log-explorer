/**
 * Dismisses popovers and selects. Mantine waits for `mousedown`, which drag
 * handles and resizers suppress or stop; this event always reaches the document.
 */
export const OUTSIDE_PRESS_EVENT = "explorer:press";

export function installOutsidePress(
  doc: Document,
  onWindowPress?: (listener: () => void) => () => void,
): () => void {
  const press = (event: Event) =>
    event.target?.dispatchEvent(
      new Event(OUTSIDE_PRESS_EVENT, { bubbles: true, composed: true }),
    );
  doc.addEventListener("pointerdown", press, true);
  const unsubscribe = onWindowPress?.(() =>
    doc.documentElement.dispatchEvent(
      new PointerEvent("pointerdown", { bubbles: true }),
    ),
  );
  return () => {
    doc.removeEventListener("pointerdown", press, true);
    unsubscribe?.();
  };
}
