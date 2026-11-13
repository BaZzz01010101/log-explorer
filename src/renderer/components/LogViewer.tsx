import {
  useCallback,
  useContext,
  useDeferredValue,
  useId,
  useLayoutEffect,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react";
import { createPortal } from "react-dom";
import {
  ActionIcon,
  Badge,
  Button,
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
  IconEyeOff,
  IconEye,
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
  messagePreview,
  META_COLUMNS,
  DEFAULT_TIMESTAMP_COLUMN_WIDTH,
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
  COPY_TEXT_LIMIT,
  type SelectedEventCopyFormat,
} from "../../shared/event-copy";
import { sourceColumnConfig } from "../source-column";
import { applyColumnAction, isProtectedColumn } from "../column-actions";
import {
  ColumnHeaderMenu,
  type ColumnHeaderMenuTarget,
} from "./ColumnHeaderMenu";
import { eventSourceDisplay, sourceCount } from "../../shared/source-labels";
import { useColumnHeaderDrag } from "../useColumnHeaderDrag";
import { useScrollPagination } from "../useScrollPagination";
import { lockCorrection, newestIndex, RECENT_HOLD_MS, RECENT_START_MS, releasedByInput, type RecentScrollLock } from "../recent-scroll";
import { useMeasuredVirtualRows } from "../useMeasuredVirtualRows";
import {
  useMessageExpansion,
  type MessageExpansionState,
} from "../useMessageExpansion";
import {
  HighlightText,
  MessageContent,
  objectExpansionPaths,
  JsonTreeExpansionContext,
  type JsonExpansionState,
} from "./EventMessage";
import { EventInspector } from "./EventInspector";
import { InspectorMessage } from "./InspectorMessage";
import { ExpandedEventDetails } from "./ExpandedEventDetails";
import { ResizableFilterField } from "./ResizableFilterField";
import { FilterMatchButtons } from "./FilterMatchButtons";
import { useLocalFilter } from "../useLocalFilter";
import { shortcutMatches } from "../shortcuts";
import { clearEditControl } from "../scoped-edit-history";
import { regexError } from "../../shared/highlights";
import { EventOverview } from "./EventOverview";
import { EventLoadingIndicator } from "./EventLoadingIndicator";
import { SurroundingContextMenu } from "./SurroundingContextMenu";
import type { ContextRange } from "../../shared/context-range";
import { contextEventIndex } from "../context-event";
import { LevelFilter } from "./LevelFilter";
import { formatTimestamp } from "../timestamp-format";
import {
  useEventSelection,
  type EventSelectionState,
} from "../useEventSelection";
import { useDeserializedEvents } from "../useDeserializedEvents";
import { eventPageDestination } from "../event-page-navigation";
import {
  EventHighlightContext,
  QuickHighlightContext,
  useEventHighlights,
} from "../useEventHighlights";

interface EventRow {
  event: LogEvent;
  parsed: ParsedMessage;
  level: LogLevel;
}
interface StructuredRowState {
  expanded: Set<string>;
  applied?: number;
  full?: boolean;
  revision?: number;
  choice?: boolean;
  value?: JsonValue;
}
export interface LogViewerInteractionState {
  selection: EventSelectionState;
  expansion: MessageExpansionState;
  details: {
    heights: ReadonlyMap<string, number>;
    recursive?: ReadonlySet<string>;
    onRecursiveExpand?(eventId: string): void;
    onHeightChange(eventId: string, height: number | undefined): void;
  };
}

export interface LogViewerProps {
  events: LogEvent[];
  revealEvent?: LogEvent;
  onEventRevealed?(): void;
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
  pagination?: { scope: string; pageKey?: string; direction?: "older"; loadingOlder?: boolean; onLoad(): void };
  loading?: boolean;
  incomplete?: boolean;
  liveState?: LiveState;
  followLive?: boolean;
  onPauseLiveFollow?(): void;
  onResumeLiveFollow?(): void;
  renderStatus?: (eventsShown: number) => React.ReactNode;
  interactionState?: LogViewerInteractionState;
  onScrollElement?: (element: HTMLDivElement | null) => void;
  onScrollPositionChange?: (element: HTMLDivElement) => void;
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
  { path: "@timestamp", width: DEFAULT_TIMESTAMP_COLUMN_WIDTH, pinned: true },
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
    row = { event, parsed, level: inferLevel(parsed, event.message, event.severity) };
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
  revealEvent,
  onEventRevealed,
  serverFilter = "",
  sourceContext,
  view,
  onViewChange,
  preferences,
  onContext,
  pagination,
  loading = false,
  incomplete,
  liveState,
  followLive = false,
  onPauseLiveFollow,
  onResumeLiveFollow,
  renderStatus,
  interactionState,
  onScrollElement,
  onScrollPositionChange,
}: LogViewerProps) {
  const highlightText = view.highlightText ?? preferences.highlightText;
  const quick = useMemo(
    () => ({
      regex: view.highlightRegex ?? false,
      caseSensitive: view.highlightCaseSensitive ?? false,
    }),
    [view.highlightRegex, view.highlightCaseSensitive],
  );
  const localOptions = useMemo(
    () => ({
      regex: view.localSearchRegex ?? false,
      caseSensitive: view.localSearchCaseSensitive ?? false,
    }),
    [view.localSearchRegex, view.localSearchCaseSensitive],
  );
  const matchShortcut = (
    scope: "highlight" | "localFilter",
    option: "Regex" | "CaseSensitive",
  ) =>
    preferences.shortcuts[`${scope}${option}`] ??
    (option === "Regex" ? "Alt+E" : "Alt+C");
  const toggleMatch = (
    scope: "highlight" | "localFilter",
    option: "Regex" | "CaseSensitive",
  ) => {
    const field =
      scope === "highlight"
        ? option === "Regex"
          ? "highlightRegex"
          : "highlightCaseSensitive"
        : option === "Regex"
          ? "localSearchRegex"
          : "localSearchCaseSensitive";
    const current = currentView.current.view;
    onViewChange({ ...current, [field]: !current[field] });
  };
  const matchKeys = (
    event: ReactKeyboardEvent<HTMLInputElement>,
    scope: "highlight" | "localFilter",
  ) => {
    if (event.nativeEvent.isComposing) return;
    const option = shortcutMatches(event, matchShortcut(scope, "Regex"))
      ? "Regex"
      : shortcutMatches(event, matchShortcut(scope, "CaseSensitive"))
        ? "CaseSensitive"
        : undefined;
    if (!option) return;
    event.preventDefault();
    event.stopPropagation();
    toggleMatch(scope, option);
  };
  const localInput = useRef<HTMLInputElement>(null);
  const highlightInput = useRef<HTMLInputElement>(null);
  const recursiveRequests = useRef(new WeakMap<LogEvent, number>());
  const fittedRequests = useRef(new WeakMap<LogEvent, number>());
  const rowJsonState = useRef(
    new WeakMap<LogEvent, Map<ViewConfig["mode"], StructuredRowState>>(),
  );
  const recursiveSequence = useRef(0);
  const expansion = useMessageExpansion(view.mode, interactionState?.expansion);
  const sharedJsonExpansion = useContext(JsonTreeExpansionContext);
  const [, redrawExpansion] = useState(0);
  const structuredState = (event: LogEvent, parsed?: ParsedMessage) => {
    let modes = rowJsonState.current.get(event);
    if (!modes) {
      modes = new Map();
      rowJsonState.current.set(event, modes);
    }
    let state = modes.get(view.mode);
    if (!state) {
      state = { expanded: new Set([""]) };
      modes.set(view.mode, state);
    }
    // Global commands apply lazily, including to rows arriving later or outside
    // the virtual window. Keep manual branches until another explicit command.
    const choice =
      expansion.isExpanded(event.id) &&
      (view.mode !== "hybrid" || expansion.all);
    const value = (parsed ?? deserialized.parsedFor(event)).value;
    if (
      state.revision !== expansion.revision ||
      (view.mode !== "hybrid" && state.choice !== choice) ||
      (choice && state.value !== value)
    ) {
      state.expanded =
        choice && value !== undefined
          ? objectExpansionPaths(value)
          : new Set([""]);
      state.revision = expansion.revision;
      state.choice = choice;
      state.value = value;
      state.full = choice;
      state.applied = recursiveRequests.current.get(event);
    }
    return state;
  };
  const messageExpansionState = (
    event: LogEvent,
    parsed?: ParsedMessage,
  ): JsonExpansionState => ({
    expanded: structuredState(event, parsed).expanded,
    onChange(update) {
      const state = structuredState(event);
      state.expanded =
        typeof update === "function" ? update(state.expanded) : update;
      redrawExpansion((previous) => previous + 1);
    },
  });
  const jsonExpandRequest = (event: LogEvent) =>
    structuredState(event).applied === recursiveRequests.current.get(event)
      ? undefined
      : recursiveRequests.current.get(event);
  const appliedJsonExpansion = (event: LogEvent) => {
    structuredState(event).applied = recursiveRequests.current.get(event);
    redrawExpansion((previous) => previous + 1);
  };
  const [contextEventId, setContextEventId] = useState<string | undefined>();
  const [contextSelectedText, setContextSelectedText] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);
  const setScrollElement = useCallback(
    (element: HTMLDivElement | null) => {
      scrollRef.current = element;
      onScrollElement?.(element);
    },
    [onScrollElement],
  );
  const [positionedScope, setPositionedScope] = useState("");
  const scrollLock = useRef<RecentScrollLock | null>(null);
  const recentScope = useRef("");
  if (pagination?.scope && recentScope.current !== pagination.scope) {
    recentScope.current = pagination.scope;
    // A new Recent query starts pinned to the newest event at the bottom.
    scrollLock.current =
      pagination.direction === "older" && !pagination.loadingOlder && (events.length === 0 || loading)
        ? { kind: "bottom" }
        : null;
  }
  const rowsRef = useRef<string[]>([]);
  /** Re-applies the active Recent lock against the current layout. */
  const applyScrollLock = () => {
    const scroll = scrollRef.current;
    const lock = scrollLock.current;
    if (!scroll || !lock) return;
    if (lock.kind === "bottom") {
      const bottom = Math.max(0, scroll.scrollHeight - scroll.clientHeight);
      if (Math.abs(scroll.scrollTop - bottom) > 0.5) scroll.scrollTop = bottom;
      return;
    }
    if (performance.now() > lock.expires) {
      scrollLock.current = null;
      return;
    }
    // While the page loads the anchor only follows the viewer (see onScroll).
    if (lock.phase === "tracking") return;
    const top = scroll.getBoundingClientRect().top;
    const element = scroll.querySelector<HTMLElement>(`.virtual-event[data-event-id="${CSS.escape(lock.id)}"]`);
    if (element) {
      const correction = lockCorrection(element.getBoundingClientRect().top - top, lock.offset);
      if (correction) scroll.scrollTop += correction;
      return;
    }
    // The row is outside the rendered range: place it from measurements, then
    // the next layout pass corrects against the rendered row.
    const index = rowsRef.current.indexOf(lock.id);
    const start = index >= 0 ? virtualizer.measurementsCache[index]?.start : undefined;
    const list = scroll.querySelector<HTMLElement>(".virtual-events");
    if (start === undefined || !list) return;
    const base = list.getBoundingClientRect().top - top + scroll.scrollTop;
    scroll.scrollTop = Math.max(0, base + start - lock.offset);
  };
  const applyScrollLockRef = useRef(applyScrollLock);
  applyScrollLockRef.current = applyScrollLock;
  const releaseScrollLock = () => {
    scrollLock.current = releasedByInput(scrollLock.current);
  };
  const recentPaging = pagination?.direction === "older";
  useScrollPagination(scrollRef, {
    scope: pagination?.scope ?? "no-query",
    edge: "bottom",
    enabled: !recentPaging,
    targets: pagination?.pageKey && !recentPaging
      ? [{ key: pagination.pageKey, load: pagination.onLoad }]
      : [],
  });
  // Recent pages load only on explicit requests (see requestOlderPage). The
  // bar shows as soon as a page is requested, before the query state arrives.
  const [olderRequested, setOlderRequested] = useState<string | null>(null);
  const requestedOlderKey = useRef<string | null>(null);
  // Only the viewer's own scrolling (wheel, touch, scrollbar drag) reaching the
  // top asks for a page; keyboard navigation has its own triggers.
  const userScroll = useRef({ inputAt: 0, pointer: false });
  useEffect(() => {
    const release = () => { userScroll.current.pointer = false; };
    window.addEventListener("pointerup", release);
    window.addEventListener("pointercancel", release);
    return () => {
      window.removeEventListener("pointerup", release);
      window.removeEventListener("pointercancel", release);
    };
  }, []);
  const loadingOlder = Boolean(olderRequested) || Boolean(loading && pagination?.loadingOlder);
  /**
   * Requests the next older Recent page. The current first row becomes the
   * first visible row once the page arrives; `keepBottom` keeps the initial
   * bottom pin instead (an underfull view filling itself).
   */
  const requestOlderPage = (keepBottom = false) => {
    const scroll = scrollRef.current;
    const key = pagination?.pageKey;
    if (!recentPaging || !scroll || !key || loading || requestedOlderKey.current === key || (rowsRef.current.length > 0 && positionedScope !== pagination.scope))
      return false;
    requestedOlderKey.current = key;
    const first = rowsRef.current[0];
    if (!keepBottom || scrollLock.current?.kind !== "bottom")
      scrollLock.current = first
        ? {
            kind: "row",
            id: first,
            offset: scroll.querySelector<HTMLElement>(".log-table-header")?.getBoundingClientRect().height ?? 0,
            phase: "tracking",
            awaitingIndicator: true,
            expires: performance.now() + RECENT_START_MS,
          }
        : null;
    setOlderRequested(key);
    pagination.onLoad();
    return true;
  };
  /** Keyboard paging at the top: request a page, or keep a loading bar in view. */
  const requestOlderFromKeyboard = () => {
    if (!requestOlderPage() && loadingOlder && scrollRef.current) scrollRef.current.scrollTop = 0;
  };
  const detailHeights = useRef(new WeakMap<LogEvent, number>());
  const [inspectorMode, setInspectorMode] = useState("structured");
  const [inspectorActionsTarget, setInspectorActionsTarget] =
    useState<HTMLDivElement | null>(null);
  const [columnsOpened, setColumnsOpened] = useState(false);
  const [columnNotice, setColumnNotice] = useState("");
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
  const deserialized = useDeserializedEvents(events, prepare);
  const allRows = deserialized.rows;
  const localFiltered = useLocalFilter(
    allRows,
    localSearch,
    view.levels ?? view.level,
    localOptions,
  );
  const filteredRows = localFiltered.rows;
  const filtering = localSearch !== view.localSearch || localFiltered.pending;
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
  const applyColumns = (columns: ColumnConfig[]) => {
    setColumnNotice("");
    onViewChange({ ...view, columns });
  };
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
  // Retain cell text nodes while row details open, preserving word selection.
  const cellExpansion = useRef({ expansion, messageExpansionState });
  cellExpansion.current = { expansion, messageExpansionState };
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
          if (
            column.path === "@message" &&
            view.mode === "table" &&
            cellExpansion.current.expansion.isExpanded(row.event.id)
          )
            return (
              <div className="table-message-expanded">
                <MessageContent
                  row={row}
                  highlight={highlightText}
                  expansionState={cellExpansion.current.messageExpansionState(
                    row.event,
                    row.parsed,
                  )}
                />
              </div>
            );
          if (column.path === "@source" && automatic) {
            const source = eventSourceDisplay(
              row.event,
              sourceContext?.sources ?? [],
              sourceContext?.connections ?? [],
              sourceContext?.connectionId ?? "",
            );
            return <span className="event-source-label">{source.label}</span>;
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
            <span className={value === undefined ? "cell-missing" : ""}>
              <HighlightText
                text={text || (value === undefined ? "—" : "")}
                needle={highlightText}
                path={preview?.path ?? column.path}
              />
            </span>
          );
        },
      })),
    [config, preferences.timezone, highlightText, sourceContext, view.mode],
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
  rowsRef.current = rows.map((row) => row.id);
  const eventIds = useMemo(
    () => rows.map((row) => row.original.event.id),
    [rows],
  );
  const selection = useEventSelection(
    eventIds,
    true,
    interactionState?.selection,
  );
  useEffect(() => {
    // Selection changes by the viewer release the lock first, so only row
    // updates re-select the newest event here.
    if (scrollLock.current?.kind !== "bottom" || pagination?.direction !== "older" || !rows.length) return;
    const latest = rows[newestIndex(rows.map((row) => row.original.event.timestamp))]!;
    if (selection.selectedId !== latest.original.event.id) selection.select(latest.original.event.id);
  }, [rows, pagination?.direction, pagination?.scope, loading]);
  const selectedEventIds = new Set(selection.selectedIds);
  const viewerId = useId();
  const virtualizer = useVirtualizer<HTMLDivElement, HTMLDivElement>({
    count: rows.length,
    getScrollElement: () => scrollRef.current,
    // Measurement publishes from layout effects; React batches these before
    // paint without attempting flushSync inside a lifecycle method.
    useFlushSync: false,
    estimateSize: (index) =>
      view.mode === "json"
        ? 180
        : expansion.isExpanded(rows[index]!.id)
          ? 260
          : preferences.density === "compact"
            ? 34
            : 44,
    getItemKey: (index) => rows[index]!.id,
    overscan: 7,
  });
  const measureRow = useMeasuredVirtualRows(
    virtualizer,
    [view.mode, view.wrap, preferences.density, preferences.fontSize, expansion.all].join(":"),
  );
  useLayoutEffect(() => {
    if (pagination?.direction !== "older" || !pagination.scope) return;
    if (rows.length && positionedScope !== pagination.scope) setPositionedScope(pagination.scope);
    // The requested page has started (or will not): the query state drives the bar.
    if (olderRequested && pagination.pageKey !== olderRequested) setOlderRequested(null);
    const lock = scrollLock.current;
    const scroll = scrollRef.current;
    if (lock?.kind !== "row" || !scroll) return;
    if (lock.phase === "tracking" && loadingOlder && lock.awaitingIndicator) {
      // The bar opens above the first row: bring it into view.
      lock.awaitingIndicator = false;
      scroll.scrollTop = 0;
    }
    if (lock.phase === "tracking" && loading && pagination.loadingOlder) lock.expires = Infinity;
    if (lock.phase === "tracking" && lock.expires === Infinity && !loading) {
      lock.phase = "holding";
      lock.expires = performance.now() + RECENT_HOLD_MS;
    }
  }, [rows, pagination?.direction, pagination?.scope, pagination?.loadingOlder, pagination?.pageKey, positionedScope, loading, loadingOlder, olderRequested]);
  // An underfull initial view keeps loading older pages while pinned to the bottom.
  useEffect(() => {
    const scroll = scrollRef.current;
    if (scrollLock.current?.kind === "bottom" && scroll && scroll.scrollHeight <= scroll.clientHeight + 1)
      requestOlderPage(true);
  });
  // Every render (row measurement, highlights, prepended pages) re-applies the lock.
  useLayoutEffect(() => applyScrollLock());
  useEffect(() => {
    const scroll = scrollRef.current;
    if (!scroll || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => applyScrollLockRef.current());
    observer.observe(scroll);
    const list = scroll.querySelector(".virtual-events");
    if (list) observer.observe(list);
    return () => observer.disconnect();
  }, [rows.length > 0, view.mode]);
  /**
   * Scrolls the least distance that shows the whole row between the sticky
   * header and the bottom edge. The virtualizer's "auto" alignment ignores the
   * header and the content above the list, so it treats a row clipped by up to
   * that height at the bottom as visible.
   */
  const revealIndex = (index: number) => {
    const scroll = scrollRef.current;
    const element = scroll?.querySelector<HTMLElement>(`.virtual-event[data-index="${index}"]`);
    if (!scroll || !element) {
      virtualizer.scrollToIndex(index, { align: "auto" });
      return;
    }
    const top = scroll.getBoundingClientRect().top;
    const header = scroll.querySelector<HTMLElement>(".log-table-header")?.getBoundingClientRect().height ?? 0;
    const bounds = element.getBoundingClientRect();
    const rowTop = bounds.top - top, rowBottom = bounds.bottom - top;
    if (rowBottom > scroll.clientHeight + 0.5)
      // Taller-than-view rows align their top instead of their bottom.
      scroll.scrollTop += Math.min(rowBottom - scroll.clientHeight, rowTop - header);
    else if (rowTop < header - 0.5) scroll.scrollTop += rowTop - header;
  };
  const inspectedIndex = selection.index;
  useEffect(() => {
    if (!revealEvent) return;
    const index = contextEventIndex(
      rows.map((row) => row.original.event),
      revealEvent,
    );
    if (index < 0) return;
    scrollLock.current = null;
    selection.select(rows[index]!.original.event.id);
    virtualizer.scrollToIndex(index, { align: "center" });
    onEventRevealed?.();
  }, [rows, revealEvent, virtualizer]);
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
    if (!loading || pagination?.direction === "older" || rows.length === 0 || !scroll) return;
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
    quick,
    filters: { server: serverFilter, local: localSearch, localOptions },
    priority: [
      ...visibleItems.map((item) => rows[item.index]!.original.event.id),
      ...(selection.opened && inspected ? [inspected.event.id] : []),
    ],
  });
  const overview = useEventHighlights(overviewEvents, preferences, config, {
    overview: true,
    needle: highlightText,
    quick,
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
  const pendingHighlightNavigation = useRef<{ id: string | null; direction: "next" | "previous"; needle: string } | null>(null);
  const navigateHighlight = (direction: "next" | "previous") => {
    const step = direction === "next" ? 1 : -1;
    const start = selection.index < 0 ? (step > 0 ? -1 : rows.length) : selection.index;
    for (let index = start + step; index >= 0 && index < rows.length; index += step) {
      const result = overview.results.get(rows[index]!.original.event.id);
      if (!result) {
        pendingHighlightNavigation.current = { id: selection.selectedId, direction, needle: highlightText };
        setNotice("Finding highlighted events…");
        return;
      }
      if (result.quickMatch) {
        releaseScrollLock();
        pendingHighlightNavigation.current = null;
        setNotice("");
        onPauseLiveFollow?.();
        selection.select(rows[index]!.original.event.id);
        revealIndex(index);
        return;
      }
    }
    pendingHighlightNavigation.current = null;
    setNotice(direction === "next" ? "No more highlighted events below." : "No more highlighted events above.");
  };
  useEffect(() => {
    const pending = pendingHighlightNavigation.current;
    if (!pending) return;
    if (pending.id !== selection.selectedId || pending.needle !== highlightText || overview.error) {
      pendingHighlightNavigation.current = null;
      return;
    }
    navigateHighlight(pending.direction);
  }, [overview.results, overview.error, selection.selectedId, highlightText, rows]);
  const navigateTo = (index: number) => {
    const row = rows[index];
    if (!row) return;
    releaseScrollLock();
    selection.select(row.original.event.id);
    revealIndex(index);
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
      localSearch: view.localSearchRegex
        ? term
        : [view.localSearch.trim(), term].filter(Boolean).join(" "),
      localSearchRegex: false,
    });
    setNotice(`Added ${path || "root"} to the loaded-event filter.`);
  };
  const toggleExpand = (id: string, recursive = false) => {
    const event = events.find((item) => item.id === id);
    if (event && recursive) {
      structuredState(event).full = true;
      interactionState?.details.onRecursiveExpand?.(id);
      const sequence = ++recursiveSequence.current;
      recursiveRequests.current.set(event, sequence);
      if (!expansion.isExpanded(id)) expansion.toggle(id);
      redrawExpansion((previous) => previous + 1);
    } else {
      if (event) recursiveRequests.current.delete(event);
      expansion.toggle(id);
    }
  };
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
    if (
      filtering ||
      selection.selectedIds.length === 0 ||
      (format === "rows" && view.mode === "json")
    )
      return;
    try {
      const selected = rows
        .filter((row) => selectedEventIds.has(row.original.event.id))
        .map((row) => row.original.event);
      const columns = [
        ...table.getLeftVisibleLeafColumns(),
        ...table.getCenterVisibleLeafColumns(),
        ...table.getRightVisibleLeafColumns(),
      ].map((column) => columnPath(column.id));
      const columnConfig = new Map(
        config.map((column) => [column.path, column]),
      );
      const sourceLabel = (event: LogEvent) =>
        eventSourceDisplay(
          event,
          sourceContext?.sources ?? [],
          sourceContext?.connections ?? [],
          sourceContext?.connectionId ?? "",
        ).label;
      await copy(
        serializeSelectedEvents(
          selected,
          format,
          columns,
          deserialized.parsedFor,
          (event, path, parsed) => {
            const column = columnConfig.get(path);
            const automatic = !column?.format || column.format === "auto";
            if (automatic) {
              if (path === "@timestamp")
                return timeLabel(event.timestamp, preferences.timezone);
              if (path === "@level")
                return inferLevel(parsed, event.message, event.severity).toUpperCase();
              if (path === "@source") return sourceLabel(event);
              if (path === "@message")
                return messagePreview(parsed)?.value ?? event.message;
            }
            return formatColumnValue(
              eventColumnValue(event, parsed, path),
              column?.format,
              preferences.timezone,
              COPY_TEXT_LIMIT,
            );
          },
          sourceContext && sourceCount(sourceContext.sources) > 1
            ? sourceLabel
            : undefined,
          titleFor,
        ),
      );
    } catch (error) {
      setNotice(
        error instanceof Error ? error.message : "Clipboard copy failed.",
      );
    }
  };
  const exportRows = async (extension: "csv" | "json" | "jsonl") => {
    if (filtering || localFiltered.error) return;
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
    <QuickHighlightContext.Provider value={quick}>
      <div
        className={`log-viewer density-${preferences.density}`}
        style={
          { "--log-font-size": `${preferences.fontSize}px` } as CSSProperties
        }
      >
        <div className="viewer-toolbar">
          <ResizableFilterField
            label="Resize local filter field"
            width={view.localSearchWidth}
            defaultWidth={360}
            onResize={(width) =>
              onViewChange({
                ...currentView.current.view,
                localSearchWidth: width,
              })
            }
          >
            <TextInput
              ref={localInput}
              className="local-search"
              aria-label="Local filter loaded events"
              placeholder="Search loaded events…"
              size="xs"
              leftSection={
                <IconSearch size={14} color="var(--mantine-color-green-6)" />
              }
              value={view.localSearch}
              spellCheck={false}
              error={Boolean(localFiltered.error)}
              data-tooltip={localFiltered.error}
              onKeyDown={(event) => {
                matchKeys(event, "localFilter");
                if (!event.defaultPrevented && event.key === "Escape" && !event.nativeEvent.isComposing) {
                  event.preventDefault(); event.stopPropagation();
                  scrollRef.current?.focus({ preventScroll: true });
                  return;
                }
                if (!event.defaultPrevented && event.key === "Enter" && !event.nativeEvent.isComposing && !event.ctrlKey && !event.metaKey && !event.altKey && !event.shiftKey) {
                  event.preventDefault();
                  scrollRef.current?.focus({ preventScroll: true });
                }
              }}
              onChange={(event) =>
                onViewChange({
                  ...view,
                  localSearch: event.currentTarget.value,
                })
              }
              rightSection={
                <Group gap={2} wrap="nowrap">
                  {view.localSearch && (
                    <ActionIcon
                      aria-label="Clear local search"
                      size={22}
                      variant="subtle"
                      onMouseDown={(event) => event.preventDefault()}
                      onClick={() => clearEditControl(localInput.current)}
                    >
                      <IconX size={12} />
                    </ActionIcon>
                  )}
                  <FilterMatchButtons
                    scope="local filter"
                    caseSensitive={localOptions.caseSensitive}
                    regex={localOptions.regex}
                    caseShortcut={matchShortcut("localFilter", "CaseSensitive")}
                    regexShortcut={matchShortcut("localFilter", "Regex")}
                    onCaseChange={() =>
                      toggleMatch("localFilter", "CaseSensitive")
                    }
                    onRegexChange={() => toggleMatch("localFilter", "Regex")}
                  />
                </Group>
              }
              rightSectionWidth={view.localSearch ? 78 : 54}
              rightSectionPointerEvents="all"
            />
          </ResizableFilterField>
          <ResizableFilterField
            label="Resize highlight field"
            width={view.highlightTextWidth}
            defaultWidth={300}
            onResize={(width) =>
              onViewChange({
                ...currentView.current.view,
                highlightTextWidth: width,
              })
            }
          >
            <TextInput
              ref={highlightInput}
              className="quick-highlight"
              aria-label="Highlight text in loaded events"
              placeholder="Highlight text…"
              size="xs"
              leftSection={
                <IconHighlight
                  size={14}
                  color="var(--mantine-color-yellow-6)"
                />
              }
              value={highlightText}
              maxLength={200}
              spellCheck={false}
              error={Boolean(quick.regex && regexError(highlightText))}
              data-tooltip={quick.regex ? regexError(highlightText) : undefined}
              onKeyDown={(event) => {
                matchKeys(event, "highlight");
                if (!event.defaultPrevented && event.key === "Escape" && !event.nativeEvent.isComposing) {
                  event.preventDefault(); event.stopPropagation();
                  scrollRef.current?.focus({ preventScroll: true });
                  return;
                }
                if (!event.defaultPrevented && event.key === "Enter" && !event.nativeEvent.isComposing && !event.ctrlKey && !event.metaKey && !event.altKey && !event.shiftKey) {
                  event.preventDefault();
                  scrollRef.current?.focus({ preventScroll: true });
                }
              }}
              onChange={(event) =>
                onViewChange({
                  ...view,
                  highlightText: event.currentTarget.value,
                })
              }
              rightSection={
                <Group gap={2} wrap="nowrap">
                  {highlightText ? (
                    <ActionIcon
                      aria-label="Clear text highlight"
                      size="xs"
                      variant="subtle"
                      onMouseDown={(event) => event.preventDefault()}
                      onClick={() => clearEditControl(highlightInput.current)}
                    >
                      <IconX size={12} />
                    </ActionIcon>
                  ) : null}
                  <FilterMatchButtons
                    scope="highlight"
                    caseSensitive={quick.caseSensitive}
                    regex={quick.regex}
                    caseShortcut={matchShortcut("highlight", "CaseSensitive")}
                    regexShortcut={matchShortcut("highlight", "Regex")}
                    onCaseChange={() =>
                      toggleMatch("highlight", "CaseSensitive")
                    }
                    onRegexChange={() => toggleMatch("highlight", "Regex")}
                  />
                </Group>
              }
              rightSectionWidth={highlightText ? 78 : 54}
              rightSectionPointerEvents="all"
            />
          </ResizableFilterField>
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
              onClick={() => {
                const next = !expansion.all;
                expansion.toggleAll();
                // Preview themes share JSON branches as well as row expansion.
                if (sharedJsonExpansion)
                  for (const row of allRows)
                    if (row.parsed.kind === "json")
                      sharedJsonExpansion.onChange(
                        row.event.id,
                        next
                          ? objectExpansionPaths(row.parsed.value!)
                          : new Set([""]),
                      );
              }}
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
                disabled={filtering || Boolean(localFiltered.error)}
                leftSection={<IconDownload size={14} />}
              >
                Export
              </Button>
            </Menu.Target>
            <Menu.Dropdown>
              <Menu.Label>
                {rows.length.toLocaleString()} loaded matching events
              </Menu.Label>
              <Menu.Item
                disabled={filtering || Boolean(localFiltered.error)}
                onClick={() => exportRows("jsonl")}
              >
                JSON Lines · full events
              </Menu.Item>
              <Menu.Item
                disabled={filtering || Boolean(localFiltered.error)}
                onClick={() => exportRows("json")}
              >
                JSON · full events
              </Menu.Item>
              <Menu.Item
                disabled={filtering || Boolean(localFiltered.error)}
                onClick={() => exportRows("csv")}
              >
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
                selection.opened
                  ? "Hide event inspector"
                  : "Show event inspector"
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
              ref={setScrollElement}
              // Recent paging anchors rows explicitly; native anchoring would fight it.
              style={pagination?.direction === "older" ? { overflowAnchor: "none" } : undefined}
              onScroll={(event) => {
                const scroll = event.currentTarget;
                const lock = scrollLock.current;
                if (lock?.kind === "row" && lock.phase === "tracking") {
                  // At the top the first row lands just below the header;
                  // scrolled away, the row keeps where the viewer put it.
                  const header = scroll.querySelector<HTMLElement>(".log-table-header")?.getBoundingClientRect().height ?? 0;
                  const row = scroll.querySelector<HTMLElement>(`.virtual-event[data-event-id="${CSS.escape(lock.id)}"]`);
                  if (scroll.scrollTop <= 1) lock.offset = header;
                  else if (row) lock.offset = row.getBoundingClientRect().top - scroll.getBoundingClientRect().top;
                } else if (
                  scroll.scrollTop <= 1 &&
                  lock?.kind !== "bottom" &&
                  (userScroll.current.pointer || performance.now() - userScroll.current.inputAt < 1000)
                )
                  requestOlderPage();
                onScrollPositionChange?.(event.currentTarget);
              }}
              role="grid"
              aria-label="Log events"
              aria-rowcount={rows.length}
              aria-busy={loading || filtering || undefined}
              aria-multiselectable="true"
              aria-activedescendant={
                selection.index >= 0
                  ? `${viewerId}-event-${selection.index}`
                  : undefined
              }
              tabIndex={0}
              onPointerDownCapture={() => {
                releaseScrollLock();
                userScroll.current.pointer = true;
              }}
              onWheel={(event) => {
                releaseScrollLock();
                userScroll.current.inputAt = performance.now();
                if (event.deltaY < 0 && event.currentTarget.scrollTop <= 1) requestOlderPage();
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
              onTouchMove={() => {
                userScroll.current.inputAt = performance.now();
                onPauseLiveFollow?.();
              }}
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
                  target.closest(
                    'input,textarea,select,[contenteditable="true"]',
                  )
                )
                  return;
                const row = target.closest<HTMLElement>("[data-event-id]");
                const id = row?.dataset.eventId;
                if (!id) return;
                event.preventDefault();
                // Snapshot before menu focus can collapse the native selection.
                // Reject selections from the inspector or spanning other rows.
                const textSelection = window.getSelection();
                const ranges = textSelection
                  ? Array.from(
                      { length: textSelection.rangeCount },
                      (_, index) => textSelection.getRangeAt(index),
                    )
                  : [];
                setContextSelectedText(
                  ranges.length > 0 &&
                    ranges.every(
                      (range) =>
                        row.contains(range.startContainer) &&
                        row.contains(range.endContainer),
                    )
                    ? textSelection!.toString()
                    : "",
                );
                if (id && !selectedEventIds.has(id)) selection.select(id);
                setContextEventId(id);
                setColumnMenu(null);
                setContextPosition({ x: event.clientX, y: event.clientY });
              }}
              onKeyDown={(event) => {
                if (event.defaultPrevented) return;
                releaseScrollLock();
                const target = event.target as HTMLElement;
                if (
                  target.closest(
                    'input,textarea,select,[contenteditable="true"],[role="separator"]',
                  ) ||
                  (target.closest("button") &&
                    !target.closest(".inspect-cell,.expand-event"))
                )
                  return;
                if ((event.key === "PageUp" || event.key === "PageDown") && !event.ctrlKey && !event.metaKey && !event.altKey) {
                  const scroll = scrollRef.current;
                  const list = scroll?.querySelector<HTMLElement>(".virtual-events");
                  if (!scroll || !list) return;
                  const header = scroll.querySelector<HTMLElement>(".log-table-header")?.getBoundingClientRect().height ?? 0;
                  const base = list.getBoundingClientRect().top - scroll.getBoundingClientRect().top + scroll.scrollTop;
                  const viewport = Math.max(1, scroll.clientHeight - header);
                  const offset = base - header;
                  const currentTop = Math.max(0, scroll.scrollTop - offset);
                  const maxTop = Math.max(0, scroll.scrollHeight - scroll.clientHeight - offset);
                  const destination = eventPageDestination(virtualizer.measurementsCache, selection.index, currentTop, viewport, maxTop, event.key === "PageUp" ? "up" : "down");
                  if (destination) {
                    event.preventDefault();
                    onPauseLiveFollow?.();
                    scroll.scrollTop = Math.max(0, destination.scrollTop + offset);
                    selection.select(rows[destination.index]!.original.event.id, { range: event.shiftKey });
                  }
                  // Fewer rows above than a page: the page reaches the first row.
                  if (event.key === "PageUp" && (destination?.index ?? selection.index) === 0) {
                    event.preventDefault();
                    requestOlderFromKeyboard();
                  }
                  return;
                }
                if (
                  (event.key === "ArrowLeft" || event.key === "ArrowRight") &&
                  !event.ctrlKey &&
                  !event.metaKey &&
                  !event.altKey &&
                  !event.shiftKey
                ) {
                  const id =
                    target.closest<HTMLElement>(".virtual-event")?.dataset
                      .eventId ?? selection.selectedId;
                  if (!id) return;
                  event.preventDefault();
                  if (selection.selectedId !== id) selection.select(id);
                  if (
                    expansion.isExpanded(id) !==
                    (event.key === "ArrowRight")
                  ) {
                    onPauseLiveFollow?.();
                    toggleExpand(id);
                  }
                  return;
                }
                if ((event.ctrlKey || event.metaKey) && !event.altKey) {
                  if (!event.shiftKey && highlightText && (event.key === "ArrowDown" || event.key === "ArrowUp")) {
                    event.preventDefault(); event.stopPropagation();
                    navigateHighlight(event.key === "ArrowDown" ? "next" : "previous");
                    return;
                  }
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
                    void copySelected(event.shiftKey ? "rows" : "messages");
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
                  const fromFirst = selection.index === 0;
                  const index = selection.move(direction, {
                    range: event.shiftKey,
                    additive:
                      event.shiftKey && (event.ctrlKey || event.metaKey),
                  });
                  if (index >= 0) revealIndex(index);
                  // Home, or Up on the first row, asks for older Recent events.
                  if (direction === "first" || (direction === "previous" && fromFirst && !event.shiftKey))
                    requestOlderFromKeyboard();
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
                filtering ? (
                  <div className="viewer-empty" role="status">
                    <Text size="sm">Filtering loaded events…</Text>
                  </div>
                ) : loading ? (
                  <EventLoadingIndicator position="empty" />
                ) : (
                  <div className="viewer-empty">
                    <IconSearch size={32} stroke={1.2} />
                    <Text size="sm" fw={600}>
                      {events.length
                        ? "No loaded events match this filter"
                        : incomplete
                          ? "No matching events found yet"
                        : liveState === "streaming"
                          ? "Waiting for new events"
                          : liveState === "stopped"
                            ? "Live stopped"
                            : "Ready to investigate"}
                    </Text>
                    <Text size="xs" c="dimmed">
                      {events.length
                        ? "Clear the local search or choose another level."
                        : incomplete
                          ? "Scroll to continue searching older events."
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
                  {loadingOlder && <EventLoadingIndicator position="older" />}
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
                      const marker = overview.results.get(row.event.id)?.overview?.[0];
                      const highlightPending =
                        highlighting.active &&
                        !highlight &&
                        !highlighting.error;
                      return (
                        <EventHighlightContext.Provider
                          key={tableRow.id}
                          value={highlight}
                        >
                          <div
                            className={`virtual-event ${view.mode === "json" ? "json-event-card" : "table-event"}${view.mode === "json" && marker ? " has-highlight-marker" : ""} level-${row.level}${selectedEventIds.has(row.event.id) ? " event-selected" : ""}`}
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
                                scrollRef.current?.focus({
                                  preventScroll: true,
                                });
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
                                  toggleExpand(
                                    row.event.id,
                                    event.ctrlKey || event.metaKey,
                                  );
                              } else selection.inspect(row.event.id);
                            }}
                            data-index={virtualRow.index}
                            ref={measureRow}
                            style={
                              {
                                "--event-highlight-bg":
                                  highlight?.row.background,
                                "--event-highlight-fg":
                                  highlight?.row.foreground,
                                "--event-marker-color": marker,
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
                                    onClick={(event) =>
                                      toggleExpand(
                                        row.event.id,
                                        event.ctrlKey || event.metaKey,
                                      )
                                    }
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
                                  <span className="event-source">
                                    {row.event.logStream}
                                  </span>
                                </div>
                                <div className="event-message-details">
                                  <MessageContent
                                    row={row}
                                    highlight={highlightText}
                                    expandRequest={jsonExpandRequest(row.event)}
                                    expansionState={messageExpansionState(
                                      row.event,
                                    )}
                                    onExpansionApplied={() =>
                                      appliedJsonExpansion(row.event)
                                    }
                                    compact={
                                      !structuredState(row.event).full &&
                                      !interactionState?.details.recursive?.has(
                                        row.event.id,
                                      )
                                    }
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
                                      onClick={(event) =>
                                        toggleExpand(
                                          row.event.id,
                                          event.ctrlKey || event.metaKey,
                                        )
                                      }
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
                                      className={`log-cell ${cell.column.getIsPinned() ? "pinned" : ""}${columnPath(cell.column.id) === "@message" && marker ? " has-highlight-marker" : ""}`}
                                      role="cell"
                                      key={cell.id}
                                      style={{
                                        ...pinStyle(cell.column),
                                        ...(cell.column.getIsPinned() &&
                                        view.mode === "hybrid"
                                          ? {
                                              left:
                                                cell.column.getStart("left") +
                                                32,
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
                                {view.mode === "hybrid" && expanded && (
                                  <ExpandedEventDetails
                                    eventId={row.event.id}
                                    autoFitRequest={
                                      fittedRequests.current.get(row.event) ===
                                      recursiveRequests.current.get(row.event)
                                        ? undefined
                                        : recursiveRequests.current.get(
                                            row.event,
                                          )
                                    }
                                    onAutoFitApplied={() => {
                                      const request =
                                        recursiveRequests.current.get(
                                          row.event,
                                        );
                                      if (request !== undefined)
                                        fittedRequests.current.set(
                                          row.event,
                                          request,
                                        );
                                    }}
                                    height={
                                      interactionState
                                        ? (interactionState.details.heights.get(
                                            row.event.id,
                                          ) ?? null)
                                        : undefined
                                    }
                                    initialHeight={detailHeights.current.get(
                                      row.event,
                                    )}
                                    onHeightChange={(height) => {
                                      if (interactionState) {
                                        interactionState.details.onHeightChange(
                                          row.event.id,
                                          height,
                                        );
                                        return;
                                      }
                                      if (height === undefined)
                                        detailHeights.current.delete(row.event);
                                      else
                                        detailHeights.current.set(
                                          row.event,
                                          height,
                                        );
                                    }}
                                    onResizeStart={() => {
                                      const request =
                                        recursiveRequests.current.get(
                                          row.event,
                                        );
                                      if (request !== undefined)
                                        fittedRequests.current.set(
                                          row.event,
                                          request,
                                        );
                                      onPauseLiveFollow?.();
                                    }}
                                  >
                                    <MessageContent
                                      row={row}
                                      highlight={highlightText}
                                      expandRequest={jsonExpandRequest(
                                        row.event,
                                      )}
                                      expansionState={messageExpansionState(
                                        row.event,
                                      )}
                                      onExpansionApplied={() =>
                                        appliedJsonExpansion(row.event)
                                      }
                                      compact={
                                        !structuredState(row.event).full &&
                                        !interactionState?.details.recursive?.has(
                                          row.event.id,
                                        )
                                      }
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
              {loading && rows.length > 0 && !pagination?.loadingOlder && (
                <EventLoadingIndicator position="more" />
              )}
            </div>
            <Menu
              withinPortal
              position="bottom-start"
              hideDetached={false}
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
                  disabled={contextSelectedText.length === 0}
                  onClick={() => void copy(contextSelectedText)}
                >
                  Copy selected text
                </Menu.Item>
                <Menu.Item
                  leftSection={<IconCopy size={14} />}
                  disabled={
                    contextSelectedText.length > 0 ||
                    selection.selectedIds.length === 0 ||
                    filtering
                  }
                  onClick={() => void copySelected("messages")}
                >
                  Copy selected messages
                </Menu.Item>
                {view.mode !== "json" && (
                  <Menu.Item
                    leftSection={<IconCopy size={14} />}
                    disabled={
                      contextSelectedText.length > 0 ||
                      selection.selectedIds.length === 0 ||
                      filtering
                    }
                    onClick={() => void copySelected("rows")}
                  >
                    Copy selected rows
                  </Menu.Item>
                )}
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
                scrollLock.current = null;
                selection.select(rows[index]!.original.event.id);
                virtualizer.scrollToIndex(index, { align: "center" });
              }}
            />
          </div>
          <EventInspector
            opened={selection.opened}
            eventId={inspected?.event.id}
          >
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
                            inspectorInfoCollapsed:
                              !view.inspectorInfoCollapsed,
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
                              inspected.event.logStream || "Not provided"
                            }
                          >
                            {inspected.event.logStream || "Not provided"}
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
                            variant="subtle"
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
                      (view.inspectorWrap ?? true)
                        ? "inspector-wrap"
                        : undefined
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
                        deserializedPaths={deserialized.pathsFor(
                          inspected.event,
                        )}
                        onAddFilter={addFilter}
                        controls
                        defaultExpanded={view.inspectorExpanded}
                        onToggleAll={(expanded) =>
                          onViewChange({ ...view, inspectorExpanded: expanded })
                        }
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
                        controls
                        defaultExpanded={view.inspectorExpanded}
                        onToggleAll={(expanded) =>
                          onViewChange({ ...view, inspectorExpanded: expanded })
                        }
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
        {(localFiltered.error || highlighting.error || overview.error) && (
          <Text size="xs" c="orange" role="status">
            {localFiltered.error || highlighting.error || overview.error}
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
                className={`column-config ${draggedColumn === column.path ? "column-dragging" : ""}${column.hidden ? " column-hidden" : ""}`}
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
                <Tooltip label={column.hidden ? "Show column" : "Hide column"}>
                  <ActionIcon
                    aria-label={`${column.hidden ? "Show" : "Hide"} ${titleFor(column.path)}`}
                    aria-pressed={!column.hidden}
                    variant="subtle"
                    color={column.hidden ? "gray" : undefined}
                    onClick={() => {
                      const hidden = !column.hidden;
                      if (
                        hidden &&
                        config.filter((entry) => !entry.hidden).length === 1
                      ) {
                        setColumnNotice("Keep at least one column visible.");
                        return;
                      }
                      setColumnNotice("");
                      applyColumns(
                        config.map((entry) =>
                          entry.path === column.path
                            ? { ...entry, hidden }
                            : entry,
                        ),
                      );
                    }}
                  >
                    {column.hidden ? (
                      <IconEyeOff size={15} />
                    ) : (
                      <IconEye size={15} />
                    )}
                  </ActionIcon>
                </Tooltip>
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
                    aria-pressed={column.pinned ?? false}
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
                {isProtectedColumn(column.path) ? (
                  <span
                    className="column-delete-placeholder"
                    aria-hidden="true"
                  />
                ) : (
                  <ActionIcon
                    aria-label={`Remove ${titleFor(column.path)}`}
                    variant="subtle"
                    color="gray"
                    disabled={
                      applyColumnAction(config, column.path, "remove") ===
                      config
                    }
                    onClick={() =>
                      applyColumns(
                        applyColumnAction(config, column.path, "remove"),
                      )
                    }
                  >
                    <IconX size={14} />
                  </ActionIcon>
                )}
              </div>
            ))}
          </div>
          {columnNotice && (
            <Text size="xs" c="orange" mt="xs" role="status">
              {columnNotice}
            </Text>
          )}
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
    </QuickHighlightContext.Provider>
  );
}
