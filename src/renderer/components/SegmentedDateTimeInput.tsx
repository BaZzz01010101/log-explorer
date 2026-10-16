import { TextInput } from "@mantine/core";
import { useEffect, useLayoutEffect, useRef } from "react";
import { stepDateTimeSegment } from "../time-range";

interface Props {
  label: string;
  value: string;
  kind: "date" | "time" | "duration";
  onChange(value: string): void;
  error?: boolean;
}

export function SegmentedDateTimeInput({
  label,
  value,
  kind,
  onChange,
  error,
}: Props) {
  const input = useRef<HTMLInputElement>(null);
  const current = useRef({ value, kind, onChange });
  current.current = { value, kind, onChange };
  const pending = useRef<ReturnType<typeof stepDateTimeSegment>>(null);

  const step = (element: HTMLInputElement, delta: number) => {
    if (document.activeElement !== element) return false;
    const next = stepDateTimeSegment(
      current.current.value,
      current.current.kind,
      element.selectionStart ?? 0,
      delta,
    );
    if (!next) return false;
    pending.current = next;
    current.current.onChange(next.value);
    if (next.value === current.current.value) {
      element.setSelectionRange(next.selectionStart, next.selectionEnd);
      pending.current = null;
    }
    return true;
  };

  useLayoutEffect(() => {
    const next = pending.current;
    pending.current = null;
    if (
      next &&
      next.value === value &&
      document.activeElement === input.current
    )
      input.current?.setSelectionRange(next.selectionStart, next.selectionEnd);
  });

  useEffect(() => {
    const element = input.current;
    if (!element) return;
    const wheel = (event: WheelEvent) => {
      if (event.deltaY !== 0 && step(element, event.deltaY < 0 ? 1 : -1))
        event.preventDefault();
    };
    element.addEventListener("wheel", wheel, { passive: false });
    return () => element.removeEventListener("wheel", wheel);
  }, []);

  return (
    <TextInput
      ref={input}
      type="text"
      label={label}
      aria-label={label}
      value={value}
      error={error}
      inputMode="numeric"
      maxLength={kind === "date" ? 10 : kind === "time" ? 8 : 4}
      placeholder={
        kind === "date"
          ? "YYYY/MM/DD"
          : kind === "time"
            ? "HH:mm:ss"
            : undefined
      }
      onChange={(event) => onChange(event.currentTarget.value)}
      onKeyDown={(event) => {
        if (
          (event.key === "ArrowUp" || event.key === "ArrowDown") &&
          step(event.currentTarget, event.key === "ArrowUp" ? 1 : -1)
        )
          event.preventDefault();
      }}
    />
  );
}
