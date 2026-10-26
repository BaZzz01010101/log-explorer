import {} from "@mantine/core";
import { Menu } from "./AppMenu";
import type { ColumnConfig } from "../../shared/contracts";
import {
  applyColumnAction,
  isProtectedColumn,
  type ColumnAction,
} from "../column-actions";

export interface ColumnHeaderMenuTarget {
  path: string;
  origin?: HTMLElement;
  x: number;
  y: number;
}

const actions: [ColumnAction, string][] = [
  ["move-left", "Move left"],
  ["move-right", "Move right"],
  ["pin", "Pin"],
  ["pin-left", "Pin left"],
  ["unpin", "Unpin"],
  ["unpin-right", "Unpin right"],
];

export function ColumnHeaderMenu({
  target,
  columns,
  onClose,
  onChange,
}: {
  target: ColumnHeaderMenuTarget | null;
  columns: ColumnConfig[];
  onClose(): void;
  onChange(columns: ColumnConfig[]): void;
}) {
  if (
    !target ||
    !columns.some((column) => column.path === target.path && !column.hidden)
  )
    return null;
  const close = () => {
    const origin = target.origin;
    onClose();
    requestAnimationFrame(() => {
      // Restore keyboard navigation after the menu disappears, while respecting
      // a focusable control the user clicked outside the menu.
      if (origin?.isConnected && document.activeElement === document.body)
        origin.focus({ preventScroll: true });
    });
  };
  return (
    <Menu
      opened
      onChange={(opened) => {
        if (!opened) close();
      }}
      position="bottom-start"
      offset={4}
      withinPortal
      returnFocus={false}
      transitionProps={{ duration: 0 }}
    >
      <Menu.Target>
        <span
          aria-hidden="true"
          style={{
            position: "fixed",
            left: target.x,
            top: target.y,
            width: 0,
            height: 0,
            pointerEvents: "none",
          }}
        />
      </Menu.Target>
      <Menu.Dropdown
        aria-label="Column actions"
        onKeyDown={(event) => {
          event.stopPropagation();
          if (event.key === "Escape") {
            event.preventDefault();
            close();
          }
        }}
      >
        {actions.map(([action, label]) => {
          const next = applyColumnAction(columns, target.path, action);
          return (
            <Menu.Item
              key={action}
              disabled={next === columns}
              onClick={() => {
                onChange(next);
                close();
              }}
            >
              {label}
            </Menu.Item>
          );
        })}
        <Menu.Divider />
        <Menu.Item
          disabled={
            applyColumnAction(columns, target.path, "remove") === columns
          }
          onClick={() => {
            onChange(applyColumnAction(columns, target.path, "remove"));
            close();
          }}
        >
          {isProtectedColumn(target.path) ? "Hide column" : "Remove column"}
        </Menu.Item>
      </Menu.Dropdown>
    </Menu>
  );
}
