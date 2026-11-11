import { useEffect, useReducer, useRef, useState } from "react";
import { flushSync } from "react-dom";
import {
  ActionIcon,
  Alert,
  Badge,
  Button,
  Group,
  MantineProvider,
  Text,
  createTheme,
} from "@mantine/core";
import { Tooltip } from "./components/AppTooltip";
import { ApplicationMenu } from "./components/ApplicationMenu";
import { Notifications, notifications } from "@mantine/notifications";
import {
  IconSettings,
  IconBrandGoogle,
  IconChevronRight,
  IconCloud,
  IconLayoutColumns,
  IconLayoutRows,
  IconPlus,
  IconX,
} from "@tabler/icons-react";
import type {
  EnvironmentInfo,
  LogEvent,
  LogSource,
  LogTab,
  GcpSource,
  GcpIdentity,
} from "../shared/contracts";
import {
  createTab,
  createWorkspace,
  workspaceReducer,
  projectFavoriteOpen,
  projectResourceAction,
} from "./workspace";
import {
  activeEntryId,
  logTabLabel,
  workspaceEntries,
} from "./workspace-entries";
import { useLogJobs } from "./useLogJobs";
import { useKeyboardModality } from "./useKeyboardModality";
import { PaneLayoutView } from "./components/PaneLayout";
import {
  legacyLayout,
  nextSplitAxis,
  MAX_SPLIT_PANES,
} from "../shared/pane-layout";
import { ResourceSidebar } from "./components/ResourceSidebar";
import { GcpExplorer } from "./components/GcpExplorer";
import { gcpResourceToLogSource } from "./gcp-open";
import {
  WorkspaceTabs,
  WorkspaceDragSurface,
  PaneDropTarget,
  PaneDragHeader,
} from "./components/WorkspaceTabs";
import { ResourceDropSurface } from "./components/ResourceDropSurface";
import { QueryPane } from "./components/QueryPane";
import { RetainedViews, RetainedViewSlot } from "./components/RetainedViews";
import { Settings } from "./components/Settings";
import {
  captureSettingsPreview,
  type SettingsPreviewSnapshot,
} from "./settings-preview";
import "./components/workspace-tabs.css";
import "./app.css";
import "./floating-surfaces.css";
import "./toggle-buttons.css";
import { TextTooltips } from "./components/AppTooltip";
import { shortcutMatches } from "./shortcuts";
import {
  cycleRecentTabs,
  finishRecentTabCycle,
  observeTabFocus,
  visualTabId,
  type TabNavigationState,
} from "./tab-navigation";
import awsExplorerIcon from "../../build/aws-explorer.svg";
import {
  contextRangeLabel,
  contextTimeRange,
  type ContextRange,
} from "../shared/context-range";

const theme = createTheme({
  primaryColor: "indigo",
  fontFamily: "Segoe UI, Inter, system-ui, sans-serif",
  fontFamilyMonospace: "Cascadia Code, Consolas, monospace",
  defaultRadius: "sm",
  colors: {
    dark: [
      "#d6dce7",
      "#b2bdcf",
      "#8593aa",
      "#627089",
      "#354155",
      "#283345",
      "#1e2837",
      "#18212e",
      "#121a25",
      "#0d141e",
    ],
  },
  components: { Button: Button.extend({ defaultProps: { fw: 500 } }) },
});

export default function App() {
  useKeyboardModality();
  const [workspace, dispatch] = useReducer(
    workspaceReducer,
    undefined,
    createWorkspace,
  );
  const [ready, setReady] = useState(false);
  const [environment, setEnvironment] = useState<EnvironmentInfo | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsPreview, setSettingsPreview] =
    useState<SettingsPreviewSnapshot | null>(null);
  const [settingsPage, setSettingsPage] = useState<string | null>(null);
  const [settingsPageRequest, setSettingsPageRequest] = useState(0);
  const [sidePanel, setSidePanel] = useState<"explorer" | "gcp" | "settings">(
    "explorer",
  );
  const [windowControlsVisible, setWindowControlsVisible] = useState(false);
  const [contextOrigins, setContextOrigins] = useState<
    Record<string, LogEvent>
  >({});
  useEffect(() => {
    setContextOrigins((previous) => {
      const ids = new Set(workspace.tabs.map((tab) => tab.id));
      return Object.keys(previous).every((id) => ids.has(id))
        ? previous
        : Object.fromEntries(
            Object.entries(previous).filter(([id]) => ids.has(id)),
          );
    });
  }, [workspace.tabs]);
  const workspaceRef = useRef(workspace);
  const paneLayout =
    workspace.layout ??
    legacyLayout(
      workspace.panes.map((pane) => pane.id),
      workspace.splitSizes,
    );
  workspaceRef.current = workspace;
  const { runtimes, run, cancel } = useLogJobs(
    workspace,
    ready,
    (message) => {
      notifications.show({
        color: "red",
        title: "Could not stop previous query",
        message,
        autoClose: false,
      });
    },
    environment?.awsEnabled ?? false,
  );
  const runtimesRef = useRef(runtimes);
  runtimesRef.current = runtimes;
  const settingsVisible =
    settingsOpen || (workspace.sidebarVisible && sidePanel === "settings");
  const settingsVisibleRef = useRef(settingsVisible);
  settingsVisibleRef.current = settingsVisible;
  useEffect(() => {
    if (!settingsVisible) setSettingsPreview(null);
  }, [settingsVisible]);
  const activePane =
    workspace.panes.find((p) => p.id === workspace.activePaneId) ??
    workspace.panes[0];
  const activeTab = workspace.tabs.find((t) => t.id === activePane?.tabId);
  const activeConnectionId =
    workspace.activeConnectionId ?? workspace.connections[0].id;
  const entries = workspaceEntries(workspace);
  const activeWorkspaceTabId = activeEntryId(workspace);
  const tabNavigation = useRef<TabNavigationState>({ recentIds: [] });
  useEffect(() => {
    tabNavigation.current = observeTabFocus(
      tabNavigation.current,
      entries.map((entry) => entry.id),
      activeWorkspaceTabId,
    );
  }, [workspace]);
  const openSettings = () => {
    if (!settingsVisible)
      setSettingsPreview(
        captureSettingsPreview(workspaceRef.current, runtimesRef.current),
      );
    const detached = workspace.preferences.settingsDetached === true;
    setSettingsOpen(detached);
    setSidePanel(detached ? "explorer" : "settings");
    if (!detached)
      dispatch({ type: "workspace/update", patch: { sidebarVisible: true } });
  };
  const toggleSettings = () => {
    if (settingsOpen) setSettingsOpen(false);
    else if (workspace.sidebarVisible && sidePanel === "settings")
      dispatch({ type: "workspace/update", patch: { sidebarVisible: false } });
    else openSettings();
  };
  const toggleSidePanel = () => {
    dispatch({
      type: "workspace/update",
      patch: { sidebarVisible: !workspace.sidebarVisible },
    });
  };
  useEffect(() => {
    const showTimeRanges = () => {
      if (!settingsVisibleRef.current)
        setSettingsPreview(
          captureSettingsPreview(workspaceRef.current, runtimesRef.current),
        );
      setSettingsPage("time-ranges");
      setSettingsPageRequest((request) => request + 1);
      const detached =
        workspaceRef.current.preferences.settingsDetached === true;
      setSettingsOpen(detached);
      setSidePanel(detached ? "explorer" : "settings");
      if (!detached)
        dispatch({ type: "workspace/update", patch: { sidebarVisible: true } });
    };
    window.addEventListener(
      "explorer:open-time-range-settings",
      showTimeRanges,
    );
    return () =>
      window.removeEventListener(
        "explorer:open-time-range-settings",
        showTimeRanges,
      );
  }, []);
  const toggleExplorer = () => {
    const visible = workspace.sidebarVisible && sidePanel === "explorer";
    setSidePanel("explorer");
    dispatch({ type: "workspace/update", patch: { sidebarVisible: !visible } });
  };
  const toggleGcpExplorer = () => {
    const visible = workspace.sidebarVisible && sidePanel === "gcp";
    setSidePanel("gcp");
    dispatch({ type: "workspace/update", patch: { sidebarVisible: !visible } });
  };

  useEffect(() => {
    const overlay = (
      navigator as Navigator & {
        windowControlsOverlay?: EventTarget & { visible: boolean };
      }
    ).windowControlsOverlay;
    if (!overlay) return;
    const update = () => setWindowControlsVisible(overlay.visible);
    update();
    overlay.addEventListener("geometrychange", update);
    return () => overlay.removeEventListener("geometrychange", update);
  }, []);

  useEffect(() => {
    let disposed = false;
    Promise.all([
      window.explorer.loadWorkspace(),
      window.explorer.environment(),
    ])
      .then(([loaded, info]) => {
        if (disposed) return;
        if (loaded.workspace)
          dispatch({ type: "workspace/restore", workspace: loaded.workspace });
        setEnvironment(info);
        setReady(true);
        if (loaded.warning)
          notifications.show({
            color: "yellow",
            title: "Workspace recovery",
            message: loaded.warning,
            autoClose: false,
          });
      })
      .catch((error) => {
        if (!disposed) {
          setReady(true);
          notifications.show({
            color: "red",
            message: String(error),
            autoClose: false,
          });
        }
      });
    return () => {
      disposed = true;
    };
  }, []);
  useEffect(() => {
    if (!ready) return;
    const timer = setTimeout(() => {
      void window.explorer.saveWorkspace(workspace).catch((error) => {
        notifications.show({
          color: "red",
          title: "Could not save changes",
          message: String(error),
        });
      });
    }, 400);
    return () => clearTimeout(timer);
  }, [workspace, ready]);
  useEffect(
    () =>
      window.explorer.onBeforeClose(async () => {
        if (ready) {
          // Finish the focused field before taking the final workspace snapshot.
          flushSync(() => {
            if (document.activeElement instanceof HTMLElement)
              document.activeElement.blur();
          });
          await window.explorer.saveWorkspace(workspaceRef.current);
        }
      }),
    [ready],
  );

  const openSources = (
    connectionId: string,
    sources: LogSource[],
    mode: "preview" | "permanent" = "preview",
  ) => {
    let tab = createTab(connectionId, sources);
    const preset = workspace.presets.find(
      (p) => p.logGroup && sources.some((s) => s.logGroup === p.logGroup),
    );
    if (preset) tab = { ...tab, view: structuredClone(preset.view) };
    dispatch({
      type: mode === "preview" ? "tab/preview" : "tab/open-resource",
      tab,
    });
    for (const source of sources)
      dispatch({
        type: "recents/add",
        favorite: {
          connectionId,
          logGroup: source.logGroup,
          logStream:
            source.logStreams?.length === 1 ? source.logStreams[0] : undefined,
        },
      });
  };
  const openGcpSource = (source: GcpSource, identity: GcpIdentity, mode: "preview" | "permanent") => {
    try {
      const resource = gcpResourceToLogSource(source);
      const state = workspaceRef.current;
      let connection = state.connections.find((item) => item.mode === "gcp" && item.region === source.region && item.gcpIdentity?.configuration === identity.configuration && item.gcpIdentity?.account === identity.account && item.gcpIdentity?.quotaProject === identity.quotaProject);
      if (!connection) {
        if (state.connections.length >= 50) throw new Error("Connection limit reached. Remove an unused connection and retry.");
        connection = { id: `gcp-${crypto.randomUUID()}`, name: `Google Cloud · ${source.region}`, profile: identity.configuration, region: source.region, mode: "gcp", gcpIdentity: { ...identity } };
      }
      dispatch({ type: "gcp/open-source", connection, source: resource, mode });
    } catch (error) {
      notifications.show({ color: "red", message: error instanceof Error ? error.message : "Could not open Google Cloud source." });
    }
  };
  const applyGcpSource = (source: GcpSource, identity: GcpIdentity, mode: "add-sources" | "add-splits" | "new-split" | "new-multisource") => {
    try {
      const resource = gcpResourceToLogSource(source);
      const state = workspaceRef.current;
      let connection = state.connections.find((item) => item.mode === "gcp" && item.region === source.region && item.gcpIdentity?.configuration === identity.configuration && item.gcpIdentity?.account === identity.account && item.gcpIdentity?.quotaProject === identity.quotaProject);
      let next = state;
      if (!connection) {
        if (state.connections.length >= 50) throw new Error("Connection limit reached.");
        connection = { id: `gcp-${crypto.randomUUID()}`, name: `Google Cloud · ${source.region}`, profile: identity.configuration, region: source.region, mode: "gcp", gcpIdentity: { ...identity } };
        next = workspaceReducer(state, { type: "connections/set", connections: [...state.connections, connection] });
      }
      const payload = { connectionId: connection.id, sources: [resource] };
      const result = projectResourceAction(next, payload, mode);
      if (result.error) throw new Error(result.error);
      if (next !== state) dispatch({ type: "connections/set", connections: next.connections });
      dispatch({ type: "resources/apply", payload, mode });
    } catch (error) {
      notifications.show({ color: "red", message: error instanceof Error ? error.message : "Could not add Google Cloud source." });
    }
  };
  const execute = (tab: LogTab, live = false, more = false) => {
    if (!more) {
      const text = tab.filterPattern;
      if (text.trim())
        dispatch({
          type: "history/add",
          query: {
            id: crypto.randomUUID(),
            name: text.slice(0, 60),
            kind: "events",
            text,
            filterMode: tab.filterMode,
          },
        });
    }
    void run(tab, live, more);
  };
  const context = (tab: LogTab, event: LogEvent, range: ContextRange) => {
    if (!event.logGroup || !event.logStream) {
      notifications.show({
        color: "yellow",
        message:
          "This aggregate result has no source stream. Run an event query to inspect surrounding context.",
      });
      return;
    }
    let bounds: ReturnType<typeof contextTimeRange>;
    try {
      bounds = contextTimeRange(event.timestamp, range);
    } catch (error) {
      notifications.show({ color: "yellow", message: String(error) });
      return;
    }
    const connectionId = event.connectionId ?? tab.connectionId;
    const contextTab = {
      ...createTab(connectionId, [
        {
          connectionId,
          logGroup: event.logGroup,
          ...(event.gcpSource ? { gcp: event.gcpSource, ...(event.gcpSource.kind === "kubernetes" ? { logStreams: [event.logStream] } : {}) } : { logStreams: [event.logStream] }),
        },
      ]),
      title: `Context · ${contextRangeLabel(range)} · ${event.logStream.split("/").at(-1)}`,
      timePreset: "custom",
      customStart: new Date(bounds.startTime).toISOString(),
      customEnd: new Date(bounds.endTime).toISOString(),
    };
    setContextOrigins((previous) => ({
      ...previous,
      [contextTab.id]: { ...event, connectionId },
    }));
    dispatch({
      type: "tab/open",
      tab: contextTab,
    });
  };
  useEffect(() => {
    const keydown = (event: KeyboardEvent) => {
      if (
        document.querySelector('[data-shortcut-recording="true"]') ||
        (event.target instanceof Element &&
          event.target.closest("[data-shortcut-editor]"))
      )
        return;
      // Removing the native menu must retain its standard window shortcuts.
      const nativeAction =
        event.key === "F11"
          ? "toggle-fullscreen"
          : (event.ctrlKey || event.metaKey) && event.key === "0"
            ? "reset-zoom"
            : (event.ctrlKey || event.metaKey) && ["+", "="].includes(event.key)
              ? "zoom-in"
              : (event.ctrlKey || event.metaKey) && event.key === "-"
                ? "zoom-out"
                : null;
      if (nativeAction) {
        event.preventDefault();
        event.stopPropagation();
        void window.explorer.windowAction(nativeAction);
      }
    };
    window.addEventListener("keydown", keydown, true);
    return () => window.removeEventListener("keydown", keydown, true);
  }, []);
  useEffect(() => {
    const keydown = (event: KeyboardEvent) => {
      if (
        document.querySelector('[data-shortcut-recording="true"]') ||
        (event.target instanceof Element &&
          event.target.closest("[data-shortcut-editor]"))
      )
        return;
      const isInput =
        event.target instanceof HTMLElement &&
        !!event.target.closest('input,textarea,[contenteditable="true"]');
      const entry = Object.entries(workspace.preferences.shortcuts).find(
        ([action, shortcut]) =>
          !["explorer", "highlight", "localFilter"].some((prefix) =>
            action.startsWith(prefix),
          ) && shortcutMatches(event, shortcut),
      );
      if (!entry) return;
      if (
        (settingsOpen ||
          (event.target instanceof HTMLElement &&
            event.target.closest(".settings-pane"))) &&
        !["openSettings", "toggleSidebar", "toggleTheme"].includes(entry[0])
      )
        return;
      if (
        isInput &&
        ![
          "runQuery",
          "openSettings",
          "toggleSidebar",
          "toggleTheme",
          "nextTab",
          "previousTab",
          "recentTab",
          "previousRecentTab",
        ].includes(entry[0])
      )
        return;
      event.preventDefault();
      switch (entry[0]) {
        case "newTab":
          dispatch({
            type: "tab/open",
            tab: createTab(
              workspace.activeConnectionId ?? workspace.connections[0].id,
              [],
            ),
          });
          break;
        case "openSettings":
          openSettings();
          break;
        case "toggleTheme":
          dispatch({
            type: "preferences/update",
            patch: {
              theme: workspace.preferences.theme === "dark" ? "light" : "dark",
            },
          });
          break;
        case "closeTab":
          if (activeWorkspaceTabId)
            dispatch({ type: "tab/close", tabId: activeWorkspaceTabId });
          break;
        case "reopenTab":
          dispatch({ type: "tab/reopen" });
          break;
        case "toggleSidebar":
          toggleSidePanel();
          break;
        case "splitPane":
          dispatch({ type: "pane/split" });
          break;
        case "runQuery":
          if (activeTab) execute(activeTab);
          break;
        case "nextTab":
        case "previousTab": {
          tabNavigation.current = finishRecentTabCycle(tabNavigation.current);
          const nextId = visualTabId(
            entries.map((entry) => entry.id),
            activeWorkspaceTabId,
            entry[0] === "nextTab" ? 1 : -1,
          );
          if (nextId) dispatch({ type: "tab/select", tabId: nextId });
          break;
        }
        case "recentTab":
        case "previousRecentTab": {
          const next = cycleRecentTabs(
            tabNavigation.current,
            entries.map((entry) => entry.id),
            activeWorkspaceTabId,
            entry[0] === "recentTab" ? 1 : -1,
          );
          tabNavigation.current =
            event.ctrlKey || event.metaKey || event.altKey
              ? next.state
              : finishRecentTabCycle(next.state);
          if (next.tabId) dispatch({ type: "tab/select", tabId: next.tabId });
          break;
        }
      }
    };
    const finishCycle = () => {
      tabNavigation.current = finishRecentTabCycle(tabNavigation.current);
    };
    const keyup = (event: KeyboardEvent) => {
      if (
        document.querySelector('[data-shortcut-recording="true"]') ||
        (event.target instanceof Element &&
          event.target.closest("[data-shortcut-editor]"))
      )
        return;
      if (
        ["Control", "Meta", "Alt"].includes(event.key) ||
        (!event.ctrlKey && !event.metaKey && !event.altKey)
      )
        finishCycle();
    };
    window.addEventListener("keydown", keydown);
    window.addEventListener("keyup", keyup);
    window.addEventListener("blur", finishCycle);
    return () => {
      window.removeEventListener("keydown", keydown);
      window.removeEventListener("keyup", keyup);
      window.removeEventListener("blur", finishCycle);
    };
  }, [workspace, activeTab, settingsOpen]);

  useEffect(() => {
    if (!ready) return;
    void window.explorer
      .setWindowTheme(workspace.preferences.theme)
      .catch((error) => {
        console.error("Could not update window chrome", error);
      });
  }, [workspace.preferences.theme, ready]);

  const beginResize = (event: React.PointerEvent<HTMLDivElement>) => {
    event.currentTarget.setPointerCapture(event.pointerId);
    const start = event.clientX;
    const width =
      event.currentTarget.parentElement!.getBoundingClientRect().width;
    const target = event.currentTarget;
    const move = (e: PointerEvent) =>
      dispatch({
        type: "workspace/update",
        patch: {
          sidebarWidth: Math.min(
            1200,
            Math.max(180, width + e.clientX - start),
          ),
        },
      });
    const end = () => {
      target.removeEventListener("pointermove", move);
      target.removeEventListener("pointerup", end);
      target.removeEventListener("pointercancel", end);
    };
    target.addEventListener("pointermove", move);
    target.addEventListener("pointerup", end);
    target.addEventListener("pointercancel", end);
  };
  // Do not paint the default workspace before its saved theme is restored.
  // The native window already has the matching startup background.
  if (!ready) return null;
  return (
    <MantineProvider
      theme={theme}
      forceColorScheme={workspace.preferences.theme}
    >
      <Notifications position="top-right" limit={4} />
      <TextTooltips />
      <WorkspaceDragSurface workspace={workspace} dispatch={dispatch}>
        <div
          className="desktop-app"
          data-theme={workspace.preferences.theme}
          data-window-controls-overlay={windowControlsVisible}
        >
          <div className="app-body">
            <nav className="activity-bar" aria-label="Application tools">
              <ApplicationMenu
                workspace={workspace}
                dispatch={dispatch}
                onSettings={openSettings}
                onToggleSidePanel={toggleSidePanel}
                version={environment?.version ?? "…"}
              />
              <div className="activity-menu-separator" aria-hidden="true" />
              <Tooltip label="AWS logs explorer" position="right">
                <ActionIcon
                  variant={
                    workspace.sidebarVisible && sidePanel === "explorer"
                      ? "light"
                      : "subtle"
                  }
                  size="lg"
                  aria-label="AWS logs explorer"
                  aria-pressed={
                    workspace.sidebarVisible && sidePanel === "explorer"
                  }
                  onClick={toggleExplorer}
                >
                  <img
                    src={awsExplorerIcon}
                    width={27}
                    height={27}
                    alt=""
                    draggable={false}
                  />
                </ActionIcon>
              </Tooltip>
              <Tooltip label="Google Cloud logs explorer" position="right">
                <ActionIcon
                  variant={
                    workspace.sidebarVisible && sidePanel === "gcp"
                      ? "light"
                      : "subtle"
                  }
                  size="lg"
                  aria-label="Google Cloud logs explorer"
                  aria-pressed={workspace.sidebarVisible && sidePanel === "gcp"}
                  onClick={toggleGcpExplorer}
                >
                  <IconBrandGoogle size={22} />
                </ActionIcon>
              </Tooltip>
              <div className="activity-spacer" />
              <div className="activity-menu-separator" aria-hidden="true" />
              <Tooltip label="Settings" position="right">
                <ActionIcon
                  variant="subtle"
                  size="lg"
                  aria-label="Settings"
                  aria-pressed={
                    settingsOpen ||
                    (workspace.sidebarVisible && sidePanel === "settings")
                  }
                  onClick={toggleSettings}
                >
                  <IconSettings size={22} />
                </ActionIcon>
              </Tooltip>
            </nav>
            <div
              className="sidebar-shell"
              style={{ width: workspace.sidebarWidth }}
              hidden={!workspace.sidebarVisible}
            >
              <div className="explorer-host" hidden={sidePanel !== "explorer"}>
                <ResourceSidebar
                  preferences={workspace.preferences}
                  onSourceDetailsHeightChange={(sourceDetailsHeight) =>
                    dispatch({
                      type: "preferences/update",
                      patch: { sourceDetailsHeight },
                    })
                  }
                  connections={workspace.connections}
                  activeConnectionId={activeConnectionId}
                  onConnectionChange={(connectionId) =>
                    dispatch({ type: "connection/select", connectionId })
                  }
                  favorites={workspace.favorites}
                  recents={workspace.recents}
                  onOpen={openSources}
                  onResourceAction={(payload, mode) => {
                    const result = projectResourceAction(
                      workspace,
                      payload,
                      mode,
                    );
                    if (result.error)
                      notifications.show({
                        title: "Log sources",
                        message: result.error,
                        color: "red",
                      });
                    else dispatch({ type: "resources/apply", payload, mode });
                  }}
                  refreshKey={environment?.awsEnabled ? 1 : 0}
                  onOpenFavorite={(favoriteId) => {
                    const result = projectFavoriteOpen(workspace, favoriteId);
                    if (result.error)
                      notifications.show({
                        title: "Saved view",
                        message: result.error,
                        color: "red",
                      });
                    else if (result.workspace !== workspace)
                      dispatch({ type: "favorites/open", favoriteId });
                  }}
                  onRenameFavorite={(favoriteId, title) =>
                    dispatch({ type: "favorites/rename", favoriteId, title })
                  }
                  onRemoveFavorite={(favoriteId) =>
                    dispatch({ type: "favorites/remove", favoriteId })
                  }
                  onManage={openSettings}
                />
              </div>
              <div className="explorer-host" hidden={sidePanel !== "gcp"}>
                <GcpExplorer
                  active={workspace.sidebarVisible && sidePanel === "gcp"}
                  onOpen={openGcpSource}
                  onSourceAction={applyGcpSource}
                  shortcuts={workspace.preferences.shortcuts}
                  initialProject={workspace.preferences.gcpProjectId}
                  initialConfiguration={workspace.preferences.gcpConfiguration}
                  initialAccount={workspace.preferences.gcpAccount}
                  onIdentityChange={(gcpConfiguration, gcpAccount) =>
                    dispatch({
                      type: "preferences/update",
                      patch: { gcpConfiguration, gcpAccount },
                    })
                  }
                  onProjectChange={(gcpProjectId) =>
                    dispatch({
                      type: "preferences/update",
                      patch: { gcpProjectId },
                    })
                  }
                />
              </div>
              <Settings
                opened={
                  settingsOpen ||
                  (workspace.sidebarVisible && sidePanel === "settings")
                }
                presentation={settingsOpen ? "modal" : "pane"}
                onOpenModal={() => {
                  setSidePanel("explorer");
                  setSettingsOpen(true);
                  dispatch({
                    type: "preferences/update",
                    patch: { settingsDetached: true },
                  });
                }}
                onReturnToPane={() => {
                  setSettingsOpen(false);
                  setSidePanel("settings");
                  dispatch({
                    type: "workspace/update",
                    patch: { sidebarVisible: true },
                  });
                  dispatch({
                    type: "preferences/update",
                    patch: { settingsDetached: false },
                  });
                }}
                requestedTab={settingsPage}
                requestedTabKey={settingsPageRequest}
                onClose={() => setSettingsOpen(false)}
                workspace={workspace}
                dispatch={dispatch}
                environment={environment}
                onEnvironment={setEnvironment}
                previewSnapshot={settingsPreview}
              />
              <div
                className="sidebar-resizer"
                role="separator"
                aria-label="Resize explorer"
                aria-orientation="vertical"
                aria-valuenow={workspace.sidebarWidth}
                tabIndex={0}
                onPointerDown={beginResize}
                onKeyDown={(e) => {
                  if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
                    e.preventDefault();
                    dispatch({
                      type: "workspace/update",
                      patch: {
                        sidebarWidth: Math.max(
                          180,
                          Math.min(
                            1200,
                            e.currentTarget.parentElement!.getBoundingClientRect()
                              .width + (e.key === "ArrowLeft" ? -20 : 20),
                          ),
                        ),
                      },
                    });
                  }
                }}
              />
            </div>
            <main className="workspace-main">
              <ResourceDropSurface workspace={workspace} dispatch={dispatch} />
              <WorkspaceTabs
                workspace={workspace}
                dispatch={dispatch}
                runtimes={runtimes}
              />
              <RetainedViews
                ids={workspace.tabs.map((tab) => tab.id)}
                visibleIds={workspace.panes.flatMap((pane) =>
                  pane.tabId ? [pane.tabId] : [],
                )}
                onActivate={(id) => {
                  const pane = workspace.panes.find(
                    (pane) => pane.tabId === id,
                  );
                  if (pane && pane.id !== workspace.activePaneId)
                    dispatch({ type: "pane/activate", paneId: pane.id });
                }}
                renderView={(id) => {
                  const tab = workspace.tabs.find((tab) => tab.id === id)!;
                  return (
                    <QueryPane
                      workspace={workspace}
                      tab={tab}
                      runtime={runtimes[tab.id]}
                      onPatch={(patch) =>
                        dispatch({
                          type: "tab/update",
                          tabId: tab.id,
                          patch,
                        })
                      }
                      onTimezoneChange={(timezone) =>
                        dispatch({
                          type: "preferences/update",
                          patch: { timezone },
                        })
                      }
                      onRun={(live, more, filterPattern) =>
                        execute(
                          filterPattern === undefined
                            ? tab
                            : { ...tab, filterPattern },
                          live,
                          more,
                        )
                      }
                      onCancel={() => void cancel(tab.id)}
                      onSaveQuery={(query) =>
                        dispatch({ type: "query/save", query })
                      }
                      onDeleteQuery={(queryId) =>
                        dispatch({ type: "query/remove", queryId })
                      }
                      onSavePreset={(name) =>
                        dispatch({
                          type: "preset/save",
                          preset: {
                            id: crypto.randomUUID(),
                            name,
                            logGroup:
                              tab.sources.length === 1
                                ? tab.sources[0].logGroup
                                : undefined,
                            view: structuredClone(tab.view),
                          },
                        })
                      }
                      onContext={(event, range) => context(tab, event, range)}
                      revealEvent={contextOrigins[tab.id]}
                      onEventRevealed={() =>
                        setContextOrigins((previous) => {
                          if (!previous[tab.id]) return previous;
                          const next = { ...previous };
                          delete next[tab.id];
                          return next;
                        })
                      }
                    />
                  );
                }}
              >
                <PaneLayoutView
                  layout={paneLayout}
                  onResize={(path, ratio) =>
                    dispatch({ type: "pane/resize", path, ratio })
                  }
                  renderPane={(paneId) => {
                    const pane = workspace.panes.find(
                      (item) => item.id === paneId,
                    )!;
                    const index = workspace.panes.indexOf(pane);
                    const splitAxis = nextSplitAxis(paneLayout, paneId);
                    const SplitIcon =
                      splitAxis === "horizontal"
                        ? IconLayoutColumns
                        : IconLayoutRows;
                    const tab = workspace.tabs.find((t) => t.id === pane.tabId);
                    const connection = workspace.connections.find(
                      (c) => c.id === tab?.connectionId,
                    );
                    const regions = [
                      ...new Set(
                        (tab?.sources ?? [])
                          .map(
                            (source) =>
                              workspace.connections.find(
                                (connection) =>
                                  connection.id ===
                                  (source.connectionId ?? tab?.connectionId),
                              )?.region,
                          )
                          .filter((region): region is string => !!region),
                      ),
                    ];
                    return (
                      <PaneDropTarget key={pane.id} paneId={pane.id}>
                        <section
                          className={`workspace-pane ${pane.id === workspace.activePaneId ? "active-pane" : ""}`}
                          onFocusCapture={() => {
                            if (workspace.activePaneId !== pane.id)
                              dispatch({
                                type: "pane/activate",
                                paneId: pane.id,
                              });
                          }}
                          onPointerDown={() => {
                            if (workspace.activePaneId !== pane.id)
                              dispatch({
                                type: "pane/activate",
                                paneId: pane.id,
                              });
                          }}
                          aria-label={`Pane ${index + 1}`}
                        >
                          <PaneDragHeader paneId={pane.id}>
                            <Group gap={7}>
                              <Badge
                                size="xs"
                                variant="outline"
                                color={
                                  pane.id === workspace.activePaneId
                                    ? "indigo"
                                    : "gray"
                                }
                              >
                                {index + 1}
                              </Badge>
                              <Text
                                className="pane-title"
                                size="xs"
                                fw={600}
                                truncate="end"
                              >
                                {tab ? logTabLabel(tab) : "Empty pane"}
                              </Text>
                              <IconChevronRight size={12} />
                              <Text
                                size="xs"
                                className="pane-region"
                                data-tooltip={regions.join(", ")}
                              >
                                {regions.length > 1
                                  ? `${regions.length} regions`
                                  : (regions[0] ?? connection?.region)}
                              </Text>
                            </Group>
                            <Group gap={4}>
                              {workspace.panes.length < MAX_SPLIT_PANES && (
                                <ActionIcon
                                  size="sm"
                                  variant="subtle"
                                  aria-label="Split pane"
                                  aria-description={
                                    splitAxis === "horizontal"
                                      ? "Split side by side"
                                      : "Split above and below"
                                  }
                                  data-tooltip={
                                    splitAxis === "horizontal"
                                      ? "Split side by side"
                                      : "Split above and below"
                                  }
                                  data-split-axis={splitAxis}
                                  onClick={() =>
                                    dispatch({
                                      type: "pane/split",
                                      paneId: pane.id,
                                    })
                                  }
                                >
                                  <SplitIcon size={14} />
                                </ActionIcon>
                              )}
                              {workspace.panes.length > 1 && (
                                <ActionIcon
                                  size="sm"
                                  variant="subtle"
                                  aria-label={`Close pane ${index + 1}`}
                                  onClick={() =>
                                    dispatch({
                                      type: "pane/close",
                                      paneId: pane.id,
                                    })
                                  }
                                >
                                  <IconX size={14} />
                                </ActionIcon>
                              )}
                            </Group>
                          </PaneDragHeader>
                          {tab ? (
                            <RetainedViewSlot id={tab.id} />
                          ) : (
                            <div className="empty-pane">
                              <IconCloud size={38} stroke={1} />
                              <Text fw={600}>Open a log source</Text>
                              <Text size="sm" c="dimmed">
                                Choose a group or stream in the explorer, or
                                drag a tab onto this pane.
                              </Text>
                              {workspace.connections.find(
                                (item) => item.id === activeConnectionId,
                              )?.mode === "offline" && (
                                <Button
                                  variant="light"
                                  size="xs"
                                  leftSection={<IconPlus size={14} />}
                                  onClick={() =>
                                    openSources(activeConnectionId, [
                                      { logGroup: "/aws/lambda/orders-api" },
                                    ])
                                  }
                                >
                                  Open fixture source
                                </Button>
                              )}
                            </div>
                          )}
                        </section>
                      </PaneDropTarget>
                    );
                  }}
                />
              </RetainedViews>
            </main>
          </div>
        </div>
      </WorkspaceDragSurface>
    </MantineProvider>
  );
}
