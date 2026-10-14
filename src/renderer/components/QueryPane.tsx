import { useState } from "react";
import {
  ActionIcon,
  Alert,
  Badge,
  Button,
  Group,
  Loader,
  Menu,
  Modal,
  Select,
  SegmentedControl,
  Text,
  Textarea,
  TextInput,
  Tooltip,
} from "@mantine/core";
import {
  IconBookmark,
  IconChevronDown,
  IconClock,
  IconPlayerPlay,
  IconPlayerStop,
  IconRadio,
  IconX,
} from "@tabler/icons-react";
import type {
  LogEvent,
  LogTab,
  SavedQuery,
  ViewConfig,
  Workspace,
} from "../../shared/contracts";
import type { TabRuntime } from "../useLogJobs";
import { LogViewer } from "./LogViewer";
import { requestMatchesTab } from "../query-state";

interface Props {
  workspace: Workspace;
  tab: LogTab;
  runtime?: TabRuntime;
  onPatch(patch: Partial<LogTab>): void;
  onRun(live?: boolean, more?: boolean): void;
  onCancel(): void;
  onSaveQuery(query: SavedQuery): void;
  onSavePreset(name: string): void;
  onContext(event: LogEvent): void;
}

export function QueryPane({
  workspace,
  tab,
  runtime,
  onPatch,
  onRun,
  onCancel,
  onSaveQuery,
  onSavePreset,
  onContext,
}: Props) {
  const connection = workspace.connections.find(
    (c) => c.id === tab.connectionId,
  );
  const [saveKind, setSaveKind] = useState<"query" | "preset" | null>(null);
  const [saveName, setSaveName] = useState("");
  const [sourcesOpen, setSourcesOpen] = useState(false);
  const [sourceText, setSourceText] = useState("");
  const [sourceConnectionId, setSourceConnectionId] = useState(
    tab.connectionId,
  );
  const running = runtime?.state === "queued" || runtime?.state === "running";
  const stale =
    runtime?.request && !requestMatchesTab(runtime.request, tab, connection);
  const currentText = tab.kind === "events" ? tab.filterPattern : tab.query;
  const patchView = (view: ViewConfig) => onPatch({ view });
  const presets = workspace.presets.filter(
    (p) => !p.logGroup || tab.sources.some((s) => s.logGroup === p.logGroup),
  );
  return (
    <div
      className="query-pane"
      id={`view-${tab.id}`}
      role="tabpanel"
      aria-label={tab.title}
    >
      <div className="query-toolbar">
        <Group gap={7} wrap="wrap" justify="space-between">
          <Group gap={7}>
            <SegmentedControl
              aria-label="Server query type"
              size="xs"
              value={tab.kind}
              onChange={(value) => onPatch({ kind: value as LogTab["kind"] })}
              data={[
                { label: "Events", value: "events" },
                { label: "Insights", value: "insights" },
              ]}
            />
            <Menu position="bottom-start">
              <Menu.Target>
                <Button
                  variant="subtle"
                  size="compact-xs"
                  rightSection={<IconChevronDown size={12} />}
                >
                  {tab.sources.length} source
                  {tab.sources.length !== 1 ? "s" : ""}
                </Button>
              </Menu.Target>
              <Menu.Dropdown>
                <Menu.Label>
                  {connection?.name} · {connection?.region}
                </Menu.Label>
                {tab.sources.map((source) => (
                  <Menu.Item
                    key={source.logGroup}
                    onClick={() => {
                      setSourceText(
                        tab.sources.map((s) => s.logGroup).join("\n"),
                      );
                      setSourceConnectionId(tab.connectionId);
                      setSourcesOpen(true);
                    }}
                  >
                    {source.logGroup}
                    {source.logStreams?.length
                      ? ` (${source.logStreams.length} streams)`
                      : ""}
                  </Menu.Item>
                ))}
                <Menu.Divider />
                <Menu.Item
                  onClick={() => {
                    setSourceText(
                      tab.sources.map((s) => s.logGroup).join("\n"),
                    );
                    setSourceConnectionId(tab.connectionId);
                    setSourcesOpen(true);
                  }}
                >
                  Edit sources
                </Menu.Item>
              </Menu.Dropdown>
            </Menu>
          </Group>
          <Group gap={6}>
            <Select
              aria-label="Time range"
              size="xs"
              w={128}
              leftSection={<IconClock size={13} />}
              value={tab.timePreset}
              onChange={(value) => value && onPatch({ timePreset: value })}
              data={[
                { value: "5m", label: "Last 5 minutes" },
                { value: "15m", label: "Last 15 minutes" },
                { value: "1h", label: "Last hour" },
                { value: "6h", label: "Last 6 hours" },
                { value: "24h", label: "Last 24 hours" },
                { value: "7d", label: "Last 7 days" },
                { value: "custom", label: "Custom range" },
              ]}
            />
            <Menu>
              <Menu.Target>
                <ActionIcon
                  variant="subtle"
                  aria-label="Saved queries and presets"
                >
                  <IconBookmark size={17} />
                </ActionIcon>
              </Menu.Target>
              <Menu.Dropdown>
                <Menu.Label>Queries</Menu.Label>
                {workspace.savedQueries.map((query) => (
                  <Menu.Item
                    key={query.id}
                    onClick={() =>
                      onPatch({
                        kind: query.kind,
                        ...(query.kind === "events"
                          ? { filterPattern: query.text }
                          : { query: query.text }),
                      })
                    }
                  >
                    {query.name}
                  </Menu.Item>
                ))}
                <Menu.Item
                  disabled={!currentText.trim()}
                  onClick={() => {
                    setSaveName("");
                    setSaveKind("query");
                  }}
                >
                  Save current query…
                </Menu.Item>
                <Menu.Divider />
                <Menu.Label>Visualization presets</Menu.Label>
                {presets.map((preset) => (
                  <Menu.Item
                    key={preset.id}
                    onClick={() => patchView(structuredClone(preset.view))}
                  >
                    {preset.name}
                  </Menu.Item>
                ))}
                <Menu.Item
                  onClick={() => {
                    setSaveName("");
                    setSaveKind("preset");
                  }}
                >
                  Save view for this log group…
                </Menu.Item>
                {workspace.history.length > 0 && (
                  <>
                    <Menu.Divider />
                    <Menu.Label>Recent searches</Menu.Label>
                    {workspace.history.slice(0, 8).map((query) => (
                      <Menu.Item
                        key={query.id}
                        title={query.text}
                        onClick={() =>
                          onPatch({
                            kind: query.kind,
                            ...(query.kind === "events"
                              ? { filterPattern: query.text }
                              : { query: query.text }),
                          })
                        }
                      >
                        {query.text.slice(0, 70)}
                      </Menu.Item>
                    ))}
                  </>
                )}
              </Menu.Dropdown>
            </Menu>
          </Group>
        </Group>
        {tab.timePreset === "custom" && (
          <Group gap="xs" mt={8}>
            <TextInput
              size="xs"
              type="datetime-local"
              aria-label="Range start"
              value={tab.customStart ?? ""}
              onChange={(e) => onPatch({ customStart: e.currentTarget.value })}
            />
            <Text size="xs" c="dimmed">
              to
            </Text>
            <TextInput
              size="xs"
              type="datetime-local"
              aria-label="Range end"
              value={tab.customEnd ?? ""}
              onChange={(e) => onPatch({ customEnd: e.currentTarget.value })}
            />
            <Text size="xs" c="dimmed">
              Local time
            </Text>
          </Group>
        )}
        <div
          className={`query-editor ${tab.kind === "insights" ? "insights-editor" : ""}`}
        >
          <div className="query-input">
            {tab.kind === "events" ? (
              <TextInput
                aria-label="CloudWatch filter pattern"
                classNames={{ input: "code-input" }}
                value={tab.filterPattern}
                onChange={(e) =>
                  onPatch({ filterPattern: e.currentTarget.value })
                }
                placeholder='{ $.level = "error" } or "request failed"'
                size="xs"
                leftSection={
                  <Badge size="xs" variant="light" color="blue">
                    SERVER
                  </Badge>
                }
                leftSectionWidth={61}
              />
            ) : (
              <Textarea
                aria-label="CloudWatch Logs Insights query"
                classNames={{ input: "code-input" }}
                autosize
                minRows={3}
                maxRows={7}
                value={tab.query}
                onChange={(e) => onPatch({ query: e.currentTarget.value })}
                placeholder="fields @timestamp, @message | sort @timestamp desc | limit 100"
              />
            )}
          </div>
          <Group gap={6} align="flex-start">
            <Button
              size="xs"
              data-testid="run-query"
              leftSection={<IconPlayerPlay size={14} />}
              disabled={running}
              onClick={() => onRun()}
            >
              Run
            </Button>
            {running ? (
              <Tooltip label="Cancel this request">
                <Button
                  size="xs"
                  color="red"
                  variant="light"
                  aria-label="Cancel query"
                  onClick={onCancel}
                  leftSection={<IconPlayerStop size={14} />}
                >
                  Stop
                </Button>
              </Tooltip>
            ) : (
              <Tooltip
                label={
                  connection?.mode === "offline"
                    ? "Start an explicitly simulated fixture stream"
                    : "Start CloudWatch Live Tail (AWS charges apply; results may be sampled)"
                }
              >
                <Button
                  size="xs"
                  color="teal"
                  variant="light"
                  disabled={tab.kind === "insights"}
                  leftSection={<IconRadio size={14} />}
                  onClick={() => onRun(true)}
                >
                  Live
                </Button>
              </Tooltip>
            )}
          </Group>
        </div>
        <Group justify="space-between" gap="xs" mt={7}>
          <Text size="xs" c="dimmed">
            {tab.kind === "insights"
              ? "Logs Insights • server-side analysis • AWS scan charges apply"
              : "CloudWatch pattern • server-side selection"}
            {connection?.mode === "offline"
              ? " • limited fixture interpreter"
              : ""}
          </Text>
          <Text size="xs" c="dimmed">
            {workspace.preferences.shortcuts.runQuery ?? "Control+Enter"}
          </Text>
        </Group>
      </div>
      {stale && (
        <Alert color="yellow" p="xs" mx="xs">
          Query settings changed. Displayed events belong to the previous
          request; run the query to apply these settings.
        </Alert>
      )}
      {runtime?.error && (
        <Alert
          color="red"
          title={
            runtime.state === "cancelled"
              ? "Cancellation cleanup failed"
              : "Query failed"
          }
          m="xs"
        >
          <Text size="xs">{runtime.error}</Text>
          <Button
            mt="xs"
            size="compact-xs"
            variant="light"
            onClick={() => onRun()}
          >
            Retry
          </Button>
        </Alert>
      )}
      {runtime?.sampled && (
        <Alert color="yellow" p="xs" mx="xs">
          Live Tail is sampled by CloudWatch. This view does not contain every
          matching event.
        </Alert>
      )}
      {(runtime?.truncated || (runtime?.evicted ?? 0) > 0) && (
        <Alert color="yellow" p="xs" mx="xs">
          {runtime?.evicted
            ? `${runtime.evicted.toLocaleString()} earlier events removed at the buffer limit. `
            : ""}
          {runtime?.truncated
            ? "The service result limit was reached. Narrow the time range or query."
            : ""}
        </Alert>
      )}
      <div className="viewer-container">
        <LogViewer
          events={runtime?.events ?? []}
          view={tab.view}
          onViewChange={patchView}
          preferences={workspace.preferences}
          onContext={onContext}
        />
      </div>
      <div className="query-status" role="status" aria-live="polite">
        <Group gap={7}>
          {running ? (
            <Loader size={11} color={runtime?.live ? "teal" : "blue"} />
          ) : (
            <span
              className={`status-dot ${runtime?.state === "error" ? "error" : ""}`}
            />
          )}
          <Text size="xs" c="dimmed">
            {runtime?.live ? "Live stream" : (runtime?.state ?? "Ready")} ·{" "}
            {(runtime?.events.length ?? 0).toLocaleString()} loaded
          </Text>
          {runtime?.stats?.bytesScanned !== undefined && (
            <Text size="xs" c="dimmed">
              {(runtime.stats.bytesScanned / 1048576).toFixed(2)} MiB scanned
            </Text>
          )}
          {runtime?.stats?.recordsScanned !== undefined && (
            <Text size="xs" c="dimmed">
              {runtime.stats.recordsScanned.toLocaleString()} scanned
            </Text>
          )}
          {runtime?.stats?.elapsedMs !== undefined && (
            <Text size="xs" c="dimmed">
              {(runtime.stats.elapsedMs / 1000).toFixed(1)}s
            </Text>
          )}
        </Group>
        {runtime?.cursor && !running && !stale && (
          <Button
            size="compact-xs"
            variant="light"
            onClick={() => onRun(false, true)}
          >
            Load next page
          </Button>
        )}
      </div>
      <Modal
        opened={saveKind !== null}
        onClose={() => setSaveKind(null)}
        title={
          saveKind === "query" ? "Save query" : "Save visualization preset"
        }
        centered
      >
        <TextInput
          label="Name"
          value={saveName}
          onChange={(e) => setSaveName(e.currentTarget.value)}
          autoFocus
          maxLength={120}
        />
        <Button
          mt="md"
          disabled={!saveName.trim()}
          onClick={() => {
            if (saveKind === "query")
              onSaveQuery({
                id: crypto.randomUUID(),
                name: saveName.trim(),
                kind: tab.kind,
                text: currentText,
              });
            else onSavePreset(saveName.trim());
            setSaveKind(null);
          }}
        >
          Save
        </Button>
      </Modal>
      <Modal
        opened={sourcesOpen}
        onClose={() => setSourcesOpen(false)}
        title="Log sources"
        centered
      >
        <Select
          label="Connection and region"
          value={sourceConnectionId}
          data={workspace.connections.map((c) => ({
            value: c.id,
            label: `${c.name} · ${c.region}`,
          }))}
          onChange={(value) => value && setSourceConnectionId(value)}
        />
        <Textarea
          mt="sm"
          label="Log groups, one per line"
          autosize
          minRows={4}
          maxRows={12}
          value={sourceText}
          onChange={(e) => setSourceText(e.currentTarget.value)}
        />
        <Text mt="xs" size="xs" c="dimmed">
          Up to 50 groups in one region. Existing stream selections are kept for
          matching group names.
        </Text>
        <Button
          mt="md"
          disabled={!sourceText.trim()}
          onClick={() => {
            const names = [
              ...new Set(
                sourceText
                  .split("\n")
                  .map((s) => s.trim())
                  .filter(Boolean),
              ),
            ].slice(0, 50);
            onPatch({
              connectionId: sourceConnectionId,
              sources: names.map(
                (name) =>
                  (sourceConnectionId === tab.connectionId
                    ? tab.sources.find((s) => s.logGroup === name)
                    : undefined) ?? {
                    logGroup: name,
                  },
              ),
            });
            setSourcesOpen(false);
          }}
        >
          Apply sources
        </Button>
      </Modal>
    </div>
  );
}
