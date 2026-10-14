import { useEffect, useReducer, useRef, useState } from "react";
import { flushSync } from "react-dom";
import {
  ActionIcon,
  Alert,
  Badge,
  Button,
  Group,
  Kbd,
  Loader,
  MantineProvider,
  Modal,
  Text,
  TextInput,
  Tooltip,
  createTheme,
} from "@mantine/core";
import { Notifications, notifications } from "@mantine/notifications";
import {
  IconAdjustments,
  IconChevronRight,
  IconCloud,
  IconCommand,
  IconLayoutColumns,
  IconLayoutRows,
  IconLayoutSidebar,
  IconPlayerPlay,
  IconPlus,
  IconSearch,
  IconX,
} from "@tabler/icons-react";
import type {
  EnvironmentInfo,
  LogEvent,
  LogSource,
  LogTab,
} from "../shared/contracts";
import { createTab, createWorkspace, workspaceReducer } from "./workspace";
import { useLogJobs } from "./useLogJobs";
import { useKeyboardModality } from "./useKeyboardModality";
import { PaneLayoutView } from "./components/PaneLayout";
import { legacyLayout, nextSplitAxis } from "../shared/pane-layout";
import { ResourceSidebar } from "./components/ResourceSidebar";
import {
  WorkspaceTabs,
  WorkspaceDragSurface,
  PaneDropTarget,
} from "./components/WorkspaceTabs";
import { QueryPane } from "./components/QueryPane";
import { Settings } from "./components/Settings";
import "./components/workspace-tabs.css";
import "./app.css";

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

function shortcutMatches(event: KeyboardEvent, shortcut: string): boolean {
  const parts = shortcut.split("+");
  const key = parts.pop()?.toLowerCase();
  return (
    event.key.toLowerCase() === key &&
    event.ctrlKey === parts.includes("Control") &&
    event.metaKey === parts.includes("Meta") &&
    event.shiftKey === parts.includes("Shift") &&
    event.altKey === parts.includes("Alt")
  );
}
function localDate(time: number): string {
  const date = new Date(time);
  return new Date(time - date.getTimezoneOffset() * 60000)
    .toISOString()
    .slice(0, 16);
}

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
  const [commandsOpen, setCommandsOpen] = useState(false);
  const [commandText, setCommandText] = useState("");
  const [saveState, setSaveState] = useState("Loading workspace");
  const workspaceRef = useRef(workspace);
  const paneLayout =
    workspace.layout ??
    legacyLayout(
      workspace.panes.map((pane) => pane.id),
      workspace.splitSizes,
    );
  workspaceRef.current = workspace;
  const { runtimes, run, cancel } = useLogJobs(workspace, ready, (message) => {
    notifications.show({
      color: "red",
      title: "Could not stop previous query",
      message,
      autoClose: false,
    });
  });
  const activePane =
    workspace.panes.find((p) => p.id === workspace.activePaneId) ??
    workspace.panes[0];
  const activeTab = workspace.tabs.find((t) => t.id === activePane?.tabId);
  const activeConnectionId =
    activeTab?.connectionId ?? workspace.connections[0].id;

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
    setSaveState("Saving");
    const timer = setTimeout(() => {
      void window.explorer
        .saveWorkspace(workspace)
        .then(() => setSaveState("Saved locally"))
        .catch((error) => {
          setSaveState("Save failed");
          notifications.show({
            color: "red",
            title: "Workspace save failed",
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
  const execute = (tab: LogTab, live = false, more = false) => {
    if (!more) {
      const text = tab.kind === "events" ? tab.filterPattern : tab.query;
      if (text.trim())
        dispatch({
          type: "history/add",
          query: {
            id: crypto.randomUUID(),
            name: text.slice(0, 60),
            kind: tab.kind,
            text,
          },
        });
    }
    void run(tab, live, more);
  };
  const context = (tab: LogTab, event: LogEvent) => {
    if (!event.logGroup || !event.logStream) {
      notifications.show({
        color: "yellow",
        message:
          "This aggregate result has no source stream. Run an event query to inspect surrounding context.",
      });
      return;
    }
    dispatch({
      type: "tab/open",
      tab: {
        ...createTab(tab.connectionId, [
          { logGroup: event.logGroup, logStreams: [event.logStream] },
        ]),
        title: `Context · ${event.logStream.split("/").at(-1)}`,
        timePreset: "custom",
        customStart: localDate(Math.max(0, event.timestamp - 120000)),
        customEnd: localDate(event.timestamp + 120000),
      },
    });
  };
  useEffect(() => {
    const keydown = (event: KeyboardEvent) => {
      const isInput =
        event.target instanceof HTMLElement &&
        !!event.target.closest('input,textarea,[contenteditable="true"]');
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setCommandText("");
        setCommandsOpen(true);
        return;
      }
      if (settingsOpen || commandsOpen) return;
      const entry = Object.entries(workspace.preferences.shortcuts).find(
        ([, shortcut]) => shortcutMatches(event, shortcut),
      );
      if (!entry) return;
      if (isInput && entry[0] !== "runQuery") return;
      event.preventDefault();
      switch (entry[0]) {
        case "closeTab":
          if (activeTab) dispatch({ type: "tab/close", tabId: activeTab.id });
          break;
        case "reopenTab":
          dispatch({ type: "tab/reopen" });
          break;
        case "toggleSidebar":
          dispatch({
            type: "workspace/update",
            patch: { sidebarVisible: !workspace.sidebarVisible },
          });
          break;
        case "splitPane":
          dispatch({ type: "pane/split" });
          break;
        case "runQuery":
          if (activeTab) execute(activeTab);
          break;
        case "nextTab":
        case "previousTab": {
          const index = workspace.tabs.findIndex((t) => t.id === activeTab?.id);
          const next =
            workspace.tabs[
              (index +
                (entry[0] === "nextTab" ? 1 : workspace.tabs.length - 1)) %
                workspace.tabs.length
            ];
          if (next) dispatch({ type: "tab/select", tabId: next.id });
          break;
        }
      }
    };
    window.addEventListener("keydown", keydown);
    return () => window.removeEventListener("keydown", keydown);
  }, [workspace, activeTab, settingsOpen, commandsOpen]);

  const commands = [
    {
      name: "Run current query",
      hint: workspace.preferences.shortcuts.runQuery,
      action: () => activeTab && execute(activeTab),
    },
    {
      name: "Split workspace pane",
      hint: workspace.preferences.shortcuts.splitPane,
      action: () => dispatch({ type: "pane/split" }),
    },
    {
      name: "Toggle resource sidebar",
      hint: workspace.preferences.shortcuts.toggleSidebar,
      action: () =>
        dispatch({
          type: "workspace/update",
          patch: { sidebarVisible: !workspace.sidebarVisible },
        }),
    },
    {
      name: "Reopen closed tab",
      hint: workspace.preferences.shortcuts.reopenTab,
      action: () => dispatch({ type: "tab/reopen" }),
    },
    {
      name: "Workspace settings and connections",
      hint: "",
      action: () => setSettingsOpen(true),
    },
    ...workspace.tabs.map((tab) => ({
      name: `Go to ${tab.title}`,
      hint: "",
      action: () => dispatch({ type: "tab/select", tabId: tab.id }),
    })),
  ].filter((c) => c.name.toLowerCase().includes(commandText.toLowerCase()));
  const beginResize = (event: React.PointerEvent<HTMLDivElement>) => {
    event.currentTarget.setPointerCapture(event.pointerId);
    const start = event.clientX;
    const width = workspace.sidebarWidth;
    const target = event.currentTarget;
    const move = (e: PointerEvent) =>
      dispatch({
        type: "workspace/update",
        patch: {
          sidebarWidth: Math.min(600, Math.max(180, width + e.clientX - start)),
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
  return (
    <MantineProvider
      theme={theme}
      forceColorScheme={workspace.preferences.theme}
    >
      <Notifications position="top-right" limit={4} />
      <div className="desktop-app" data-theme={workspace.preferences.theme}>
        <header className="app-header">
          <Group gap={10}>
            <div className="brand-mark">
              <IconCloud size={21} />
            </div>
            <div>
              <Text size="sm" fw={650}>
                AWS Log Explorer
              </Text>
              <Text size="xs" c="dimmed">
                {workspace.name}
              </Text>
            </div>
          </Group>
          <button
            className="command-trigger"
            onClick={() => {
              setCommandText("");
              setCommandsOpen(true);
            }}
          >
            <IconSearch size={15} />
            <span>Search commands and tabs</span>
            <Kbd size="xs">Ctrl K</Kbd>
          </button>
          <Group gap={8}>
            <Badge
              variant="light"
              color={environment?.awsEnabled ? "teal" : "yellow"}
            >
              {environment?.awsEnabled
                ? "AWS session enabled"
                : "Offline · no AWS access"}
            </Badge>
            <Tooltip label="Workspace settings">
              <ActionIcon
                size="lg"
                variant="subtle"
                aria-label="Workspace settings"
                onClick={() => setSettingsOpen(true)}
              >
                <IconAdjustments size={20} />
              </ActionIcon>
            </Tooltip>
          </Group>
        </header>
        <div className="app-body">
          <nav className="activity-bar" aria-label="Application tools">
            <Tooltip label="Toggle explorer" position="right">
              <ActionIcon
                variant="subtle"
                size="lg"
                aria-label="Toggle explorer"
                onClick={() =>
                  dispatch({
                    type: "workspace/update",
                    patch: { sidebarVisible: !workspace.sidebarVisible },
                  })
                }
              >
                <IconLayoutSidebar size={21} />
              </ActionIcon>
            </Tooltip>
            <Tooltip label="Commands" position="right">
              <ActionIcon
                variant="subtle"
                size="lg"
                aria-label="Commands"
                onClick={() => setCommandsOpen(true)}
              >
                <IconCommand size={21} />
              </ActionIcon>
            </Tooltip>
            <div className="activity-spacer" />
            <Tooltip label="Settings" position="right">
              <ActionIcon
                variant="subtle"
                size="lg"
                aria-label="Settings"
                onClick={() => setSettingsOpen(true)}
              >
                <IconAdjustments size={21} />
              </ActionIcon>
            </Tooltip>
          </nav>
          {workspace.sidebarVisible && (
            <div
              className="sidebar-shell"
              style={{ width: workspace.sidebarWidth }}
            >
              <ResourceSidebar
                connections={workspace.connections}
                activeConnectionId={activeConnectionId}
                favorites={workspace.favorites}
                recents={workspace.recents}
                onOpen={openSources}
                onFavorite={(favorite) =>
                  dispatch({ type: "favorites/toggle", favorite })
                }
                onManage={() => setSettingsOpen(true)}
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
                            600,
                            workspace.sidebarWidth +
                              (e.key === "ArrowLeft" ? -20 : 20),
                          ),
                        ),
                      },
                    });
                  }
                }}
              />
            </div>
          )}
          <main className="workspace-main">
            <WorkspaceDragSurface workspace={workspace} dispatch={dispatch}>
              <WorkspaceTabs workspace={workspace} dispatch={dispatch} />
              {!ready ? (
                <div className="startup-loader">
                  <Loader />
                  <Text size="sm" c="dimmed">
                    Restoring workspace
                  </Text>
                </div>
              ) : (
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
                          <div className="pane-heading">
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
                              <Text size="xs" fw={600} truncate="end">
                                {tab?.title ?? "Empty pane"}
                              </Text>
                              <IconChevronRight size={12} />
                              <Text size="xs" c="dimmed">
                                {connection?.region}
                              </Text>
                            </Group>
                            <Group gap={4}>
                              {workspace.panes.length < 4 && (
                                <ActionIcon
                                  size="sm"
                                  variant="subtle"
                                  aria-label="Split pane"
                                  aria-description={
                                    splitAxis === "horizontal"
                                      ? "Split side by side"
                                      : "Split above and below"
                                  }
                                  title={
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
                          </div>
                          {tab ? (
                            <QueryPane
                              key={tab.id}
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
                              onRun={(live, more) => execute(tab, live, more)}
                              onCancel={() => void cancel(tab.id)}
                              onSaveQuery={(query) =>
                                dispatch({ type: "query/save", query })
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
                              onContext={(event) => context(tab, event)}
                            />
                          ) : (
                            <div className="empty-pane">
                              <IconCloud size={38} stroke={1} />
                              <Text fw={600}>Open a log source</Text>
                              <Text size="sm" c="dimmed">
                                Choose a group or stream in the explorer, or
                                drag a tab onto this pane.
                              </Text>
                              <Button
                                variant="light"
                                size="xs"
                                leftSection={<IconPlus size={14} />}
                                onClick={() =>
                                  openSources(workspace.connections[0].id, [
                                    { logGroup: "/aws/lambda/orders-api" },
                                  ])
                                }
                              >
                                Open fixture source
                              </Button>
                            </div>
                          )}
                        </section>
                      </PaneDropTarget>
                    );
                  }}
                />
              )}
            </WorkspaceDragSurface>
          </main>
        </div>
        <footer className="app-footer">
          <Group gap={12}>
            <span className="status-dot" />
            <Text size="xs">
              {environment?.awsEnabled
                ? "Connected workspace"
                : "Isolated local development"}
            </Text>
            <Text size="xs" c="dimmed">
              {workspace.tabs.length} tabs · {workspace.panes.length} panes
            </Text>
          </Group>
          <Group gap={14}>
            <Text size="xs" c={saveState === "Save failed" ? "red" : "dimmed"}>
              {saveState}
            </Text>
            <Text size="xs" c="dimmed">
              v{environment?.version ?? "0.1.0"}
            </Text>
          </Group>
        </footer>
      </div>
      <Settings
        opened={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        workspace={workspace}
        dispatch={dispatch}
        environment={environment}
        onEnvironment={setEnvironment}
      />
      <Modal
        opened={commandsOpen}
        onClose={() => setCommandsOpen(false)}
        title="Command palette"
        size="lg"
        centered
      >
        <TextInput
          autoFocus
          aria-label="Search commands"
          placeholder="Type a command or tab name…"
          value={commandText}
          onChange={(e) => setCommandText(e.currentTarget.value)}
          leftSection={<IconSearch size={17} />}
          onKeyDown={(e) => {
            if (e.key === "Enter" && commands[0]) {
              commands[0].action();
              setCommandsOpen(false);
            }
          }}
        />
        <div className="command-list">
          {commands.map((command, index) => (
            <button
              key={`${command.name}:${index}`}
              onClick={() => {
                command.action();
                setCommandsOpen(false);
              }}
            >
              <span>{command.name}</span>
              {command.hint && <Kbd size="xs">{command.hint}</Kbd>}
            </button>
          ))}
        </div>
      </Modal>
    </MantineProvider>
  );
}
