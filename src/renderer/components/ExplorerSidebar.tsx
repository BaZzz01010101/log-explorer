import { useEffect, useId, useRef, useState } from "react";
import { ownValue } from "../../shared/records";
import {
  ActionIcon,
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
  IconCopy,
  IconFolder,
  IconInfoCircle,
  IconList,
  IconPlus,
  IconRefresh,
  IconSearch,
  IconSettings,
  IconStar,
  IconStarFilled,
} from "@tabler/icons-react";
import { defaultRangeExtractor, useVirtualizer } from "@tanstack/react-virtual";
import type {
  Connection,
  Favorite,
  LogGroup,
  LogSource,
  Preferences,
} from "../../shared/contracts";
import { explorerProfiles } from "../explorer-configuration";
import {
  buildExplorerRows,
  navigateExplorer,
  type ExplorerRow,
} from "../explorer-tree";
import { resourceScope, useExplorerResources } from "../useExplorerResources";
import {
  useScrollPagination,
  type ScrollPageTarget,
} from "../useScrollPagination";
import { ResourceDragLabel } from "./ResourceDragLabel";
import "./explorer.css";

interface Props {
  connections: Connection[];
  activeConnectionId: string;
  preferences?: Pick<Preferences, "profileVisibility">;
  onConnectionChange?(id: string): void;
  favorites: Favorite[];
  recents: Favorite[];
  onOpen(
    id: string,
    sources: LogSource[],
    mode?: "preview" | "permanent",
  ): void;
  onFavorite(favorite: Favorite): void;
  onManage(): void;
}
function description(group: LogGroup) {
  return `Retention: ${group.retentionDays === undefined ? "Indefinite" : group.retentionDays + " days"}\nClass: ${group.logClass ?? "Standard"}\nStored: ${group.storedBytes === undefined ? "Not provided" : (group.storedBytes / 1048576).toLocaleString(undefined, { maximumFractionDigits: 2 }) + " MiB"}`;
}
export function ExplorerSidebar(props: Props) {
  const [connectionId, setConnectionId] = useState(props.activeConnectionId);
  const [search, setSearch] = useState(""),
    [debounced, setDebounced] = useState("");
  const [groups, setGroups] = useState(new Set<string>());
  const [selected, setSelected] = useState(
    new Map<string, { connectionId: string; logGroup: string }>(),
  );
  const [activeKey, setActiveKey] = useState<string | null>(null),
    [focused, setFocused] = useState(false),
    [notice, setNotice] = useState("");
  const tree = useRef<HTMLDivElement>(null),
    treeId = useId();
  const profiles = explorerProfiles(
    props.connections,
    props.preferences ?? {},
    connectionId,
  );
  const connections = profiles.flatMap((profile) => profile.connections);
  const selectedConnection =
    connections.find((connection) => connection.id === connectionId) ??
    connections[0];
  const selectedProfile = profiles.find((profile) =>
    profile.connections.some(
      (connection) => connection.id === selectedConnection?.id,
    ),
  );
  const visibleRegions = selectedConnection ? [selectedConnection.id] : [];
  const resources = useExplorerResources(
    connections,
    visibleRegions,
    debounced,
  );
  const rows = buildExplorerRows(
    selectedConnection,
    groups,
    resources.cache,
    debounced,
  );
  const missingStreams = rows.flatMap((row) =>
    row.kind === "group" &&
    groups.has(row.key) &&
    ownValue(resources.cache, row.connection.id)?.groups.loaded &&
    !ownValue(resources.cache, row.connection.id)?.groups.loading &&
    !ownValue(
      ownValue(resources.cache, row.connection.id)?.streams,
      row.group.name,
    )
      ? [[row.connection.id, row.group.name]]
      : [],
  );
  useEffect(() => {
    for (const [id, group] of missingStreams)
      void resources.loadStreams(id, group);
  }, [JSON.stringify(missingStreams), resources.loadStreams]);
  const selectedSources = [...selected.values()].filter(
    (source) => source.connectionId === selectedConnection?.id,
  );
  const allowed = new Set(
    props.connections
      .filter(
        (connection) =>
          connection.enabled !== false &&
          profiles.some(
            (account) =>
              account.mode === connection.mode &&
              account.profile === connection.profile,
          ),
      )
      .map((connection) => connection.id),
  );
  const activeIndex =
    rows.findIndex((row) => row.key === activeKey) >= 0
      ? rows.findIndex((row) => row.key === activeKey)
      : Math.max(
          0,
          rows.findIndex((row) => row.kind === "group"),
        );
  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => tree.current,
    estimateSize: () => 32,
    getItemKey: (index) => rows[index].key,
    overscan: 5,
    rangeExtractor: (range) =>
      [
        ...new Set([
          ...defaultRangeExtractor(range),
          ...(activeIndex >= 0 ? [activeIndex] : []),
        ]),
      ].sort((a, b) => a - b),
  });
  const jump = (id: string) => {
    setConnectionId(id);
    setActiveKey(null);
    setSelected(new Map());
    props.onConnectionChange?.(id);
  };
  useEffect(() => {
    setConnectionId(props.activeConnectionId);
    setActiveKey(null);
  }, [props.activeConnectionId]);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(search), 220);
    return () => clearTimeout(timer);
  }, [search]);
  useEffect(() => {
    setSelected(new Map());
    setActiveKey(null);
    if (tree.current) tree.current.scrollTop = 0;
  }, [debounced, selectedConnection?.id]);
  const toggleSet = (setter: typeof setGroups, key: string) =>
    setter((previous) => {
      const next = new Set(previous);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  const toggle = (row: ExplorerRow) => {
    setActiveKey(row.key);
    if (row.kind === "group") {
      toggleSet(setGroups, row.key);
      const page = ownValue(
        ownValue(resources.cache, row.connection.id)?.streams,
        row.group.name,
      );
      if (!groups.has(row.key) && !page?.loaded && !page?.loading)
        void resources.loadStreams(row.connection.id, row.group.name);
    }
  };
  const select = (row: Extract<ExplorerRow, { kind: "group" }>) =>
    setSelected((previous) => {
      const next = new Map(previous);
      if (next.has(row.key)) next.delete(row.key);
      else if (
        [...next.values()].filter(
          (item) => item.connectionId === row.connection.id,
        ).length < 50
      )
        next.set(row.key, {
          connectionId: row.connection.id,
          logGroup: row.group.name,
        });
      return next;
    });
  const open = (
    row: ExplorerRow,
    mode: "preview" | "permanent" = "preview",
  ) => {
    if (row.kind === "group")
      props.onOpen(row.connection.id, [{ logGroup: row.group.name }], mode);
    else if (row.kind === "stream")
      props.onOpen(
        row.connection.id,
        [{ logGroup: row.group.name, logStreams: [row.stream.name] }],
        mode,
      );
    else if (row.kind === "more-groups" || row.kind === "error-groups")
      void resources.loadGroups(
        row.connection.id,
        Boolean(ownValue(resources.cache, row.connection.id)?.groups.cursor),
      );
    else if (row.kind === "more-streams" || row.kind === "error-streams")
      void resources.loadStreams(
        row.connection.id,
        row.group.name,
        Boolean(
          ownValue(
            ownValue(resources.cache, row.connection.id)?.streams,
            row.group.name,
          )?.cursor,
        ),
      );
  };
  const expanded = groups;
  const targets: ScrollPageTarget[] = rows.flatMap((row, index) => {
    if ((index + 1) * 32 < (tree.current?.scrollTop ?? 0) - 96) return [];
    if (row.kind === "more-groups") {
      const page = ownValue(resources.cache, row.connection.id)?.groups;
      return [
        {
          key: JSON.stringify([
            row.connection.id,
            resourceScope(row.connection, debounced),
            "groups",
            page?.cursor,
          ]),
          end: (index + 1) * 32,
          load: () => void resources.loadGroups(row.connection.id, true),
        },
      ];
    }
    if (row.kind === "more-streams") {
      const page = ownValue(
        ownValue(resources.cache, row.connection.id)?.streams,
        row.group.name,
      );
      return [
        {
          key: JSON.stringify([
            row.connection.id,
            resourceScope(row.connection, debounced),
            row.group.name,
            page?.cursor,
          ]),
          end: (index + 1) * 32,
          load: () =>
            void resources.loadStreams(row.connection.id, row.group.name, true),
        },
      ];
    }
    return [];
  });
  useScrollPagination(tree, {
    scope: JSON.stringify([
      debounced,
      connections.map((connection) => resourceScope(connection, debounced)),
    ]),
    targets,
  });
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
  const favorite = (id: string, group: string, stream?: string) =>
    props.favorites.some(
      (favorite) =>
        favorite.connectionId === id &&
        favorite.logGroup === group &&
        favorite.logStream === stream,
    );
  const copy = (value: string) =>
    void window.explorer
      .copy(value)
      .then(() => setNotice("Resource copied"))
      .catch(() => setNotice("Could not copy resource"));
  const rowId = (index: number) => treeId + "-row-" + index;
  return (
    <aside className="resource-sidebar" aria-label="AWS resources">
      <div className="sidebar-heading">
        <Text size="xs" fw={700} tt="uppercase" c="dimmed">
          Explorer
        </Text>
        <Group gap={3}>
          <Tooltip label="Refresh selected region">
            <ActionIcon
              size="sm"
              variant="subtle"
              aria-label="Refresh resources"
              disabled={
                !selectedConnection ||
                visibleRegions.some(
                  (id) => ownValue(resources.cache, id)?.groups.loading,
                )
              }
              onClick={() => {
                for (const id of visibleRegions) void resources.loadGroups(id);
              }}
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
          label="Profile"
          aria-label="Explorer profile"
          size="xs"
          searchable
          placeholder="Add a profile in Connections"
          value={selectedProfile?.key ?? null}
          data={profiles.map((profile) => ({
            value: profile.key,
            label: profile.label,
          }))}
          onChange={(key) => {
            const profile = profiles.find((item) => item.key === key);
            const next =
              profile?.connections.find(
                (connection) =>
                  connection.region === selectedConnection?.region,
              ) ?? profile?.connections[0];
            if (next) jump(next.id);
          }}
          allowDeselect={false}
          disabled={!profiles.length}
          leftSection={<IconCloud size={16} />}
        />
        <Select
          label="Region"
          aria-label="Explorer region"
          size="xs"
          searchable
          mt={7}
          placeholder="Add a region in Connections"
          value={selectedConnection?.id ?? null}
          data={(selectedProfile?.connections ?? []).map((connection) => ({
            value: connection.id,
            label: connection.region,
          }))}
          onChange={(id) => id && jump(id)}
          allowDeselect={false}
          disabled={!selectedConnection}
        />
        {selectedConnection?.mode === "offline" && (
          <Badge mt={7} size="xs" color="yellow" variant="light">
            Offline fixtures
          </Badge>
        )}
      </div>
      <div className="sidebar-search">
        <TextInput
          aria-label="Search log groups"
          placeholder="Search log groups…"
          description="Group name contains · case-sensitive"
          size="xs"
          leftSection={<IconSearch size={14} />}
          value={search}
          onChange={(event) => setSearch(event.currentTarget.value)}
        />
      </div>
      {props.favorites.some((item) => allowed.has(item.connectionId)) && (
        <div className="sidebar-quick">
          <Text size="xs" c="dimmed" fw={600}>
            FAVORITES
          </Text>
          {props.favorites
            .filter((item) => allowed.has(item.connectionId))
            .slice(0, 8)
            .map((item) => (
              <button
                className="quick-resource"
                key={JSON.stringify(item)}
                title={`${item.logGroup}${item.logStream ? " / " + item.logStream : ""}`}
                onClick={() => openFavorite(item)}
                onDoubleClick={() => openFavorite(item, "permanent")}
              >
                <IconStarFilled size={13} color="#e8b85c" />
                <span>{item.logStream ?? item.logGroup.split("/").at(-1)}</span>
              </button>
            ))}
        </div>
      )}
      <div
        className="resource-tree"
        ref={tree}
        role="tree"
        aria-label="Log groups and streams"
        aria-multiselectable="true"
        aria-activedescendant={
          rows[activeIndex] ? rowId(activeIndex) : undefined
        }
        aria-describedby={treeId + "-help"}
        tabIndex={0}
        onFocusCapture={() => setFocused(true)}
        onBlurCapture={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget as Node | null))
            setFocused(false);
        }}
        onFocus={(event) => {
          if (event.target === event.currentTarget && rows[activeIndex])
            setActiveKey(rows[activeIndex].key);
        }}
        onKeyDown={(event) => {
          if (event.ctrlKey || event.metaKey || event.altKey || event.shiftKey)
            return;
          const own = event.target === event.currentTarget;
          if (
            !own &&
            ![
              "ArrowUp",
              "ArrowDown",
              "ArrowLeft",
              "ArrowRight",
              "Home",
              "End",
              "PageUp",
              "PageDown",
            ].includes(event.key)
          )
            return;
          const next = navigateExplorer(
            rows,
            expanded,
            activeIndex,
            event.key,
            Math.max(1, Math.floor((tree.current?.clientHeight ?? 320) / 32)),
          );
          if (!next) return;
          event.preventDefault();
          if (!own) tree.current?.focus({ preventScroll: true });
          const row = rows[next.index];
          setActiveKey(row.key);
          virtualizer.scrollToIndex(next.index, { align: "auto" });
          if (next.action === "toggle") toggle(row);
          else if (next.action === "select" && row.kind === "group")
            select(row);
          else if (next.action === "open" || next.action === "load") open(row);
        }}
      >
        {!connections.length && (
          <div className="explorer-empty">
            <Text size="sm">No profiles or regions added.</Text>
            <Button variant="light" size="xs" onClick={props.onManage}>
              Manage profiles and regions
            </Button>
          </div>
        )}
        <div
          style={{ height: virtualizer.getTotalSize(), position: "relative" }}
        >
          {virtualizer.getVirtualItems().map((item) => {
            const row = rows[item.index];
            if (!row) return null;
            const connection = row.connection;
            const label =
              row.kind === "group"
                ? row.group.name
                : row.kind === "stream"
                  ? row.stream.name
                  : row.message;
            const branch = row.kind === "group";
            return (
              <div
                key={row.key}
                onFocusCapture={() => {
                  if (row.kind !== "loading" && row.kind !== "empty")
                    setActiveKey(row.key);
                }}
                style={{
                  position: "absolute",
                  width: "100%",
                  height: item.size,
                  transform: `translateY(${item.start}px)`,
                  background:
                    item.index === activeIndex && focused
                      ? "color-mix(in srgb,var(--mantine-color-blue-5) 16%,transparent)"
                      : undefined,
                  boxShadow:
                    item.index === activeIndex && focused
                      ? "inset 2px 0 var(--mantine-color-blue-5)"
                      : undefined,
                }}
              >
                <div
                  className={`resource-row ${row.kind === "stream" ? "stream-row" : ""} explorer-${row.kind}`}
                  role={
                    row.kind === "loading" || row.kind === "empty"
                      ? "presentation"
                      : "treeitem"
                  }
                  id={rowId(item.index)}
                  aria-label={label}
                  aria-level={row.level}
                  aria-expanded={branch ? expanded.has(row.key) : undefined}
                  aria-selected={
                    row.kind === "group" ? selected.has(row.key) : undefined
                  }
                  data-connection-id={connection?.id}
                  data-node-kind={row.kind}
                  style={{ paddingLeft: 8 + (row.level - 1) * 14 }}
                >
                  {row.kind === "group" ? (
                    <>
                      <button
                        className="tree-toggle"
                        aria-label={`Expand ${row.group.name}`}
                        onClick={() => toggle(row)}
                      >
                        {expanded.has(row.key) ? (
                          <IconChevronDown size={13} />
                        ) : (
                          <IconChevronRight size={13} />
                        )}
                      </button>
                      <input
                        type="checkbox"
                        aria-label={`Select ${row.group.name}`}
                        checked={selected.has(row.key)}
                        onChange={() => select(row)}
                      />
                      <ResourceDragLabel
                        title={row.group.name + "\n" + description(row.group)}
                        payload={{
                          connectionId: row.connection.id,
                          sources: selected.has(row.key)
                            ? selectedSources
                                .filter(
                                  (source) =>
                                    source.connectionId === row.connection.id,
                                )
                                .map((source) => ({
                                  logGroup: source.logGroup,
                                }))
                            : [{ logGroup: row.group.name }],
                        }}
                        onClick={() => open(row)}
                        onDoubleClick={() => open(row, "permanent")}
                      >
                        <IconFolder size={14} />
                        <span>{row.group.name}</span>
                      </ResourceDragLabel>
                      <button
                        className="favorite-button"
                        aria-label={`Favorite ${row.group.name}`}
                        onClick={() =>
                          props.onFavorite({
                            connectionId: row.connection.id,
                            logGroup: row.group.name,
                          })
                        }
                      >
                        {favorite(row.connection.id, row.group.name) ? (
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
                            {description(row.group)}
                          </Text>
                          <Text size="xs" c="dimmed" px="xs" pb="xs">
                            {row.connection.name} · {row.connection.region}
                          </Text>
                          <Menu.Divider />
                          <Menu.Item
                            leftSection={<IconCopy size={13} />}
                            onClick={() => copy(row.group.name)}
                          >
                            Copy group name
                          </Menu.Item>
                          {row.group.arn && (
                            <Menu.Item
                              leftSection={<IconCopy size={13} />}
                              onClick={() => copy(row.group.arn!)}
                            >
                              Copy ARN
                            </Menu.Item>
                          )}
                        </Menu.Dropdown>
                      </Menu>
                    </>
                  ) : row.kind === "stream" ? (
                    <>
                      <ResourceDragLabel
                        title={row.stream.name}
                        payload={{
                          connectionId: row.connection.id,
                          sources: [
                            {
                              logGroup: row.group.name,
                              logStreams: [row.stream.name],
                            },
                          ],
                        }}
                        onClick={() => open(row)}
                        onDoubleClick={() => open(row, "permanent")}
                      >
                        <IconList size={13} />
                        <span>{row.stream.name}</span>
                      </ResourceDragLabel>
                      <button
                        className="favorite-button"
                        aria-label={`Favorite ${row.stream.name}`}
                        onClick={() =>
                          props.onFavorite({
                            connectionId: row.connection.id,
                            logGroup: row.group.name,
                            logStream: row.stream.name,
                          })
                        }
                      >
                        {favorite(
                          row.connection.id,
                          row.group.name,
                          row.stream.name,
                        ) ? (
                          <IconStarFilled size={13} />
                        ) : (
                          <IconStar size={13} />
                        )}
                      </button>
                    </>
                  ) : row.kind === "loading" ? (
                    <Group gap="xs">
                      <Loader size={12} />
                      <Text size="xs" c="dimmed" role="status">
                        {row.message}
                      </Text>
                    </Group>
                  ) : row.kind === "error-groups" ||
                    row.kind === "error-streams" ? (
                    <button
                      className="tree-more explorer-error"
                      title={row.message}
                      onClick={() => open(row)}
                    >
                      Retry {row.kind === "error-groups" ? "groups" : "streams"}
                      : {row.message}
                    </button>
                  ) : (
                    <Text size="xs" c="dimmed">
                      {row.kind === "empty"
                        ? row.message
                        : row.kind === "more-groups"
                          ? "More groups load as you scroll"
                          : "More streams load as you scroll"}
                    </Text>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
      {selectedSources.length > 0 && (
        <Button
          size="xs"
          mx="xs"
          mb="xs"
          leftSection={<IconPlus size={14} />}
          onClick={() => {
            const byConnection = new Map<string, LogSource[]>();
            for (const source of selectedSources)
              byConnection.set(source.connectionId, [
                ...(byConnection.get(source.connectionId) ?? []),
                { logGroup: source.logGroup },
              ]);
            for (const [id, sources] of byConnection)
              props.onOpen(id, sources, "permanent");
          }}
        >
          Open {selectedSources.length} selected sources
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
        {props.recents.some((item) => allowed.has(item.connectionId)) && (
          <details>
            <summary>Recent sources</summary>
            {props.recents
              .filter((item) => allowed.has(item.connectionId))
              .slice(0, 6)
              .map((item, index) => (
                <button
                  key={index}
                  className="quick-resource"
                  title={item.logGroup}
                  onClick={() => openFavorite(item)}
                  onDoubleClick={() => openFavorite(item, "permanent")}
                >
                  {item.logStream ?? item.logGroup.split("/").at(-1)}
                </button>
              ))}
          </details>
        )}
      </div>
    </aside>
  );
}
