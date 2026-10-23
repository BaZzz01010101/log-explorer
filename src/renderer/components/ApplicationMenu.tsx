import { ActionIcon } from "@mantine/core";
import {
  IconAdjustments,
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
import appIcon from "../../../build/icon.svg";

export function ApplicationMenu({
  workspace,
  dispatch,
  onSettings,
  onExplorer,
  explorerVisible,
}: {
  workspace: Workspace;
  dispatch: Dispatch<WorkspaceAction>;
  onSettings(): void;
  onExplorer(): void;
  explorerVisible: boolean;
}) {
  const nativeAction = (action: WindowAction) => {
    void window.explorer.windowAction(action);
  };
  const dark = workspace.preferences.theme === "dark";
  return (
    <Menu position="right-start" width={230} offset={6}>
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
        <Menu.Label>AWS Log Explorer</Menu.Label>
        <Menu.Item
          leftSection={<IconPlus size={15} />}
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
          disabled={!workspace.closedTabs.length}
          onClick={() => dispatch({ type: "tab/reopen" })}
        >
          Reopen closed tab
        </Menu.Item>
        <Menu.Divider />
        <Menu.Item
          leftSection={<IconLayoutSidebar size={15} />}
          onClick={onExplorer}
        >
          {explorerVisible ? "Hide explorer" : "Show explorer"}
        </Menu.Item>
        <Menu.Item
          leftSection={dark ? <IconSun size={15} /> : <IconMoon size={15} />}
          onClick={() =>
            dispatch({
              type: "preferences/update",
              patch: { theme: dark ? "light" : "dark" },
            })
          }
        >
          Switch to {dark ? "light" : "dark"} theme
        </Menu.Item>
        <Menu.Item onClick={() => nativeAction("zoom-in")}>Zoom in</Menu.Item>
        <Menu.Item onClick={() => nativeAction("zoom-out")}>Zoom out</Menu.Item>
        <Menu.Item onClick={() => nativeAction("reset-zoom")}>
          Reset zoom
        </Menu.Item>
        <Menu.Item onClick={() => nativeAction("toggle-fullscreen")}>
          Toggle full screen
        </Menu.Item>
        <Menu.Divider />
        <Menu.Item
          leftSection={<IconAdjustments size={15} />}
          onClick={onSettings}
        >
          Settings
        </Menu.Item>
        <Menu.Item
          leftSection={<IconX size={15} />}
          onClick={() => nativeAction("close")}
        >
          Close window
        </Menu.Item>
      </Menu.Dropdown>
    </Menu>
  );
}
