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
import { tooltipIsRedundant } from "../tooltip-visibility";
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
  const [suppressed, setSuppressed] = useState(false);
  const owner = useRef<HTMLElement | null>(null);
  const latest = useRef({ label: props.label, disabled });
  latest.current = { label: props.label, disabled };
  const timers = useRef<{
    open?: ReturnType<typeof setTimeout>;
    close?: ReturnType<typeof setTimeout>;
  }>({});
  const clear = () => {
    clearTimeout(timers.current.open);
    clearTimeout(timers.current.close);
  };
  const show = (element: HTMLElement) => {
    clear();
    owner.current = element;
    timers.current.open = setTimeout(() => {
      window.dispatchEvent(new CustomEvent(TOOLTIP_OPEN_EVENT, { detail: id }));
      const hide =
        owner.current !== element ||
        !element.isConnected ||
        latest.current.disabled ||
        tooltipIsRedundant(element, latest.current.label);
      setSuppressed(Boolean(hide));
      setVisible(!hide);
    }, openDelay);
  };
  useEffect(() => {
    if (!(opened ?? visible) || !owner.current) return;
    const recheck = () => {
      const redundant =
        !owner.current?.isConnected ||
        Boolean(
          owner.current &&
          tooltipIsRedundant(owner.current, latest.current.label),
        );
      setSuppressed(redundant);
      if (redundant) {
        clear();
        setVisible(false);
      }
    };
    recheck();
    window.addEventListener("resize", recheck);
    document.addEventListener("scroll", recheck, true);
    return () => {
      window.removeEventListener("resize", recheck);
      document.removeEventListener("scroll", recheck, true);
    };
  }, [visible, opened, props.label, children]);
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
      opened={(opened ?? visible) && !suppressed}
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
              if (!event.buttons) show(event.currentTarget as HTMLElement);
              target.props.onMouseEnter?.(event);
            },
            onMouseLeave: (event) => {
              leave(event.buttons);
              target.props.onMouseLeave?.(event);
            },
            onFocus: (event) => {
              if (document.documentElement.dataset.inputModality === "keyboard")
                show(event.currentTarget as HTMLElement);
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
  const recheckCurrent = useRef<(() => void) | undefined>(undefined);
  useEffect(() => {
    let activeTarget: HTMLElement | null = null;
    let shown: { target: HTMLElement; text: string } | null = null;
    const clear = () => {
      clearTimeout(timers.current.open);
      clearTimeout(timers.current.close);
    };
    const hide = () => {
      clear();
      activeTarget = null;
      shown = null;
      setHint(null);
    };
    const recheck = () => {
      if (!shown) return;
      const { target } = shown;
      const text = target.dataset.tooltip;
      if (!target.isConnected || !text || tooltipIsRedundant(target, text)) {
        hide();
      } else if (text !== shown.text) {
        shown = { target, text };
        setHint(shown);
      }
    };
    recheckCurrent.current = recheck;
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
        activeTarget === target &&
        event.relatedTarget instanceof Node &&
        target.contains(event.relatedTarget)
      ) {
        recheck();
        return;
      }
      clear();
      activeTarget = target;
      timers.current.open = setTimeout(() => {
        if (activeTarget !== target || !target.isConnected) return;
        window.dispatchEvent(
          new CustomEvent(TOOLTIP_OPEN_EVENT, { detail: id }),
        );
        const text = target.dataset.tooltip;
        shown =
          text && !tooltipIsRedundant(target, text) ? { target, text } : null;
        setHint(shown);
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
      if ((!target || target !== activeTarget) && !inside(event.target)) return;
      if (target?.contains(event.relatedTarget as Node | null)) return;
      // Only the current owner can dismiss its hint. Cancel both timers so
      // rapid exits cannot leave an untracked close that cancels the next open.
      clear();
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
    window.addEventListener("resize", recheck);
    document.addEventListener("scroll", recheck, true);
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
      window.removeEventListener("resize", recheck);
      document.removeEventListener("scroll", recheck, true);
      recheckCurrent.current = undefined;
    };
  }, [id]);
  useEffect(() => recheckCurrent.current?.());
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
        hint.target.closest(".activity-bar, .highlight-tree-row")
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
