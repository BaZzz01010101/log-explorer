import { Menu as MantineMenu } from "@mantine/core";
import {
  cloneElement,
  createContext,
  useContext,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type ComponentProps,
  type ReactElement,
} from "react";

export const MENU_OPEN_EVENT = "explorer:menu-open";
const MenuId = createContext("");

function AppMenu({
  opened,
  onChange,
  children,
  ...props
}: ComponentProps<typeof MantineMenu>) {
  const id = useId();
  const [localOpen, setLocalOpen] = useState(false);
  const open = opened ?? localOpen;
  const change = (value: boolean) => {
    setLocalOpen(value);
    onChange?.(value);
  };
  const latest = useRef({ open, change });
  latest.current = { open, change };
  useLayoutEffect(() => {
    if (
      typeof document === "undefined" ||
      typeof window === "undefined" ||
      typeof window.addEventListener !== "function"
    )
      return;
    const dismiss = (event: Event) => {
      if (!latest.current.open) return;
      if (event instanceof CustomEvent) {
        if (event.detail !== id) latest.current.change(false);
      } else {
        const owner =
          event.target instanceof Element
            ? event.target.closest("[data-app-menu-id]")
            : null;
        if (
          owner?.getAttribute("data-app-menu-id") !== id ||
          owner?.hasAttribute("data-context-menu-trigger")
        )
          latest.current.change(false);
      }
    };
    const dismissOnEscape = (event: KeyboardEvent) => {
      if (!latest.current.open || event.key !== "Escape") return;
      event.preventDefault();
      event.stopPropagation();
      latest.current.change(false);
    };
    document.addEventListener("keydown", dismissOnEscape, true);
    window.addEventListener(MENU_OPEN_EVENT, dismiss);
    window.addEventListener("blur", dismiss);
    document.addEventListener("pointerdown", dismiss, true);
    document.addEventListener("click", dismiss, true);
    return () => {
      document.removeEventListener("keydown", dismissOnEscape, true);
      window.removeEventListener(MENU_OPEN_EVENT, dismiss);
      window.removeEventListener("blur", dismiss);
      document.removeEventListener("pointerdown", dismiss, true);
      document.removeEventListener("click", dismiss, true);
    };
  }, [id]);
  useLayoutEffect(() => {
    if (
      open &&
      typeof window !== "undefined" &&
      typeof window.dispatchEvent === "function"
    )
      window.dispatchEvent(new CustomEvent(MENU_OPEN_EVENT, { detail: id }));
  }, [open, id]);
  return (
    <MenuId.Provider value={id}>
      <MantineMenu {...props} opened={open} onChange={change}>
        {children}
      </MantineMenu>
    </MenuId.Provider>
  );
}

function Target({
  children,
  ...props
}: ComponentProps<typeof MantineMenu.Target>) {
  const id = useContext(MenuId);
  return (
    <MantineMenu.Target {...props}>
      {cloneElement(children as ReactElement<Record<string, unknown>>, {
        "data-app-menu-id": id,
      })}
    </MantineMenu.Target>
  );
}
function ContextMenu({
  children,
  ...props
}: ComponentProps<typeof MantineMenu.ContextMenu>) {
  const id = useContext(MenuId);
  return (
    <MantineMenu.ContextMenu {...props}>
      {cloneElement(children as ReactElement<Record<string, unknown>>, {
        "data-app-menu-id": id,
        "data-context-menu-trigger": "",
      })}
    </MantineMenu.ContextMenu>
  );
}
function Dropdown(props: ComponentProps<typeof MantineMenu.Dropdown>) {
  const id = useContext(MenuId);
  return <MantineMenu.Dropdown {...props} data-app-menu-id={id} />;
}
export const Menu = Object.assign(AppMenu, {
  Target,
  ContextMenu,
  Dropdown,
  Item: MantineMenu.Item,
  Label: MantineMenu.Label,
  Divider: MantineMenu.Divider,
});
