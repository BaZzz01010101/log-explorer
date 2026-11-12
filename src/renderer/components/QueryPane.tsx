import { useEffect, useMemo, useRef, useState } from "react";
import {
  ActionIcon,
  Alert,
  Button,
  Group,
  Modal,
  Select,
  Text,
  TextInput,
} from "@mantine/core";
import { Tooltip } from "./AppTooltip";
import { Menu } from "./AppMenu";
import {
  IconBookmark,
  IconPlayerPlay,
  IconPlayerStop,
  IconRadio,
  IconTrash,
} from "@tabler/icons-react";
import type {
  LogEvent,
  LogTab,
  SavedQuery,
  ViewConfig,
  Workspace,
} from "../../shared/contracts";
import type { TabRuntime } from "../useLogJobs";
import type { ContextRange } from "../../shared/context-range";
import { LogViewer } from "./LogViewer";
import { requestMatchesTab } from "../query-state";
import { TimeRangePicker } from "./TimeRangePicker";
import { EventStatus } from "./EventStatus";
import { logTabLabel } from "../workspace-entries";
import { contextEventIndex } from "../context-event";
import { SourceBadges } from "./SourceBadges";
import { ServerFilterInput } from "./ServerFilterInput";
import { DEFAULT_RECENT_SEARCHES_LIMIT } from "../../shared/query-history";
import { InlineDeleteConfirmation } from "./InlineDeleteConfirmation";
import "./sources.css";

interface Props {
  workspace: Workspace;
  tab: LogTab;
  runtime?: TabRuntime;
  onPatch(patch: Partial<LogTab>): void;
  onTimezoneChange(timezone: Workspace["preferences"]["timezone"]): void;
  onRun(live?: boolean, more?: boolean, filterPattern?: string): void;
  onCancel(): void;
  onSaveQuery(query: SavedQuery): void;
  onDeleteQuery?(queryId: string): void;
  onSavePreset(name: string): void;
  onContext(event: LogEvent, range: ContextRange): void;
  revealEvent?: LogEvent;
  onEventRevealed?(): void;
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
  onDeleteQuery,
  onContext,
  revealEvent,
  onEventRevealed,
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
  const [saveOpened, setSaveOpened] = useState(false);
  const [saveName, setSaveName] = useState("");
  const [pendingSearchDeletes, setPendingSearchDeletes] = useState<Set<string>>(
    () => new Set(),
  );
  const finishDelete = (id: string) =>
    setPendingSearchDeletes((previous) => {
      const next = new Set(previous);
      next.delete(id);
      return next;
    });
  const [followLive, setFollowLive] = useState(false);
  const sourceContext = useMemo(
    () => ({
      sources: runtime?.request?.sources ?? tab.sources,
      connections: runtime?.request
        ? [runtime.request.connection, ...(runtime.request.connections ?? [])]
        : workspace.connections,
      connectionId: runtime?.request?.connection.id ?? tab.connectionId,
    }),
    [runtime?.request, tab.sources, tab.connectionId, workspace.connections],
  );
  useEffect(() => {
    if (!runtime?.live) setFollowLive(false);
  }, [runtime?.live]);
  const liveUnavailable =
    sourceConnections.length !== 1
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
    (runtime.request.direction === "older" || !runtime.evicted) &&
    !stale &&
    (runtime.request.direction === "older" || runtime.events.length < workspace.preferences.maxEvents),
  );
  const prefetched = useRef(new Set<string>());
  useEffect(() => {
    const request = runtime?.request;
    if (!canPage || !request || request.direction === "older" || request.cursor || (runtime?.events.length ?? 0) < 100 ||
        !sourceConnections.some((item) => item.mode === "gcp") || prefetched.current.has(request.requestId)) return;
    prefetched.current.add(request.requestId);
    if (prefetched.current.size > 100) prefetched.current.delete(prefetched.current.values().next().value!);
    onRun(false, true);
  }, [canPage, runtime?.request, runtime?.events.length, sourceConnections, onRun]);
  const currentText = tab.filterPattern;
  const savedSearches = workspace.savedQueries.filter(
    (query) => query.kind === "events",
  );
  const recentSearches = workspace.history
    .filter((query) => query.kind === "events")
    .slice(
      0,
      workspace.preferences.recentSearchesLimit ??
        DEFAULT_RECENT_SEARCHES_LIMIT,
    );
  const contextPages = useRef(new Set<string>());
  useEffect(() => {
    if (
      !revealEvent ||
      runtime?.state !== "complete" ||
      contextEventIndex(runtime?.events ?? [], revealEvent) >= 0
    )
      return;
    if (!canPage) {
      onEventRevealed?.();
      return;
    }
    const cursor = runtime!.cursor!;
    if (contextPages.current.has(cursor)) return;
    contextPages.current.add(cursor);
    onRun(false, true);
  }, [revealEvent, canPage, runtime?.cursor, runtime?.events]);
  const patchView = (view: ViewConfig) => onPatch({ view });
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
              relativeTimeTemplates={
                workspace.preferences.relativeTimeTemplates
              }
              onPatch={onPatch}
              onTimezoneChange={onTimezoneChange}
            />
          </Group>
        </Group>
        <div className="query-editor">
          <div className="query-input">
            <ServerFilterInput
              provider={sourceConnections.length > 0 && sourceConnections.every((item) => item.mode === "gcp") ? "gcp" : "aws"}
              historyKey={`events-filter:${tab.id}`}
              value={tab.filterPattern}
              mode={tab.filterMode}
              onChange={(filterPattern) => onPatch({ filterPattern })}
              onModeChange={(filterMode) => onPatch({ filterMode })}
              onRun={() => onRun()}
              onClear={() => {
                onPatch({ filterPattern: "" });
                onRun(false, false, "");
              }}
            />
          </div>
          <Menu position="bottom-end">
            <Menu.Target>
              <ActionIcon
                className="query-searches-button"
                variant="subtle"
                aria-label="Saved and recent searches"
                data-tooltip="Saved and recent searches"
              >
                <IconBookmark size={17} />
              </ActionIcon>
            </Menu.Target>
            <Menu.Dropdown className="query-searches-menu">
              <Menu.Item
                disabled={!currentText.trim()}
                onClick={() => {
                  setSaveName(
                    currentText.replace(/\s+/g, " ").trim().slice(0, 120),
                  );
                  setSaveOpened(true);
                }}
              >
                Save search…
              </Menu.Item>
              {savedSearches.length > 0 && (
                <>
                  <Menu.Divider />
                  <Menu.Label>Saved searches</Menu.Label>
                  {savedSearches.map((query) => (
                    <div
                      key={query.id}
                      className={`saved-search-menu-row inline-delete-row${pendingSearchDeletes.has(query.id) ? " is-confirming-delete" : ""}`}
                      data-saved-search-id={query.id}
                      data-confirming-delete={
                        pendingSearchDeletes.has(query.id) || undefined
                      }
                    >
                      <Menu.Item
                        className="saved-search-menu-item"
                        data-tooltip={
                          pendingSearchDeletes.has(query.id)
                            ? undefined
                            : query.text
                        }
                        onClick={() =>
                          onPatch({
                            kind: "events",
                            filterPattern: query.text,
                            filterMode: query.filterMode ?? "pattern",
                          })
                        }
                      >
                        {query.name}
                      </Menu.Item>
                      {onDeleteQuery &&
                        (pendingSearchDeletes.has(query.id) ? (
                          <InlineDeleteConfirmation
                            label={`Delete saved search ${query.name}`}
                            onCancel={() => finishDelete(query.id)}
                            onDelete={() => {
                              finishDelete(query.id);
                              onDeleteQuery(query.id);
                            }}
                          />
                        ) : (
                          <Menu.Item
                            className="saved-search-menu-delete"
                            aria-label={`Delete saved search ${query.name}`}
                            color="red"
                            closeMenuOnClick={false}
                            onClick={(event) => {
                              event.stopPropagation();
                              setPendingSearchDeletes((previous) =>
                                new Set(previous).add(query.id),
                              );
                            }}
                          >
                            <IconTrash size={14} />
                          </Menu.Item>
                        ))}
                    </div>
                  ))}
                </>
              )}
              {recentSearches.length > 0 && (
                <>
                  <Menu.Divider />
                  <Menu.Label>Recent searches</Menu.Label>
                  {recentSearches.map((query) => (
                    <Menu.Item
                      key={query.id}
                      data-tooltip={query.text}
                      onClick={() =>
                        onPatch({
                          kind: "events",
                          filterPattern: query.text,
                          filterMode: query.filterMode ?? "pattern",
                        })
                      }
                    >
                      {query.text.replace(/\s+/g, " ").trim().slice(0, 70)}
                    </Menu.Item>
                  ))}
                </>
              )}
            </Menu.Dropdown>
          </Menu>
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
              <Tooltip label="Cancel this request" disabled={runtime?.live}>
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
              <span data-tooltip={liveUnavailable} aria-label={liveUnavailable} role={liveUnavailable ? "note" : undefined} tabIndex={liveUnavailable ? 0 : undefined}>
              <Button
                size="xs"
                color="teal"
                variant="light"
                disabled={Boolean(liveUnavailable)}
                aria-description={
                  liveUnavailable ?? (offlineSources
                    ? "Start an explicitly simulated fixture stream"
                    : sourceConnections.every((item) => item.mode === "gcp")
                    ? "Stream new Google Cloud log entries"
                    : "Start CloudWatch Live Tail (AWS charges apply; results may be sampled)")
                }
                leftSection={<IconRadio size={14} />}
                onClick={() => onRun(true)}
              >
                Live
              </Button>
              </span>
            )}
          </Group>
        </div>
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
          Live Tail omitted events. This view does not contain every
          matching event.
        </Alert>
      )}
      {(runtime?.truncated || (runtime?.evicted ?? 0) > 0) && (
        <Alert color="yellow" p="xs" mx="xs">
          {runtime?.evicted
            ? `${runtime.evicted.toLocaleString()} ${runtime.request?.direction === "older" ? "newer" : "earlier"} events removed at the buffer limit. `
            : ""}
          {runtime?.truncated
            ? "The service result limit was reached. Narrow the time range or query."
            : ""}
          {runtime?.evicted && runtime.request?.direction === "older" ? <Button size="compact-xs" variant="subtle" onClick={() => onRun()}>Return to recent</Button> : null}
        </Alert>
      )}
      <div className="viewer-container">
        <LogViewer
          events={runtime?.events ?? []}
          revealEvent={revealEvent}
          onEventRevealed={onEventRevealed}
          serverFilter={
            runtime?.request?.kind === "events"
              ? runtime.request.filterPattern
              : ""
          }
          sourceContext={sourceContext}
          view={tab.view}
          onViewChange={patchView}
          preferences={workspace.preferences}
          onContext={onContext}
          loading={
            running && (!runtime?.live || runtime.liveState !== "streaming")
          }
          incomplete={runtime?.incomplete}
          liveState={runtime?.liveState}
          followLive={Boolean(runtime?.live && followLive)}
          onPauseLiveFollow={() => setFollowLive(false)}
          onResumeLiveFollow={() => {
            if (runtime?.live) setFollowLive(true);
          }}
          renderStatus={(eventsShown) => (
            <EventStatus
              runtime={runtime}
              eventsShown={eventsShown}
              eventsLoaded={runtime?.events.length ?? 0}
              followLive={followLive}
              onToggleFollow={() => setFollowLive((value) => !value)}
            />
          )}
          pagination={{
            scope: `${tab.id}:${paginationScope.current}`,
            direction: runtime?.request?.direction,
            loadingOlder: runtime?.request?.direction === "older" && Boolean(runtime.request.cursor),
            pageKey: canPage
              ? JSON.stringify([runtime!.cursor, runtime!.request!.requestId])
              : undefined,
            onLoad: () => onRun(false, true),
          }}
        />
      </div>
      <Modal
        opened={saveOpened}
        onClose={() => setSaveOpened(false)}
        title="Save search"
        centered
      >
        <TextInput
          label="Name"
          value={saveName}
          onChange={(e) => setSaveName(e.currentTarget.value)}
          autoFocus
          data-autofocus
          onFocus={(event) => event.currentTarget.select()}
          maxLength={120}
        />
        <Button
          mt="md"
          disabled={!saveName.trim()}
          onClick={() => {
            onSaveQuery({
              id: crypto.randomUUID(),
              name: saveName.trim(),
              kind: "events",
              text: currentText,
              filterMode: tab.filterMode,
            });
            setSaveOpened(false);
          }}
        >
          Save
        </Button>
      </Modal>
    </div>
  );
}
