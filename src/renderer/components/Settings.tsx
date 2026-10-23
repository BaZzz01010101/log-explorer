import { useEffect, useState } from "react";
import {
  ActionIcon,
  Alert,
  Badge,
  Button,
  Checkbox,
  Group,
  Modal,
  NumberInput,
  Select,
  Stack,
  Switch,
  Tabs,
  Text,
  Textarea,
  TextInput,
  type NumberInputProps,
} from "@mantine/core";
import { IconMaximize, IconTrash } from "@tabler/icons-react";
import { notifications } from "@mantine/notifications";
import type { EnvironmentInfo, Workspace } from "../../shared/contracts";
import type { WorkspaceAction } from "../workspace";
import { parseWorkspaceInput } from "../../main/workspace-input";
import {
  HighlightProfilesEditor,
  createHighlightProfilesEditorState,
} from "./HighlightProfilesEditor";
import {
  ProfileConnectionsEditor,
  createProfileConnectionsEditorState,
} from "./ProfileConnectionsEditor";
import { Tooltip } from "./AppTooltip";
import "./settings.css";

function NumericPreference({
  value,
  onCommit,
  live = false,
  ...props
}: Omit<NumberInputProps, "value" | "onChange" | "onBlur" | "onKeyDown"> & {
  value: number;
  live?: boolean;
  onCommit(value: number): void;
}) {
  // Preserve intermediate input such as `1` while the user is entering `14`.
  // Apply only the finished value: an intermediate lower event limit must not
  // evict logs, and partial refresh settings must not start automatic queries.
  const [draft, setDraft] = useState<string | number | undefined>();
  const commit = () => {
    if (typeof draft === "number" && Number.isFinite(draft)) onCommit(draft);
    setDraft(undefined);
  };
  return (
    <NumberInput
      {...props}
      value={draft ?? value}
      clampBehavior="none"
      allowDecimal={false}
      allowNegative={false}
      onChange={(next) => {
        setDraft(next);
        if (
          live &&
          typeof next === "number" &&
          Number.isFinite(next) &&
          next >= (props.min ?? -Infinity) &&
          next <= (props.max ?? Infinity)
        )
          onCommit(next);
      }}
      onBlur={commit}
      onKeyDown={(event) => {
        if (event.key === "Enter") {
          event.preventDefault();
          event.currentTarget.blur();
        }
      }}
    />
  );
}

export function Settings({
  opened,
  onClose,
  workspace,
  dispatch,
  environment,
  onEnvironment,
  presentation = "modal",
  onOpenModal,
}: {
  opened: boolean;
  onClose(): void;
  workspace: Workspace;
  dispatch: React.Dispatch<WorkspaceAction>;
  environment: EnvironmentInfo | null;
  onEnvironment(info: EnvironmentInfo): void;
  presentation?: "modal" | "pane";
  onOpenModal?(): void;
}) {
  const [profiles, setProfiles] = useState<string[]>([]);
  const [accessPending, setAccessPending] = useState(false);
  const [activeTab, setActiveTab] = useState<string | null>("connections");
  const [importText, setImportText] = useState("");
  // Keep editor selections and drafts above the pane/modal remount boundary.
  const [highlightEditorState, setHighlightEditorState] = useState(() =>
    createHighlightProfilesEditorState(
      workspace.preferences.highlightProfiles?.[0]?.id,
    ),
  );
  const [connectionsEditorState, setConnectionsEditorState] = useState(
    createProfileConnectionsEditorState,
  );
  const preferences = workspace.preferences;
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
    <Tabs className="settings-tabs" value={activeTab} onChange={setActiveTab}>
      <Tabs.List aria-label="Settings categories">
        <Tabs.Tab value="connections">Connections</Tabs.Tab>
        <Tabs.Tab value="appearance">Preferences</Tabs.Tab>
        <Tabs.Tab value="highlights">Highlights</Tabs.Tab>
        <Tabs.Tab value="shortcuts">Shortcuts</Tabs.Tab>
        <Tabs.Tab value="workspace">Workspace</Tabs.Tab>
      </Tabs.List>
      <Tabs.Panel value="connections" pt="md">
        <Stack gap="sm">
          <Alert
            color={environment?.awsEnabled ? "teal" : "yellow"}
            title={
              environment?.awsEnabled
                ? "AWS access is enabled"
                : "AWS access is disabled"
            }
          >
            <Text size="sm">
              {environment?.packaged
                ? "Use your configured AWS profiles. This choice is remembered between restarts and can be disabled here."
                : "Development builds use local fixtures only. They cannot read AWS profiles, SSO sessions or connect to AWS."}
            </Text>
          </Alert>
          <Switch
            label="Enable AWS access"
            checked={environment?.awsEnabled ?? false}
            disabled={!environment?.canEnableAws || accessPending}
            onChange={(e) => void setAws(e.currentTarget.checked)}
          />
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
      <Tabs.Panel value="appearance" pt="md">
        <Stack gap="sm">
          <Group grow className="settings-preference-row">
            <Select
              label="Theme"
              allowDeselect={false}
              value={preferences.theme}
              data={["dark", "light"]}
              onChange={(v) =>
                dispatch({
                  type: "preferences/update",
                  patch: { theme: v as "dark" | "light" },
                })
              }
            />
            <Select
              label="Density"
              value={preferences.density}
              data={["compact", "comfortable"]}
              onChange={(v) =>
                dispatch({
                  type: "preferences/update",
                  patch: { density: v as "compact" | "comfortable" },
                })
              }
            />
          </Group>
          <Select
            label="Tab layout"
            value={preferences.tabBarLayout}
            data={[
              { value: "scroll", label: "Scroll" },
              { value: "wrap", label: "Multiple rows" },
            ]}
            allowDeselect={false}
            onChange={(value) => {
              if (value === "scroll" || value === "wrap")
                dispatch({
                  type: "preferences/update",
                  patch: { tabBarLayout: value },
                });
            }}
          />
          <Checkbox
            label="Put pinned tabs on a separate row"
            checked={preferences.pinnedTabsSeparateRow === true}
            onChange={(event) =>
              dispatch({
                type: "preferences/update",
                patch: { pinnedTabsSeparateRow: event.currentTarget.checked },
              })
            }
          />
          <Checkbox
            label="Automatically expand inspector paths to highlighted matches"
            checked={preferences.autoExpandFilterMatches !== false}
            onChange={(event) =>
              dispatch({
                type: "preferences/update",
                patch: {
                  autoExpandFilterMatches: event.currentTarget.checked,
                },
              })
            }
          />
          <Group grow className="settings-preference-row">
            <NumericPreference
              label="Log font size"
              live
              min={10}
              max={20}
              value={preferences.fontSize}
              onCommit={(v) =>
                dispatch({
                  type: "preferences/update",
                  patch: { fontSize: v },
                })
              }
            />
            <Select
              label="Timestamp display"
              value={preferences.timezone}
              data={[
                { value: "local", label: "Local time" },
                { value: "utc", label: "UTC" },
              ]}
              onChange={(v) =>
                dispatch({
                  type: "preferences/update",
                  patch: { timezone: v as "local" | "utc" },
                })
              }
            />
          </Group>
          <NumericPreference
            label="Maximum events per view"
            description="Older live events are removed visibly at this memory limit"
            min={100}
            max={100000}
            step={1000}
            value={preferences.maxEvents}
            onCommit={(v) =>
              dispatch({
                type: "preferences/update",
                patch: { maxEvents: v },
              })
            }
          />
          <NumericPreference
            label="Automatic refresh (seconds)"
            description="0 disables refresh. Event queries only; each refresh makes AWS requests when enabled."
            min={0}
            max={3600}
            value={preferences.refreshSeconds}
            onCommit={(v) =>
              dispatch({
                type: "preferences/update",
                patch: { refreshSeconds: v },
              })
            }
          />
        </Stack>
      </Tabs.Panel>
      <Tabs.Panel value="highlights" pt="md" className="settings-highlights">
        <HighlightProfilesEditor
          uiState={highlightEditorState}
          onUiStateChange={setHighlightEditorState}
          preferences={preferences}
          onChange={(highlightProfiles) =>
            dispatch({
              type: "preferences/update",
              patch: { highlightProfiles },
            })
          }
        />
      </Tabs.Panel>
      <Tabs.Panel value="shortcuts" pt="md">
        <Text size="sm" c="dimmed" mb="sm">
          Use Control, Meta, Shift or Alt and a key. Explorer shortcuts apply
          while the log group search field is focused.
        </Text>
        <Stack gap="xs">
          {Object.entries(preferences.shortcuts).map(([action, shortcut]) => (
            <TextInput
              key={action}
              label={
                action === "explorerRegex"
                  ? "Explorer regex"
                  : action === "explorerCaseSensitive"
                    ? "Explorer match case"
                    : action.replace(/([A-Z])/g, " $1")
              }
              value={shortcut}
              maxLength={80}
              onChange={(e) =>
                dispatch({
                  type: "preferences/update",
                  patch: {
                    shortcuts: {
                      ...preferences.shortcuts,
                      [action]: e.currentTarget.value,
                    },
                  },
                })
              }
            />
          ))}
        </Stack>
      </Tabs.Panel>
      <Tabs.Panel value="workspace" pt="md">
        <Stack gap="sm">
          <TextInput
            label="Workspace name"
            value={workspace.name}
            maxLength={120}
            onChange={(e) =>
              dispatch({
                type: "workspace/update",
                patch: { name: e.currentTarget.value },
              })
            }
          />
          <Button
            variant="light"
            onClick={() =>
              void window.explorer
                .exportData(JSON.stringify(workspace, null, 2), "json")
                .catch((e) =>
                  notifications.show({ color: "red", message: String(e) }),
                )
            }
          >
            Export workspace configuration
          </Button>
          <Textarea
            label="Import workspace JSON"
            description="Replaces the current layout and settings. Logs and credentials are never imported."
            minRows={4}
            maxRows={8}
            autosize
            value={importText}
            onChange={(e) => setImportText(e.currentTarget.value)}
          />
          <Button
            variant="light"
            disabled={!importText.trim()}
            onClick={() => {
              try {
                const value = JSON.parse(importText);
                dispatch({
                  type: "workspace/restore",
                  workspace: parseWorkspaceInput(value),
                });
                setImportText("");
                notifications.show({
                  message: "Workspace imported",
                  color: "teal",
                });
              } catch (e) {
                notifications.show({ color: "red", message: String(e) });
              }
            }}
          >
            Import configuration
          </Button>
          <Text size="xs" c="dimmed">
            Saved queries
          </Text>
          {workspace.savedQueries.map((q) => (
            <Group key={q.id} justify="space-between">
              <Text size="sm">{q.name}</Text>
              <ActionIcon
                aria-label={`Remove ${q.name}`}
                color="red"
                variant="subtle"
                onClick={() =>
                  dispatch({ type: "query/remove", queryId: q.id })
                }
              >
                <IconTrash size={14} />
              </ActionIcon>
            </Group>
          ))}
          <Text size="xs" c="dimmed">
            Visualization presets
          </Text>
          {workspace.presets.map((p) => (
            <Group key={p.id} justify="space-between">
              <Text size="sm">
                {p.name}
                <Badge ml="xs" size="xs">
                  {p.logGroup ?? "All groups"}
                </Badge>
              </Text>
              <ActionIcon
                aria-label={`Remove preset ${p.name}`}
                color="red"
                variant="subtle"
                onClick={() =>
                  dispatch({ type: "preset/remove", presetId: p.id })
                }
              >
                <IconTrash size={14} />
              </ActionIcon>
            </Group>
          ))}
        </Stack>
      </Tabs.Panel>
    </Tabs>
  );
  if (presentation === "pane")
    return (
      <section
        className="settings-pane"
        aria-label="Workspace settings"
        hidden={!opened}
      >
        <header className="settings-pane-header">
          <Text component="h2" size="sm" fw={600}>
            Workspace settings
          </Text>
          <Tooltip label="Open settings in window">
            <ActionIcon
              aria-label="Open settings in window"
              variant="subtle"
              size="sm"
              disabled={!onOpenModal}
              onClick={onOpenModal}
            >
              <IconMaximize size={16} />
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
      title="Workspace settings"
      size={
        activeTab === "highlights" ? "min(1200px, calc(100vw - 48px))" : "lg"
      }
      centered
    >
      {content}
    </Modal>
  );
}
