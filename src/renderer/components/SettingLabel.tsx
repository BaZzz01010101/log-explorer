import { useEffect, useRef, useState, type ReactNode } from "react";
import { IconHelpCircle } from "@tabler/icons-react";
import { Tooltip } from "./AppTooltip";
import { MENU_OPEN_EVENT } from "./AppMenu";
import "./setting-label.css";

export function SettingLabel({
  label,
  help,
}: {
  label: ReactNode;
  help?: ReactNode;
}) {
  const [opened, setOpened] = useState(false);
  const button = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (
      !opened ||
      typeof document === "undefined" ||
      typeof window === "undefined"
    )
      return;
    const close = () => setOpened(false);
    const outside = (event: Event) => {
      if (
        event.target instanceof Element &&
        (button.current?.contains(event.target) ||
          event.target.closest('[role="tooltip"]'))
      )
        return;
      close();
    };
    const key = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        close();
      }
    };
    document.addEventListener("pointerdown", outside, true);
    document.addEventListener("keydown", key, true);
    window.addEventListener("blur", close);
    window.addEventListener(MENU_OPEN_EVENT, close);
    return () => {
      document.removeEventListener("pointerdown", outside, true);
      document.removeEventListener("keydown", key, true);
      window.removeEventListener("blur", close);
      window.removeEventListener(MENU_OPEN_EVENT, close);
    };
  }, [opened]);
  return (
    <span className="settings-field-label">
      <span>{label}</span>
      {help && (
        <Tooltip
          label={help}
          opened={opened || undefined}
          onDismiss={() => setOpened(false)}
          maw={330}
        >
          <button
            ref={button}
            type="button"
            className="settings-label-help"
            aria-label={`Help for ${typeof label === "string" ? label : "this setting"}`}
            aria-expanded={opened}
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              setOpened((value) => !value);
            }}
          >
            <IconHelpCircle size={14} aria-hidden="true" />
          </button>
        </Tooltip>
      )}
    </span>
  );
}
