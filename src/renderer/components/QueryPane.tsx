import { useEffect, useRef, useState } from "react";
import {
  ActionIcon,
  Alert,
  Badge,
  Button,
  Group,
  Menu,
  Modal,
  SegmentedControl,
  Text,
  Textarea,
  TextInput,
  Tooltip,
} from "@mantine/core";
import {
  IconBookmark,
  IconArrowDown,
  IconPlayerPlay,
  IconPlayerStop,
  IconRadio,
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
import { TimeRangePicker } from "./TimeRangePicker";
import { EventStatus } from "./EventStatus";
import { logTabLabel } from "../workspace-entries";
import { SourceBadges } from "./SourceBadges";
import "./sources.css";

interface Props {
  workspace: Workspace;
  tab: LogTab;
  runtime?: TabRuntime;
  onPatch(patch: Partial<LogTab>): void;
  onTimezoneChange(timezone: Workspace["preferences"]["timezone"]): void;
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
  onTimezoneChange,
  onRun,
  onCancel,
  onSaveQuery,
  onSavePreset,
  onContext,
}: Props) {
  const connection = workspace.connections.find(
    (c) => c.id === tab.connectionId,
  );
  const sourceConnections = workspace.connections.filter((connection) =>
    tab.sources.some(
      (source) => (source.connectionId ?? tab.connectionId) === connection.id,
    ),
  );
  const offlineSources =
    sourceConnections.length > 0 &&
    sourceConnections.every((connection) => connection.mode === "offline");
  const [saveKind, setSaveKind] = useState<"query" | "preset" | null>(null);
  const [saveName, setSaveName] = useState("");
  const [followLive, setFollowLive] = useState(true);
  useEffect(() => {
    if (runtime?.live) setFollowLive(true);
  }, [runtime?.live, runtime?.request?.requestId]);
  const liveUnavailable =
    tab.kind === "insights"
      ? "Live Tail is available for Events, not Insights queries."
      : sourceConnections.length !== 1
        ? "Live Tail requires sources from one connection and region."
        : tab.sources.length > 10
          ? "Live Tail supports at most 10 log groups."
          : tab.sources.length > 1 &&
              tab.sources.some((source) => source.logStreams?.length)
            ? "Live Tail supports selected streams only with one log group."
            : undefined;
  const running = runtime?.state === "queued" || runtime?.state === "running";
  const stale =
    runtime?.request &&
    !requestMatchesTab(runtime.request, tab, connection, workspace.connections);
  const paginationScope = useRef("");
  if (runtime?.request && (!paginationScope.current || !runtime.request.cursor))
    paginationScope.current = runtime.request.requestId;
  const canPage = Boolean(
    runtime?.state === "complete" &&
    runtime.cursor &&
    runtime.request &&
    !runtime.live &&
    !runtime.error &&
    !runtime.truncated &&
    !runtime.evicted &&
    !stale &&
    runtime.events.length < workspace.preferences.maxEvents,
  );
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
      aria-label={logTabLabel(tab)}
    >
      <div className="query-toolbar">
        <Group gap={7} wrap="wrap" justify="space-between">
          <Group
            gap={7}
            wrap="nowrap"
            style={{ flex: "1 1 260px", minWidth: 0 }}
          >
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
            <SourceBadges
              sources={tab.sources}
              connectionId={tab.connectionId}
              connections={workspace.connections}
              onChange={(sources) => onPatch({ sources })}
            />
          </Group>
          <Group gap={6}>
            <TimeRangePicker
              tab={tab}
              timezone={workspace.preferences.timezone}
              onPatch={onPatch}
              onTimezoneChange={onTimezoneChange}
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
              disabled={running && !runtime?.live}
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
                  aria-label={runtime?.live ? "Stop Live" : "Cancel query"}
                  onClick={onCancel}
                  leftSection={<IconPlayerStop size={14} />}
                >
                  {runtime?.live ? "Stop Live" : "Stop"}
                </Button>
              </Tooltip>
            ) : (
              <Tooltip
                label={
                  liveUnavailable
                    ? liveUnavailable
                    : offlineSources
                      ? "Start an explicitly simulated fixture stream"
                      : "Start CloudWatch Live Tail (AWS charges apply; results may be sampled)"
                }
              >
                <Button
                  size="xs"
                  color="teal"
                  variant="light"
                  disabled={Boolean(liveUnavailable)}
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
            {offlineSources ? " • limited fixture interpreter" : ""}
          </Text>
          <Text size="xs" c="dimmed">
            {workspace.preferences.shortcuts.runQuery ?? "Control+Enter"}
          </Text>
        </Group>
      </div>
      {runtime?.live && (
        <div
          className="live-session-controls"
          role="region"
          aria-label="Live Tail controls"
        >
          <IconRadio size={15} />
          <Text size="xs">
            {runtime.liveState === "streaming"
              ? offlineSources
                ? "Simulated Live · new events arrive automatically."
                : "Live Tail · new events arrive automatically."
              : "Connecting to Live Tail…"}
          </Text>
          <Text size="xs" c="dimmed">
            Time range buttons stop Live and load history.
          </Text>
          <Tooltip label="Follow the newest event. Scrolling or selecting an event pauses following; the stream keeps receiving events.">
            <Button
              size="compact-xs"
              variant={followLive ? "light" : "default"}
              color="teal"
              aria-label="Follow Live"
              aria-pressed={followLive}
              leftSection={<IconArrowDown size={13} />}
              onClick={() => setFollowLive((value) => !value)}
            >
              {followLive ? "Following Live" : "Follow Live"}
            </Button>
          </Tooltip>
        </div>
      )}
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
              : runtime.liveState
                ? "Live Tail failed"
                : "Query failed"
          }
          m="xs"
        >
          <Text size="xs">{runtime.error}</Text>
          <Button
            mt="xs"
            size="compact-xs"
            variant="light"
            onClick={() => onRun(Boolean(runtime.liveState))}
          >
            {runtime.liveState ? "Retry Live" : "Retry"}
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
          sourceContext={{
            sources: runtime?.request?.sources ?? tab.sources,
            connections: runtime?.request
              ? [
                  runtime.request.connection,
                  ...(runtime.request.connections ?? []),
                ]
              : workspace.connections,
            connectionId: runtime?.request?.connection.id ?? tab.connectionId,
          }}
          view={tab.view}
          onViewChange={patchView}
          preferences={workspace.preferences}
          onContext={onContext}
          loading={
            running && (!runtime?.live || runtime.liveState !== "streaming")
          }
          liveState={runtime?.liveState}
          followLive={Boolean(runtime?.live && followLive)}
          onPauseLiveFollow={() => setFollowLive(false)}
          renderStatus={(eventsShown) => (
            <EventStatus
              runtime={runtime}
              eventsShown={eventsShown}
              eventsLoaded={runtime?.events.length ?? 0}
            />
          )}
          pagination={{
            scope: `${tab.id}:${paginationScope.current}`,
            pageKey: canPage
              ? JSON.stringify([runtime!.cursor, runtime!.request!.requestId])
              : undefined,
            onLoad: () => onRun(false, true),
          }}
        />
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
    </div>
  );
}
