import { useEffect, useId, useRef, useState, type MouseEvent } from "react";
import { ownValue } from "../../shared/records";
import {
  ActionIcon,
  Badge,
  Button,
  Group,
  Loader,
  Select,
  Text,
  TextInput,
} from "@mantine/core";
import { Tooltip } from "./AppTooltip";
import { Menu } from "./AppMenu";
import {
  IconChevronDown,
  IconChevronRight,
  IconCloud,
  IconCopy,
  IconFolder,
  IconList,
  IconPlus,
  IconRefresh,
  IconSearch,
  IconX,
} from "@tabler/icons-react";
import { defaultRangeExtractor, useVirtualizer } from "@tanstack/react-virtual";
import type {
  Connection,
  Favorite,
  ViewFavorite,
  LogGroup,
  LogSource,
  Preferences,
} from "../../shared/contracts";
import { explorerProfiles } from "../explorer-configuration";
import { shortcutMatches } from "../shortcuts";
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
import { ViewFavorites } from "./ViewFavorites";
import type { ResourceActionMode, ResourcePayload } from "../resource-drag";
import {
  changeExplorerSelection,
  selectionPayload,
  type SelectedResource,
} from "../explorer-selection";
import "./explorer.css";

interface Props {
  connections: Connection[];
  activeConnectionId: string;
  preferences?: Pick<Preferences, "profileVisibility"> &
    Partial<Pick<Preferences, "shortcuts">>;
  onConnectionChange?(id: string): void;
  onResourceAction?(payload: ResourcePayload, mode: ResourceActionMode): void;
  favorites: ViewFavorite[];
  refreshKey?: number;
  recents: Favorite[];
  onOpen(
    id: string,
    sources: LogSource[],
    mode?: "preview" | "permanent",
  ): void;
  onOpenFavorite?(id: string): void;
  onRemoveFavorite?(id: string): void;
  onRenameFavorite?(id: string, title: string): void;
  onManage(): void;
}
function description(group: LogGroup) {
  return `Retention: ${group.retentionDays === undefined ? "Indefinite" : group.retentionDays + " days"}\nClass: ${group.logClass ?? "Standard"}\nStored: ${group.storedBytes === undefined ? "Not provided" : (group.storedBytes / 1048576).toLocaleString(undefined, { maximumFractionDigits: 2 }) + " MiB"}`;
}
export function ExplorerSidebar(props: Props) {
  const [connectionId, setConnectionId] = useState(props.activeConnectionId);
  const [search, setSearch] = useState(""),
    [debounced, setDebounced] = useState("");
  const [regex, setRegex] = useState(false);
  const [caseSensitive, setCaseSensitive] = useState(false);
  const regexShortcut = props.preferences?.shortcuts?.explorerRegex ?? "Alt+E";
  const caseShortcut =
    props.preferences?.shortcuts?.explorerCaseSensitive ?? "Alt+C";
  const [groups, setGroups] = useState(new Set<string>());
  const [selected, setSelected] = useState(new Map<string, SelectedResource>());
  const selectionAnchor = useRef<string | null>(null);
  const [contextKey, setContextKey] = useState<string | null>(null);
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
    props.refreshKey,
    regex,
    caseSensitive,
  );
  const rows = buildExplorerRows(
    selectedConnection,
    groups,
    resources.cache,
    debounced,
    regex,
    caseSensitive,
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
  const selectable = (row: ExplorerRow): SelectedResource | undefined =>
    row.kind === "group" || row.kind === "stream"
      ? {
          key: row.key,
          connectionId: row.connection.id,
          logGroup: row.group.name,
          ...(row.kind === "stream" ? { logStream: row.stream.name } : {}),
        }
      : undefined;
  const selectableRows = rows.flatMap((row) => {
    const resource = selectable(row);
    return resource ? [resource] : [];
  });
  const payloadFor = (row: ExplorerRow) =>
    selectionPayload(
      selected.has(row.key) ? selected.values() : [selectable(row)!],
      row.connection.id,
    );
  const performAction = (row: ExplorerRow, mode: ResourceActionMode) => {
    const payload = payloadFor(row);
    if (props.onResourceAction) props.onResourceAction(payload, mode);
    else if (mode === "new-multisource" || mode === "new-split")
      props.onOpen(payload.connectionId, payload.sources, "permanent");
  };
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
    selectionAnchor.current = null;
    setContextKey(null);
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
    selectionAnchor.current = null;
    setContextKey(null);
    setActiveKey(null);
    if (tree.current) tree.current.scrollTop = 0;
  }, [debounced, regex, caseSensitive, selectedConnection?.id]);
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
  const select = (
    row: ExplorerRow,
    mode: "toggle" | "range" | "add-range" | "context" | "single" = "toggle",
  ) => {
    const resource = selectable(row);
    if (!resource) return;
    setActiveKey(row.key);
    const anchor = selectionAnchor.current;
    if (mode !== "range" && mode !== "add-range")
      selectionAnchor.current = row.key;
    setSelected((previous) =>
      changeExplorerSelection(previous, selectableRows, resource, anchor, mode),
    );
  };
  const clickResource = (
    row: ExplorerRow,
    event?: MouseEvent<HTMLButtonElement>,
  ) => {
    if (event?.shiftKey)
      select(row, event.ctrlKey || event.metaKey ? "add-range" : "range");
    else if (event?.ctrlKey || event?.metaKey) select(row);
    else {
      select(row, "single");
      open(row);
    }
  };
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
            resourceScope(row.connection, debounced, regex, caseSensitive),
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
            resourceScope(row.connection, debounced, regex, caseSensitive),
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
      regex,
      caseSensitive,
      connections.map((connection) =>
        resourceScope(connection, debounced, regex, caseSensitive),
      ),
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
        </Group>
      </div>
      <div className="sidebar-connection">
        <Select
          label="Profile"
          aria-label="Explorer profile"
          size="xs"
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
          description={`${regex ? "Regular expression" : "Group name contains"} · ${caseSensitive ? "case-sensitive" : "ignore case"}${regex || !caseSensitive ? " · searches all groups" : ""}`}
          error={
            search === debounced
              ? ownValue(resources.cache, selectedConnection?.id ?? "")?.groups
                  .error
              : undefined
          }
          size="xs"
          leftSection={<IconSearch size={14} />}
          value={search}
          onChange={(event) => setSearch(event.currentTarget.value)}
          onKeyDown={(event) => {
            if (shortcutMatches(event, regexShortcut)) {
              event.preventDefault();
              event.stopPropagation();
              setRegex((value) => !value);
            } else if (shortcutMatches(event, caseShortcut)) {
              event.preventDefault();
              event.stopPropagation();
              setCaseSensitive((value) => !value);
            }
          }}
          rightSectionWidth={search ? 82 : 56}
          rightSectionPointerEvents="all"
          rightSection={
            <Group gap={2} wrap="nowrap">
              {search && (
                <ActionIcon
                  size={22}
                  variant="subtle"
                  aria-label="Clear log group search"
                  onClick={() => {
                    setSearch("");
                    setDebounced("");
                  }}
                >
                  <IconX size={13} />
                </ActionIcon>
              )}
              <Tooltip label={`Match case (${caseShortcut || "unassigned"})`}>
                <ActionIcon
                  size={22}
                  variant={caseSensitive ? "light" : "subtle"}
                  aria-label="Match case"
                  aria-pressed={caseSensitive}
                  onClick={() => setCaseSensitive((value) => !value)}
                >
                  <span style={{ fontSize: 12, fontWeight: 600 }}>Aa</span>
                </ActionIcon>
              </Tooltip>
              <Tooltip
                label={`Use regular expression (${regexShortcut || "unassigned"})`}
                styles={{
                  tooltip: {
                    background: "var(--mantine-color-body)",
                    color: "var(--mantine-color-text)",
                    border: "1px solid var(--mantine-color-default-border)",
                    boxShadow: "0 4px 16px #0002",
                  },
                }}
              >
                <ActionIcon
                  size={22}
                  variant={regex ? "light" : "subtle"}
                  aria-label="Use regular expression"
                  aria-pressed={regex}
                  onClick={() => setRegex((value) => !value)}
                >
                  <svg
                    width={15}
                    height={15}
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={2}
                    strokeLinecap="round"
                    aria-hidden="true"
                  >
                    <circle
                      cx={6}
                      cy={18}
                      r={2}
                      fill="currentColor"
                      stroke="none"
                    />
                    <path d="M17 4v8m-3.5-6 7 4m-7 0 7-4" />
                  </svg>
                </ActionIcon>
              </Tooltip>
            </Group>
          }
        />
      </div>
      <ViewFavorites
        favorites={props.favorites}
        onOpen={props.onOpenFavorite}
        onRemove={props.onRemoveFavorite}
        onRename={props.onRenameFavorite}
      />
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
          if (
            event.target instanceof Element &&
            event.target.closest('[role="menu"]')
          )
            return;
          if (
            event.key === "ContextMenu" ||
            (event.shiftKey && event.key === "F10")
          ) {
            const row = rows[activeIndex];
            if (!row || !selectable(row)) return;
            event.preventDefault();
            event.stopPropagation();
            const element = document.getElementById(rowId(activeIndex));
            if (!element || !tree.current) return;
            const bounds = element.getBoundingClientRect(),
              viewport = tree.current.getBoundingClientRect();
            element.dispatchEvent(
              new window.MouseEvent("contextmenu", {
                bubbles: true,
                cancelable: true,
                clientX: Math.max(
                  viewport.left + 4,
                  Math.min(bounds.left + 32, viewport.right - 4),
                ),
                clientY: Math.max(
                  viewport.top + 4,
                  Math.min(bounds.bottom, viewport.bottom - 4),
                ),
              }),
            );
            return;
          }
          if (
            event.altKey ||
            ((event.ctrlKey || event.metaKey) && event.key !== " ") ||
            (event.shiftKey &&
              ![
                "ArrowUp",
                "ArrowDown",
                "Home",
                "End",
                "PageUp",
                "PageDown",
                " ",
              ].includes(event.key))
          )
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
          if (event.shiftKey && selectable(row)) {
            if (!selectionAnchor.current)
              selectionAnchor.current = rows[activeIndex]?.key ?? row.key;
            select(row, event.ctrlKey || event.metaKey ? "add-range" : "range");
          }
          setActiveKey(row.key);
          virtualizer.scrollToIndex(next.index, { align: "auto" });
          if (next.action === "toggle") toggle(row);
          else if (next.action === "select" && !event.shiftKey) select(row);
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
                <Menu
                  width={240}
                  withinPortal
                  position="bottom-start"
                  opened={contextKey === row.key}
                  onChange={(opened) =>
                    setContextKey((previous) =>
                      opened ? row.key : previous === row.key ? null : previous,
                    )
                  }
                  transitionProps={{ duration: 0 }}
                >
                  <Menu.ContextMenu disabled={!selectable(row)}>
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
                        selectable(row) ? selected.has(row.key) : undefined
                      }
                      aria-haspopup={selectable(row) ? "menu" : undefined}
                      onContextMenu={() => {
                        if (selectable(row)) {
                          select(row, "context");
                          setContextKey(row.key);
                        }
                      }}
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
                            onChange={() => {}}
                            onClick={(event) =>
                              select(
                                row,
                                event.shiftKey
                                  ? event.ctrlKey || event.metaKey
                                    ? "add-range"
                                    : "range"
                                  : "toggle",
                              )
                            }
                          />
                          <ResourceDragLabel
                            title={
                              row.group.name + "\n" + description(row.group)
                            }
                            payload={payloadFor(row)}
                            onClick={(event) => clickResource(row, event)}
                            onDoubleClick={() => open(row, "permanent")}
                          >
                            <IconFolder size={14} />
                            <span>{row.group.name}</span>
                          </ResourceDragLabel>
                        </>
                      ) : row.kind === "stream" ? (
                        <>
                          <input
                            type="checkbox"
                            aria-label={`Select ${row.stream.name}`}
                            checked={selected.has(row.key)}
                            onChange={() => {}}
                            onClick={(event) =>
                              select(
                                row,
                                event.shiftKey
                                  ? event.ctrlKey || event.metaKey
                                    ? "add-range"
                                    : "range"
                                  : "toggle",
                              )
                            }
                          />
                          <ResourceDragLabel
                            title={row.stream.name}
                            payload={payloadFor(row)}
                            onClick={(event) => clickResource(row, event)}
                            onDoubleClick={() => open(row, "permanent")}
                          >
                            <IconList size={13} />
                            <span>{row.stream.name}</span>
                          </ResourceDragLabel>
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
                          data-tooltip={row.message}
                          onClick={() => open(row)}
                        >
                          Retry{" "}
                          {row.kind === "error-groups" ? "groups" : "streams"}:{" "}
                          {row.message}
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
                  </Menu.ContextMenu>
                  {selectable(row) && (
                    <Menu.Dropdown>
                      {(row.kind === "group" || row.kind === "stream") && (
                        <>
                          <Menu.Item
                            leftSection={<IconCopy size={13} />}
                            onClick={() => copy(row.group.name)}
                          >
                            Copy group name
                          </Menu.Item>
                          {row.kind === "stream" && (
                            <Menu.Item
                              leftSection={<IconCopy size={13} />}
                              onClick={() => copy(row.stream.name)}
                            >
                              Copy stream name
                            </Menu.Item>
                          )}
                          {row.group.arn && (
                            <Menu.Item
                              leftSection={<IconCopy size={13} />}
                              onClick={() =>
                                copy(
                                  row.kind === "stream"
                                    ? row.group.arn!.replace(/:\*$/, "") +
                                        ":log-stream:" +
                                        row.stream.name
                                    : row.group.arn!,
                                )
                              }
                            >
                              Copy ARN
                            </Menu.Item>
                          )}
                          <Menu.Divider />
                        </>
                      )}
                      <Menu.Label>
                        {selected.has(row.key) && selectedSources.length > 1
                          ? `${selectedSources.length} selected resources`
                          : "Resource actions"}
                      </Menu.Label>
                      <Menu.Item
                        onClick={() => performAction(row, "new-multisource")}
                      >
                        Open in new multi-source tab
                      </Menu.Item>
                      <Menu.Item
                        onClick={() => performAction(row, "new-split")}
                      >
                        Open in new split tab
                      </Menu.Item>
                      <Menu.Divider />
                      <Menu.Item
                        disabled={!props.onResourceAction}
                        onClick={() => performAction(row, "add-sources")}
                      >
                        Add sources to current tab
                      </Menu.Item>
                      <Menu.Item
                        disabled={!props.onResourceAction}
                        onClick={() => performAction(row, "add-splits")}
                      >
                        Add splits to current tab
                      </Menu.Item>
                    </Menu.Dropdown>
                  )}
                </Menu>
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
            const payload = selectionPayload(
              selectedSources,
              selectedConnection!.id,
            );
            if (props.onResourceAction)
              props.onResourceAction(payload, "new-multisource");
            else
              props.onOpen(payload.connectionId, payload.sources, "permanent");
          }}
        >
          Open {selectedSources.length} selected sources
        </Button>
      )}
      <div className="sidebar-footer">
        <Text size="xs" c="dimmed" id={treeId + "-help"}>
          Arrow keys navigate · Enter previews · Double-click keeps · Space
          selects · Ctrl/Cmd toggles · Shift selects a range · Right-click for
          actions
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
                  data-tooltip={item.logGroup}
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
