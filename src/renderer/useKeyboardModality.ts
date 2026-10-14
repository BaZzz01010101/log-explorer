import { useEffect } from "react";
import "./keyboard-modality.css";

export function installKeyboardModality(target: Document): () => void {
  const root = target.documentElement;
  const previous = root.getAttribute("data-input-modality");
  const setModality = (value: "pointer" | "keyboard") => {
    if (root.getAttribute("data-input-modality") !== value)
      root.setAttribute("data-input-modality", value);
  };
  const keyboard = (event: KeyboardEvent) => {
    if (["Shift", "Control", "Alt", "Meta", "AltGraph"].includes(event.key))
      return;
    setModality("keyboard");
  };
  const pointer = () => setModality("pointer");
  const options = { capture: true };
  setModality("pointer");
  target.addEventListener("keydown", keyboard, options);
  target.addEventListener("pointerdown", pointer, options);
  return () => {
    target.removeEventListener("keydown", keyboard, options);
    target.removeEventListener("pointerdown", pointer, options);
    if (previous === null) root.removeAttribute("data-input-modality");
    else root.setAttribute("data-input-modality", previous);
  };
}

export function useKeyboardModality(): void {
  useEffect(() => installKeyboardModality(document), []);
}
