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
import { IconPlus, IconTrash } from "@tabler/icons-react";
import { notifications } from "@mantine/notifications";
import type {
  Connection,
  EnvironmentInfo,
  Workspace,
} from "../../shared/contracts";
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
  const [selectedId, setSelectedId] = useState(workspace.connections[0].id);
  const selected =
    workspace.connections.find((c) => c.id === selectedId) ??
    workspace.connections[0];
  const [draft, setDraft] = useState<Connection>({ ...selected });
  useEffect(() => {
    setDraft({ ...selected });
  }, [
    selected.id,
    selected.name,
    selected.profile,
    selected.region,
    selected.mode,
  ]);
  const [profiles, setProfiles] = useState<string[]>([]);
  const [importText, setImportText] = useState("");
  const updateConnection = (patch: Partial<Connection>) =>
    dispatch({
      type: "connections/set",
      connections: workspace.connections.map((c) =>
        c.id === selected.id ? { ...c, ...patch } : c,
      ),
    });
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
    }
  };
  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title="Workspace settings"
      size="lg"
      centered
    >
      <Tabs defaultValue="connections">
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
                  ? "AWS enabled for this session"
                  : "AWS access is disabled"
              }
            >
              <Text size="sm">
                {environment?.packaged
                  ? "Enable access deliberately to use your configured AWS profiles. Authorization ends when the application exits."
                  : "Development builds use local fixtures only. They cannot read AWS profiles, SSO sessions or connect to AWS."}
              </Text>
            </Alert>
            <Switch
              label="Enable AWS access for this packaged session"
              checked={environment?.awsEnabled ?? false}
              disabled={!environment?.canEnableAws}
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
            <details className="advanced-connections">
              <summary>Advanced connection settings</summary>
              <Stack gap="sm" mt="sm">
                <Group align="end">
                  <Select
                    style={{ flex: 1 }}
                    label="Connection"
                    value={selected.id}
                    data={workspace.connections.map((c) => ({
                      value: c.id,
                      label: c.name,
                    }))}
                    onChange={(value) => value && setSelectedId(value)}
                  />
                  <Button
                    variant="light"
                    leftSection={<IconPlus size={16} />}
                    onClick={() => {
                      const connection: Connection = {
                        id: crypto.randomUUID(),
                        name: "New connection",
                        profile: "default",
                        region: "eu-west-1",
                        mode: "offline",
                      };
                      dispatch({
                        type: "connections/set",
                        connections: [...workspace.connections, connection],
                      });
                      setSelectedId(connection.id);
                    }}
                  >
                    Add
                  </Button>
                  <ActionIcon
                    aria-label="Remove connection"
                    size="lg"
                    color="red"
                    variant="subtle"
                    disabled={
                      workspace.connections.length < 2 ||
                      workspace.tabs.some((t) => t.connectionId === selected.id)
                    }
                    onClick={() =>
                      dispatch({
                        type: "connections/set",
                        connections: workspace.connections.filter(
                          (c) => c.id !== selected.id,
                        ),
                      })
                    }
                  >
                    <IconTrash size={17} />
                  </ActionIcon>
                </Group>
                <TextInput
                  label="Display name"
                  value={draft.name}
                  maxLength={120}
                  onChange={(e) =>
                    setDraft({ ...draft, name: e.currentTarget.value })
                  }
                />
                <Group grow>
                  <TextInput
                    label="AWS profile"
                    value={draft.profile}
                    maxLength={256}
                    onChange={(e) =>
                      setDraft({ ...draft, profile: e.currentTarget.value })
                    }
                  />
                  <TextInput
                    label="AWS region"
                    value={draft.region}
                    maxLength={40}
                    onChange={(e) =>
                      setDraft({ ...draft, region: e.currentTarget.value })
                    }
                  />
                </Group>
                {profiles.length > 0 && (
                  <Select
                    label="Configured profiles"
                    placeholder="Select a profile"
                    searchable
                    data={profiles}
                    value={
                      profiles.includes(draft.profile) ? draft.profile : null
                    }
                    onChange={(value) =>
                      value && setDraft({ ...draft, profile: value })
                    }
                  />
                )}
                <Select
                  label="Data source"
                  value={draft.mode}
                  data={[
                    { value: "offline", label: "Offline fixtures" },
                    { value: "aws", label: "AWS CloudWatch Logs" },
                  ]}
                  onChange={(value) =>
                    value &&
                    setDraft({ ...draft, mode: value as Connection["mode"] })
                  }
                />
                <Text size="xs" c="dimmed">
                  Profiles support IAM Identity Center / SSO and role assumption
                  through the official AWS credential provider. Establish your
                  SSO session outside this application. Credentials remain in
                  the main process and are never stored in a workspace.
                </Text>
                <Button
                  disabled={
                    !draft.name.trim() ||
                    !draft.profile.trim() ||
                    !/^[a-z]{2}(?:-[a-z]+)+-\d+$/.test(draft.region)
                  }
                  onClick={() =>
                    updateConnection({
                      name: draft.name.trim(),
                      profile: draft.profile.trim(),
                      region: draft.region,
                      mode: draft.mode,
                    })
                  }
                >
                  Apply connection
                </Button>
              </Stack>
            </details>
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
