import {
  memo,
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import {
  ActionIcon,
  Badge,
  Button,
  Checkbox,
  Group,
  Menu,
  Modal,
  SegmentedControl,
  Select,
  Switch,
  Text,
  TextInput,
  Tooltip,
} from "@mantine/core";
import {
  IconArrowDown,
  IconArrowLeft,
  IconArrowRight,
  IconArrowUp,
  IconBraces,
  IconCheck,
  IconChevronDown,
  IconChevronRight,
  IconColumns3,
  IconCopy,
  IconDownload,
  IconFilter,
  IconGripVertical,
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
  LogEvent,
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
  inspectionRows,
  matchesLocalFilter,
  META_COLUMNS,
  parseLogMessage,
  serializeEvents,
  summarizeValue,
  type JsonValue,
  type LogLevel,
  type ParsedMessage,
} from "../../shared/log-data";
import "./viewer.css";

interface EventRow {
  event: LogEvent;
  parsed: ParsedMessage;
  level: LogLevel;
}
export interface LogViewerProps {
  events: LogEvent[];
  view: ViewConfig;
  onViewChange: (view: ViewConfig) => void;
  preferences: Preferences;
  onContext?: (event: LogEvent) => void;
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
  if (!Number.isFinite(timestamp)) return "Invalid timestamp";
  const date = new Date(timestamp);
  if (!Number.isFinite(date.getTime())) return "Invalid timestamp";
  if (timezone === "utc")
    return date.toISOString().replace("T", " ").replace("Z", " UTC");
  return `${date.toLocaleDateString(undefined, { month: "short", day: "2-digit" })} ${date.toLocaleTimeString(undefined, { hour12: false, hour: "2-digit", minute: "2-digit", second: "2-digit" })}.${String(date.getMilliseconds()).padStart(3, "0")}`;
}

const HighlightText = memo(function HighlightText({
  text,
  needle,
}: {
  text: string;
  needle: string;
}) {
  if (!needle || needle.length > 200) return <>{text}</>;
  const parts: React.ReactNode[] = [];
  const lower = text.toLowerCase();
  let cursor = 0;
  for (let count = 0; count < 30; count++) {
    const index = lower.indexOf(needle.toLowerCase(), cursor);
    if (index === -1) break;
    parts.push(
      text.slice(cursor, index),
      <mark key={index}>{text.slice(index, index + needle.length)}</mark>,
    );
    cursor = index + needle.length;
  }
  parts.push(text.slice(cursor));
  return <>{parts}</>;
});

function JsonTree({
  value,
  highlight,
  compact = false,
  onAddColumn,
}: {
  value: JsonValue;
  highlight: string;
  compact?: boolean;
  onAddColumn?: (path: string) => void;
}) {
  const [expanded, setExpanded] = useState(() => new Set([""]));
  const model = useMemo(
    () => inspectionRows(value, expanded, { maxNodes: compact ? 120 : 800 }),
    [value, expanded, compact],
  );
  const toggle = (path: string) =>
    setExpanded((previous) => {
      const next = new Set(previous);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  return (
    <div className={`json-tree ${compact ? "json-tree-compact" : ""}`}>
      {model.rows.map((row) => {
        const container = row.value !== null && typeof row.value === "object";
        const array = Array.isArray(row.value);
        const type = row.value === null ? "null" : typeof row.value;
        const valueText = container
          ? `${array ? "[" : "{"}${row.childCount} ${array ? "items" : "keys"}${array ? "]" : "}"}`
          : typeof row.value === "string"
            ? JSON.stringify(summarizeValue(row.value, compact ? 500 : 4000))
            : String(row.value);
        return (
          <div
            className="json-line"
            key={row.path}
            style={{ paddingLeft: row.depth * 17 }}
          >
            {row.childCount > 0 && !row.depthLimited ? (
              <button
                className="json-toggle"
                aria-label={`${row.expanded ? "Collapse" : "Expand"} ${row.path || "root"}`}
                onClick={() => toggle(row.path)}
              >
                {row.expanded ? (
                  <IconChevronDown size={13} />
                ) : (
                  <IconChevronRight size={13} />
                )}
              </button>
            ) : (
              <span className="json-toggle json-toggle-spacer" />
            )}
            <span className="json-key" title={row.path || "Root"}>
              <HighlightText
                text={row.label === "$" ? "$" : JSON.stringify(row.label)}
                needle={highlight}
              />
            </span>
            <span className="json-punctuation">: </span>
            <span
              className={`json-value json-${container ? "container" : type}`}
            >
              <HighlightText text={valueText} needle={highlight} />
            </span>
            {row.depthLimited && (
              <span className="inspection-note"> depth limit</span>
            )}
            {onAddColumn && (
              <button
                className="json-add-column"
                title={`Add ${row.path || "$"} as a column`}
                aria-label={`Add ${row.path || "root"} column`}
                onClick={() => onAddColumn(row.path)}
              >
                <IconColumns3 size={13} />
              </button>
            )}
          </div>
        );
      })}
      {model.truncated && (
        <div className="inspection-note">
          Inspection limited to {compact ? 120 : 800} visible nodes and 24
          levels. Collapse branches to explore others. Raw copy and export
          retain the complete event.
        </div>
      )}
    </div>
  );
}

function MessageContent({
  row,
  highlight,
  compact = false,
  onAddColumn,
}: {
  row: EventRow;
  highlight: string;
  compact?: boolean;
  onAddColumn?: (path: string) => void;
}) {
  if (row.parsed.kind === "json")
    return (
      <JsonTree
        value={row.parsed.value!}
        highlight={highlight}
        compact={compact}
        onAddColumn={onAddColumn}
      />
    );
  const displayLimit = compact ? 6000 : 200_000;
  return (
    <div className="raw-content">
      {row.parsed.reason && (
        <div className="inspection-note">{row.parsed.reason}</div>
      )}
      <pre>
        <HighlightText
          text={row.event.message.slice(0, displayLimit)}
          needle={highlight}
        />
      </pre>
      {row.event.message.length > displayLimit && (
        <div className="inspection-note">
          Preview shows the first {displayLimit.toLocaleString()} characters.
          Copy raw or export for the complete message.
        </div>
      )}
    </div>
  );
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
  view,
  onViewChange,
  preferences,
  onContext,
}: LogViewerProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [expandedEvents, setExpandedEvents] = useState<Set<string>>(
    () => new Set(),
  );
  const [inspectedId, setInspectedId] = useState<string | null>(null);
  const [inspectorMode, setInspectorMode] = useState("structured");
  const [columnsOpened, setColumnsOpened] = useState(false);
  const [columnInput, setColumnInput] = useState("");
  const [draggedColumn, setDraggedColumn] = useState<string | null>(null);
  const [notice, setNotice] = useState("");
  const [exporting, setExporting] = useState(false);
  const [copied, setCopied] = useState(false);
  const [draftSizing, setDraftSizing] = useState<Record<string, number> | null>(
    null,
  );
  const resizeSession = useRef<ColumnResizeSession | null>(null);
  const localSearch = useDeferredValue(view.localSearch);
  const filtering = localSearch !== view.localSearch;
  const allRows = useMemo(() => events.map(prepare), [events]);
  const filteredRows = useMemo(
    () =>
      allRows.filter((row) =>
        matchesLocalFilter(row.event, row.parsed, localSearch, view.level),
      ),
    [allRows, localSearch, view.level],
  );
  const config = useMemo(
    () =>
      (view.columns.length ? view.columns : initialColumns).map((column) => ({
        ...column,
        width: Math.min(1400, Math.max(70, column.width || 180)),
      })),
    [view.columns],
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
          if (
            automatic &&
            column.path === "@message" &&
            row.parsed.kind === "json"
          ) {
            const message =
              getPointer(row.parsed.value, "/message") ??
              getPointer(row.parsed.value, "/msg");
            if (typeof message === "string")
              text = summarizeValue(message, 1500);
          }
          return (
            <span
              className={value === undefined ? "cell-missing" : ""}
              title={text}
            >
              <HighlightText
                text={text || (value === undefined ? "—" : "")}
                needle={preferences.highlightText}
              />
            </span>
          );
        },
      })),
    [config, preferences.timezone, preferences.highlightText],
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
  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () =>
      view.mode === "json" ? 180 : preferences.density === "compact" ? 34 : 44,
    getItemKey: (index) => rows[index]!.id,
    overscan: 7,
  });
  useEffect(() => {
    virtualizer.measure();
  }, [
    view.mode,
    view.wrap,
    preferences.density,
    preferences.fontSize,
    virtualizer,
  ]);
  const inspectedIndex = rows.findIndex(
    (row) => row.original.event.id === inspectedId,
  );
  const inspected =
    inspectedIndex >= 0
      ? rows[inspectedIndex]!.original
      : allRows.find((row) => row.event.id === inspectedId);
  const jsonCount = allRows.filter((row) => row.parsed.kind === "json").length;
  const limitedCount = allRows.filter(
    (row) => row.parsed.kind === "limited",
  ).length;
  const toggleExpand = (id: string) =>
    setExpandedEvents((previous) => {
      const next = new Set(previous);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
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
      className={`log-viewer density-${preferences.density} ${view.wrap ? "viewer-wrap" : ""}`}
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
          leftSection={<IconSearch size={14} />}
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
        <Select
          className="level-filter"
          aria-label="Local level filter"
          size="xs"
          data={[
            "all",
            "trace",
            "debug",
            "info",
            "warn",
            "error",
            "fatal",
            "unknown",
          ].map((value) => ({
            value,
            label: value === "all" ? "All levels" : value.toUpperCase(),
          }))}
          value={view.level || "all"}
          onChange={(value) => onViewChange({ ...view, level: value ?? "all" })}
          allowDeselect={false}
        />
        <Tooltip
          label="Local filter only. Use @/request/id=42 for a property, @/request/id for existence, and quotes for spaces. JSON Pointer preserves dotted keys and arrays."
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
            variant={view.wrap ? "light" : "subtle"}
            onClick={() => onViewChange({ ...view, wrap: !view.wrap })}
          >
            <IconTextWrap size={16} />
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
      </div>
      <div className="viewer-meta">
        <span>
          <span className="local-indicator" /> LOCAL ·{" "}
          {filtering
            ? "Filtering…"
            : `${rows.length.toLocaleString()} / ${events.length.toLocaleString()} loaded events`}
        </span>
        <span>
          {jsonCount.toLocaleString()} JSON
          {limitedCount > 0
            ? ` · ${limitedCount} inspection limited`
            : ""} · {preferences.timezone === "utc" ? "UTC" : "Local time"}
          {view.sort ? ` · Sorted by ${titleFor(view.sort.path)}` : ""}
        </span>
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
        className="viewer-scroll"
        ref={scrollRef}
        role="region"
        aria-label="Log events"
      >
        {rows.length === 0 ? (
          <div className="viewer-empty">
            <IconSearch size={32} stroke={1.2} />
            <Text size="sm" fw={600}>
              {events.length
                ? "No loaded events match this filter"
                : "Ready to investigate"}
            </Text>
            <Text size="xs" c="dimmed">
              {events.length
                ? "Clear the local search or choose another level."
                : "Choose a log group and run a query to see events here."}
            </Text>
            {events.length > 0 && (
              <Button
                size="xs"
                variant="light"
                onClick={() =>
                  onViewChange({ ...view, localSearch: "", level: "all" })
                }
              >
                Clear local filters
              </Button>
            )}
          </div>
        ) : (
          <>
            {view.mode !== "json" && (
              <div
                className="log-table-header"
                role="row"
                style={{
                  minWidth:
                    table.getTotalSize() + (view.mode === "hybrid" ? 32 : 0),
                }}
              >
                {view.mode === "hybrid" && <div className="hybrid-gutter" />}
                {table.getHeaderGroups()[0]?.headers.map((header) => (
                  <div
                    className={`log-header-cell ${header.column.getIsPinned() ? "pinned" : ""}`}
                    key={header.id}
                    style={{
                      ...pinStyle(header.column),
                      ...(header.column.getIsPinned() && view.mode === "hybrid"
                        ? { left: header.column.getStart("left") + 32 }
                        : {}),
                    }}
                    role="columnheader"
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
                      title={`Sort by ${titleFor(columnPath(header.id))}`}
                      onClick={header.column.getToggleSortingHandler()}
                    >
                      {flexRender(
                        header.column.columnDef.header,
                        header.getContext(),
                      )}
                      {header.column.getIsPinned() && <IconPin size={11} />}
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
                        if (!event.isPrimary || event.button !== 0) return;
                        event.preventDefault();
                        event.stopPropagation();
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
                        if (!session || event.pointerId !== session.pointerId)
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
                          event.pointerId === resizeSession.current?.pointerId
                        )
                          finishColumnResize(true);
                      }}
                      onPointerCancel={(event) => {
                        if (
                          event.pointerId === resizeSession.current?.pointerId
                        )
                          finishColumnResize(false);
                      }}
                      onLostPointerCapture={(event) => {
                        if (
                          event.pointerId === resizeSession.current?.pointerId
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
                                      (entry) => entry.path === column.path,
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
                    : table.getTotalSize() + (view.mode === "hybrid" ? 32 : 0),
              }}
            >
              {virtualizer.getVirtualItems().map((virtualRow) => {
                const tableRow = rows[virtualRow.index]!;
                const row = tableRow.original;
                const expanded = expandedEvents.has(row.event.id);
                return (
                  <div
                    className={`virtual-event ${view.mode === "json" ? "json-event-card" : "table-event"} level-${row.level}`}
                    key={tableRow.id}
                    data-index={virtualRow.index}
                    ref={virtualizer.measureElement}
                    style={{
                      position: "absolute",
                      top: 0,
                      left: 0,
                      width: "100%",
                      transform: `translateY(${virtualRow.start}px)`,
                    }}
                  >
                    {view.mode === "json" ? (
                      <>
                        <div className="json-card-meta">
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
                            title={`${row.event.logGroup} · ${row.event.logStream}`}
                          >
                            {row.event.logStream}
                          </span>
                          <span className="toolbar-spacer" />
                          <button
                            className="event-inspect"
                            onClick={() => setInspectedId(row.event.id)}
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
                        <MessageContent
                          row={row}
                          highlight={preferences.highlightText}
                          compact
                          onAddColumn={addColumn}
                        />
                      </>
                    ) : (
                      <>
                        <div
                          className="log-table-row"
                          role="row"
                          onDoubleClick={() => setInspectedId(row.event.id)}
                        >
                          {view.mode === "hybrid" && (
                            <button
                              className="hybrid-gutter expand-event"
                              aria-label={`${expanded ? "Collapse" : "Expand"} event details`}
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
                                  ? { left: cell.column.getStart("left") + 32 }
                                  : {}),
                              }}
                            >
                              <button
                                className="inspect-cell"
                                aria-label={`Inspect event ${row.event.id}`}
                                onClick={() => setInspectedId(row.event.id)}
                              >
                                {flexRender(
                                  cell.column.columnDef.cell,
                                  cell.getContext(),
                                )}
                              </button>
                            </div>
                          ))}
                        </div>
                        {expanded && view.mode === "hybrid" && (
                          <div className="hybrid-detail">
                            <MessageContent
                              row={row}
                              highlight={preferences.highlightText}
                              compact
                              onAddColumn={addColumn}
                            />
                            <Group gap="xs" mt={6}>
                              <Button
                                size="compact-xs"
                                variant="subtle"
                                onClick={() => setInspectedId(row.event.id)}
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
                              {onContext && (
                                <Button
                                  size="compact-xs"
                                  variant="subtle"
                                  onClick={() => onContext(row.event)}
                                >
                                  Surrounding context
                                </Button>
                              )}
                            </Group>
                          </div>
                        )}
                      </>
                    )}
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>
      <div className="viewer-footer">
        <span>
          {view.mode === "json"
            ? "Expand JSON branches · Inspect for full details"
            : view.mode === "hybrid"
              ? "Expand a row for JSON · Click a cell to inspect"
              : "Click a cell to inspect · Drag column edges to resize"}
        </span>
        <span>Export covers this loaded selection</span>
      </div>

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
              <span className="column-path" title={column.path}>
                {titleFor(column.path)}
              </span>
              <span className="column-width">
                {Math.round(column.width)} px
              </span>
              <Select
                aria-label={`Format ${titleFor(column.path)}`}
                title="Format displayed values"
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
                      config.map((entry) =>
                        entry.path === column.path
                          ? { ...entry, pinned: !entry.pinned }
                          : entry,
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
                    config.filter((entry) => entry.path !== column.path),
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

      <Modal
        opened={Boolean(inspected)}
        onClose={() => setInspectedId(null)}
        title="Event inspector"
        size="xl"
        classNames={{ body: "inspector-modal-body" }}
      >
        {inspected && (
          <>
            <Group justify="space-between" mb="sm">
              <Group gap="xs">
                <Badge color={levelColor[inspected.level]} variant="light">
                  {inspected.level}
                </Badge>
                <Text size="xs" ff="monospace">
                  {timeLabel(inspected.event.timestamp, preferences.timezone)}
                </Text>
              </Group>
              <Group gap={4}>
                <ActionIcon
                  aria-label="Previous event"
                  variant="default"
                  disabled={inspectedIndex <= 0}
                  onClick={() =>
                    setInspectedId(rows[inspectedIndex - 1]!.original.event.id)
                  }
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
                    inspectedIndex < 0 || inspectedIndex >= rows.length - 1
                  }
                  onClick={() =>
                    setInspectedId(rows[inspectedIndex + 1]!.original.event.id)
                  }
                >
                  <IconArrowRight size={15} />
                </ActionIcon>
              </Group>
            </Group>
            <div className="inspector-source">
              <div>
                <span>GROUP</span>
                <code>{inspected.event.logGroup}</code>
              </div>
              <div>
                <span>STREAM</span>
                <code>{inspected.event.logStream || "Insights result"}</code>
              </div>
              <div>
                <span>EVENT</span>
                <code>{inspected.event.id}</code>
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
            <Group justify="space-between" my="sm">
              <SegmentedControl
                size="xs"
                value={inspectorMode}
                onChange={setInspectorMode}
                data={[
                  { value: "structured", label: "Structured" },
                  { value: "raw", label: "Raw message" },
                ]}
              />
              <Group gap="xs">
                {onContext && (
                  <Button
                    size="xs"
                    variant="default"
                    onClick={() => onContext(inspected.event)}
                  >
                    Surrounding context
                  </Button>
                )}
                <Menu withinPortal>
                  <Menu.Target>
                    <Button
                      size="xs"
                      variant="light"
                      leftSection={
                        copied ? (
                          <IconCheck size={13} />
                        ) : (
                          <IconCopy size={13} />
                        )
                      }
                    >
                      Copy
                    </Button>
                  </Menu.Target>
                  <Menu.Dropdown>
                    <Menu.Item onClick={() => copy(inspected.event.message)}>
                      Raw message
                    </Menu.Item>
                    <Menu.Item
                      disabled={inspected.parsed.kind !== "json"}
                      onClick={() =>
                        copy(JSON.stringify(inspected.parsed.value, null, 2))
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
            <div
              className={`inspector-content ${view.wrap ? "inspector-wrap" : ""}`}
              style={{ fontSize: preferences.fontSize }}
            >
              {inspectorMode === "structured" ? (
                <MessageContent
                  row={inspected}
                  highlight={preferences.highlightText}
                  onAddColumn={addColumn}
                />
              ) : (
                <MessageContent
                  row={{ ...inspected, parsed: { kind: "text" } }}
                  highlight={preferences.highlightText}
                />
              )}
            </div>
            <Text size="xs" c="dimmed" mt="sm">
              Expand nested fields. Use the column icon beside a field to add
              its exact JSON Pointer to the table.
            </Text>
            {notice && (
              <Text size="xs" c="cyan" mt="xs" role="status">
                {notice}
              </Text>
            )}
          </>
        )}
      </Modal>
    </div>
  );
}
