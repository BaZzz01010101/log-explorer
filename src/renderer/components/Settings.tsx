import { useEffect, useState } from "react";
import {
  ActionIcon,
  Alert,
  Badge,
  Button,
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
import { IconTrash } from "@tabler/icons-react";
import { notifications } from "@mantine/notifications";
import type { EnvironmentInfo, Workspace } from "../../shared/contracts";
import type { WorkspaceAction } from "../workspace";
import { parseWorkspaceInput } from "../../main/workspace-input";
import { HighlightProfilesEditor } from "./HighlightProfilesEditor";
import { ProfileConnectionsEditor } from "./ProfileConnectionsEditor";

function NumericPreference({
  value,
  onCommit,
  ...props
}: Omit<NumberInputProps, "value" | "onChange" | "onBlur" | "onKeyDown"> & {
  value: number;
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
      onChange={setDraft}
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
}: {
  opened: boolean;
  onClose(): void;
  workspace: Workspace;
  dispatch: React.Dispatch<WorkspaceAction>;
  environment: EnvironmentInfo | null;
  onEnvironment(info: EnvironmentInfo): void;
}) {
  const [profiles, setProfiles] = useState<string[]>([]);
  const [accessPending, setAccessPending] = useState(false);
  const [activeTab, setActiveTab] = useState<string | null>("connections");
  const [importText, setImportText] = useState("");
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
      <Tabs value={activeTab} onChange={setActiveTab}>
        <Tabs.List>
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
            <Group grow>
              <Select
                label="Theme"
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
            <Group grow>
              <NumericPreference
                label="Log font size"
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
        <Tabs.Panel value="highlights" pt="md">
          <HighlightProfilesEditor
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
            Use Control or Meta, optional Shift/Alt, and a key. Ctrl+K opens
            commands.
          </Text>
          <Stack gap="xs">
            {Object.entries(preferences.shortcuts).map(([action, shortcut]) => (
              <TextInput
                key={action}
                label={action.replace(/([A-Z])/g, " $1")}
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
    </Modal>
  );
}
