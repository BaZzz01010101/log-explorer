import { useEffect, useId, useMemo, useRef, useState } from "react";
import {
  ActionIcon,
  Alert,
  Badge,
  Button,
  Group,
  Loader,
  Menu,
  Select,
  Text,
  TextInput,
  Tooltip,
} from "@mantine/core";
import {
  IconChevronDown,
  IconChevronRight,
  IconCloud,
  IconFolder,
  IconPlus,
  IconRefresh,
  IconSearch,
  IconSettings,
  IconStar,
  IconStarFilled,
  IconList,
  IconInfoCircle,
  IconCopy,
} from "@tabler/icons-react";
import { defaultRangeExtractor, useVirtualizer } from "@tanstack/react-virtual";
import type {
  Connection,
  Favorite,
  LogGroup,
  LogSource,
  LogStream,
  Page,
} from "../../shared/contracts";

interface Props {
  connections: Connection[];
  activeConnectionId: string;
  favorites: Favorite[];
  recents: Favorite[];
  onOpen(
    connectionId: string,
    sources: LogSource[],
    mode?: "preview" | "permanent",
  ): void;
  onFavorite(favorite: Favorite): void;
  onManage(): void;
}
export type ResourceRow =
  | { kind: "group"; group: LogGroup }
  | { kind: "stream"; group: LogGroup; stream: LogStream }
  | { kind: "more"; group: LogGroup }
  | { kind: "loading"; group: LogGroup }
  | { kind: "error"; group: LogGroup; message: string };
interface StreamState {
  items: LogStream[];
  cursor?: string;
  loading?: boolean;
  error?: string;
}

export function navigateResourceTree(
  rows: ResourceRow[],
  expanded: ReadonlySet<string>,
  currentIndex: number,
  key: string,
  pageSize = 10,
): {
  index: number;
  action?: "expand" | "collapse" | "open" | "select" | "load";
} | null {
  const keys = [
    "ArrowUp",
    "ArrowDown",
    "Home",
    "End",
    "PageUp",
    "PageDown",
    "ArrowRight",
    "ArrowLeft",
    "Enter",
    " ",
  ];
  if (!keys.includes(key)) return null;
  const focusable = rows
    .map((row, index) => (row.kind === "loading" ? -1 : index))
    .filter((index) => index >= 0);
  if (!focusable.length) return null;
  const currentPosition = focusable.indexOf(currentIndex);
  const position = currentPosition < 0 ? 0 : currentPosition;
  const index = focusable[position];
  const move = (offset: number) => ({
    index:
      focusable[Math.max(0, Math.min(focusable.length - 1, position + offset))],
  });
  if (key === "Home") return { index: focusable[0] };
  if (key === "End") return { index: focusable.at(-1)! };
  if (key === "ArrowDown") return currentPosition < 0 ? { index } : move(1);
  if (key === "ArrowUp") return currentPosition < 0 ? { index } : move(-1);
  if (key === "PageDown") return move(Math.max(1, pageSize));
  if (key === "PageUp") return move(-Math.max(1, pageSize));
  const row = rows[index];
  if (key === "Enter")
    return {
      index,
      action: row.kind === "group" || row.kind === "stream" ? "open" : "load",
    };
  if (key === " ")
    return row.kind === "group" ? { index, action: "select" } : { index };
  if (key === "ArrowRight" && row.kind === "group") {
    if (!expanded.has(row.group.name)) return { index, action: "expand" };
    const child = focusable[position + 1];
    if (
      child !== undefined &&
      rows[child].kind !== "group" &&
      rows[child].group.name === row.group.name
    )
      return { index: child };
  }
  if (key === "ArrowLeft") {
    if (row.kind === "group")
      return expanded.has(row.group.name)
        ? { index, action: "collapse" }
        : { index };
    const parent = rows.findIndex(
      (item) => item.kind === "group" && item.group.name === row.group.name,
    );
    if (parent >= 0) return { index: parent };
  }
  return { index };
}

function resourceRowKey(row: ResourceRow): string {
  return JSON.stringify([
    row.kind,
    row.group.name,
    row.kind === "stream" ? row.stream.name : "",
  ]);
}
function groupDescription(group: LogGroup): string {
  const retention =
    group.retentionDays !== undefined
      ? group.retentionDays + " days"
      : "Indefinite";
  const storage =
    group.storedBytes !== undefined
      ? (group.storedBytes / 1048576).toLocaleString(undefined, {
          maximumFractionDigits: 2,
        }) + " MiB"
      : "Not provided";
  return (
    "Retention: " +
    retention +
    "\nClass: " +
    (group.logClass ?? "Standard") +
    "\nStored: " +
    storage
  );
}

export function ResourceSidebar(props: Props) {
  const [connectionId, setConnectionId] = useState(props.activeConnectionId);
  const connection =
    props.connections.find((c) => c.id === connectionId) ??
    props.connections[0];
  const [search, setSearch] = useState("");
  const [debounced, setDebounced] = useState("");
  const [streamPrefix, setStreamPrefix] = useState("");
  const [groups, setGroups] = useState<Page<LogGroup>>({ items: [] });
  const [streams, setStreams] = useState<Record<string, StreamState>>({});
  const [expanded, setExpanded] = useState(new Set<string>());
  const [regionOpen, setRegionOpen] = useState(true);
  const [selected, setSelected] = useState(new Set<string>());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [activeKey, setActiveKey] = useState<string | null>(null);
  const [treeFocused, setTreeFocused] = useState(false);
  const generation = useRef(0);
  const groupsRequest = useRef(0);
  const streamRequestCounter = useRef(0);
  const streamRequests = useRef(new Map<string, number>());
  const treeRef = useRef<HTMLDivElement>(null);
  const treeId = useId();
  useEffect(() => {
    setConnectionId(props.activeConnectionId);
  }, [props.activeConnectionId]);
  useEffect(() => {
    const timeout = setTimeout(() => setDebounced(search), 220);
    return () => clearTimeout(timeout);
  }, [search]);
  const loadGroups = async (more = false, version = generation.current) => {
    if (!connection) return;
    const request = ++groupsRequest.current;
    setBusy(true);
    setError("");
    try {
      const page = await window.explorer.listGroups(
        connection,
        debounced,
        more ? groups.cursor : undefined,
      );
      if (version !== generation.current || request !== groupsRequest.current)
        return;
      setGroups((previous) => ({
        items: more
          ? [
              ...new Map(
                [...previous.items, ...page.items].map((g) => [g.name, g]),
              ).values(),
            ]
          : page.items,
        cursor: page.cursor,
      }));
    } catch (e) {
      if (version === generation.current && request === groupsRequest.current)
        setError(e instanceof Error ? e.message : "Could not load log groups");
    } finally {
      if (version === generation.current && request === groupsRequest.current)
        setBusy(false);
    }
  };
  useEffect(() => {
    const version = ++generation.current;
    streamRequests.current.clear();
    setActiveKey(null);
    setGroups({ items: [] });
    setStreams({});
    setExpanded(new Set());
    setSelected(new Set());
    void loadGroups(false, version);
    return () => {
      generation.current++;
    };
  }, [
    connection?.id,
    connection?.profile,
    connection?.region,
    connection?.mode,
    debounced,
  ]);
  const loadStreams = async (group: string, more = false) => {
    if (!connection || streamRequests.current.has(group)) return;
    const version = generation.current;
    const request = ++streamRequestCounter.current;
    streamRequests.current.set(group, request);
    setStreams((previous) => ({
      ...previous,
      [group]: {
        ...(previous[group] ?? { items: [] }),
        loading: true,
        error: undefined,
      },
    }));
    try {
      const page = await window.explorer.listStreams(
        connection,
        group,
        "",
        more ? streams[group]?.cursor : undefined,
      );
      if (
        version !== generation.current ||
        streamRequests.current.get(group) !== request
      )
        return;
      setStreams((previous) => ({
        ...previous,
        [group]: {
          items: more
            ? [
                ...new Map(
                  [...(previous[group]?.items ?? []), ...page.items].map(
                    (s) => [s.name, s],
                  ),
                ).values(),
              ]
            : page.items,
          cursor: page.cursor,
        },
      }));
    } catch (e) {
      if (
        version === generation.current &&
        streamRequests.current.get(group) === request
      )
        setStreams((previous) => ({
          ...previous,
          [group]: {
            ...(previous[group] ?? { items: [] }),
            loading: false,
            error: e instanceof Error ? e.message : "Could not load streams",
          },
        }));
    } finally {
      if (streamRequests.current.get(group) === request)
        streamRequests.current.delete(group);
    }
  };
  const toggleGroup = (group: LogGroup) => {
    setExpanded((previous) => {
      const next = new Set(previous);
      if (next.has(group.name)) next.delete(group.name);
      else next.add(group.name);
      return next;
    });
    if (!streams[group.name]) void loadStreams(group.name);
  };
  const rows = useMemo(() => {
    const result: ResourceRow[] = [];
    if (!regionOpen) return result;
    for (const group of groups.items) {
      result.push({ kind: "group", group });
      if (!expanded.has(group.name)) continue;
      const state = streams[group.name];
      for (const stream of state?.items ?? [])
        if (stream.name.toLowerCase().includes(streamPrefix.toLowerCase()))
          result.push({ kind: "stream", group, stream });
      if (state?.loading) result.push({ kind: "loading", group });
      else if (state?.error)
        result.push({ kind: "error", group, message: state.error });
      else if (state?.cursor) result.push({ kind: "more", group });
    }
    return result;
  }, [groups, expanded, streams, regionOpen, streamPrefix]);
  const requestedIndex = activeKey
    ? rows.findIndex((row) => resourceRowKey(row) === activeKey)
    : -1;
  const activeIndex =
    requestedIndex >= 0
      ? requestedIndex
      : rows.findIndex((row) => row.kind !== "loading");
  const rowId = (index: number) => treeId + "-row-" + index;
  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => treeRef.current,
    estimateSize: () => 32,
    overscan: 12,
    getItemKey: (index) => resourceRowKey(rows[index]),
    rangeExtractor: (range) => {
      const indices = defaultRangeExtractor(range);
      return activeIndex >= 0 && !indices.includes(activeIndex)
        ? [...indices, activeIndex].sort((a, b) => a - b)
        : indices;
    },
  });
  const toggleSelected = (group: string) =>
    setSelected((previous) => {
      const next = new Set(previous);
      if (next.has(group)) next.delete(group);
      else if (next.size < 50) next.add(group);
      return next;
    });
  const openRow = (
    row: ResourceRow,
    mode: "preview" | "permanent" = "preview",
  ) => {
    if (row.kind === "group")
      props.onOpen(connection.id, [{ logGroup: row.group.name }], mode);
    else if (row.kind === "stream")
      props.onOpen(
        connection.id,
        [{ logGroup: row.group.name, logStreams: [row.stream.name] }],
        mode,
      );
    else if (row.kind === "more" || row.kind === "error")
      void loadStreams(row.group.name, row.kind === "more");
  };
  const openFavorite = (
    favorite: Favorite,
    mode: "preview" | "permanent" = "preview",
  ) =>
    props.onOpen(
      favorite.connectionId,
      [
        {
          logGroup: favorite.logGroup,
          logStreams: favorite.logStream ? [favorite.logStream] : undefined,
        },
      ],
      mode,
    );
  const focusRow = (index: number) => {
    const row = rows[index];
    if (!row || row.kind === "loading") return;
    setActiveKey(resourceRowKey(row));
    virtualizer.scrollToIndex(index, { align: "auto" });
  };
  const copyResource = (text: string) =>
    void window.explorer
      .copy(text)
      .then(() => setNotice("Resource copied"))
      .catch(() => setNotice("Could not copy resource"));
  const isFavorite = (group: string, stream?: string) =>
    props.favorites.some(
      (f) =>
        f.connectionId === connection.id &&
        f.logGroup === group &&
        f.logStream === stream,
    );
  return (
    <aside className="resource-sidebar" aria-label="AWS resources">
      <div className="sidebar-heading">
        <Text size="xs" fw={700} tt="uppercase" c="dimmed">
          Explorer
        </Text>
        <Group gap={3}>
          <Tooltip label="Refresh resources">
            <ActionIcon
              size="sm"
              variant="subtle"
              aria-label="Refresh resources"
              disabled={busy}
              onClick={() => void loadGroups()}
            >
              <IconRefresh size={15} />
            </ActionIcon>
          </Tooltip>
          <ActionIcon
            size="sm"
            variant="subtle"
            aria-label="Manage connections"
            onClick={props.onManage}
          >
            <IconSettings size={15} />
          </ActionIcon>
        </Group>
      </div>
      <div className="sidebar-connection">
        <Select
          aria-label="AWS connection"
          value={connection.id}
          onChange={(value) => value && setConnectionId(value)}
          data={props.connections.map((c) => ({ value: c.id, label: c.name }))}
          size="xs"
          searchable
          leftSection={<IconCloud size={16} />}
        />
        <Group justify="space-between" mt={7}>
          <Text size="xs" c="dimmed">
            {connection.profile}
          </Text>
          <Badge
            size="xs"
            variant="light"
            color={connection.mode === "offline" ? "yellow" : "teal"}
          >
            {connection.mode === "offline" ? "Offline fixtures" : "AWS"}
          </Badge>
        </Group>
      </div>
      <div className="sidebar-search">
        <TextInput
          aria-label="Search log groups"
          placeholder="Search log groups…"
          description="Matches anywhere · case-sensitive"
          size="xs"
          leftSection={<IconSearch size={14} />}
          value={search}
          onChange={(e) => setSearch(e.currentTarget.value)}
        />
        <TextInput
          aria-label="Filter loaded streams"
          placeholder="Filter loaded streams…"
          size="xs"
          mt={6}
          value={streamPrefix}
          onChange={(e) => setStreamPrefix(e.currentTarget.value)}
        />
      </div>
      {props.favorites.length > 0 && (
        <div className="sidebar-quick">
          <Text size="xs" c="dimmed" fw={600}>
            FAVORITES
          </Text>
          {props.favorites.slice(0, 8).map((f) => (
            <button
              className="quick-resource"
              title={`${f.logGroup}${f.logStream ? ` / ${f.logStream}` : ""}`}
              key={`${f.connectionId}:${f.logGroup}:${f.logStream ?? ""}`}
              onClick={() => openFavorite(f)}
              onDoubleClick={() => openFavorite(f, "permanent")}
            >
              <IconStarFilled size={13} color="#e8b85c" />
              <span>{f.logStream ?? f.logGroup.split("/").at(-1)}</span>
            </button>
          ))}
        </div>
      )}
      {error && (
        <Alert
          color="red"
          p="xs"
          mx="xs"
          my="xs"
          title="Resource loading failed"
        >
          <Text size="xs">{error}</Text>
          <Button
            size="compact-xs"
            mt="xs"
            variant="light"
            onClick={() => void loadGroups()}
          >
            Retry
          </Button>
        </Alert>
      )}
      <button
        className="region-row"
        onClick={() => setRegionOpen(!regionOpen)}
        aria-expanded={regionOpen}
      >
        {regionOpen ? (
          <IconChevronDown size={14} />
        ) : (
          <IconChevronRight size={14} />
        )}
        <IconCloud size={15} />
        <strong>{connection.region}</strong>
        <span className="resource-count">{groups.items.length}</span>
      </button>
      {busy && !groups.items.length && (
        <Group p="md" gap="xs">
          <Loader size="xs" />
          <Text size="xs" c="dimmed">
            Loading groups
          </Text>
        </Group>
      )}
      {!busy && !error && !groups.items.length && (
        <Text size="xs" c="dimmed" p="md">
          No log groups contain this text.
        </Text>
      )}
      <div
        className="resource-tree"
        ref={treeRef}
        role="tree"
        aria-label="Log groups and streams"
        aria-multiselectable="true"
        aria-activedescendant={
          activeIndex >= 0 ? rowId(activeIndex) : undefined
        }
        aria-describedby={treeId + "-help"}
        tabIndex={0}
        onFocusCapture={() => setTreeFocused(true)}
        onBlurCapture={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget as Node | null))
            setTreeFocused(false);
        }}
        onFocus={(event) => {
          if (event.target === event.currentTarget && activeIndex >= 0)
            focusRow(activeIndex);
        }}
        onKeyDown={(event) => {
          if (event.ctrlKey || event.metaKey || event.altKey || event.shiftKey)
            return;
          const ownFocus = event.target === event.currentTarget;
          if (
            !ownFocus &&
            ![
              "ArrowUp",
              "ArrowDown",
              "ArrowRight",
              "ArrowLeft",
              "Home",
              "End",
              "PageUp",
              "PageDown",
            ].includes(event.key)
          )
            return;
          if (
            event.target instanceof Element &&
            event.target.closest('[role="menu"],[role="menuitem"]')
          )
            return;
          const navigation = navigateResourceTree(
            rows,
            expanded,
            activeIndex,
            event.key,
            Math.max(1, Math.floor(event.currentTarget.clientHeight / 32) - 1),
          );
          if (!navigation) return;
          event.preventDefault();
          // Focus dispatches synchronously and can restore the previous active row.
          // Commit the requested row after that transfer, within the same batch.
          if (!ownFocus) treeRef.current?.focus();
          focusRow(navigation.index);
          const row = rows[navigation.index];
          if (
            navigation.action === "expand" ||
            navigation.action === "collapse"
          )
            toggleGroup(row.group);
          else if (navigation.action === "select")
            toggleSelected(row.group.name);
          else if (navigation.action === "open" || navigation.action === "load")
            openRow(row);
        }}
      >
        <div
          style={{ height: virtualizer.getTotalSize(), position: "relative" }}
        >
          {virtualizer.getVirtualItems().map((item) => {
            const row = rows[item.index];
            return (
              <div
                key={item.key}
                onFocusCapture={() => {
                  if (row.kind !== "loading") setActiveKey(resourceRowKey(row));
                }}
                style={{
                  position: "absolute",
                  width: "100%",
                  height: item.size,
                  transform: `translateY(${item.start}px)`,
                  background:
                    item.index === activeIndex && treeFocused
                      ? "color-mix(in srgb, var(--mantine-color-blue-5) 16%, transparent)"
                      : undefined,
                  boxShadow:
                    item.index === activeIndex && treeFocused
                      ? "inset 2px 0 var(--mantine-color-blue-5)"
                      : undefined,
                }}
              >
                {row.kind === "group" ? (
                  <div
                    className="resource-row"
                    role="treeitem"
                    id={rowId(item.index)}
                    aria-level={1}
                    aria-label={row.group.name}
                    aria-selected={selected.has(row.group.name)}
                    aria-expanded={expanded.has(row.group.name)}
                  >
                    <button
                      className="tree-toggle"
                      aria-label={`Expand ${row.group.name}`}
                      onClick={() => toggleGroup(row.group)}
                    >
                      {expanded.has(row.group.name) ? (
                        <IconChevronDown size={13} />
                      ) : (
                        <IconChevronRight size={13} />
                      )}
                    </button>
                    <input
                      aria-label={`Select ${row.group.name}`}
                      type="checkbox"
                      checked={selected.has(row.group.name)}
                      onChange={() => toggleSelected(row.group.name)}
                    />
                    <button
                      className="resource-label"
                      title={
                        row.group.name + "\n" + groupDescription(row.group)
                      }
                      onClick={() => openRow(row)}
                      onDoubleClick={() => openRow(row, "permanent")}
                    >
                      <IconFolder size={14} />
                      <span>{row.group.name}</span>
                    </button>
                    <button
                      className="favorite-button"
                      aria-label={`Favorite ${row.group.name}`}
                      onClick={() =>
                        props.onFavorite({
                          connectionId: connection.id,
                          logGroup: row.group.name,
                        })
                      }
                    >
                      {isFavorite(row.group.name) ? (
                        <IconStarFilled size={13} />
                      ) : (
                        <IconStar size={13} />
                      )}
                    </button>
                    <Menu position="right-start" width={260}>
                      <Menu.Target>
                        <button
                          className="favorite-button"
                          aria-label={`Details for ${row.group.name}`}
                        >
                          <IconInfoCircle size={13} />
                        </button>
                      </Menu.Target>
                      <Menu.Dropdown>
                        <Menu.Label>Log group details</Menu.Label>
                        <Text
                          size="xs"
                          px="xs"
                          pb="xs"
                          style={{ overflowWrap: "anywhere" }}
                        >
                          {row.group.name}
                        </Text>
                        <Text
                          size="xs"
                          c="dimmed"
                          px="xs"
                          pb="xs"
                          style={{ whiteSpace: "pre-line" }}
                        >
                          {groupDescription(row.group)}
                        </Text>
                        <Text size="xs" c="dimmed" px="xs" pb="xs">
                          {connection.name} · {connection.region}
                        </Text>
                        <Menu.Divider />
                        <Menu.Item
                          leftSection={<IconCopy size={13} />}
                          onClick={() => copyResource(row.group.name)}
                        >
                          Copy group name
                        </Menu.Item>
                        {row.group.arn && (
                          <Menu.Item
                            leftSection={<IconCopy size={13} />}
                            onClick={() => copyResource(row.group.arn!)}
                          >
                            Copy ARN
                          </Menu.Item>
                        )}
                      </Menu.Dropdown>
                    </Menu>
                  </div>
                ) : row.kind === "stream" ? (
                  <div
                    className="resource-row stream-row"
                    role="treeitem"
                    id={rowId(item.index)}
                    aria-level={2}
                    aria-label={row.stream.name}
                  >
                    <button
                      className="resource-label"
                      title={row.stream.name}
                      onClick={() => openRow(row)}
                      onDoubleClick={() => openRow(row, "permanent")}
                    >
                      <IconList size={13} />
                      <span>{row.stream.name}</span>
                    </button>
                    <button
                      className="favorite-button"
                      aria-label={`Favorite ${row.stream.name}`}
                      onClick={() =>
                        props.onFavorite({
                          connectionId: connection.id,
                          logGroup: row.group.name,
                          logStream: row.stream.name,
                        })
                      }
                    >
                      {isFavorite(row.group.name, row.stream.name) ? (
                        <IconStarFilled size={13} />
                      ) : (
                        <IconStar size={13} />
                      )}
                    </button>
                  </div>
                ) : row.kind === "loading" ? (
                  <Group pl={44} gap="xs">
                    <Loader size={12} />
                    <Text size="xs" c="dimmed">
                      Loading streams…
                    </Text>
                  </Group>
                ) : row.kind === "error" ? (
                  <button
                    className="tree-more"
                    role="treeitem"
                    id={rowId(item.index)}
                    aria-level={2}
                    title={row.message}
                    onClick={() => void loadStreams(row.group.name)}
                  >
                    Retry streams: {row.message.slice(0, 35)}
                  </button>
                ) : (
                  <button
                    className="tree-more"
                    role="treeitem"
                    id={rowId(item.index)}
                    aria-level={2}
                    onClick={() => void loadStreams(row.group.name, true)}
                  >
                    Load more streams
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </div>
      {groups.cursor && (
        <Button
          variant="subtle"
          size="xs"
          mx="xs"
          mb="xs"
          loading={busy}
          onClick={() => void loadGroups(true)}
        >
          Load more groups
        </Button>
      )}
      {selected.size > 0 && (
        <Button
          size="xs"
          mx="xs"
          mb="xs"
          leftSection={<IconPlus size={14} />}
          onClick={() =>
            props.onOpen(
              connection.id,
              [...selected].map((logGroup) => ({ logGroup })),
              "permanent",
            )
          }
        >
          Open {selected.size} selected sources
        </Button>
      )}
      <div className="sidebar-footer">
        <Text size="xs" c="dimmed" id={treeId + "-help"}>
          Arrow keys navigate · Enter previews · Double-click keeps · Space
          selects
        </Text>
        {notice && (
          <Text size="xs" role="status" aria-live="polite">
            {notice}
          </Text>
        )}
        {props.recents.length > 0 && (
          <details>
            <summary>Recent sources</summary>
            {props.recents.slice(0, 6).map((r, i) => (
              <button
                key={i}
                className="quick-resource"
                title={r.logGroup}
                onClick={() => openFavorite(r)}
                onDoubleClick={() => openFavorite(r, "permanent")}
              >
                {r.logStream ?? r.logGroup.split("/").at(-1)}
              </button>
            ))}
          </details>
        )}
      </div>
    </aside>
  );
}
