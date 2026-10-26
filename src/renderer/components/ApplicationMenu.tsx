import { ActionIcon } from "@mantine/core";
import {
  IconSettings,
  IconLayoutSidebar,
  IconMoon,
  IconPlus,
  IconRestore,
  IconSun,
  IconX,
} from "@tabler/icons-react";
import type { Dispatch } from "react";
import type { Workspace } from "../../shared/contracts";
import type { WindowAction } from "../../shared/window-chrome";
import { createTab, type WorkspaceAction } from "../workspace";
import { Menu } from "./AppMenu";
import { shortcutKeys } from "../shortcuts";
import appIcon from "../../../build/icon.svg";

export function ApplicationMenu({
  workspace,
  dispatch,
  onSettings,
  onToggleSidePanel,
  version,
}: {
  workspace: Workspace;
  dispatch: Dispatch<WorkspaceAction>;
  onSettings(): void;
  onToggleSidePanel(): void;
  version: string;
}) {
  const nativeAction = (action: WindowAction) => {
    void window.explorer.windowAction(action);
  };
  const dark = workspace.preferences.theme === "dark";
  const hint = (action: string, fixed?: string) => {
    const keys = shortcutKeys(
      fixed ?? workspace.preferences.shortcuts[action] ?? "",
    );
    return (
      <span className="application-menu-shortcut" aria-hidden="true">
        {keys.length
          ? keys.map((key, index) => (
              <span className="application-menu-key-part" key={index}>
                {index > 0 && (
                  <span className="application-menu-key-separator">+</span>
                )}
                <kbd>{key}</kbd>
              </span>
            ))
          : "Unassigned"}
      </span>
    );
  };
  return (
    <Menu position="right-start" width={320} offset={6}>
      <Menu.Target>
        <ActionIcon
          className="application-menu-button"
          size={36}
          variant="subtle"
          aria-label="Application menu"
          data-tooltip="Application menu"
        >
          <img src={appIcon} width={27} height={27} alt="" draggable={false} />
        </ActionIcon>
      </Menu.Target>
      <Menu.Dropdown>
        <Menu.Label>
          AWS Log Explorer{" "}
          <span className="application-menu-version">v{version}</span>
        </Menu.Label>
        <Menu.Item
          leftSection={<IconPlus size={15} />}
          rightSection={hint("newTab")}
          onClick={() =>
            dispatch({
              type: "tab/open",
              tab: createTab(
                workspace.activeConnectionId ?? workspace.connections[0].id,
                [],
              ),
            })
          }
        >
          New log view
        </Menu.Item>
        <Menu.Item
          leftSection={<IconRestore size={15} />}
          rightSection={hint("reopenTab")}
          disabled={!workspace.closedTabs.length}
          onClick={() => dispatch({ type: "tab/reopen" })}
        >
          Reopen closed tab
        </Menu.Item>
        <Menu.Divider />
        <Menu.Item
          leftSection={<IconLayoutSidebar size={15} />}
          rightSection={hint("toggleSidebar")}
          onClick={onToggleSidePanel}
        >
          Toggle side panel
        </Menu.Item>
        <Menu.Item
          leftSection={dark ? <IconSun size={15} /> : <IconMoon size={15} />}
          rightSection={hint("toggleTheme")}
          onClick={() =>
            dispatch({
              type: "preferences/update",
              patch: { theme: dark ? "light" : "dark" },
            })
          }
        >
          Switch to {dark ? "light" : "dark"} theme
        </Menu.Item>
        <Menu.Item
          rightSection={hint("", "Ctrl++")}
          onClick={() => nativeAction("zoom-in")}
        >
          Zoom in
        </Menu.Item>
        <Menu.Item
          rightSection={hint("", "Ctrl+−")}
          onClick={() => nativeAction("zoom-out")}
        >
          Zoom out
        </Menu.Item>
        <Menu.Item
          rightSection={hint("", "Ctrl+0")}
          onClick={() => nativeAction("reset-zoom")}
        >
          Reset zoom
        </Menu.Item>
        <Menu.Item
          rightSection={hint("", "F11")}
          onClick={() => nativeAction("toggle-fullscreen")}
        >
          Toggle full screen
        </Menu.Item>
        <Menu.Divider />
        <Menu.Item
          leftSection={<IconSettings size={15} />}
          rightSection={hint("openSettings")}
          onClick={onSettings}
        >
          Settings
        </Menu.Item>
        <Menu.Item
          leftSection={<IconX size={15} />}
          rightSection={hint("", "Alt+F4")}
          onClick={() => nativeAction("close")}
        >
          Close window
        </Menu.Item>
      </Menu.Dropdown>
    </Menu>
  );
}
