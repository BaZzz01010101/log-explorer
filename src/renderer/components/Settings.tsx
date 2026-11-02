import { useEffect, useState } from "react";
import {
  ActionIcon,
  Group,
  Modal,
  Stack,
  Switch,
  Tabs,
  Text,
} from "@mantine/core";
import {
  IconExternalLink,
  IconLayoutSidebarLeftCollapse,
} from "@tabler/icons-react";
import { notifications } from "@mantine/notifications";
import type { EnvironmentInfo, Workspace } from "../../shared/contracts";
import type { WorkspaceAction } from "../workspace";
import { PreferencesEditor } from "./PreferencesEditor";
import { ShortcutsEditor } from "./ShortcutsEditor";
import { SettingLabel } from "./SettingLabel";
import {
  ProfileConnectionsEditor,
  createProfileConnectionsEditorState,
} from "./ProfileConnectionsEditor";
import { Tooltip } from "./AppTooltip";
import { RelativeTimeTemplatesEditor } from "./RelativeTimeTemplatesEditor";
import {
  HighlightTreeEditor,
  createHighlightTreeEditorState,
} from "./HighlightTreeEditor";
import { normalizeRelativeTimeTemplates } from "../../shared/relative-time-templates";
import "./settings.css";
import { settingsResizeEdges, useSettingsWindow } from "./settings-window";
import type { SettingsPreviewSnapshot } from "../settings-preview";

export function Settings({
  opened,
  onClose,
  workspace,
  dispatch,
  environment,
  onEnvironment,
  presentation = "modal",
  onOpenModal,
  onReturnToPane,
  requestedTab,
  requestedTabKey,
  previewSnapshot = null,
}: {
  opened: boolean;
  onClose(): void;
  workspace: Workspace;
  dispatch: React.Dispatch<WorkspaceAction>;
  environment: EnvironmentInfo | null;
  onEnvironment(info: EnvironmentInfo): void;
  presentation?: "modal" | "pane";
  onOpenModal?(): void;
  onReturnToPane?(): void;
  requestedTab?: string | null;
  requestedTabKey?: number;
  previewSnapshot?: SettingsPreviewSnapshot | null;
}) {
  const [profiles, setProfiles] = useState<string[]>([]);
  const [accessPending, setAccessPending] = useState(false);
  const [activeTab, setActiveTab] = useState<string | null>("connections");
  const [previewPointer, setPreviewPointer] = useState<number | null>(null);
  const settingsWindow = useSettingsWindow(opened && presentation === "modal");
  // Keep editor selections and drafts above the pane/modal remount boundary.
  const [connectionsEditorState, setConnectionsEditorState] = useState(
    createProfileConnectionsEditorState,
  );
  const [highlightTreeState, setHighlightTreeState] = useState(() =>
    createHighlightTreeEditorState(
      workspace.preferences.highlightProfiles?.[0]?.id,
    ),
  );
  const preferences = workspace.preferences;
  // Let row editors and nested overlays consume Escape first. Mantine's modal
  // listener runs during window capture, before a picker can handle the key.
  useEffect(() => {
    if (
      !opened ||
      presentation !== "modal" ||
      typeof window === "undefined" ||
      !window.addEventListener
    )
      return;
    const escape = (event: KeyboardEvent) => {
      if (
        event.key !== "Escape" ||
        event.defaultPrevented ||
        event.isComposing ||
        settingsWindow.interacting ||
        previewPointer !== null
      )
        return;
      if (event.target instanceof Element) {
        const dialog = event.target.closest('[role="dialog"]');
        if (
          (dialog && !dialog.classList.contains("settings-window")) ||
          event.target.closest('[data-mantine-stop-propagation="true"]')
        )
          return;
      }
      onClose();
    };
    window.addEventListener("keydown", escape);
    return () => window.removeEventListener("keydown", escape);
  }, [
    opened,
    presentation,
    settingsWindow.interacting,
    previewPointer,
    onClose,
  ]);
  useEffect(() => {
    if (!opened || presentation !== "modal") {
      setPreviewPointer(null);
      return;
    }
    if (typeof window === "undefined" || !window.addEventListener) return;
    const release = (event: PointerEvent) =>
      setPreviewPointer((pointer) =>
        pointer === event.pointerId ? null : pointer,
      );
    const blur = () => setPreviewPointer(null);
    window.addEventListener("pointerup", release, true);
    window.addEventListener("pointercancel", release, true);
    window.addEventListener("lostpointercapture", release, true);
    window.addEventListener("blur", blur);
    return () => {
      window.removeEventListener("pointerup", release, true);
      window.removeEventListener("pointercancel", release, true);
      window.removeEventListener("lostpointercapture", release, true);
      window.removeEventListener("blur", blur);
    };
  }, [opened, presentation]);
  useEffect(() => {
    const next =
      requestedTab === "highlights-tree" ? "highlights" : requestedTab;
    if (
      next &&
      [
        "connections",
        "appearance",
        "time-ranges",
        "highlights",
        "shortcuts",
      ].includes(next)
    )
      setActiveTab(next);
  }, [requestedTab, requestedTabKey]);
  useEffect(() => {
    if (environment?.awsEnabled)
      window.explorer
        .profiles()
        .then(setProfiles)
        .catch((e) => notifications.show({ color: "red", message: String(e) }));
    else setProfiles([]);
  }, [environment?.awsEnabled]);
  const setAws = async (enabled: boolean) => {
    setAccessPending(true);
    try {
      onEnvironment(await window.explorer.enableAws(enabled));
    } catch (error) {
      // Revoking authorization still takes effect when query cleanup fails.
      const current = await window.explorer
        .environment()
        .catch(() => undefined);
      if (current) onEnvironment(current);
      notifications.show({
        color: "red",
        title: "AWS access",
        message: error instanceof Error ? error.message : String(error),
      });
    } finally {
      setAccessPending(false);
    }
  };
  const content = (
    <Tabs
      className="settings-tabs"
      variant="outline"
      value={activeTab}
      onChange={setActiveTab}
    >
      <Tabs.List aria-label="Settings categories">
        <Tabs.Tab value="connections">Connections</Tabs.Tab>
        <Tabs.Tab value="appearance">Preferences</Tabs.Tab>
        <Tabs.Tab value="time-ranges">Time ranges</Tabs.Tab>
        <Tabs.Tab value="highlights">Highlights</Tabs.Tab>
        <Tabs.Tab value="shortcuts">Shortcuts</Tabs.Tab>
      </Tabs.List>
      <Tabs.Panel value="connections" pt="md" className="settings-form-page">
        <Stack
          gap="sm"
          className="settings-form-content settings-connections-form"
        >
          <Group gap="xl" className="settings-access-switches">
            <Switch
              aria-label="Enable AWS access"
              label={
                <SettingLabel
                  label="Enable AWS access"
                  help={
                    environment?.canEnableAws
                      ? "Use your configured AWS profiles to read CloudWatch Logs."
                      : "AWS access is unavailable in development and offline verification builds."
                  }
                />
              }
              checked={environment?.awsEnabled ?? false}
              disabled={!environment?.canEnableAws || accessPending}
              onChange={(event) => void setAws(event.currentTarget.checked)}
            />
            <Switch
              aria-label="Offline fixtures"
              label={
                <SettingLabel
                  label="Offline fixtures"
                  help="Show local sample log sources in Explorer. These sources do not connect to AWS."
                />
              }
              checked={workspace.connections.some(
                (connection) =>
                  connection.mode === "offline" && connection.enabled !== false,
              )}
              onChange={(event) => {
                const enabled = event.currentTarget.checked;
                const hasFixtures = workspace.connections.some(
                  (connection) => connection.mode === "offline",
                );
                dispatch({
                  type: "connections/set",
                  connections: hasFixtures
                    ? workspace.connections.map((connection) =>
                        connection.mode === "offline"
                          ? { ...connection, enabled }
                          : connection,
                      )
                    : [
                        ...workspace.connections,
                        {
                          id: crypto.randomUUID(),
                          name: "Offline fixtures",
                          profile: "default",
                          region: "eu-west-1",
                          mode: "offline",
                          enabled,
                        },
                      ],
                });
              }}
            />
          </Group>
          <ProfileConnectionsEditor
            uiState={connectionsEditorState}
            onUiStateChange={setConnectionsEditorState}
            connections={workspace.connections}
            preferences={preferences}
            knownProfiles={profiles}
            discoveryEnabled={environment?.awsEnabled ?? false}
            onConnections={(connections) =>
              dispatch({ type: "connections/set", connections })
            }
            onVisibility={(profileVisibility) =>
              dispatch({
                type: "preferences/update",
                patch: { profileVisibility },
              })
            }
          />
        </Stack>
      </Tabs.Panel>
      <Tabs.Panel value="appearance" pt="md" className="settings-form-page">
        <PreferencesEditor
          value={preferences}
          onChange={(patch) => dispatch({ type: "preferences/update", patch })}
        />
      </Tabs.Panel>
      <Tabs.Panel value="time-ranges" pt="md">
        <RelativeTimeTemplatesEditor
          value={normalizeRelativeTimeTemplates(
            preferences.relativeTimeTemplates,
          )}
          onChange={(relativeTimeTemplates) =>
            dispatch({
              type: "preferences/update",
              patch: { relativeTimeTemplates },
            })
          }
        />
      </Tabs.Panel>
      <Tabs.Panel value="highlights" pt="md" className="settings-highlights">
        <HighlightTreeEditor
          uiState={highlightTreeState}
          onUiStateChange={setHighlightTreeState}
          preferences={preferences}
          previewEnabled={presentation === "modal"}
          previewSnapshot={previewSnapshot}
          onChange={(highlightProfiles) =>
            dispatch({
              type: "preferences/update",
              patch: { highlightProfiles },
            })
          }
        />
      </Tabs.Panel>
      <Tabs.Panel value="shortcuts" pt="md" className="settings-form-page">
        {opened && activeTab === "shortcuts" && (
          <ShortcutsEditor
            shortcuts={preferences.shortcuts}
            onChange={(shortcuts) =>
              dispatch({ type: "preferences/update", patch: { shortcuts } })
            }
          />
        )}
      </Tabs.Panel>
    </Tabs>
  );
  if (presentation === "pane")
    return (
      <section className="settings-pane" aria-label="Settings" hidden={!opened}>
        <header className="settings-pane-header">
          <Text component="h2" size="sm" fw={600}>
            Settings
          </Text>
          <Tooltip label="Open settings in window">
            <ActionIcon
              aria-label="Open settings in window"
              variant="subtle"
              size="sm"
              disabled={!onOpenModal}
              onClick={onOpenModal}
            >
              <IconExternalLink size={16} />
            </ActionIcon>
          </Tooltip>
        </header>
        <div className="settings-pane-scroll">{content}</div>
      </section>
    );
  return (
    <Modal
      opened={opened}
      onClose={onClose}
      closeOnEscape={false}
      closeButtonProps={{ "aria-label": "Close Settings" }}
      classNames={{
        inner: "settings-window-layer",
        content: "settings-window",
        header: "settings-window-header",
        title: "settings-modal-title",
        body: "settings-modal-body",
      }}
      attributes={{
        title: { "aria-label": "Settings" },
        header: settingsWindow.header,
        body: {
          onPointerDownCapture(event: React.PointerEvent<HTMLElement>) {
            if (
              event.button === 0 &&
              (event.target as Element).closest(
                ".highlight-events-theme, .highlight-pane-divider",
              )
            )
              setPreviewPointer(event.pointerId);
          },
        },
      }}
      styles={{
        content: {
          left: settingsWindow.frame.x,
          top: settingsWindow.frame.y,
          width: settingsWindow.frame.width,
          height: settingsWindow.frame.height,
        },
      }}
      transitionProps={{ transition: "fade", duration: 120 }}
      title={
        <Group justify="space-between" wrap="nowrap">
          <Text fw={600}>Settings</Text>
          {onReturnToPane && (
            <Tooltip label="Return settings to pane">
              <ActionIcon
                aria-label="Return settings to pane"
                variant="subtle"
                size="sm"
                onClick={onReturnToPane}
              >
                <IconLayoutSidebarLeftCollapse size={16} />
              </ActionIcon>
            </Tooltip>
          )}
        </Group>
      }
    >
      {content}
      {settingsResizeEdges.map((edge) => (
        <div
          key={edge}
          className={`settings-window-resizer edge-${edge}`}
          {...settingsWindow.resize(edge)}
          role={edge === "se" ? "button" : undefined}
          aria-label={edge === "se" ? "Resize Settings window" : undefined}
          aria-hidden={edge === "se" ? undefined : true}
          tabIndex={edge === "se" ? 0 : undefined}
          onKeyDown={(event) => {
            if (settingsWindow.resizeWithKey(event.key, event.shiftKey)) {
              event.preventDefault();
              event.stopPropagation();
            }
          }}
        />
      ))}
    </Modal>
  );
}
