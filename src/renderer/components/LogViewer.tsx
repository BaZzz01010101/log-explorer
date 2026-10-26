import {
  useDeferredValue,
  useId,
  useLayoutEffect,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import { createPortal } from "react-dom";
import {
  ActionIcon,
  Badge,
  Button,
  Checkbox,
  Group,
  Modal,
  SegmentedControl,
  Select,
  Switch,
  Text,
  TextInput,
} from "@mantine/core";
import { Tooltip } from "./AppTooltip";
import { Menu } from "./AppMenu";
import {
  IconArrowDown,
  IconArrowLeft,
  IconArrowRight,
  IconArrowUp,
  IconArrowsVertical,
  IconBraces,
  IconCheck,
  IconChevronDown,
  IconChevronRight,
  IconColumns3,
  IconCopy,
  IconDownload,
  IconFilter,
  IconFold,
  IconGripVertical,
  IconHighlight,
  IconLayoutSidebarRight,
  IconPin,
  IconSearch,
  IconTable,
  IconTextWrap,
  IconX,
} from "@tabler/icons-react";
import {
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  useReactTable,
  type Column,
  type ColumnDef,
  type SortingState,
  type Updater,
} from "@tanstack/react-table";
import { useVirtualizer } from "@tanstack/react-virtual";
import type {
  ColumnConfig,
  Connection,
  LogEvent,
  LiveState,
  LogSource,
  Preferences,
  ViewConfig,
} from "../../shared/contracts";
import {
  eventColumnValue,
  compareLogValues,
  formatColumnValue,
  flattenJson,
  getPointer,
  inferLevel,
  matchesLocalFilter,
  messagePreview,
  META_COLUMNS,
  parseLogMessage,
  propertyFilterTerm,
  serializeEvents,
  summarizeValue,
  type JsonValue,
  type LogLevel,
  type ParsedMessage,
} from "../../shared/log-data";
import "./viewer.css";
import {
  serializeSelectedEvents,
  type SelectedEventCopyFormat,
} from "../../shared/event-copy";
import { sourceColumnConfig } from "../source-column";
import { applyColumnAction } from "../column-actions";
import {
  ColumnHeaderMenu,
  type ColumnHeaderMenuTarget,
} from "./ColumnHeaderMenu";
import { eventSourceDisplay, sourceCount } from "../../shared/source-labels";
import { useColumnHeaderDrag } from "../useColumnHeaderDrag";
import { useScrollPagination } from "../useScrollPagination";
import { useMessageExpansion } from "../useMessageExpansion";
import { HighlightText, MessageContent } from "./EventMessage";
import { EventInspector } from "./EventInspector";
import { InspectorMessage } from "./InspectorMessage";
import { ExpandedEventDetails } from "./ExpandedEventDetails";
import { EventOverview } from "./EventOverview";
import { EventLoadingIndicator } from "./EventLoadingIndicator";
import { SurroundingContextMenu } from "./SurroundingContextMenu";
import type { ContextRange } from "../../shared/context-range";
import { LevelFilter } from "./LevelFilter";
import { formatTimestamp } from "../timestamp-format";
import { useEventSelection } from "../useEventSelection";
import { useDeserializedEvents } from "../useDeserializedEvents";
import {
  EventHighlightContext,
  useEventHighlights,
} from "../useEventHighlights";

interface EventRow {
  event: LogEvent;
  parsed: ParsedMessage;
  level: LogLevel;
}
export interface LogViewerProps {
  events: LogEvent[];
  serverFilter?: string;
  sourceContext?: {
    sources: LogSource[];
    connections: Connection[];
    connectionId: string;
  };
  view: ViewConfig;
  onViewChange: (view: ViewConfig) => void;
  preferences: Preferences;
  onContext?: (event: LogEvent, range: ContextRange) => void;
  pagination?: { scope: string; pageKey?: string; onLoad(): void };
  loading?: boolean;
  liveState?: LiveState;
  followLive?: boolean;
  onPauseLiveFollow?(): void;
  onResumeLiveFollow?(): void;
  renderStatus?: (eventsShown: number) => React.ReactNode;
}
const levelColor: Record<LogLevel, string> = {
  trace: "gray",
  debug: "violet",
  info: "cyan",
  warn: "yellow",
  error: "red",
  fatal: "pink",
  unknown: "gray",
};
const columnNames: Record<string, string> = {
  "@timestamp": "Timestamp",
  "@level": "Level",
  "@message": "Message",
  "@logGroup": "Log group",
  "@logStream": "Log stream",
  "@source": "Source",
};
const initialColumns: ColumnConfig[] = [
  { path: "@timestamp", width: 194, pinned: true },
  { path: "@level", width: 84 },
  { path: "@message", width: 560 },
  { path: "@logStream", width: 220, hidden: true },
  { path: "@logGroup", width: 240, hidden: true },
];
const parsedCache = new WeakMap<LogEvent, EventRow>();
function prepare(event: LogEvent): EventRow {
  let row = parsedCache.get(event);
  if (!row) {
    const parsed = parseLogMessage(event.message);
    row = { event, parsed, level: inferLevel(parsed, event.message) };
    parsedCache.set(event, row);
  }
  return row;
}
function titleFor(path: string): string {
  return columnNames[path] ?? (path === "" ? "$" : path);
}

function columnId(path: string): string {
  return path || "@jsonRoot";
}
function columnPath(id: string): string {
  return id === "@jsonRoot" ? "" : id;
}
function resolve<T>(updater: Updater<T>, previous: T): T {
  return typeof updater === "function"
    ? (updater as (value: T) => T)(previous)
    : updater;
}
function timeLabel(
  timestamp: number,
  timezone: Preferences["timezone"],
): string {
  return formatTimestamp(timestamp, timezone);
}

function pinStyle(column: Column<EventRow>): CSSProperties {
  return {
    width: column.getSize(),
    flex: `0 0 ${column.getSize()}px`,
    ...(column.getIsPinned()
      ? { position: "sticky", left: column.getStart("left"), zIndex: 2 }
      : {}),
  };
}

interface ColumnResizeSession {
  pointerId: number;
  element: HTMLDivElement;
  path: string;
  id: string;
  startX: number;
  startWidth: number;
  width: number;
}

export function LogViewer({
  events,
  serverFilter = "",
  sourceContext,
  view,
  onViewChange,
  preferences,
  onContext,
  pagination,
  loading = false,
  liveState,
  followLive = false,
  onPauseLiveFollow,
  onResumeLiveFollow,
  renderStatus,
}: LogViewerProps) {
  const highlightText = view.highlightText ?? preferences.highlightText;
  const [contextEventId, setContextEventId] = useState<string | undefined>();
  const scrollRef = useRef<HTMLDivElement>(null);
  useScrollPagination(scrollRef, {
    scope: pagination?.scope ?? "no-query",
    targets: pagination?.pageKey
      ? [{ key: pagination.pageKey, load: pagination.onLoad }]
      : [],
  });
  const expansion = useMessageExpansion(view.mode);
  const detailHeights = useRef(new WeakMap<LogEvent, number>());
  const [inspectorMode, setInspectorMode] = useState("structured");
  const [inspectorActionsTarget, setInspectorActionsTarget] =
    useState<HTMLDivElement | null>(null);
  const [columnsOpened, setColumnsOpened] = useState(false);
  const [columnInput, setColumnInput] = useState("");
  const [draggedColumn, setDraggedColumn] = useState<string | null>(null);
  const [notice, setNotice] = useState("");
  const [exporting, setExporting] = useState(false);
  const [copied, setCopied] = useState(false);
  const [contextPosition, setContextPosition] = useState<{
    x: number;
    y: number;
  } | null>(null);
  const [columnMenu, setColumnMenu] = useState<ColumnHeaderMenuTarget | null>(
    null,
  );
  const [draftSizing, setDraftSizing] = useState<Record<string, number> | null>(
    null,
  );
  const resizeSession = useRef<ColumnResizeSession | null>(null);
  const localSearch = useDeferredValue(view.localSearch);
  const filtering = localSearch !== view.localSearch;
  const deserialized = useDeserializedEvents(events, prepare);
  const allRows = deserialized.rows;
  const filteredRows = useMemo(
    () =>
      allRows.filter((row) =>
        matchesLocalFilter(
          row.event,
          row.parsed,
          localSearch,
          view.levels ?? view.level,
        ),
      ),
    [allRows, localSearch, view.level, view.levels],
  );
  const config = useMemo(
    () =>
      sourceColumnConfig(
        view.columns.length ? view.columns : initialColumns,
        sourceCount(sourceContext?.sources ?? []) > 1,
      ).map((column) => ({
        ...column,
        width: Math.min(1400, Math.max(70, column.width || 180)),
      })),
    [view.columns, sourceContext?.sources],
  );
  const configuredSizing = useMemo(
    () =>
      Object.fromEntries(
        config.map((column) => [columnId(column.path), column.width]),
      ),
    [config],
  );
  const currentView = useRef({ view, config, onViewChange });
  currentView.current = { view, config, onViewChange };
  const headerDrag = useColumnHeaderDrag(
    config,
    (columns) => {
      const current = currentView.current;
      current.onViewChange({ ...current.view, columns });
    },
    scrollRef,
  );
  useEffect(() => {
    headerDrag.cancel();
  }, [view.mode]);
  const finishColumnResize = (commit: boolean) => {
    const session = resizeSession.current;
    if (!session) return;
    resizeSession.current = null;
    document.body.classList.remove("resizing-columns");
    if (session.element.hasPointerCapture(session.pointerId))
      session.element.releasePointerCapture(session.pointerId);
    if (commit && session.width !== session.startWidth) {
      const current = currentView.current;
      current.onViewChange({
        ...current.view,
        columns: current.config.map((column) =>
          column.path === session.path
            ? { ...column, width: session.width }
            : column,
        ),
      });
    }
    setDraftSizing(null);
  };
  useEffect(() => {
    const cancel = () => finishColumnResize(false);
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape" && resizeSession.current) {
        event.preventDefault();
        event.stopPropagation();
        cancel();
      }
    };
    window.addEventListener("blur", cancel);
    window.addEventListener("keydown", escape, true);
    return () => {
      window.removeEventListener("blur", cancel);
      window.removeEventListener("keydown", escape, true);
      const session = resizeSession.current;
      if (session) {
        resizeSession.current = null;
        document.body.classList.remove("resizing-columns");
        if (session.element.hasPointerCapture(session.pointerId))
          session.element.releasePointerCapture(session.pointerId);
      }
    };
  }, []);
  const paths = useMemo(() => {
    const discovered = new Set<string>(META_COLUMNS);
    let limited = false;
    for (const row of allRows.slice(0, 500)) {
      if (row.parsed.kind !== "json") continue;
      const flat = flattenJson(row.parsed.value!);
      limited ||= flat.truncated;
      for (const path of Object.keys(flat.fields)) {
        if (discovered.size >= 200) {
          limited = true;
          break;
        }
        discovered.add(path);
      }
      if (discovered.size >= 200) break;
    }
    return { list: [...discovered], limited: limited || allRows.length > 500 };
  }, [allRows]);
  const applyColumns = (columns: ColumnConfig[]) =>
    onViewChange({ ...view, columns });
  const addColumn = (path: string) => {
    if (
      path !== "" &&
      !path.startsWith("/") &&
      !META_COLUMNS.includes(path as (typeof META_COLUMNS)[number])
    ) {
      setNotice(
        "Use a JSON Pointer such as /request/id. Escape a literal slash as ~1 and a tilde as ~0.",
      );
      return;
    }
    const existing = config.find((column) => column.path === path);
    if (existing)
      applyColumns(
        config.map((column) =>
          column.path === path ? { ...column, hidden: false } : column,
        ),
      );
    else if (config.length < 80)
      applyColumns([...config, { path, width: 180 }]);
    else {
      setNotice(
        "The view is limited to 80 configured columns. Remove a column before adding another.",
      );
      return;
    }
    setColumnInput("");
    setNotice(`Column ${titleFor(path)} is visible.`);
  };
  const defs = useMemo<ColumnDef<EventRow>[]>(
    () =>
      config.map((column) => ({
        id: columnId(column.path),
        accessorFn: (row) =>
          eventColumnValue(row.event, row.parsed, column.path),
        header: titleFor(column.path),
        minSize: 70,
        maxSize: 1400,
        size: column.width,
        sortingFn: (first, second, id) => {
          const a = first.getValue<JsonValue | undefined>(id);
          const b = second.getValue<JsonValue | undefined>(id);
          return compareLogValues(a, b);
        },
        cell: (context) => {
          const row = context.row.original;
          const value = context.getValue<JsonValue | undefined>();
          const automatic = !column.format || column.format === "auto";
          if (column.path === "@source" && automatic) {
            const source = eventSourceDisplay(
              row.event,
              sourceContext?.sources ?? [],
              sourceContext?.connections ?? [],
              sourceContext?.connectionId ?? "",
            );
            return (
              <span className="event-source-label" data-tooltip={source.detail}>
                {source.label}
              </span>
            );
          }
          if (column.path === "@timestamp" && automatic)
            return (
              <span className="event-timestamp">
                {timeLabel(row.event.timestamp, preferences.timezone)}
              </span>
            );
          if (column.path === "@level" && automatic)
            return (
              <Badge size="xs" color={levelColor[row.level]} variant="light">
                {row.level}
              </Badge>
            );
          let text = formatColumnValue(
            value,
            column.format,
            preferences.timezone,
          );
          const preview =
            automatic && column.path === "@message"
              ? messagePreview(row.parsed)
              : undefined;
          if (preview) text = summarizeValue(preview.value, 1500);
          return (
            <span
              className={value === undefined ? "cell-missing" : ""}
              data-tooltip={text}
            >
              <HighlightText
                text={text || (value === undefined ? "—" : "")}
                needle={highlightText}
                path={preview?.path ?? column.path}
              />
            </span>
          );
        },
      })),
    [config, preferences.timezone, highlightText, sourceContext],
  );
  // TanStack's sorted row model resets pagination when sorting changes.
  // Keep its reference stable so that reset cannot schedule another render loop.
  const sorting = useMemo<SortingState>(
    () =>
      view.sort ? [{ id: columnId(view.sort.path), desc: view.sort.desc }] : [],
    [view.sort?.path, view.sort?.desc],
  );
  const table = useReactTable({
    data: filteredRows,
    columns: defs,
    getRowId: (row) => row.event.id,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    // This view virtualizes rows; it has no client pagination to reset.
    autoResetPageIndex: false,
    enableMultiSort: false,
    columnResizeMode: "onChange",
    state: {
      sorting,
      columnOrder: config.map((column) => columnId(column.path)),
      columnVisibility: Object.fromEntries(
        config.map((column) => [columnId(column.path), !column.hidden]),
      ),
      columnSizing: draftSizing ?? configuredSizing,
      columnPinning: {
        left: config
          .filter((column) => column.pinned && !column.hidden)
          .map((column) => columnId(column.path)),
        right: [],
      },
    },
    onSortingChange: (updater) => {
      const result = resolve(updater, table.getState().sorting);
      onViewChange({
        ...view,
        sort: result[0]
          ? { path: columnPath(result[0].id), desc: result[0].desc }
          : undefined,
      });
    },
    onColumnSizingChange: (updater) => {
      setDraftSizing(resolve(updater, table.getState().columnSizing));
    },
    onColumnVisibilityChange: (updater) => {
      const visible = resolve(updater, table.getState().columnVisibility);
      applyColumns(
        config.map((column) => ({
          ...column,
          hidden: visible[columnId(column.path)] === false,
        })),
      );
    },
  });
  const rows = table.getRowModel().rows;
  const eventIds = useMemo(
    () => rows.map((row) => row.original.event.id),
    [rows],
  );
  const selection = useEventSelection(eventIds);
  const selectedEventIds = new Set(selection.selectedIds);
  const viewerId = useId();
  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scrollRef.current,
    // Preserve fractional border heights so the following row cannot cover a
    // detail separator at display scales where borders are subpixel-sized.
    measureElement: (element) => element.getBoundingClientRect().height,
    estimateSize: (index) =>
      expansion.isExpanded(rows[index]!.id)
        ? view.mode === "json"
          ? 180
          : 260
        : preferences.density === "compact"
          ? 34
          : 44,
    getItemKey: (index) => rows[index]!.id,
    overscan: 7,
  });
  useEffect(() => {
    // Reset only global layout changes. A single expansion must retain other
    // measured heights; ResizeObserver measures the row that actually changes.
    virtualizer.measure();
    scrollRef.current
      ?.querySelectorAll<HTMLElement>(".virtual-event")
      .forEach((element) => virtualizer.measureElement(element));
  }, [
    view.mode,
    view.wrap,
    preferences.density,
    preferences.fontSize,
    expansion.all,
    virtualizer,
  ]);
  const inspectedIndex = selection.index;
  useLayoutEffect(() => {
    if (!followLive || liveState !== "streaming" || !rows.length) return;
    let latest = 0;
    for (let index = 1; index < rows.length; index++)
      if (
        rows[index]!.original.event.timestamp >=
        rows[latest]!.original.event.timestamp
      )
        latest = index;
    virtualizer.scrollToIndex(latest, { align: "end" });
    return () => virtualizer.cancelScroll();
  }, [events, rows, followLive, liveState, virtualizer]);
  useLayoutEffect(() => {
    const scroll = scrollRef.current;
    if (!loading || rows.length === 0 || !scroll) return;
    const indicator = scroll.querySelector('[data-loading-position="more"]');
    const addedHeight = indicator?.getBoundingClientRect().height ?? 0;
    const distance =
      scroll.scrollHeight - scroll.scrollTop - scroll.clientHeight;
    // Pagination starts within 96px of the end. Include the newly appended indicator.
    if (distance <= 96 + addedHeight) scroll.scrollTop = scroll.scrollHeight;
  }, [loading, rows.length]);
  const inspected =
    inspectedIndex >= 0 ? rows[inspectedIndex]?.original : undefined;
  const visibleItems = virtualizer.getVirtualItems();
  const overviewEvents = useMemo(
    () => allRows.map((row) => row.event),
    [allRows],
  );
  const highlighting = useEventHighlights(overviewEvents, preferences, config, {
    needle: highlightText,
    filters: { server: serverFilter, local: localSearch },
    priority: [
      ...visibleItems.map((item) => rows[item.index]!.original.event.id),
      ...(selection.opened && inspected ? [inspected.event.id] : []),
    ],
  });
  const overview = useEventHighlights(overviewEvents, preferences, config, {
    overview: true,
    needle: highlightText,
  });
  const overviewRows = useMemo(
    () =>
      rows.map(({ original: row }) => ({
        id: row.event.id,
        level: row.level,
        colors: overview.results.get(row.event.id)?.overview ?? [],
      })),
    [rows, overview.results],
  );
  const navigateTo = (index: number) => {
    const row = rows[index];
    if (!row) return;
    selection.select(row.original.event.id);
    virtualizer.scrollToIndex(index, { align: "auto" });
  };
  const closeInspector = () => {
    selection.close();
    scrollRef.current?.focus({ preventScroll: true });
  };
  const addFilter = (path: string, value: JsonValue) => {
    const term = propertyFilterTerm(path, value);
    if (term.length > 10000) {
      setNotice("This value is too long to use in a loaded-event filter.");
      return;
    }
    onViewChange({
      ...view,
      localSearch: [view.localSearch.trim(), term].filter(Boolean).join(" "),
    });
    setNotice(`Added ${path || "root"} to the loaded-event filter.`);
  };
  const toggleExpand = expansion.toggle;
  const moveColumn = (path: string, destination: number) => {
    const next = [...config];
    const index = next.findIndex((column) => column.path === path);
    if (index < 0 || destination < 0 || destination >= next.length) return;
    next.splice(destination, 0, next.splice(index, 1)[0]!);
    applyColumns(next);
  };
  const copy = async (text: string) => {
    try {
      await window.explorer.copy(text);
      setCopied(true);
      setNotice("Copied to clipboard.");
      setTimeout(() => setCopied(false), 1800);
    } catch (error) {
      setNotice(
        error instanceof Error ? error.message : "Clipboard copy failed.",
      );
    }
  };
  const copySelected = async (format: SelectedEventCopyFormat = "messages") => {
    if (filtering || selection.selectedIds.length === 0) return;
    try {
      const selected = rows
        .filter((row) => selectedEventIds.has(row.original.event.id))
        .map((row) => row.original.event);
      const columns = [
        ...table.getLeftVisibleLeafColumns(),
        ...table.getCenterVisibleLeafColumns(),
        ...table.getRightVisibleLeafColumns(),
      ].map((column) => columnPath(column.id));
      await copy(
        serializeSelectedEvents(
          selected,
          format,
          columns,
          deserialized.parsedFor,
        ),
      );
    } catch (error) {
      setNotice(
        error instanceof Error ? error.message : "Clipboard copy failed.",
      );
    }
  };
  const exportRows = async (extension: "csv" | "json" | "jsonl") => {
    setExporting(true);
    try {
      const content = serializeEvents(
        rows.map((row) => row.original.event),
        extension,
        [
          ...table.getLeftVisibleLeafColumns(),
          ...table.getCenterVisibleLeafColumns(),
          ...table.getRightVisibleLeafColumns(),
        ].map((column) => columnPath(column.id)),
        deserialized.parsedFor,
      );
      const written = await window.explorer.exportData(content, extension);
      setNotice(
        written
          ? `Exported ${rows.length.toLocaleString()} locally filtered loaded events.`
          : "Export cancelled.",
      );
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Export failed.");
    } finally {
      setExporting(false);
    }
  };
  return (
    <div
      className={`log-viewer density-${preferences.density}`}
      style={
        { "--log-font-size": `${preferences.fontSize}px` } as CSSProperties
      }
    >
      <div className="viewer-toolbar">
        <TextInput
          className="local-search"
          aria-label="Local filter loaded events"
          placeholder="Search loaded events…"
          size="xs"
          leftSection={
            <IconSearch size={14} color="var(--mantine-color-green-6)" />
          }
          value={view.localSearch}
          onChange={(event) =>
            onViewChange({ ...view, localSearch: event.currentTarget.value })
          }
          rightSection={
            view.localSearch ? (
              <ActionIcon
                aria-label="Clear local search"
                size="xs"
                variant="subtle"
                onClick={() => onViewChange({ ...view, localSearch: "" })}
              >
                <IconX size={12} />
              </ActionIcon>
            ) : undefined
          }
        />
        <TextInput
          className="quick-highlight"
          aria-label="Highlight text in loaded events"
          placeholder="Highlight text…"
          size="xs"
          leftSection={
            <IconHighlight size={14} color="var(--mantine-color-yellow-6)" />
          }
          value={highlightText}
          maxLength={200}
          onChange={(event) =>
            onViewChange({ ...view, highlightText: event.currentTarget.value })
          }
          rightSection={
            highlightText ? (
              <ActionIcon
                aria-label="Clear text highlight"
                size="xs"
                variant="subtle"
                onClick={() => onViewChange({ ...view, highlightText: "" })}
              >
                <IconX size={12} />
              </ActionIcon>
            ) : undefined
          }
        />
        <LevelFilter
          level={view.level}
          levels={view.levels}
          onChange={(levels) =>
            onViewChange({
              ...view,
              level: levels.length === 1 ? levels[0] : "all",
              levels,
            })
          }
        />
        <Tooltip
          label="Local matches are green; server matches are blue; manual highlights are yellow. Use @/request/id=42 for a property, @/request/id for existence, and quotes for spaces. JSON Pointer preserves dotted keys and arrays."
          multiline
          w={320}
        >
          <ActionIcon
            variant="subtle"
            color="gray"
            aria-label="Local filtering help"
          >
            <IconFilter size={15} />
          </ActionIcon>
        </Tooltip>
        <span className="toolbar-spacer" />
        <SegmentedControl
          className="viewer-mode-control"
          aria-label="Event view mode"
          size="xs"
          value={view.mode}
          onChange={(value) =>
            onViewChange({ ...view, mode: value as ViewConfig["mode"] })
          }
          data={[
            {
              value: "json",
              label: (
                <span className="viewer-mode-label">
                  <IconBraces size={13} />
                  <span>JSON</span>
                </span>
              ),
            },
            {
              value: "table",
              label: (
                <span className="viewer-mode-label">
                  <IconTable size={13} />
                  <span>Table</span>
                </span>
              ),
            },
            {
              value: "hybrid",
              label: (
                <span className="viewer-mode-label">
                  <IconColumns3 size={13} />
                  <span>Hybrid</span>
                </span>
              ),
            },
          ]}
        />
        <Tooltip label="Column order, size, visibility and pinning">
          <ActionIcon
            aria-label="Configure columns"
            variant="default"
            onClick={() => setColumnsOpened(true)}
          >
            <IconColumns3 size={16} />
          </ActionIcon>
        </Tooltip>
        <Tooltip label={view.wrap ? "Disable line wrapping" : "Wrap lines"}>
          <ActionIcon
            aria-label="Toggle line wrap"
            aria-pressed={view.wrap}
            variant={view.wrap ? "light" : "subtle"}
            onClick={() => onViewChange({ ...view, wrap: !view.wrap })}
          >
            <IconTextWrap size={16} />
          </ActionIcon>
        </Tooltip>
        <Tooltip
          label={expansion.all ? "Fold all messages" : "Unfold all messages"}
        >
          <ActionIcon
            aria-label={
              expansion.all ? "Fold all messages" : "Unfold all messages"
            }
            aria-pressed={expansion.all}
            variant={expansion.all ? "light" : "subtle"}
            onClick={expansion.toggleAll}
            disabled={events.length === 0}
          >
            {expansion.all ? (
              <IconFold size={16} />
            ) : (
              <IconArrowsVertical size={16} />
            )}
          </ActionIcon>
        </Tooltip>
        <Menu position="bottom-end" withinPortal>
          <Menu.Target>
            <Button
              aria-label="Export loaded filtered events"
              size="xs"
              variant="default"
              loading={exporting}
              disabled={filtering}
              leftSection={<IconDownload size={14} />}
            >
              Export
            </Button>
          </Menu.Target>
          <Menu.Dropdown>
            <Menu.Label>
              {rows.length.toLocaleString()} loaded matching events
            </Menu.Label>
            <Menu.Item onClick={() => exportRows("jsonl")}>
              JSON Lines · full events
            </Menu.Item>
            <Menu.Item onClick={() => exportRows("json")}>
              JSON · full events
            </Menu.Item>
            <Menu.Item onClick={() => exportRows("csv")}>
              CSV · visible columns, formula-safe
            </Menu.Item>
          </Menu.Dropdown>
        </Menu>
        <Tooltip
          label={
            selection.opened ? "Hide event inspector" : "Show event inspector"
          }
        >
          <ActionIcon
            aria-label={
              selection.opened ? "Hide event inspector" : "Show event inspector"
            }
            aria-pressed={selection.opened}
            variant={selection.opened ? "light" : "default"}
            onClick={() => {
              if (selection.opened) closeInspector();
              else selection.toggle();
            }}
          >
            <IconLayoutSidebarRight size={16} />
          </ActionIcon>
        </Tooltip>
      </div>
      {notice && (
        <div className="viewer-notice" role="status">
          <span>{notice}</span>
          <button aria-label="Dismiss notice" onClick={() => setNotice("")}>
            <IconX size={12} />
          </button>
        </div>
      )}
      <div
        className="event-viewer-layout"
        onKeyDown={(event) => {
          if (columnMenu) {
            if (event.key === "Escape") {
              event.preventDefault();
              event.stopPropagation();
              columnMenu.origin?.focus({ preventScroll: true });
              setColumnMenu(null);
            }
            return;
          }
          if (
            event.key === "Escape" &&
            !event.defaultPrevented &&
            selection.opened
          ) {
            event.preventDefault();
            event.stopPropagation();
            closeInspector();
          }
        }}
      >
        <div
          className={`event-scroll-layout${view.wrap ? " viewer-wrap" : ""}`}
        >
          <div
            className="viewer-scroll"
            ref={scrollRef}
            role="grid"
            aria-label="Log events"
            aria-rowcount={rows.length}
            aria-multiselectable="true"
            aria-activedescendant={
              selection.index >= 0
                ? `${viewerId}-event-${selection.index}`
                : undefined
            }
            tabIndex={0}
            onWheel={(event) => {
              if (event.deltaY < 0) onPauseLiveFollow?.();
              else if (event.deltaY > 0) {
                const scroll = event.currentTarget;
                let nested = event.target as HTMLElement | null;
                let consumesScroll = false;
                while (nested && nested !== scroll) {
                  if (
                    nested.scrollHeight -
                      nested.scrollTop -
                      nested.clientHeight >
                      2 &&
                    /^(auto|scroll)$/.test(getComputedStyle(nested).overflowY)
                  ) {
                    consumesScroll = true;
                    break;
                  }
                  nested = nested.parentElement;
                }
                if (
                  !consumesScroll &&
                  scroll.scrollHeight -
                    scroll.scrollTop -
                    scroll.clientHeight <=
                    2
                )
                  onResumeLiveFollow?.();
              }
            }}
            onTouchMove={() => onPauseLiveFollow?.()}
            onPointerDown={(event) => {
              const element = event.currentTarget;
              if (
                event.target === element &&
                event.clientX >=
                  element.getBoundingClientRect().left + element.clientWidth
              )
                onPauseLiveFollow?.();
            }}
            onContextMenu={(event) => {
              const target = event.target as HTMLElement;
              if (
                target.closest('input,textarea,select,[contenteditable="true"]')
              )
                return;
              const row = target.closest<HTMLElement>("[data-event-id]");
              const id = row?.dataset.eventId;
              if (!id) return;
              event.preventDefault();
              if (id && !selectedEventIds.has(id)) selection.select(id);
              setContextEventId(id);
              setColumnMenu(null);
              setContextPosition({ x: event.clientX, y: event.clientY });
            }}
            onKeyDown={(event) => {
              if (event.defaultPrevented) return;
              const target = event.target as HTMLElement;
              if (
                target.closest(
                  'input,textarea,select,[contenteditable="true"]',
                ) ||
                (target.closest("button") && !target.closest(".inspect-cell"))
              )
                return;
              if ((event.ctrlKey || event.metaKey) && !event.altKey) {
                if (event.key.toLowerCase() === "a") {
                  event.preventDefault();
                  window.getSelection()?.removeAllRanges();
                  selection.selectAll();
                  return;
                }
                if (
                  event.key.toLowerCase() === "c" &&
                  selection.selectedIds.length > 0 &&
                  !window.getSelection()?.toString()
                ) {
                  event.preventDefault();
                  void copySelected(event.shiftKey ? "records" : "messages");
                  return;
                }
              }
              if (
                event.key === "PageUp" ||
                event.key === "PageDown" ||
                event.key === " "
              )
                onPauseLiveFollow?.();
              const direction = (
                {
                  ArrowDown: "next",
                  ArrowUp: "previous",
                  Home: "first",
                  End: "last",
                } as const
              )[event.key as "ArrowDown" | "ArrowUp" | "Home" | "End"];
              if (direction) {
                event.preventDefault();
                onPauseLiveFollow?.();
                const index = selection.move(direction, {
                  range: event.shiftKey,
                  additive: event.shiftKey && (event.ctrlKey || event.metaKey),
                });
                if (index >= 0)
                  virtualizer.scrollToIndex(index, { align: "auto" });
              } else if (event.key === "Enter" && selection.selectedId) {
                event.preventDefault();
                selection.inspect(selection.selectedId);
              } else if (event.key === "Escape" && selection.opened) {
                event.preventDefault();
                event.stopPropagation();
                selection.close();
              }
            }}
          >
            {rows.length === 0 ? (
              loading ? (
                <EventLoadingIndicator position="empty" />
              ) : (
                <div className="viewer-empty">
                  <IconSearch size={32} stroke={1.2} />
                  <Text size="sm" fw={600}>
                    {events.length
                      ? "No loaded events match this filter"
                      : liveState === "streaming"
                        ? "Waiting for new events"
                        : liveState === "stopped"
                          ? "Live stopped"
                          : "Ready to investigate"}
                  </Text>
                  <Text size="xs" c="dimmed">
                    {events.length
                      ? "Clear the local search or choose another level."
                      : liveState === "streaming"
                        ? "New matching events appear here automatically."
                        : liveState === "stopped"
                          ? "Start Live again or run a query to load history."
                          : "Choose a log group and run a query to see events here."}
                  </Text>
                  {events.length > 0 && (
                    <Button
                      size="xs"
                      variant="light"
                      onClick={() =>
                        onViewChange({
                          ...view,
                          localSearch: "",
                          level: "all",
                          levels: undefined,
                        })
                      }
                    >
                      Clear local filters
                    </Button>
                  )}
                </div>
              )
            ) : (
              <>
                {view.mode !== "json" && (
                  <div
                    className="log-table-header"
                    role="row"
                    onClickCapture={headerDrag.onClickCapture}
                    style={{
                      minWidth:
                        table.getTotalSize() +
                        (view.mode === "hybrid" ? 32 : 0),
                    }}
                  >
                    {view.mode === "hybrid" && (
                      <div className="hybrid-gutter" />
                    )}
                    {table
                      .getHeaderGroups()[0]
                      ?.headers.map((header, index, headers) => (
                        <div
                          className={`log-header-cell ${header.column.getIsPinned() ? "pinned" : ""}${headerDrag.visual?.sourcePath === columnPath(header.id) ? " is-reordering" : ""}${headerDrag.visual?.targetPath === columnPath(header.id) ? ` column-drop-${headerDrag.visual.edge}` : ""}`}
                          key={header.id}
                          data-column-path={columnPath(header.id)}
                          style={{
                            ...pinStyle(header.column),
                            // Keep a pinned header's centered resize handle above
                            // the next pinned header without covering the rest.
                            ...(header.column.getIsPinned()
                              ? { zIndex: headers.length - index + 2 }
                              : {}),
                            ...(header.column.getIsPinned() &&
                            view.mode === "hybrid"
                              ? { left: header.column.getStart("left") + 32 }
                              : {}),
                          }}
                          role="columnheader"
                          onContextMenu={(event) => {
                            event.preventDefault();
                            event.stopPropagation();
                            headerDrag.cancel();
                            finishColumnResize(true);
                            setContextPosition(null);
                            setColumnMenu({
                              path: columnPath(header.id),
                              origin:
                                event.currentTarget.querySelector<HTMLElement>(
                                  ".column-sort",
                                ) ?? undefined,
                              x: event.clientX,
                              y: event.clientY,
                            });
                          }}
                          onKeyDown={(event) => {
                            if (
                              event.key !== "ContextMenu" &&
                              !(event.shiftKey && event.key === "F10")
                            )
                              return;
                            event.preventDefault();
                            event.stopPropagation();
                            const rect =
                              event.currentTarget.getBoundingClientRect();
                            setContextPosition(null);
                            setColumnMenu({
                              path: columnPath(header.id),
                              origin:
                                event.currentTarget.querySelector<HTMLElement>(
                                  ".column-sort",
                                ) ?? undefined,
                              x: rect.left + Math.min(16, rect.width / 2),
                              y: rect.top + rect.height / 2,
                            });
                          }}
                          aria-sort={
                            header.column.getIsSorted() === "asc"
                              ? "ascending"
                              : header.column.getIsSorted() === "desc"
                                ? "descending"
                                : "none"
                          }
                        >
                          <button
                            className="column-sort"
                            data-tooltip={`Sort by ${titleFor(columnPath(header.id))}`}
                            onClick={header.column.getToggleSortingHandler()}
                            draggable={false}
                            onDragStart={(event) => event.preventDefault()}
                            onPointerDown={(event) => {
                              finishColumnResize(true);
                              headerDrag.begin(columnPath(header.id), event);
                            }}
                            onPointerMove={headerDrag.move}
                            onPointerUp={headerDrag.end}
                            onPointerCancel={headerDrag.cancel}
                            onLostPointerCapture={headerDrag.cancel}
                          >
                            {flexRender(
                              header.column.columnDef.header,
                              header.getContext(),
                            )}
                            {header.column.getIsPinned() && (
                              <IconPin size={11} />
                            )}
                            {header.column.getIsSorted() === "asc" ? (
                              <IconArrowUp size={12} />
                            ) : header.column.getIsSorted() === "desc" ? (
                              <IconArrowDown size={12} />
                            ) : null}
                          </button>
                          <div
                            className={`column-resizer ${resizeSession.current?.id === header.id ? "resizing" : ""}`}
                            role="separator"
                            aria-label={`Resize ${titleFor(columnPath(header.id))}`}
                            aria-orientation="vertical"
                            aria-valuemin={70}
                            aria-valuemax={1400}
                            aria-valuenow={Math.round(header.getSize())}
                            tabIndex={0}
                            draggable={false}
                            onDragStart={(event) => event.preventDefault()}
                            onPointerDown={(event) => {
                              if (!event.isPrimary || event.button !== 0)
                                return;
                              event.preventDefault();
                              event.stopPropagation();
                              headerDrag.cancel();
                              finishColumnResize(true);
                              window.getSelection()?.removeAllRanges();
                              const element = event.currentTarget;
                              element.setPointerCapture(event.pointerId);
                              resizeSession.current = {
                                pointerId: event.pointerId,
                                element,
                                path: columnPath(header.id),
                                id: header.id,
                                startX: event.clientX,
                                startWidth: header.getSize(),
                                width: header.getSize(),
                              };
                              document.body.classList.add("resizing-columns");
                              setDraftSizing({ ...configuredSizing });
                            }}
                            onPointerMove={(event) => {
                              const session = resizeSession.current;
                              if (
                                !session ||
                                event.pointerId !== session.pointerId
                              )
                                return;
                              event.preventDefault();
                              const width = Math.round(
                                Math.min(
                                  1400,
                                  Math.max(
                                    70,
                                    session.startWidth +
                                      event.clientX -
                                      session.startX,
                                  ),
                                ),
                              );
                              if (width === session.width) return;
                              session.width = width;
                              setDraftSizing({
                                ...configuredSizing,
                                [session.id]: width,
                              });
                            }}
                            onPointerUp={(event) => {
                              if (
                                event.pointerId ===
                                resizeSession.current?.pointerId
                              )
                                finishColumnResize(true);
                            }}
                            onPointerCancel={(event) => {
                              if (
                                event.pointerId ===
                                resizeSession.current?.pointerId
                              )
                                finishColumnResize(false);
                            }}
                            onLostPointerCapture={(event) => {
                              if (
                                event.pointerId ===
                                resizeSession.current?.pointerId
                              )
                                finishColumnResize(true);
                            }}
                            onKeyDown={(event) => {
                              if (
                                event.key !== "ArrowLeft" &&
                                event.key !== "ArrowRight"
                              )
                                return;
                              event.preventDefault();
                              const width = Math.min(
                                1400,
                                Math.max(
                                  70,
                                  header.getSize() +
                                    (event.key === "ArrowRight" ? 10 : -10),
                                ),
                              );
                              applyColumns(
                                config.map((column) =>
                                  column.path === columnPath(header.id)
                                    ? { ...column, width }
                                    : column,
                                ),
                              );
                            }}
                            onDoubleClick={() =>
                              applyColumns(
                                config.map((column) =>
                                  column.path === columnPath(header.id)
                                    ? {
                                        ...column,
                                        width:
                                          initialColumns.find(
                                            (entry) =>
                                              entry.path === column.path,
                                          )?.width ?? 180,
                                      }
                                    : column,
                                ),
                              )
                            }
                          />
                        </div>
                      ))}
                  </div>
                )}
                <div
                  className="virtual-events"
                  style={{
                    height: virtualizer.getTotalSize(),
                    minWidth:
                      view.mode === "json"
                        ? undefined
                        : table.getTotalSize() +
                          (view.mode === "hybrid" ? 32 : 0),
                  }}
                >
                  {visibleItems.map((virtualRow) => {
                    const tableRow = rows[virtualRow.index]!;
                    const row = tableRow.original;
                    const expanded = expansion.isExpanded(row.event.id);
                    const highlight = highlighting.results.get(row.event.id);
                    const highlightPending =
                      highlighting.active && !highlight && !highlighting.error;
                    return (
                      <EventHighlightContext.Provider
                        key={tableRow.id}
                        value={highlight}
                      >
                        <div
                          className={`virtual-event ${view.mode === "json" ? "json-event-card" : "table-event"} level-${row.level}${selectedEventIds.has(row.event.id) ? " event-selected" : ""}`}
                          key={tableRow.id}
                          id={`${viewerId}-event-${virtualRow.index}`}
                          role="row"
                          aria-selected={selectedEventIds.has(row.event.id)}
                          data-event-id={row.event.id}
                          data-selected={selectedEventIds.has(row.event.id)}
                          data-current={selection.selectedId === row.event.id}
                          data-highlighted={Boolean(
                            highlight?.row.background ||
                            highlight?.row.foreground,
                          )}
                          data-highlight-pending={highlightPending}
                          aria-busy={highlightPending || undefined}
                          onPointerDown={(event) => {
                            onPauseLiveFollow?.();
                            if (
                              event.button === 2 ||
                              event.ctrlKey ||
                              event.metaKey ||
                              event.shiftKey
                            )
                              event.preventDefault();
                          }}
                          onClick={(event) => {
                            const textSelection = window.getSelection();
                            if (
                              textSelection &&
                              !textSelection.isCollapsed &&
                              textSelection.containsNode(
                                event.currentTarget,
                                true,
                              )
                            )
                              return;
                            if (
                              !(event.target as HTMLElement).closest(
                                "button:not(.inspect-cell),input,select,textarea,a",
                              )
                            ) {
                              selection.select(row.event.id, {
                                additive: event.ctrlKey || event.metaKey,
                                range: event.shiftKey,
                              });
                              scrollRef.current?.focus({ preventScroll: true });
                            }
                          }}
                          onDoubleClick={(event) => {
                            if (
                              (event.target as HTMLElement).closest(
                                "button:not(.inspect-cell),input,select,textarea,a",
                              )
                            )
                              return;
                            if (view.mode === "hybrid") {
                              if (
                                (event.target as HTMLElement).closest(
                                  ".log-table-row",
                                )
                              )
                                toggleExpand(row.event.id);
                            } else selection.inspect(row.event.id);
                          }}
                          data-index={virtualRow.index}
                          ref={virtualizer.measureElement}
                          style={
                            {
                              "--event-highlight-bg": highlight?.row.background,
                              "--event-highlight-fg": highlight?.row.foreground,
                              position: "absolute",
                              top: virtualRow.start,
                              left: 0,
                              width: "100%",
                            } as CSSProperties
                          }
                        >
                          {view.mode === "json" ? (
                            <>
                              <div className="json-card-meta">
                                <button
                                  type="button"
                                  className="event-action expand-event"
                                  aria-label={`${expanded ? "Collapse" : "Expand"} event details`}
                                  aria-expanded={expanded}
                                  onClick={() => toggleExpand(row.event.id)}
                                >
                                  {expanded ? (
                                    <IconChevronDown size={13} />
                                  ) : (
                                    <IconChevronRight size={13} />
                                  )}
                                </button>
                                <Badge
                                  size="xs"
                                  color={levelColor[row.level]}
                                  variant="light"
                                >
                                  {row.level}
                                </Badge>
                                <span className="event-timestamp">
                                  {timeLabel(
                                    row.event.timestamp,
                                    preferences.timezone,
                                  )}
                                </span>
                                <span
                                  className="event-source"
                                  data-tooltip={`${row.event.logGroup} · ${row.event.logStream}`}
                                >
                                  {row.event.logStream}
                                </span>
                                <span className="toolbar-spacer" />
                                <button
                                  className="event-inspect"
                                  onClick={() =>
                                    selection.inspect(row.event.id)
                                  }
                                >
                                  Inspect <IconArrowRight size={12} />
                                </button>
                                <button
                                  className="event-action"
                                  aria-label="Copy raw event"
                                  onClick={() => copy(row.event.message)}
                                >
                                  <IconCopy size={13} />
                                </button>
                              </div>
                              {expanded ? (
                                <div className="event-message-details">
                                  <MessageContent
                                    row={row}
                                    highlight={highlightText}
                                    compact
                                    onAddColumn={addColumn}
                                    onAddFilter={addFilter}
                                    onDeserialize={(path, encoding) =>
                                      deserialized.deserialize(
                                        row.event,
                                        path,
                                        encoding,
                                      )
                                    }
                                    decodedLabels={deserialized.labelsFor(
                                      row.event,
                                    )}
                                    deserializedPaths={deserialized.pathsFor(
                                      row.event,
                                    )}
                                  />
                                </div>
                              ) : (
                                <div className="message-summary">
                                  <HighlightText
                                    text={row.event.message
                                      .slice(0, 600)
                                      .replace(/\s+/g, " ")}
                                    needle={highlightText}
                                  />
                                </div>
                              )}
                            </>
                          ) : (
                            <>
                              <div
                                className="log-table-row"
                                role="presentation"
                              >
                                {view.mode === "hybrid" && (
                                  <button
                                    className="hybrid-gutter expand-event"
                                    aria-label={`${expanded ? "Collapse" : "Expand"} event details`}
                                    aria-expanded={expanded}
                                    onClick={() => toggleExpand(row.event.id)}
                                  >
                                    {expanded ? (
                                      <IconChevronDown size={13} />
                                    ) : (
                                      <IconChevronRight size={13} />
                                    )}
                                  </button>
                                )}
                                {tableRow.getVisibleCells().map((cell) => (
                                  <div
                                    className={`log-cell ${cell.column.getIsPinned() ? "pinned" : ""}`}
                                    role="cell"
                                    key={cell.id}
                                    style={{
                                      ...pinStyle(cell.column),
                                      ...(cell.column.getIsPinned() &&
                                      view.mode === "hybrid"
                                        ? {
                                            left:
                                              cell.column.getStart("left") + 32,
                                          }
                                        : {}),
                                    }}
                                  >
                                    <div
                                      tabIndex={0}
                                      className="inspect-cell"
                                      aria-label={`Select event ${row.event.id}`}
                                      onFocus={() =>
                                        selection.select(row.event.id)
                                      }
                                    >
                                      {flexRender(
                                        cell.column.columnDef.cell,
                                        cell.getContext(),
                                      )}
                                    </div>
                                  </div>
                                ))}
                              </div>
                              {expanded && (
                                <ExpandedEventDetails
                                  initialHeight={detailHeights.current.get(
                                    row.event,
                                  )}
                                  onHeightChange={(height) => {
                                    if (height === undefined)
                                      detailHeights.current.delete(row.event);
                                    else
                                      detailHeights.current.set(
                                        row.event,
                                        height,
                                      );
                                  }}
                                  onResizeStart={onPauseLiveFollow}
                                  footer={
                                    <Group gap="xs" mt={6}>
                                      {view.mode === "hybrid" && (
                                        <Button
                                          size="compact-xs"
                                          variant="subtle"
                                          onClick={() =>
                                            toggleExpand(row.event.id)
                                          }
                                        >
                                          Fold message
                                        </Button>
                                      )}
                                      <Button
                                        size="compact-xs"
                                        variant="subtle"
                                        onClick={() =>
                                          selection.inspect(row.event.id)
                                        }
                                      >
                                        Open inspector
                                      </Button>
                                      <Button
                                        size="compact-xs"
                                        variant="subtle"
                                        leftSection={<IconCopy size={12} />}
                                        onClick={() => copy(row.event.message)}
                                      >
                                        Copy raw
                                      </Button>
                                    </Group>
                                  }
                                >
                                  <MessageContent
                                    row={row}
                                    highlight={highlightText}
                                    compact
                                    onAddColumn={addColumn}
                                    onAddFilter={addFilter}
                                    onDeserialize={(path, encoding) =>
                                      deserialized.deserialize(
                                        row.event,
                                        path,
                                        encoding,
                                      )
                                    }
                                    decodedLabels={deserialized.labelsFor(
                                      row.event,
                                    )}
                                    deserializedPaths={deserialized.pathsFor(
                                      row.event,
                                    )}
                                  />
                                </ExpandedEventDetails>
                              )}
                            </>
                          )}
                        </div>
                      </EventHighlightContext.Provider>
                    );
                  })}
                </div>
              </>
            )}
            {loading && rows.length > 0 && (
              <EventLoadingIndicator position="more" />
            )}
          </div>
          <Menu
            withinPortal
            position="bottom-start"
            opened={contextPosition !== null}
            onChange={(opened) => {
              if (!opened) setContextPosition(null);
            }}
            returnFocus={false}
          >
            <Menu.Target>
              <span
                aria-hidden="true"
                style={{
                  position: "fixed",
                  left: contextPosition?.x ?? 0,
                  top: contextPosition?.y ?? 0,
                  width: 0,
                  height: 0,
                  pointerEvents: "none",
                }}
              />
            </Menu.Target>
            <Menu.Dropdown>
              <Menu.Item
                leftSection={<IconCopy size={14} />}
                disabled={selection.selectedIds.length === 0 || filtering}
                onClick={() => void copySelected("messages")}
              >
                Copy selected messages
              </Menu.Item>
              <Menu.Item
                leftSection={<IconBraces size={14} />}
                disabled={selection.selectedIds.length === 0 || filtering}
                onClick={() => void copySelected("records")}
              >
                Copy selected records
              </Menu.Item>
              {onContext &&
                (() => {
                  const event = allRows.find(
                    (row) => row.event.id === contextEventId,
                  )?.event;
                  return event ? (
                    <SurroundingContextMenu
                      event={event}
                      onContext={onContext}
                      onSelect={() => setContextPosition(null)}
                    />
                  ) : null;
                })()}
            </Menu.Dropdown>
          </Menu>
          <ColumnHeaderMenu
            target={columnMenu}
            columns={config}
            onClose={() => setColumnMenu(null)}
            onChange={applyColumns}
          />
          <EventOverview
            rows={overviewRows}
            measurements={virtualizer.measurementsCache}
            totalSize={virtualizer.getTotalSize()}
            scrollRef={scrollRef}
            onNavigate={(index) => {
              onPauseLiveFollow?.();
              selection.select(rows[index]!.original.event.id);
              virtualizer.scrollToIndex(index, { align: "center" });
            }}
          />
        </div>
        <EventInspector opened={selection.opened} eventId={inspected?.event.id}>
          {!inspected && (
            <Text size="sm" c="dimmed">
              Select an event to inspect.
            </Text>
          )}
          <EventHighlightContext.Provider
            value={
              inspected
                ? highlighting.results.get(inspected.event.id)
                : undefined
            }
          >
            {inspected && (
              <>
                <section className="inspector-information">
                  <div className="inspector-information-toolbar">
                    <button
                      type="button"
                      className="inspector-information-toggle"
                      aria-label={
                        view.inspectorInfoCollapsed
                          ? "Expand event information"
                          : "Collapse event information"
                      }
                      aria-expanded={!view.inspectorInfoCollapsed}
                      aria-controls={`${viewerId}-event-information`}
                      onClick={() =>
                        onViewChange({
                          ...view,
                          inspectorInfoCollapsed: !view.inspectorInfoCollapsed,
                        })
                      }
                    >
                      {view.inspectorInfoCollapsed ? (
                        <IconChevronRight size={13} />
                      ) : (
                        <IconChevronDown size={13} />
                      )}
                      Event information
                    </button>
                    <Group gap={4}>
                      <ActionIcon
                        aria-label="Previous event"
                        variant="default"
                        disabled={inspectedIndex <= 0}
                        onClick={() => navigateTo(inspectedIndex - 1)}
                      >
                        <IconArrowLeft size={15} />
                      </ActionIcon>
                      <Text size="xs" c="dimmed">
                        {inspectedIndex >= 0
                          ? `${inspectedIndex + 1} of ${rows.length}`
                          : "Outside local filter"}
                      </Text>
                      <ActionIcon
                        aria-label="Next event"
                        variant="default"
                        disabled={
                          inspectedIndex < 0 ||
                          inspectedIndex >= rows.length - 1
                        }
                        onClick={() => navigateTo(inspectedIndex + 1)}
                      >
                        <IconArrowRight size={15} />
                      </ActionIcon>
                    </Group>
                  </div>
                  <div
                    className="inspector-information-details"
                    id={`${viewerId}-event-information`}
                    hidden={view.inspectorInfoCollapsed === true}
                  >
                    <Group gap="xs">
                      <Badge
                        color={levelColor[inspected.level]}
                        variant="light"
                      >
                        {inspected.level}
                      </Badge>
                      <Text size="xs" ff="monospace">
                        {timeLabel(
                          inspected.event.timestamp,
                          preferences.timezone,
                        )}
                      </Text>
                    </Group>
                    <div className="inspector-source">
                      <div>
                        <span>GROUP</span>
                        <code data-tooltip={inspected.event.logGroup}>
                          {inspected.event.logGroup}
                        </code>
                      </div>
                      <div>
                        <span>STREAM</span>
                        <code
                          data-tooltip={
                            inspected.event.logStream || "Insights result"
                          }
                        >
                          {inspected.event.logStream || "Insights result"}
                        </code>
                      </div>
                      <div>
                        <span>EVENT</span>
                        <code data-tooltip={inspected.event.id}>
                          {inspected.event.id}
                        </code>
                      </div>
                      {inspected.event.ingestionTime !== undefined && (
                        <div>
                          <span>INGESTED</span>
                          <code>
                            {timeLabel(
                              inspected.event.ingestionTime,
                              preferences.timezone,
                            )}
                          </code>
                        </div>
                      )}
                    </div>
                  </div>
                </section>
                <Group className="inspector-tools" justify="space-between">
                  <SegmentedControl
                    size="xs"
                    value={inspectorMode}
                    onChange={setInspectorMode}
                    data={[
                      { value: "structured", label: "Structured" },
                      { value: "raw", label: "Raw message" },
                    ]}
                  />
                  <Group gap={4}>
                    <div
                      className="inspector-message-actions"
                      ref={setInspectorActionsTarget}
                    />
                    <Menu withinPortal>
                      <Menu.Target>
                        <ActionIcon
                          size={28}
                          variant="light"
                          aria-label="Copy"
                          data-tooltip="Copy event message or metadata"
                        >
                          {copied ? (
                            <IconCheck size={13} />
                          ) : (
                            <IconCopy size={13} />
                          )}
                        </ActionIcon>
                      </Menu.Target>
                      <Menu.Dropdown>
                        <Menu.Item
                          onClick={() => copy(inspected.event.message)}
                        >
                          Raw message
                        </Menu.Item>
                        <Menu.Item
                          disabled={inspected.parsed.kind !== "json"}
                          onClick={() =>
                            copy(
                              JSON.stringify(inspected.parsed.value, null, 2),
                            )
                          }
                        >
                          Formatted JSON message
                        </Menu.Item>
                        <Menu.Item
                          onClick={() =>
                            copy(JSON.stringify(inspected.event, null, 2))
                          }
                        >
                          Event with metadata
                        </Menu.Item>
                      </Menu.Dropdown>
                    </Menu>
                  </Group>
                </Group>
                <InspectorMessage
                  eventId={inspected.event.id}
                  className={
                    (view.inspectorWrap ?? true) ? "inspector-wrap" : undefined
                  }
                  style={{ fontSize: preferences.fontSize }}
                >
                  {inspectorMode === "structured" ? (
                    <MessageContent
                      row={inspected}
                      highlight={highlightText}
                      onCopyValue={(text) => void copy(text)}
                      onAddColumn={addColumn}
                      onDeserialize={(path, encoding) =>
                        deserialized.deserialize(
                          inspected.event,
                          path,
                          encoding,
                        )
                      }
                      decodedLabels={deserialized.labelsFor(inspected.event)}
                      deserializedPaths={deserialized.pathsFor(inspected.event)}
                      onAddFilter={addFilter}
                      controls
                      renderActions={(actions) =>
                        inspectorActionsTarget
                          ? createPortal(actions, inspectorActionsTarget)
                          : null
                      }
                      lineWrap={{
                        enabled: view.inspectorWrap ?? true,
                        onToggle: () =>
                          onViewChange({
                            ...view,
                            inspectorWrap: !(view.inspectorWrap ?? true),
                          }),
                      }}
                      autoExpandMatches={
                        preferences.autoExpandFilterMatches !== false
                      }
                      key={inspected.event.id}
                    />
                  ) : (
                    <MessageContent
                      row={{ ...inspected, parsed: { kind: "text" } }}
                      renderActions={(actions) =>
                        inspectorActionsTarget
                          ? createPortal(actions, inspectorActionsTarget)
                          : null
                      }
                      lineWrap={{
                        enabled: view.inspectorWrap ?? true,
                        onToggle: () =>
                          onViewChange({
                            ...view,
                            inspectorWrap: !(view.inspectorWrap ?? true),
                          }),
                      }}
                      highlight={highlightText}
                    />
                  )}
                </InspectorMessage>
                {notice && (
                  <Text size="xs" c="cyan" mt="xs" role="status">
                    {notice}
                  </Text>
                )}
              </>
            )}
          </EventHighlightContext.Provider>
        </EventInspector>
      </div>
      {(highlighting.error || overview.error) && (
        <Text size="xs" c="orange" role="status">
          {highlighting.error || overview.error}
        </Text>
      )}
      {renderStatus?.(rows.length)}

      <Modal
        opened={columnsOpened}
        onClose={() => setColumnsOpened(false)}
        title="Customize columns"
        size="lg"
      >
        <Text size="xs" c="dimmed" mb="sm">
          Drag columns or use arrows to change their order. Sizes, formatting,
          visibility, pinning and sorting stay with this tab. Formats change
          displayed cells; sorting, inspection and export retain the original
          values.
        </Text>
        <div className="column-list">
          {config.map((column, index) => (
            <div
              className={`column-config ${draggedColumn === column.path ? "column-dragging" : ""}`}
              key={column.path}
              draggable
              onDragStart={(event) => {
                setDraggedColumn(column.path);
                event.dataTransfer.effectAllowed = "move";
                event.dataTransfer.setData("text/plain", column.path);
              }}
              onDragEnd={() => setDraggedColumn(null)}
              onDragOver={(event) => event.preventDefault()}
              onDrop={(event) => {
                event.preventDefault();
                if (draggedColumn !== null) moveColumn(draggedColumn, index);
                setDraggedColumn(null);
              }}
            >
              <IconGripVertical size={15} className="column-grip" />
              <Checkbox
                aria-label={`Show ${titleFor(column.path)}`}
                checked={!column.hidden}
                onChange={(event) => {
                  const hidden = !event.currentTarget.checked;
                  if (
                    hidden &&
                    config.filter((entry) => !entry.hidden).length === 1
                  ) {
                    setNotice("Keep at least one column visible.");
                    return;
                  }
                  applyColumns(
                    config.map((entry) =>
                      entry.path === column.path ? { ...entry, hidden } : entry,
                    ),
                  );
                }}
              />
              <span className="column-path" data-tooltip={column.path}>
                {titleFor(column.path)}
              </span>
              <span className="column-width">
                {Math.round(column.width)} px
              </span>
              <Select
                aria-label={`Format ${titleFor(column.path)}`}
                data-tooltip="Format displayed values"
                size="xs"
                style={{ flex: "0 0 116px", width: 116 }}
                value={column.format ?? "auto"}
                allowDeselect={false}
                data={[
                  { value: "auto", label: "Auto" },
                  { value: "json", label: "JSON" },
                  { value: "bytes", label: "Bytes (IEC)" },
                  { value: "milliseconds", label: "Duration (ms)" },
                  { value: "datetime", label: "Date & time" },
                ]}
                onChange={(format) =>
                  applyColumns(
                    config.map((entry) =>
                      entry.path === column.path
                        ? {
                            ...entry,
                            format: (format ??
                              "auto") as ColumnConfig["format"],
                          }
                        : entry,
                    ),
                  )
                }
              />
              <Tooltip label={column.pinned ? "Unpin" : "Pin to left"}>
                <ActionIcon
                  aria-label={`${column.pinned ? "Unpin" : "Pin"} ${titleFor(column.path)}`}
                  variant={column.pinned ? "light" : "subtle"}
                  onClick={() =>
                    applyColumns(
                      applyColumnAction(
                        config,
                        column.path,
                        column.pinned ? "unpin" : "pin",
                      ),
                    )
                  }
                >
                  <IconPin size={14} />
                </ActionIcon>
              </Tooltip>
              <ActionIcon
                aria-label={`Move ${titleFor(column.path)} up`}
                variant="subtle"
                disabled={index === 0}
                onClick={() => moveColumn(column.path, index - 1)}
              >
                <IconArrowUp size={14} />
              </ActionIcon>
              <ActionIcon
                aria-label={`Move ${titleFor(column.path)} down`}
                variant="subtle"
                disabled={index === config.length - 1}
                onClick={() => moveColumn(column.path, index + 1)}
              >
                <IconArrowDown size={14} />
              </ActionIcon>
              <ActionIcon
                aria-label={`Remove ${titleFor(column.path)}`}
                variant="subtle"
                color="gray"
                disabled={
                  config.length === 1 ||
                  (!column.hidden &&
                    config.filter((entry) => !entry.hidden).length === 1)
                }
                onClick={() =>
                  applyColumns(
                    column.path === "@source"
                      ? config.map((entry) =>
                          entry.path === "@source"
                            ? { ...entry, hidden: true }
                            : entry,
                        )
                      : config.filter((entry) => entry.path !== column.path),
                  )
                }
              >
                <IconX size={14} />
              </ActionIcon>
            </div>
          ))}
        </div>
        <Group mt="md" align="end">
          <Select
            style={{ flex: 1 }}
            label="Discovered field"
            placeholder="Choose a property…"
            searchable
            clearable
            data={paths.list
              .filter(
                (path) =>
                  !config.some(
                    (column) => column.path === path && !column.hidden,
                  ),
              )
              .map((path) => ({
                value: path || "__root__",
                label: titleFor(path),
              }))}
            value={null}
            onChange={(path) => {
              if (path !== null) addColumn(path === "__root__" ? "" : path);
            }}
          />
        </Group>
        <Group mt="xs" align="end">
          <TextInput
            style={{ flex: 1 }}
            label="JSON Pointer"
            placeholder="/request/id or /items/0/name"
            value={columnInput}
            onChange={(event) => setColumnInput(event.currentTarget.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") addColumn(columnInput);
            }}
          />
          <Button variant="light" onClick={() => addColumn(columnInput)}>
            Add column
          </Button>
        </Group>
        <Text size="xs" c="dimmed" mt="xs">
          Discovery examines up to 500 loaded events and 200 field paths.
          {paths.limited
            ? " Some fields were omitted; add their JSON Pointer directly or from the inspector."
            : ""}{" "}
          Literal dotted keys stay intact: /user.id differs from /user/id.
          Escape / as ~1 and ~ as ~0.
        </Text>
        <Group justify="space-between" mt="md">
          <Switch
            label="Wrap message lines"
            checked={view.wrap}
            onChange={(event) =>
              onViewChange({ ...view, wrap: event.currentTarget.checked })
            }
          />
          <Button
            variant="subtle"
            size="xs"
            onClick={() =>
              applyColumns(initialColumns.map((column) => ({ ...column })))
            }
          >
            Reset columns
          </Button>
        </Group>
        {notice && (
          <Text size="xs" c="cyan" mt="xs" role="status">
            {notice}
          </Text>
        )}
      </Modal>
    </div>
  );
}
