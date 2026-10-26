import { Tooltip as MantineTooltip, type TooltipProps } from "@mantine/core";
import {
  cloneElement,
  isValidElement,
  useEffect,
  useId,
  useRef,
  useState,
  type ReactElement,
} from "react";
import { MENU_OPEN_EVENT } from "./AppMenu";
import "./app-tooltip.css";
const TOOLTIP_OPEN_EVENT = "explorer:tooltip-open";

export function Tooltip({
  children,
  disabled,
  className,
  openDelay = 450,
  closeDelay = 350,
  opened,
  ...props
}: TooltipProps) {
  const id = useId();
  const [visible, setVisible] = useState(false);
  const timers = useRef<{
    open?: ReturnType<typeof setTimeout>;
    close?: ReturnType<typeof setTimeout>;
  }>({});
  const clear = () => {
    clearTimeout(timers.current.open);
    clearTimeout(timers.current.close);
  };
  const show = () => {
    clear();
    timers.current.open = setTimeout(() => {
      window.dispatchEvent(new CustomEvent(TOOLTIP_OPEN_EVENT, { detail: id }));
      setVisible(true);
    }, openDelay);
  };
  const leave = (buttons = 0) => {
    if (buttons) return;
    clear();
    timers.current.close = setTimeout(() => setVisible(false), closeDelay);
  };
  useEffect(() => {
    if (
      typeof document === "undefined" ||
      typeof window === "undefined" ||
      typeof window.addEventListener !== "function"
    )
      return;
    const hide = (event: Event) => {
      if (
        event.type === TOOLTIP_OPEN_EVENT &&
        event instanceof CustomEvent &&
        event.detail === id
      )
        return;
      if (
        !(event.target instanceof Element) ||
        !event.target.closest('[role="tooltip"]')
      ) {
        clear();
        setVisible(false);
      }
    };
    const key = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        clear();
        setVisible(false);
      }
    };
    window.addEventListener(MENU_OPEN_EVENT, hide);
    window.addEventListener(TOOLTIP_OPEN_EVENT, hide);
    window.addEventListener("blur", hide);
    document.addEventListener("contextmenu", hide, true);
    document.addEventListener("pointerdown", hide, true);
    document.addEventListener("keydown", key);
    return () => {
      clear();
      window.removeEventListener(MENU_OPEN_EVENT, hide);
      window.removeEventListener(TOOLTIP_OPEN_EVENT, hide);
      window.removeEventListener("blur", hide);
      document.removeEventListener("contextmenu", hide, true);
      document.removeEventListener("pointerdown", hide, true);
      document.removeEventListener("keydown", key);
    };
  }, [id]);
  const target = isValidElement(children)
    ? (children as ReactElement<{
        onMouseEnter?: (event: React.MouseEvent) => void;
        onMouseLeave?: (event: React.MouseEvent) => void;
        onFocus?: (event: React.FocusEvent) => void;
        onBlur?: (event: React.FocusEvent) => void;
      }>)
    : null;
  return (
    <MantineTooltip
      interactive
      multiline
      transitionProps={{ duration: 0 }}
      {...props}
      disabled={disabled}
      opened={opened ?? visible}
      classNames={{
        tooltip: ["app-tooltip", className].filter(Boolean).join(" "),
      }}
      onMouseOver={clear}
      onMouseOut={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null))
          leave(event.buttons);
      }}
    >
      {target
        ? cloneElement(target, {
            onMouseEnter: (event) => {
              if (!event.buttons) show();
              target.props.onMouseEnter?.(event);
            },
            onMouseLeave: (event) => {
              leave(event.buttons);
              target.props.onMouseLeave?.(event);
            },
            onFocus: (event) => {
              if (document.documentElement.dataset.inputModality === "keyboard")
                show();
              target.props.onFocus?.(event);
            },
            onBlur: (event) => {
              leave();
              target.props.onBlur?.(event);
            },
          })
        : children}
    </MantineTooltip>
  );
}

// One delegated tooltip for string hints, including virtualized cells. No extra
// cell wrappers or handlers: live updates retain the original selectable DOM.
export function TextTooltips() {
  const id = useId();
  const [hint, setHint] = useState<{
    target: HTMLElement;
    text: string;
  } | null>(null);
  const timers = useRef<{
    open?: ReturnType<typeof setTimeout>;
    close?: ReturnType<typeof setTimeout>;
  }>({});
  useEffect(() => {
    const clear = () => {
      clearTimeout(timers.current.open);
      clearTimeout(timers.current.close);
    };
    const hide = () => {
      clear();
      setHint(null);
    };
    const inside = (element: EventTarget | null) =>
      element instanceof Element &&
      Boolean(element.closest("[data-text-tooltip]"));
    const over = (event: MouseEvent | FocusEvent) => {
      if (inside(event.target)) {
        clear();
        return;
      }
      if (event instanceof MouseEvent && event.buttons) return;
      if (
        event instanceof FocusEvent &&
        document.documentElement.dataset.inputModality !== "keyboard"
      )
        return;
      const target =
        event.target instanceof Element
          ? event.target.closest<HTMLElement>("[data-tooltip]")
          : null;
      if (!target?.dataset.tooltip) return;
      if (
        event.relatedTarget instanceof Node &&
        target.contains(event.relatedTarget)
      )
        return;
      clear();
      timers.current.open = setTimeout(() => {
        window.dispatchEvent(
          new CustomEvent(TOOLTIP_OPEN_EVENT, { detail: id }),
        );
        setHint({ target, text: target.dataset.tooltip! });
      }, 450);
    };
    const out = (event: MouseEvent | FocusEvent) => {
      if (event instanceof MouseEvent && event.buttons) return;
      if (inside(event.relatedTarget)) {
        clear();
        return;
      }
      const target =
        event.target instanceof Element
          ? event.target.closest("[data-tooltip]")
          : null;
      if (target?.contains(event.relatedTarget as Node | null)) return;
      clearTimeout(timers.current.open);
      timers.current.close = setTimeout(hide, 350);
    };
    const press = (event: Event) => {
      if (!inside(event.target)) hide();
    };
    const otherTooltip = (event: Event) => {
      if (!(event instanceof CustomEvent) || event.detail !== id) hide();
    };
    const key = (event: KeyboardEvent) => {
      if (event.key === "Escape") hide();
    };
    document.addEventListener("mouseover", over);
    document.addEventListener("mouseout", out);
    document.addEventListener("focusin", over);
    document.addEventListener("focusout", out);
    document.addEventListener("pointerdown", press, true);
    document.addEventListener("contextmenu", hide, true);
    document.addEventListener("keydown", key);
    window.addEventListener(MENU_OPEN_EVENT, hide);
    window.addEventListener(TOOLTIP_OPEN_EVENT, otherTooltip);
    window.addEventListener("blur", hide);
    return () => {
      clear();
      document.removeEventListener("mouseover", over);
      document.removeEventListener("mouseout", out);
      document.removeEventListener("focusin", over);
      document.removeEventListener("focusout", out);
      document.removeEventListener("pointerdown", press, true);
      document.removeEventListener("contextmenu", hide, true);
      document.removeEventListener("keydown", key);
      window.removeEventListener(MENU_OPEN_EVENT, hide);
      window.removeEventListener(TOOLTIP_OPEN_EVENT, otherTooltip);
      window.removeEventListener("blur", hide);
    };
  }, [id]);
  if (!hint) return null;
  const overlay = hint.target.closest<HTMLElement>(
    '[role="menu"], .mantine-Popover-dropdown',
  );
  return (
    <MantineTooltip
      data-text-tooltip=""
      target={hint?.target}
      label={hint?.text}
      opened={Boolean(hint)}
      interactive
      multiline
      position={
        hint.target.closest(".activity-bar")
          ? "right"
          : hint.target.closest('[role="menu"], .mantine-Popover-dropdown')
            ? "right-start"
            : "top"
      }
      classNames={{ tooltip: "app-tooltip" }}
      portalProps={overlay ? { target: overlay } : undefined}
      floatingStrategy="fixed"
      transitionProps={{ duration: 0 }}
    />
  );
}
