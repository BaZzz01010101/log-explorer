import { useEffect, useRef, useState } from "react";

const INPUTS = [
  "pointermove",
  "pointerdown",
  "wheel",
  "keydown",
  "dragover",
] as const;

/**
 * Whether the app has had no input for the given minutes. Input over an
 * unfocused window counts too. 0 never sleeps.
 */
export function useInactivitySleep(
  backgroundMinutes: number,
  idleMinutes: number,
): boolean {
  const [asleep, setAsleep] = useState(false);
  const sleeping = useRef(asleep);
  sleeping.current = asleep;
  const lastActivity = useRef(Date.now());
  useEffect(() => {
    // Content moving under a still pointer is not input.
    let pointer = "";
    let timer: ReturnType<typeof setTimeout> | undefined;
    const check = () => {
      clearTimeout(timer);
      const minutes = document.hasFocus() ? idleMinutes : backgroundMinutes;
      const remaining = minutes
        ? lastActivity.current + minutes * 60_000 - Date.now()
        : Infinity;
      setAsleep(remaining <= 0);
      if (remaining > 0 && remaining < Infinity)
        timer = setTimeout(check, remaining);
    };
    const activity = () => {
      const now = Date.now();
      // Moving the pointer reports input many times a second.
      const recent = now - lastActivity.current < 1000;
      lastActivity.current = now;
      if (!recent) check();
    };
    const input = (event: Event) => {
      if (event.type === "pointermove" || event.type === "dragover") {
        const { screenX, screenY } = event as MouseEvent;
        const position = `${screenX},${screenY}`;
        if (position === pointer) return;
        pointer = position;
      }
      activity();
    };
    const focus = () => {
      lastActivity.current = Date.now();
      check();
    };
    // Another app coming to the front is not input while asleep.
    const blur = () => {
      if (!sleeping.current) focus();
    };
    for (const type of INPUTS)
      window.addEventListener(type, input, { capture: true, passive: true });
    window.addEventListener("focus", focus);
    window.addEventListener("blur", blur);
    check();
    return () => {
      clearTimeout(timer);
      for (const type of INPUTS)
        window.removeEventListener(type, input, { capture: true });
      window.removeEventListener("focus", focus);
      window.removeEventListener("blur", blur);
    };
  }, [backgroundMinutes, idleMinutes]);
  return asleep;
}
