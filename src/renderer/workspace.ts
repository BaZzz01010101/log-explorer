import { DEFAULT_SHORTCUTS } from "./shortcut-definitions";
import type {
  Connection,
  Favorite,
  ViewFavorite,
  LogSource,
  LogTab,
  Pane,
  SplitEdge,
  SplitTab,
  PaneLayout,
  Preferences,
  SavedQuery,
  ViewConfig,
  VisualizationPreset,
  Workspace,
} from "../shared/contracts";
import { tabTitle, sourceCount } from "../shared/source-labels";
import { historyRetentionDays, recentClosedTabs } from "./closed-tab-history";
import { LOG_LEVELS, DEFAULT_TIMESTAMP_COLUMN_WIDTH } from "../shared/log-data";
import { parseHighlightProfiles } from "../shared/highlights";
import {
  legacyLayout,
  normalizeLayout,
  removeLayoutPane,
  splitLayout,
  resizeLayout,
  mapLayoutIds,
  nextSplitAxis,
  MAX_SPLIT_PANES,
  MAX_LAYOUT_DEPTH,
} from "../shared/pane-layout";
import {
  activeEntryId,
  workspaceEntries,
  logTabLabel,
  type WorkspaceEntry,
} from "./workspace-entries";
import { parseRelativePreset } from "./query-state";
import { normalizeRelativeTimeTemplates } from "../shared/relative-time-templates";
import { decodeResourceDrop, mergeSources } from "./source-management";
import type { ResourcePayload, ResourceActionMode } from "./resource-drag";
import {
  DEFAULT_RECENT_SEARCHES_LIMIT,
  MAX_RECENT_SEARCHES_LIMIT,
} from "../shared/query-history";

export type WorkspaceAction =
  | { type: "gcp/open-source"; connection: Connection; source: LogSource; mode: "preview" | "permanent" }
  | {
      type: "resources/apply";
      payload: ResourcePayload;
      mode: ResourceActionMode;
    }
  | { type: "tab/open"; tab: LogTab; paneId?: string }
  | { type: "tab/preview" | "tab/open-resource"; tab: LogTab; paneId?: string }
  | { type: "tab/promote"; tabId: string }
  | { type: "tab/pin"; tabId: string; pinned: boolean }
  | {
      type: "tab/move";
      tabId: string;
      beforeTabId: string | null;
      pinned: boolean;
    }
  | {
      type: "tabs/insert";
      tabs: LogTab[];
      beforeTabId: string | null;
      pinned: boolean;
    }
  | { type: "tab/duplicate"; tabId: string }
  | { type: "tab/rename"; tabId: string; title: string }
  | { type: "split/exit"; tabId: string }
  | { type: "connection/select"; connectionId: string }
  | { type: "pane/swap"; paneId: string; overPaneId: string }
  | {
      type: "pane/detach";
      tabId: string;
      beforeTabId: string | null;
      pinned?: boolean;
    }
  | {
      type: "tab/select";
      tabId: string;
      paneId?: string;
      preserveConnection?: boolean;
    }
  | { type: "tab/update"; tabId: string; patch: Partial<LogTab> }
  | { type: "tab/close"; tabId: string; allowPinned?: boolean }
  | { type: "tab/reopen"; tabId?: string }
  | { type: "tab/reorder"; tabId: string; beforeTabId: string | null }
  | { type: "pane/split"; tabId?: string; paneId?: string; edge?: SplitEdge }
  | {
      type: "pane/drop-tab";
      tabId: string;
      paneId: string;
      edge: SplitEdge | null;
    }
  | {
      type: "pane/drop-resource";
      tab: LogTab | LogTab[];
      paneId: string;
      edge: SplitEdge | null;
    }
  | { type: "pane/show-tabs"; tabIds: string[] }
  | { type: "pane/resize"; path: string; ratio: number }
  | { type: "pane/close"; paneId: string }
  | { type: "pane/assign"; paneId: string; tabId: string | null }
  | { type: "pane/reorder"; paneId: string; beforePaneId: string | null }
  | { type: "pane/activate"; paneId: string }
  | { type: "connections/set"; connections: Connection[] }
  | { type: "preferences/update"; patch: Partial<Preferences> }
  | { type: "favorites/save"; tabId: string }
  | { type: "favorites/rename"; favoriteId: string; title: string }
  | { type: "favorites/open" | "favorites/remove"; favoriteId: string }
  | { type: "recents/add"; favorite: Favorite }
  | { type: "query/save"; query: SavedQuery }
  | { type: "query/remove"; queryId: string }
  | { type: "history/add"; query: SavedQuery }
  | { type: "preset/save"; preset: VisualizationPreset }
  | { type: "preset/remove"; presetId: string }
  | {
      type: "workspace/update";
      patch: Partial<
        Pick<
          Workspace,
          "name" | "sidebarWidth" | "sidebarVisible" | "splitSizes"
        >
      >;
    }
  | { type: "workspace/restore"; workspace: unknown };
const OFFLINE_CONNECTION: Connection = {
  id: "offline",
  name: "Offline fixtures",
  profile: "default",
  region: "eu-west-1",
  mode: "offline",
};
const DEFAULT_PREFERENCES: Preferences = {
  profileVisibility: {},
  theme: "dark",
  density: "compact",
  tabBarLayout: "scroll",
  pinnedTabsSeparateRow: false,
  settingsDetached: false,
  closedTabHistoryDays: 7,
  recentSearchesLimit: DEFAULT_RECENT_SEARCHES_LIMIT,
  fontSize: 12,
  maxEvents: 10000,
  sourceDetailsHeight: 220,
  timezone: "local",
  highlightText: "",
  autoExpandFilterMatches: true,
  shortcuts: { ...DEFAULT_SHORTCUTS },
};
const record = (value: unknown): Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
const string = (value: unknown, fallback = "", max = 10000): string =>
  typeof value === "string" ? value.slice(0, max) : fallback;
const number = (
  value: unknown,
  fallback: number,
  min: number,
  max: number,
): number =>
  typeof value === "number" && Number.isFinite(value)
    ? Math.min(max, Math.max(min, value))
    : fallback;
const list = (value: unknown, max = 100): unknown[] =>
  Array.isArray(value) ? value.slice(0, max) : [];
function unique<T extends { id: string }>(items: T[]): T[] {
  const ids = new Set<string>();
  return items.filter(
    (item) => item.id && !ids.has(item.id) && Boolean(ids.add(item.id)),
  );
}
function nextId(prefix: string, items: { id: string }[]): string {
  let index = 1;
  while (items.some((item) => item.id === prefix + "-" + index)) index++;
  return prefix + "-" + index;
}
/** View IDs and combined entry IDs share one namespace, including reopen history. */
function entryIdentities(
  state: Workspace,
  additional: { id: string }[] = [],
): { id: string }[] {
  return [
    ...state.tabs,
    ...(state.splitTabs ?? []),
    ...state.closedTabs,
    ...additional,
  ];
}
function defaultView(): ViewConfig {
  return {
    mode: "hybrid",
    columns: [
      {
        path: "@timestamp",
        width: DEFAULT_TIMESTAMP_COLUMN_WIDTH,
        pinned: true,
      },
      { path: "@level", width: 84 },
      { path: "@message", width: 560 },
    ],
    localSearch: "",
    highlightText: "",
    inspectorInfoCollapsed: false,
    inspectorWrap: true,
    level: "",
    levels: [...LOG_LEVELS],
    wrap: false,
  };
}
function parseView(value: unknown): ViewConfig {
  const raw = record(value);
  const defaults = defaultView();
  const columns = Array.isArray(raw.columns)
    ? list(raw.columns, 80)
        .map((value) => {
          const column = record(value);
          return {
            path: string(column.path, "", 2048),
            width: number(column.width, 150, 40, 2000),
            ...(["auto", "json", "bytes", "milliseconds", "datetime"].includes(
              String(column.format),
            )
              ? {
                  format: column.format as
                    "auto" | "json" | "bytes" | "milliseconds" | "datetime",
                }
              : {}),
            ...(typeof column.pinned === "boolean"
              ? { pinned: column.pinned }
              : {}),
            ...(typeof column.hidden === "boolean"
              ? { hidden: column.hidden }
              : {}),
          };
        })
        .filter((column) => column.path)
    : defaults.columns;
  const sort = record(raw.sort);
  const stock = [
    ["@timestamp", 194],
    ["@level", 84],
    ["/service/name", 150],
    ["@message", 420],
    ["/request/id", 220],
  ];
  const legacyStock =
    columns.length === stock.length &&
    columns.every(
      (column, index) =>
        column.path === stock[index][0] &&
        column.width === stock[index][1] &&
        !column.hidden &&
        (!column.format || column.format === "auto") &&
        Boolean(column.pinned) === (index === 0),
    );
  return {
    mode: raw.mode === "table" || raw.mode === "json" ? raw.mode : "hybrid",
    columns: (legacyStock
      ? columns.filter(
          (column) =>
            column.path !== "/service/name" && column.path !== "/request/id",
        )
      : columns
    )
      .map((column) =>
        column.path === "@timestamp" &&
        column.width === 194 &&
        (!column.format || column.format === "auto")
          ? { ...column, width: DEFAULT_TIMESTAMP_COLUMN_WIDTH }
          : column,
      )
      .filter(
        (column, index, current) =>
          current.findIndex((other) => other.path === column.path) === index,
      ),
    localSearch: string(raw.localSearch),
    ...(typeof raw.localSearchRegex === "boolean"
      ? { localSearchRegex: raw.localSearchRegex }
      : {}),
    ...(typeof raw.localSearchCaseSensitive === "boolean"
      ? { localSearchCaseSensitive: raw.localSearchCaseSensitive }
      : {}),
    inspectorInfoCollapsed: raw.inspectorInfoCollapsed === true,
    inspectorWrap: raw.inspectorWrap !== false,
    ...(typeof raw.inspectorExpanded === "boolean"
      ? { inspectorExpanded: raw.inspectorExpanded }
      : {}),
    ...(typeof raw.highlightText === "string"
      ? { highlightText: string(raw.highlightText, "", 200) }
      : {}),
    ...(typeof raw.highlightRegex === "boolean"
      ? { highlightRegex: raw.highlightRegex }
      : {}),
    ...(typeof raw.highlightCaseSensitive === "boolean"
      ? { highlightCaseSensitive: raw.highlightCaseSensitive }
      : {}),
    ...(typeof raw.localSearchWidth === "number"
      ? { localSearchWidth: number(raw.localSearchWidth, 360, 140, 2400) }
      : {}),
    ...(typeof raw.highlightTextWidth === "number"
      ? { highlightTextWidth: number(raw.highlightTextWidth, 300, 140, 2400) }
      : {}),
    level: string(raw.level, "", 40),
    levels: Array.isArray(raw.levels)
      ? [
          ...new Set(
            raw.levels.filter(
              (level): level is string =>
                typeof level === "string" &&
                LOG_LEVELS.some((known) => known === level),
            ),
          ),
        ].slice(0, LOG_LEVELS.length)
      : LOG_LEVELS.some((known) => known === raw.level)
        ? [String(raw.level)]
        : [...LOG_LEVELS],
    wrap: raw.wrap === true,
    ...(typeof sort.path === "string"
      ? {
          sort: { path: string(sort.path, "", 2048), desc: sort.desc === true },
        }
      : {}),
  };
}
function parseSources(value: unknown): LogSource[] {
  const sources = list(value, 50)
    .map((value) => {
      const raw = record(value);
      const google = record(raw.gcp);
      const googleKind: "function" | "kubernetes" | undefined = google.kind === "function" || google.kind === "kubernetes" ? google.kind : undefined;
      const gcp: LogSource["gcp"] = googleKind ? {
        kind: googleKind,
        project: string(google.project, "", 30),
        region: string(google.region, "", 40),
        ...(typeof google.functionName === "string" ? { functionName: string(google.functionName, "", 253) } : {}),
        ...(google.generation === "v1" || google.generation === "v2" ? { generation: google.generation } : {}),
        ...(typeof google.service === "string" ? { service: string(google.service, "", 253) } : {}),
        ...(typeof google.cluster === "string" ? { cluster: string(google.cluster, "", 253) } : {}),
        ...(typeof google.namespace === "string" ? { namespace: string(google.namespace, "", 253) } : {}),
        ...(typeof google.container === "string" ? { container: string(google.container, "", 253) } : {}),
      } : undefined;
      const logStreams = list(raw.logStreams, 100)
        .filter((stream): stream is string => typeof stream === "string")
        .map((stream) => stream.slice(0, 512))
        .filter(Boolean);
      return {
        logGroup: string(raw.logGroup, "", 512),
        ...(typeof raw.connectionId === "string" && raw.connectionId
          ? { connectionId: string(raw.connectionId, "", 160) }
          : {}),
        ...(logStreams.length ? { logStreams: [...new Set(logStreams)] } : {}),
        ...(gcp ? { gcp } : {}),
      };
    })
    .filter((source) => source.logGroup);
  return sources.filter(
    (source, index) =>
      sources.findIndex(
        (other) =>
          other.logGroup === source.logGroup &&
          other.connectionId === source.connectionId &&
          JSON.stringify(other.gcp) === JSON.stringify(source.gcp) &&
          JSON.stringify(other.logStreams) ===
            JSON.stringify(source.logStreams),
      ) === index,
  );
}
function baseTab(
  id: string,
  connectionId: string,
  sources: LogSource[],
): LogTab {
  return {
    id,
    connectionId,
    sources: parseSources(sources),
    title: tabTitle(sources),
    kind: "events",
    filterPattern: "",
    filterMode: "auto",
    query: "",
    timePreset: "clear",
    view: defaultView(),
  };
}
function parseTab(value: unknown, connections: Connection[]): LogTab | null {
  const raw = record(value);
  const id = string(raw.id, "", 160);
  const connectionId = string(raw.connectionId, "", 160);
  if (!id || !connections.some((connection) => connection.id === connectionId))
    return null;
  const sources = parseSources(raw.sources).filter(
    (source) =>
      !source.connectionId ||
      connections.some((connection) => connection.id === source.connectionId),
  );
  const defaults = baseTab(id, connectionId, sources);
  return {
    ...defaults,
    ...(typeof raw.closedAt === "number" &&
    Number.isFinite(raw.closedAt) &&
    raw.closedAt >= 0
      ? { closedAt: raw.closedAt }
      : {}),
    ...(typeof raw.preview === "boolean" ? { preview: raw.preview } : {}),
    ...(typeof raw.pinned === "boolean"
      ? { pinned: raw.pinned, ...(raw.pinned ? { preview: false } : {}) }
      : {}),
    title: string(raw.title, defaults.title, 512),
    ...(typeof raw.customTitle === "string" && raw.customTitle.trim()
      ? { customTitle: string(raw.customTitle, "", 512) }
      : {}),
    kind: "events",
    filterPattern: string(raw.filterPattern),
    filterMode:
      raw.filterMode === "plain" || raw.filterMode === "auto"
        ? raw.filterMode
        : "pattern",
    ...(raw.gcpLogType === "audit" || raw.gcpLogType === "execution" ? { gcpLogType: raw.gcpLogType } : {}),
    query: string(raw.query, defaults.query, 10000),
    timePreset:
      ["clear", "custom"].includes(String(raw.timePreset)) ||
      parseRelativePreset(String(raw.timePreset))
        ? String(raw.timePreset)
        : "1h",
    ...(typeof raw.customStart === "string"
      ? { customStart: string(raw.customStart, "", 100) }
      : {}),
    ...(typeof raw.customEnd === "string"
      ? { customEnd: string(raw.customEnd, "", 100) }
      : {}),
    view: parseView(raw.view),
  };
}
function parseConnection(value: unknown): Connection | null {
  const raw = record(value);
  const id = string(raw.id, "", 160);
  if (!id) return null;
  const region = string(raw.region, "eu-west-1", 40);
  const google = record(raw.gcpIdentity);
  const googleIdentity = raw.mode === "gcp" && typeof google.configuration === "string" && !!google.configuration && typeof google.account === "string" && !!google.account ? { configuration: string(google.configuration, "", 256), account: string(google.account, "", 256), ...(typeof google.quotaProject === "string" && google.quotaProject ? { quotaProject: string(google.quotaProject, "", 256) } : {}) } : undefined;
  if (raw.mode === "gcp" && !googleIdentity) return null;
  return {
    id,
    name: string(raw.name, "Connection", 120) || "Connection",
    profile: string(raw.profile, "default", 256) || "default",
    region: (raw.mode === "gcp" ? /^[a-z][a-z0-9-]{1,39}$/ : /^[a-z]{2}(?:-[a-z]+)+-\d+$/).test(region) ? region : "eu-west-1",
    mode: raw.mode === "gcp" ? "gcp" : raw.mode === "aws" ? "aws" : "offline",
    ...(googleIdentity ? { gcpIdentity: googleIdentity } : {}),
    ...(typeof raw.enabled === "boolean" ? { enabled: raw.enabled } : {}),
  };
}
function parsePreferences(value: unknown): Preferences {
  const raw = record(value);
  const storedShortcuts = record(raw.shortcuts);
  const shortcuts: Record<string, string> = {
    ...DEFAULT_PREFERENCES.shortcuts,
  };
  for (const [name, shortcut] of Object.entries(storedShortcuts).slice(0, 50)) {
    if (
      Object.hasOwn(DEFAULT_PREFERENCES.shortcuts, name) &&
      typeof shortcut === "string"
    )
      shortcuts[name] = shortcut.slice(0, 80);
  }
  if (
    !Object.hasOwn(storedShortcuts, "recentTab") &&
    shortcuts.nextTab === "Control+Tab"
  )
    shortcuts.nextTab = DEFAULT_PREFERENCES.shortcuts.nextTab;
  if (
    !Object.hasOwn(storedShortcuts, "previousRecentTab") &&
    shortcuts.previousTab === "Control+Shift+Tab"
  )
    shortcuts.previousTab = DEFAULT_PREFERENCES.shortcuts.previousTab;
  return {
    theme: raw.theme === "light" ? "light" : "dark",
    density: raw.density === "comfortable" ? "comfortable" : "compact",
    tabBarLayout: raw.tabBarLayout === "wrap" ? "wrap" : "scroll",
    pinnedTabsSeparateRow: raw.pinnedTabsSeparateRow === true,
    settingsDetached: raw.settingsDetached === true,
    gcpProjectId: string(raw.gcpProjectId, "", 30),
    gcpConfiguration: string(raw.gcpConfiguration, "", 256),
    gcpAccount: string(raw.gcpAccount, "", 256),
    closedTabHistoryDays: historyRetentionDays(raw.closedTabHistoryDays),
    recentSearchesLimit: Math.round(
      number(
        raw.recentSearchesLimit,
        DEFAULT_RECENT_SEARCHES_LIMIT,
        1,
        MAX_RECENT_SEARCHES_LIMIT,
      ),
    ),
    relativeTimeTemplates: normalizeRelativeTimeTemplates(
      raw.relativeTimeTemplates,
    ),
    fontSize: number(raw.fontSize, 12, 10, 20),
    maxEvents: Math.round(number(raw.maxEvents, 10000, 100, 100000)),
    sourceDetailsHeight: number(raw.sourceDetailsHeight, 220, 80, 1000),
    timezone: raw.timezone === "utc" ? "utc" : "local",
    highlightText: string(raw.highlightText, "", 1000),
    autoExpandFilterMatches: raw.autoExpandFilterMatches !== false,
    highlightProfiles: parseHighlightProfiles(raw.highlightProfiles),
    profileVisibility: Object.fromEntries(
      Object.entries(record(raw.profileVisibility))
        .filter(
          ([key, value]) =>
            key.length > 0 && key.length <= 256 && typeof value === "boolean",
        )
        .slice(0, 50),
    ) as Record<string, boolean>,
    shortcuts,
  };
}
function parseFavorite(
  value: unknown,
  connections: Connection[],
): Favorite | null {
  const raw = record(value);
  const connectionId = string(raw.connectionId, "", 160);
  const logGroup = string(raw.logGroup, "", 512);
  if (
    !logGroup ||
    !connections.some((connection) => connection.id === connectionId)
  )
    return null;
  return {
    connectionId,
    logGroup,
    ...(typeof raw.logStream === "string"
      ? { logStream: string(raw.logStream, "", 512) }
      : {}),
  };
}
function sameFavorite(one: Favorite, two: Favorite): boolean {
  return (
    one.connectionId === two.connectionId &&
    one.logGroup === two.logGroup &&
    one.logStream === two.logStream
  );
}
function parseQuery(value: unknown): SavedQuery | null {
  const raw = record(value);
  const id = string(raw.id, "", 160);
  if (!id) return null;
  return {
    id,
    name: string(raw.name, "Saved query", 256),
    kind: raw.kind === "insights" ? "insights" : "events",
    text: string(raw.text, "", 10000),
    ...(raw.filterMode === "plain" ||
    raw.filterMode === "auto" ||
    raw.filterMode === "pattern"
      ? { filterMode: raw.filterMode }
      : {}),
  };
}
function parsePreset(value: unknown): VisualizationPreset | null {
  const raw = record(value);
  const id = string(raw.id, "", 160);
  if (!id) return null;
  return {
    id,
    name: string(raw.name, "View preset", 120),
    view: parseView(raw.view),
    ...(typeof raw.logGroup === "string"
      ? { logGroup: string(raw.logGroup, "", 512) }
      : {}),
  };
}
function reorder<T extends { id: string }>(
  items: T[],
  id: string,
  beforeId: string | null,
): T[] {
  const item = items.find((item) => item.id === id);
  if (
    !item ||
    id === beforeId ||
    (beforeId !== null && !items.some((item) => item.id === beforeId))
  )
    return items;
  const rest = items.filter((item) => item.id !== id);
  const index =
    beforeId === null
      ? rest.length
      : rest.findIndex((item) => item.id === beforeId);
  return [...rest.slice(0, index), item, ...rest.slice(index)];
}
function assignPane(
  state: Workspace,
  paneId: string,
  tabId: string | null,
): Workspace {
  if (
    !state.panes.some((pane) => pane.id === paneId) ||
    (tabId !== null && !state.tabs.some((tab) => tab.id === tabId))
  )
    return state;
  if (
    state.activePaneId === paneId &&
    state.panes.find((pane) => pane.id === paneId)?.tabId === tabId
  )
    return state;
  return {
    ...state,
    activePaneId: paneId,
    panes: state.panes.map((pane) => ({
      ...pane,
      tabId:
        pane.id === paneId
          ? tabId
          : pane.tabId === tabId && tabId !== null
            ? null
            : pane.tabId,
    })),
  };
}
function cleanLinks(state: Workspace): Workspace {
  const exists = (id: string) =>
    state.connections.some((connection) => connection.id === id);
  const validConnection = (tab: LogTab) =>
    exists(tab.connectionId) ||
    tab.sources.some(
      (source) => source.connectionId && exists(source.connectionId),
    );
  const cleanTab = (tab: LogTab): LogTab => {
    const sources = tab.sources.filter((source) =>
      exists(source.connectionId ?? tab.connectionId),
    );
    const connectionId = exists(tab.connectionId)
      ? tab.connectionId
      : sources[0].connectionId!;
    if (
      sources.length !== tab.sources.length ||
      connectionId !== tab.connectionId
    ) {
      tab = {
        ...tab,
        connectionId,
        sources: sources.map((source) =>
          source.connectionId === connectionId
            ? {
                logGroup: source.logGroup,
                ...(source.logStreams ? { logStreams: source.logStreams } : {}),
              }
            : source,
        ),
        ...(!tab.customTitle ? { title: tabTitle(sources) } : {}),
      };
    }
    return tab;
  };
  const tabs = state.tabs.filter(validConnection).map(cleanTab);
  const closedTabs = state.closedTabs.filter(validConnection).map(cleanTab);
  const panes = state.panes.map((pane) => ({
    ...pane,
    tabId: tabs.some((tab) => tab.id === pane.tabId) ? pane.tabId : null,
  }));
  return {
    ...state,
    tabs,
    closedTabs,
    panes,
    favorites: state.favorites,
    recents: state.recents.filter((favorite) =>
      state.connections.some(
        (connection) => connection.id === favorite.connectionId,
      ),
    ),
  };
}

function parseSplitSizes(value: unknown): {
  horizontal: number;
  vertical: number;
} {
  const raw = record(value);
  return {
    horizontal: number(raw.horizontal, 0.5, 0.2, 0.8),
    vertical: number(raw.vertical, 0.5, 0.2, 0.8),
  };
}

export function createWorkspace(): Workspace {
  const tab = baseTab("tab-orders", "offline", [
    { logGroup: "/aws/lambda/orders-api" },
  ]);
  return {
    version: 1,
    name: "Investigation workspace",
    connections: [{ ...OFFLINE_CONNECTION }],
    tabs: [tab],
    splitTabs: [],
    tabOrder: [tab.id],
    activeTabId: tab.id,
    activeConnectionId: "offline",
    closedTabs: [],
    panes: [{ id: "pane-1", tabId: tab.id }],
    activePaneId: "pane-1",
    layout: { type: "leaf", paneId: "pane-1" },
    sidebarWidth: 280,
    sidebarVisible: true,
    splitSizes: parseSplitSizes(undefined),
    favorites: [],
    recents: [],
    savedQueries: [],
    history: [],
    presets: [],
    preferences: parsePreferences(DEFAULT_PREFERENCES),
  };
}
/** Restore only whitelisted configuration; credentials, log data and runtime authorization are never restored. */
function parseViewFavorite(
  value: unknown,
  connections: Connection[],
  timezone: Preferences["timezone"],
  index: number,
): ViewFavorite | null {
  const raw = record(value);
  if (typeof raw.logGroup === "string") {
    const resource = parseFavorite(value, connections);
    if (!resource) return null;
    const tab = baseTab("saved-tab-" + (index + 1), resource.connectionId, [
      {
        logGroup: resource.logGroup,
        ...(resource.logStream ? { logStreams: [resource.logStream] } : {}),
      },
    ]);
    return {
      id: "favorite-" + (index + 1),
      title: tab.title,
      tabs: [tab],
      connections: [
        structuredClone(
          connections.find(
            (connection) => connection.id === resource.connectionId,
          )!,
        ),
      ],
      timezone,
    };
  }
  const known = unique(
    list(raw.connections, 50)
      .map(parseConnection)
      .filter((value): value is Connection => value !== null),
  );
  const tabs = unique(
    list(raw.tabs, MAX_SPLIT_PANES + 1)
      .map((tab) => parseTab(tab, known))
      .filter((value): value is LogTab => value !== null),
  );
  const id = string(raw.id, "", 160),
    title = string(raw.title, "", 512);
  if (!id || !title || !tabs.length || !known.length) return null;
  const splitRaw = record(raw.split);
  let split: SplitTab | undefined;
  if (Object.keys(splitRaw).length) {
    const panes = unique(
      list(splitRaw.panes, MAX_SPLIT_PANES + 1).map((value) => {
        const pane = record(value);
        return {
          id: string(pane.id, "", 160),
          tabId: string(pane.tabId, "", 160),
        };
      }),
    );
    const members = new Set(panes.map((pane) => pane.tabId)),
      layout = normalizeLayout(
        splitRaw.layout,
        panes.map((pane) => pane.id),
      );
    if (
      !layout ||
      panes.length < 2 ||
      panes.length !== tabs.length ||
      members.size !== tabs.length ||
      tabs.some((tab) => !members.has(tab.id))
    )
      return null;
    const active = string(splitRaw.activePaneId);
    split = {
      id: string(splitRaw.id, "saved-split", 160),
      panes,
      layout,
      activePaneId: panes.some((pane) => pane.id === active)
        ? active
        : panes[0].id,
      ...(typeof splitRaw.title === "string"
        ? { title: string(splitRaw.title, "", 512) }
        : {}),
    };
  } else if (tabs.length !== 1) return null;
  return {
    id,
    title,
    tabs,
    connections: known,
    ...(split ? { split } : {}),
    timezone: raw.timezone === "utc" ? "utc" : "local",
  };
}

/** Capture configuration, including connection identity, without retaining log payloads. */
export function captureViewFavorite(
  input: Workspace,
  tabId: string,
): ViewFavorite | null {
  const state = modelState(input),
    entry = workspaceEntries(state).find((entry) => entry.id === tabId);
  if (!entry) return null;
  const tabs = entry.tabIds.map((id) =>
    structuredClone(state.tabs.find((tab) => tab.id === id)!),
  );
  const referenced = new Set(
    tabs.flatMap((tab) => [
      tab.connectionId,
      ...tab.sources.map((source) => source.connectionId ?? tab.connectionId),
    ]),
  );
  const split = state.splitTabs?.find((split) => split.id === entry.id);
  return {
    id: nextId("favorite", state.favorites),
    title: entry.title || "Log view",
    tabs,
    connections: structuredClone(
      state.connections.filter((connection) => referenced.has(connection.id)),
    ),
    ...(split ? { split: structuredClone(split) } : {}),
    timezone: state.preferences.timezone,
  };
}

export function projectFavoriteSave(
  input: Workspace,
  tabId: string,
): { workspace: Workspace; error?: string } {
  const state = modelState(input),
    favorite = captureViewFavorite(state, tabId);
  if (!favorite) return { workspace: input };
  const { id: _id, title: _title, ...snapshot } = favorite;
  if (
    state.favorites.some(
      ({ id: _savedId, title: _savedTitle, ...saved }) =>
        JSON.stringify(saved) === JSON.stringify(snapshot),
    )
  )
    return { workspace: input };
  if (state.favorites.length >= 500)
    return {
      workspace: input,
      error:
        "The workspace can hold up to 500 saved views. Remove an unused favorite and try again.",
    };
  const next = {
    ...state,
    favorites: [...state.favorites, favorite],
  };
  if (
    new TextEncoder().encode(JSON.stringify(next, null, 2)).byteLength >
    5_000_000
  )
    return {
      workspace: input,
      error:
        "Saving this view would exceed the 5 MB workspace limit. Remove unused favorites and try again.",
    };
  return { workspace: next };
}

function openViewFavorite(input: Workspace, favorite: ViewFavorite): Workspace {
  const state = modelState(input);
  if (state.tabs.length + favorite.tabs.length > 100) return input;
  const connections = [...state.connections],
    connectionIds = new Map<string, string>();
  for (const saved of favorite.connections) {
    let connection = connections.find(
      (connection) =>
        connection.mode === saved.mode &&
        connection.profile === saved.profile &&
        connection.region === saved.region,
    );
    if (!connection) {
      if (connections.length >= 50) return input;
      connection = {
        ...saved,
        id: connections.some((connection) => connection.id === saved.id)
          ? nextId("connection", connections)
          : saved.id,
      };
      connections.push(connection);
    }
    connectionIds.set(saved.id, connection.id);
  }
  const tabs = [...state.tabs],
    tabIds = new Map<string, string>();
  for (const saved of favorite.tabs) {
    const copy = parseTab(
      {
        ...structuredClone(saved),
        id: nextId("tab", entryIdentities(state, tabs)),
        preview: false,
        ...(!favorite.split ? { customTitle: favorite.title } : {}),
        connectionId: connectionIds.get(saved.connectionId),
        sources: saved.sources.map((source) => ({
          ...source,
          ...(source.connectionId
            ? { connectionId: connectionIds.get(source.connectionId) }
            : {}),
        })),
      },
      connections,
    );
    if (!copy) return input;
    tabs.push(copy);
    tabIds.set(saved.id, copy.id);
  }
  const id = favorite.split
    ? nextId("split", entryIdentities(state, tabs))
    : tabIds.get(favorite.tabs[0].id)!;
  const savedSplit = favorite.split ? { ...favorite.split } : undefined;
  const split = savedSplit
    ? {
        ...structuredClone(savedSplit),
        title: favorite.title,
        id,
        panes: savedSplit.panes.map((pane) => ({
          ...pane,
          tabId: tabIds.get(pane.tabId!)!,
        })),
      }
    : undefined;
  return orderedFlatTabs(
    projectEntry(
      {
        ...state,
        connections,
        tabs,
        splitTabs: split
          ? [...(state.splitTabs ?? []), split]
          : state.splitTabs,
        tabOrder: [...(state.tabOrder ?? []), id],
        preferences: { ...state.preferences, timezone: favorite.timezone },
      },
      id,
    ),
  );
}

export function projectFavoriteOpen(
  input: Workspace,
  favoriteId: string,
): { workspace: Workspace; error?: string } {
  const favorite = input.favorites.find(
    (favorite) => favorite.id === favoriteId,
  );
  if (!favorite) return { workspace: input };
  const next = openViewFavorite(input, favorite);
  if (next === input)
    return {
      workspace: input,
      error:
        "This view cannot be opened within the workspace tab or connection limits. Close unused tabs or remove unused connections and try again.",
    };
  if (
    new TextEncoder().encode(JSON.stringify(next, null, 2)).byteLength >
    5_000_000
  )
    return {
      workspace: input,
      error:
        "Opening this view would exceed the 5 MB workspace limit. Close unused tabs or remove unused favorites and try again.",
    };
  return { workspace: next };
}

export function restoreWorkspace(value: unknown): Workspace {
  const raw = record(value);
  const defaults = createWorkspace();
  if (
    !Object.keys(raw).length ||
    (raw.version !== undefined && raw.version !== 0 && raw.version !== 1) ||
    (raw.connections !== undefined && !Array.isArray(raw.connections))
  )
    return defaults;
  const valid = <T>(item: T | null): item is T => item !== null;
  const connections = unique(
    list(raw.connections, 50).map(parseConnection).filter(valid),
  );
  if (!connections.length) connections.push({ ...OFFLINE_CONNECTION });
  const tabs = Array.isArray(raw.tabs)
    ? unique(
        list(raw.tabs, 100)
          .map((tab) => parseTab(tab, connections))
          .filter(valid),
      )
    : defaults.tabs.filter((tab) =>
        connections.some((connection) => connection.id === tab.connectionId),
      );
  const preferences = parsePreferences(raw.preferences);
  const closedTabs = recentClosedTabs(
    unique(
      list(raw.closedTabs, 30)
        .map((tab) => parseTab(tab, connections))
        .filter(valid),
    )
      .filter((tab) => !tabs.some((open) => open.id === tab.id))
      .map((tab) => ({ ...tab, closedAt: tab.closedAt ?? Date.now() })),
    preferences.closedTabHistoryDays,
  );
  const shown = new Set<string>();
  const panes: Pane[] = unique(
    list(raw.panes, MAX_SPLIT_PANES).map((value, index) => {
      const pane = record(value);
      const tabId = string(pane.tabId, "", 160);
      const usable = tabs.some((tab) => tab.id === tabId) && !shown.has(tabId);
      if (usable) shown.add(tabId);
      return {
        id: string(pane.id, "pane-" + (index + 1), 160),
        tabId: usable ? tabId : null,
      };
    }),
  );
  if (!panes.length) panes.push({ id: "pane-1", tabId: tabs[0]?.id ?? null });
  const activePaneId = string(raw.activePaneId, "", 160);
  const favorites = (value: unknown, max: number) =>
    list(value, max)
      .map((item) => parseFavorite(item, connections))
      .filter(valid)
      .filter(
        (item, index, items) =>
          items.findIndex((other) => sameFavorite(item, other)) === index,
      );
  const restored: Workspace = {
    version: 1,
    name: string(raw.name, defaults.name, 120),
    connections,
    tabs,
    closedTabs,
    panes,
    activePaneId: panes.some((pane) => pane.id === activePaneId)
      ? activePaneId
      : panes[0].id,
    sidebarWidth: number(raw.sidebarWidth, 280, 180, 1200),
    sidebarVisible: raw.sidebarVisible !== false,
    splitSizes: parseSplitSizes(raw.splitSizes),
    layout:
      normalizeLayout(
        raw.layout,
        panes.map((pane) => pane.id),
      ) ??
      legacyLayout(
        panes.map((pane) => pane.id),
        parseSplitSizes(raw.splitSizes),
      ),
    favorites: unique(
      list(raw.favorites, 500)
        .map((value, index) =>
          parseViewFavorite(
            value,
            connections,
            parsePreferences(raw.preferences).timezone,
            index,
          ),
        )
        .filter(valid),
    ),
    recents: favorites(raw.recents, 100),
    savedQueries: unique(
      list(raw.savedQueries, 500).map(parseQuery).filter(valid),
    ),
    history: unique(
      list(raw.history, MAX_RECENT_SEARCHES_LIMIT)
        .map(parseQuery)
        .filter(valid),
    ).slice(0, preferences.recentSearchesLimit),
    presets: unique(list(raw.presets, 500).map(parsePreset).filter(valid)),
    preferences,
  };
  return normalizeWorkspaceEntries(restored, raw);
}
export function createTab(connectionId: string, sources: LogSource[]): LogTab {
  return baseTab(
    "tab-" + globalThis.crypto.randomUUID(),
    connectionId,
    sources,
  );
}
function resourceKey(tab: LogTab): string {
  return JSON.stringify([
    tab.connectionId,
    tab.sources.map((source) => [
      source.connectionId ?? tab.connectionId,
      source.logGroup,
      source.gcp ?? null,
      [...(source.logStreams ?? [])].sort(),
    ]),
  ]);
}

function openResource(
  state: Workspace,
  input: LogTab,
  permanent: boolean,
  paneId?: string,
): Workspace {
  const targetId = paneId ?? state.activePaneId;
  if (!state.panes.some((pane) => pane.id === targetId)) return state;
  const parsed = parseTab(input, state.connections);
  if (!parsed) return state;
  const existing = state.tabs.find(
    (tab) => resourceKey(tab) === resourceKey(parsed),
  );
  if (existing) {
    const next = permanent
      ? {
          ...state,
          tabs: state.tabs.map((tab) =>
            tab.id === existing.id ? { ...tab, preview: false } : tab,
          ),
        }
      : state;
    return legacyWorkspaceReducer(next, {
      type: "tab/select",
      tabId: existing.id,
      paneId,
    });
  }
  const tab = {
    ...parsed,
    id: entryIdentities(state).some((tab) => tab.id === parsed.id)
      ? nextId("tab", entryIdentities(state))
      : parsed.id,
    preview: !permanent,
  };
  const activeTabId = state.panes.find((pane) => pane.id === targetId)?.tabId;
  const shownElsewhere = new Set(
    state.panes
      .filter((pane) => pane.id !== targetId)
      .map((pane) => pane.tabId),
  );
  const replace = !permanent
    ? state.tabs.findIndex((tab) => tab.preview && tab.id === activeTabId)
    : -1;
  const index =
    replace >= 0
      ? replace
      : !permanent
        ? state.tabs.findIndex(
            (tab) => tab.preview && !shownElsewhere.has(tab.id),
          )
        : -1;
  if (index < 0)
    return legacyWorkspaceReducer(state, {
      type: "tab/open",
      tab,
      paneId: targetId,
    });
  const previousId = state.tabs[index].id;
  const next = {
    ...state,
    tabs: state.tabs.map((current, i) => (i === index ? tab : current)),
    closedTabs: state.closedTabs.filter((closed) => closed.id !== tab.id),
    panes: state.panes.map((pane) =>
      pane.tabId === previousId ? { ...pane, tabId: null } : pane,
    ),
  };
  return assignPane(next, targetId, tab.id);
}

function legacyWorkspaceReducer(
  state: Workspace,
  action: WorkspaceAction,
): Workspace {
  switch (action.type) {
    case "gcp/open-source": {
      const requested = action.connection;
      const connection = state.connections.find((item) =>
        item.mode === "gcp" && item.region === requested.region &&
        item.gcpIdentity?.configuration === requested.gcpIdentity?.configuration &&
        item.gcpIdentity?.account === requested.gcpIdentity?.account &&
        item.gcpIdentity?.quotaProject === requested.gcpIdentity?.quotaProject,
      ) ?? requested;
      if (connection === requested && state.connections.length >= 50) return state;
      const next = connection === requested
        ? workspaceReducer(state, { type: "connections/set", connections: [...state.connections, connection] })
        : state;
      return workspaceReducer(next, {
        type: action.mode === "preview" ? "tab/preview" : "tab/open-resource",
        tab: createTab(connection.id, [action.source]),
      });
    }
    case "workspace/restore":
      return restoreWorkspace(action.workspace);
    case "tab/preview":
    case "tab/open-resource":
      return openResource(
        state,
        action.tab,
        action.type === "tab/open-resource",
        action.paneId,
      );
    case "tab/promote":
      return {
        ...state,
        tabs: state.tabs.map((tab) =>
          tab.id === action.tabId ? { ...tab, preview: false } : tab,
        ),
      };
    case "workspace/update":
      return {
        ...state,
        name: string(action.patch.name, state.name, 120),
        sidebarWidth: number(
          action.patch.sidebarWidth,
          state.sidebarWidth,
          180,
          1200,
        ),
        sidebarVisible:
          typeof action.patch.sidebarVisible === "boolean"
            ? action.patch.sidebarVisible
            : state.sidebarVisible,
        splitSizes:
          action.patch.splitSizes === undefined
            ? (state.splitSizes ?? parseSplitSizes(undefined))
            : parseSplitSizes(action.patch.splitSizes),
      };
    case "tab/open": {
      if (state.tabs.length >= 100) return state;
      if (
        !state.panes.some(
          (pane) => pane.id === (action.paneId ?? state.activePaneId),
        )
      )
        return state;
      const parsed = parseTab(action.tab, state.connections);
      if (!parsed) return state;
      const tab = {
        ...parsed,
        id: entryIdentities(state).some((tab) => tab.id === parsed.id)
          ? nextId("tab", entryIdentities(state))
          : parsed.id,
      };
      const next = {
        ...state,
        tabs: [...state.tabs, tab],
        closedTabs: state.closedTabs.filter((closed) => closed.id !== tab.id),
      };
      return assignPane(next, action.paneId ?? state.activePaneId, tab.id);
    }
    case "tab/select": {
      if (!action.paneId) {
        const existingPane = state.panes.find(
          (pane) => pane.tabId === action.tabId,
        );
        if (existingPane) return { ...state, activePaneId: existingPane.id };
      }
      return assignPane(
        state,
        action.paneId ?? state.activePaneId,
        action.tabId,
      );
    }
    case "tab/update":
      return {
        ...state,
        tabs: state.tabs.map((tab) => {
          if (tab.id !== action.tabId) return tab;
          const parsed =
            parseTab(
              {
                ...tab,
                ...action.patch,
                ...(action.patch.sources && !tab.customTitle
                  ? { title: tabTitle(action.patch.sources) }
                  : {}),
                id: tab.id,
              },
              state.connections,
            ) ?? tab;
          const edited =
            parsed.filterPattern !== tab.filterPattern ||
            parsed.filterMode !== tab.filterMode ||
            parsed.query !== tab.query ||
            parsed.kind !== tab.kind ||
            parsed.connectionId !== tab.connectionId ||
            JSON.stringify(parsed.sources) !== JSON.stringify(tab.sources);
          // A query draft must survive the next resource preview. View and date
          // choices alone do not turn a transient tab into a permanent one.
          return tab.preview && edited ? { ...parsed, preview: false } : parsed;
        }),
      };
    case "tab/close": {
      const index = state.tabs.findIndex((tab) => tab.id === action.tabId);
      if (index < 0) return state;
      const tab = state.tabs[index];
      const tabs = state.tabs.filter((tab) => tab.id !== action.tabId);
      const shown = new Set(
        state.panes
          .map((pane) => pane.tabId)
          .filter((id) => id !== action.tabId),
      );
      const nearest = [
        ...state.tabs.slice(index + 1),
        ...state.tabs.slice(0, index).reverse(),
      ].find((tab) => !shown.has(tab.id));
      return {
        ...state,
        tabs,
        closedTabs: [
          tab,
          ...state.closedTabs.filter((closed) => closed.id !== tab.id),
        ].slice(0, 30),
        panes: state.panes.map((pane) =>
          pane.tabId === tab.id
            ? { ...pane, tabId: nearest?.id ?? null }
            : pane,
        ),
      };
    }
    case "tab/reopen": {
      const tab = state.closedTabs[0];
      if (!tab || state.tabs.length >= 100) return state;
      return legacyWorkspaceReducer(
        { ...state, closedTabs: state.closedTabs.slice(1) },
        { type: "tab/open", tab: { ...tab, preview: false } },
      );
    }
    case "tab/reorder":
      return {
        ...state,
        tabs: reorder(state.tabs, action.tabId, action.beforeTabId),
      };
    case "pane/split": {
      if (state.panes.length >= MAX_SPLIT_PANES) return state;
      const paneId = nextId("pane", state.panes);
      const targetId = action.paneId ?? state.activePaneId;
      if (
        !state.panes.some((pane) => pane.id === targetId) ||
        (action.tabId !== undefined &&
          !state.tabs.some((tab) => tab.id === action.tabId))
      )
        return state;
      const layout =
        state.layout ??
        legacyLayout(
          state.panes.map((pane) => pane.id),
          state.splitSizes,
        );
      const edge =
        action.edge ??
        (nextSplitAxis(layout, targetId) === "horizontal" ? "right" : "bottom");
      const shown = new Set(state.panes.map((pane) => pane.tabId));
      let tabId =
        action.tabId ??
        state.tabs.find((tab) => !shown.has(tab.id))?.id ??
        state.panes.find((pane) => pane.id === targetId)?.tabId ??
        null;
      let tabs = tabId
        ? state.tabs.map((tab) =>
            tab.id === tabId && tab.preview ? { ...tab, preview: false } : tab,
          )
        : state.tabs;
      if (tabId && shown.has(tabId)) {
        if (tabs.length >= 100) return state;
        const source = tabs.find((tab) => tab.id === tabId);
        if (!source) return state;
        const copy = {
          ...structuredClone(source),
          id: nextId("tab", entryIdentities(state)),
          preview: false,
        };
        tabs = [
          ...tabs.map((tab) =>
            tab.id === tabId ? { ...tab, preview: false } : tab,
          ),
          copy,
        ];
        tabId = copy.id;
      }
      const next = {
        ...state,
        tabs,
        layout: splitLayout(layout, targetId, paneId, edge),
        panes: [...state.panes, { id: paneId, tabId: null }],
        activePaneId: paneId,
      };
      return assignPane(next, paneId, tabId);
    }
    case "pane/drop-tab": {
      const target = state.panes.find((pane) => pane.id === action.paneId);
      const source = state.tabs.find((tab) => tab.id === action.tabId);
      if (!target || !source) return state;
      if (!target.tabId) return assignPane(state, target.id, source.id);
      const from = state.panes.find(
        (pane) => pane.tabId === source.id && pane.id !== target.id,
      );
      const next = from
        ? legacyWorkspaceReducer(state, { type: "pane/close", paneId: from.id })
        : state;
      return legacyWorkspaceReducer(next, {
        type: "pane/split",
        paneId: target.id,
        tabId: source.id,
        edge: action.edge ?? undefined,
      });
    }
    case "pane/show-tabs": {
      const ids = [...new Set(action.tabIds)].filter((id) =>
        state.tabs.some((tab) => tab.id === id),
      );
      if (ids.length < 2 || ids.length > MAX_SPLIT_PANES) return state;
      const panes: Pane[] = [];
      for (const [index, tabId] of ids.entries())
        panes.push({
          id: state.panes[index]?.id ?? nextId("pane", panes),
          tabId,
        });
      return {
        ...state,
        tabs: state.tabs.map((tab) =>
          ids.includes(tab.id) ? { ...tab, preview: false } : tab,
        ),
        panes,
        activePaneId: panes[0].id,
        layout: legacyLayout(panes.map((pane) => pane.id)),
      };
    }
    case "pane/resize":
      if (
        !/^[01]*$/.test(action.path) ||
        action.path.length >= MAX_LAYOUT_DEPTH ||
        !Number.isFinite(action.ratio)
      )
        return state;
      return {
        ...state,
        layout: resizeLayout(
          state.layout ??
            legacyLayout(
              state.panes.map((pane) => pane.id),
              state.splitSizes,
            ),
          action.path,
          action.ratio,
        ),
      };
    case "pane/close": {
      if (state.panes.length <= 1) return state;
      const index = state.panes.findIndex((pane) => pane.id === action.paneId);
      if (index < 0) return state;
      const panes = state.panes.filter((pane) => pane.id !== action.paneId);
      return {
        ...state,
        panes,
        layout:
          removeLayoutPane(
            state.layout ??
              legacyLayout(
                state.panes.map((pane) => pane.id),
                state.splitSizes,
              ),
            action.paneId,
          ) ?? legacyLayout(panes.map((pane) => pane.id)),
        activePaneId:
          state.activePaneId === action.paneId
            ? panes[Math.min(index, panes.length - 1)].id
            : state.activePaneId,
      };
    }
    case "pane/assign":
      return assignPane(state, action.paneId, action.tabId);
    case "pane/reorder": {
      const panes = reorder(state.panes, action.paneId, action.beforePaneId);
      return {
        ...state,
        panes,
        layout: mapLayoutIds(
          state.layout ??
            legacyLayout(
              state.panes.map((pane) => pane.id),
              state.splitSizes,
            ),
          new Map(state.panes.map((pane, index) => [pane.id, panes[index].id])),
        ),
      };
    }
    case "pane/activate":
      return state.panes.some((pane) => pane.id === action.paneId)
        ? { ...state, activePaneId: action.paneId }
        : state;
    case "connections/set": {
      const connections = unique(
        action.connections
          .slice(0, 50)
          .map(parseConnection)
          .filter(
            (connection): connection is Connection => connection !== null,
          ),
      );
      return cleanLinks({
        ...state,
        connections: connections.length
          ? connections
          : [{ ...OFFLINE_CONNECTION }],
      });
    }
    case "preferences/update": {
      const preferences = parsePreferences({
        ...state.preferences,
        ...action.patch,
      });
      return {
        ...state,
        preferences,
        history: state.history.slice(0, preferences.recentSearchesLimit),
        closedTabs: recentClosedTabs(
          state.closedTabs,
          preferences.closedTabHistoryDays,
        ),
      };
    }
    case "recents/add": {
      const favorite = parseFavorite(action.favorite, state.connections);
      return favorite
        ? {
            ...state,
            recents: [
              favorite,
              ...state.recents.filter((item) => !sameFavorite(item, favorite)),
            ].slice(0, 100),
          }
        : state;
    }
    case "query/save": {
      const query = parseQuery(action.query);
      return query
        ? {
            ...state,
            savedQueries: [
              ...state.savedQueries.filter((item) => item.id !== query.id),
              query,
            ].slice(-500),
          }
        : state;
    }
    case "query/remove":
      return {
        ...state,
        savedQueries: state.savedQueries.filter(
          (query) => query.id !== action.queryId,
        ),
      };
    case "history/add": {
      const query = parseQuery(action.query);
      return query
        ? {
            ...state,
            history: [
              query,
              ...state.history.filter(
                (item) =>
                  item.id !== query.id &&
                  (item.kind !== query.kind ||
                    item.text !== query.text ||
                    item.filterMode !== query.filterMode),
              ),
            ].slice(
              0,
              state.preferences.recentSearchesLimit ??
                DEFAULT_RECENT_SEARCHES_LIMIT,
            ),
          }
        : state;
    }
    case "preset/save": {
      const preset = parsePreset(action.preset);
      return preset
        ? {
            ...state,
            presets: [
              ...state.presets.filter((item) => item.id !== preset.id),
              preset,
            ].slice(-500),
          }
        : state;
    }
    case "preset/remove":
      return {
        ...state,
        presets: state.presets.filter(
          (preset) => preset.id !== action.presetId,
        ),
      };
    default:
      return state;
  }
}

function splitMembers(split: SplitTab): string[] {
  return split.panes.flatMap((pane) => (pane.tabId ? [pane.tabId] : []));
}

function entryFor(state: Workspace, id: string): WorkspaceEntry | undefined {
  return workspaceEntries(state).find(
    (entry) => entry.id === id || entry.tabIds.includes(id),
  );
}

function projectEntry(
  state: Workspace,
  id: string | null | undefined,
): Workspace {
  const entries = workspaceEntries(state);
  const entry = entries.find((item) => item.id === id) ?? entries[0];
  const activeConnectionId = state.connections.some(
    (connection) => connection.id === state.activeConnectionId,
  )
    ? state.activeConnectionId!
    : state.connections[0].id;
  if (!entry) {
    const paneId = state.panes.length === 1 ? state.panes[0].id : "pane-1";
    return {
      ...state,
      splitTabs: state.splitTabs ?? [],
      tabOrder: [],
      activeTabId: null,
      activeConnectionId,
      panes: [{ id: paneId, tabId: null }],
      layout: { type: "leaf", paneId },
      activePaneId: paneId,
    };
  }
  const split = state.splitTabs?.find((item) => item.id === entry.id);
  const paneId =
    !split && state.panes.length === 1 && state.panes[0].tabId === entry.id
      ? state.panes[0].id
      : `pane:${entry.id.slice(0, 155)}`;
  const panes = split ? split.panes : [{ id: paneId, tabId: entry.id }];
  const activePaneId = split?.activePaneId ?? paneId;
  return {
    ...state,
    splitTabs: state.splitTabs ?? [],
    tabOrder: entries.map((item) => item.id),
    activeTabId: entry.id,
    activeConnectionId,
    panes,
    layout: split?.layout ?? { type: "leaf", paneId },
    activePaneId,
  };
}

/** Repair entry ownership and migrate the former global pane projection. */
function normalizeWorkspaceEntries(
  state: Workspace,
  raw: Record<string, unknown>,
): Workspace {
  const tabIds = new Set(state.tabs.map((tab) => tab.id));
  const occupied = new Set<string>();
  const splitIds = new Set<string>();
  const splits: SplitTab[] = [];
  const modern =
    Array.isArray(raw.splitTabs) ||
    Array.isArray(raw.tabOrder) ||
    raw.activeTabId !== undefined;
  for (const value of list(raw.splitTabs, 50)) {
    const item = record(value),
      id = string(item.id, "", 160);
    if (!id || tabIds.has(id) || splitIds.has(id)) continue;
    const panes = list(item.panes, MAX_SPLIT_PANES + 1).map((value) => {
      const pane = record(value);
      return {
        id: string(pane.id, "", 160),
        tabId: string(pane.tabId, "", 160),
      };
    });
    const members = panes.map((pane) => pane.tabId);
    const ids = panes.map((pane) => pane.id);
    const layout = normalizeLayout(item.layout, ids);
    if (
      panes.length < 2 ||
      panes.length > MAX_SPLIT_PANES ||
      ids.some((id) => !id) ||
      new Set(ids).size !== ids.length ||
      new Set(members).size !== members.length ||
      members.some((id) => !tabIds.has(id) || occupied.has(id)) ||
      !layout
    )
      continue;
    members.forEach((id) => occupied.add(id));
    splitIds.add(id);
    splits.push({
      id,
      ...(typeof item.pinned === "boolean" ? { pinned: item.pinned } : {}),
      panes,
      layout,
      activePaneId: ids.includes(String(item.activePaneId))
        ? String(item.activePaneId)
        : ids[0],
      ...(typeof item.title === "string" && item.title.trim()
        ? { title: string(item.title, "", 512) }
        : {}),
    });
  }
  if (!modern) {
    const panes = state.panes.filter(
      (pane) => pane.tabId && tabIds.has(pane.tabId),
    );
    if (panes.length >= 2) {
      let layout =
        state.layout ??
        legacyLayout(
          state.panes.map((pane) => pane.id),
          state.splitSizes,
        );
      for (const pane of state.panes)
        if (!pane.tabId) layout = removeLayoutPane(layout, pane.id) ?? layout;
      splits.push({
        id: nextId("split", entryIdentities(state)),
        panes,
        layout,
        activePaneId: panes.some((pane) => pane.id === state.activePaneId)
          ? state.activePaneId
          : panes[0].id,
      });
    }
  }
  const owner = new Map(
    splits.flatMap((split) =>
      splitMembers(split).map((id) => [id, split.id] as const),
    ),
  );
  const fallbackOrder = [
    ...new Set(state.tabs.map((tab) => owner.get(tab.id) ?? tab.id)),
  ];
  const available = new Set(fallbackOrder);
  const requestedOrder = list(raw.tabOrder, 100).filter(
    (id): id is string => typeof id === "string" && available.has(id),
  );
  const order = [...new Set([...requestedOrder, ...fallbackOrder])];
  const projectedTab = state.panes.find(
    (pane) => pane.id === state.activePaneId,
  )?.tabId;
  const requestedActive =
    typeof raw.activeTabId === "string" && available.has(raw.activeTabId)
      ? raw.activeTabId
      : (owner.get(projectedTab ?? "") ??
        (projectedTab && available.has(projectedTab)
          ? projectedTab
          : (order[0] ?? null)));
  const activeConnectionId = state.connections.some(
    (connection) => connection.id === raw.activeConnectionId,
  )
    ? String(raw.activeConnectionId)
    : state.connections[0].id;
  return projectEntry(
    {
      ...state,
      splitTabs: splits,
      tabOrder: order,
      activeTabId: requestedActive,
      activeConnectionId,
    },
    requestedActive,
  );
}

function modelState(state: Workspace): Workspace {
  return state.splitTabs !== undefined &&
    state.tabOrder !== undefined &&
    state.activeTabId !== undefined &&
    state.activeConnectionId !== undefined
    ? state
    : normalizeWorkspaceEntries(
        state,
        state as unknown as Record<string, unknown>,
      );
}

function saveActiveProjection(state: Workspace): Workspace {
  const id = activeEntryId(state);
  if (!state.splitTabs?.some((split) => split.id === id)) return state;
  return {
    ...state,
    splitTabs: state.splitTabs.map((split) =>
      split.id === id
        ? {
            ...split,
            panes: state.panes,
            layout:
              state.layout ?? legacyLayout(state.panes.map((pane) => pane.id)),
            activePaneId: state.activePaneId,
          }
        : split,
    ),
  };
}

function orderedFlatTabs(state: Workspace): Workspace {
  const ids = workspaceEntries(state).flatMap((entry) => entry.tabIds);
  const positions = new Map(ids.map((id, index) => [id, index]));
  return {
    ...state,
    tabs: [...state.tabs].sort(
      (a, b) =>
        (positions.get(a.id) ?? Infinity) - (positions.get(b.id) ?? Infinity),
    ),
  };
}

function closeViews(state: Workspace, ids: string[]): Workspace {
  const closing = new Set(ids);
  const entries = workspaceEntries(state),
    active = activeEntryId(state);
  const activeIndex = Math.max(
    0,
    entries.findIndex((entry) => entry.id === active),
  );
  const replacements = new Map<string, string[]>();
  const remainingPins = new Map<string, boolean>();
  const splitTabs: SplitTab[] = [];
  for (const split of state.splitTabs ?? []) {
    const removed = split.panes.filter(
      (pane) => pane.tabId && closing.has(pane.tabId),
    );
    if (!removed.length) {
      splitTabs.push(split);
      continue;
    }
    const panes = split.panes.filter(
      (pane) => pane.tabId && !closing.has(pane.tabId),
    );
    if (panes.length < 2) {
      if (panes[0]?.tabId && split.pinned !== undefined)
        remainingPins.set(panes[0].tabId, split.pinned);
      replacements.set(
        split.id,
        panes.flatMap((pane) => (pane.tabId ? [pane.tabId] : [])),
      );
      continue;
    }
    let layout = split.layout;
    for (const pane of removed) layout = removeLayoutPane(layout, pane.id)!;
    splitTabs.push({
      ...split,
      panes,
      layout,
      activePaneId: panes.some((pane) => pane.id === split.activePaneId)
        ? split.activePaneId
        : panes[0].id,
    });
  }
  const tabs = state.tabs
    .filter((tab) => !closing.has(tab.id))
    .map((tab) =>
      remainingPins.has(tab.id)
        ? { ...tab, pinned: remainingPins.get(tab.id)! }
        : tab,
    );
  const closed = state.tabs
    .filter((tab) => closing.has(tab.id))
    .map((tab) => ({ ...tab, closedAt: Date.now() }));
  const order = (state.tabOrder ?? entries.map((entry) => entry.id)).flatMap(
    (id) => replacements.get(id) ?? (closing.has(id) ? [] : [id]),
  );
  const next = {
    ...state,
    tabs,
    splitTabs,
    tabOrder: order,
    closedTabs: recentClosedTabs(
      [...closed, ...state.closedTabs.filter((tab) => !closing.has(tab.id))],
      state.preferences.closedTabHistoryDays,
    ).slice(0, 30),
  };
  const available = workspaceEntries(next);
  const nextActive = available.some((entry) => entry.id === active)
    ? active
    : (replacements.get(active ?? "")?.[0] ??
      available[Math.min(activeIndex, available.length - 1)]?.id ??
      null);
  return projectEntry(next, nextActive);
}

function addView(
  state: Workspace,
  input: LogTab,
  preview: boolean,
  replacePreview = false,
): Workspace {
  const parsed = parseTab(input, state.connections);
  if (!parsed) return state;
  const entries = workspaceEntries(state);
  const active = activeEntryId(state);
  const replace = replacePreview
    ? (entries.find(
        (entry) =>
          entry.kind === "single" && entry.preview && entry.id === active,
      ) ?? entries.find((entry) => entry.kind === "single" && entry.preview))
    : undefined;
  if (!replace && state.tabs.length >= 100) return state;
  const id = entryIdentities(state).some((tab) => tab.id === parsed.id)
    ? nextId("tab", entryIdentities(state))
    : parsed.id;
  const tab = { ...parsed, id, preview };
  const tabs = replace
    ? state.tabs.map((current) => (current.id === replace.id ? tab : current))
    : [...state.tabs, tab];
  const order = replace
    ? (state.tabOrder ?? []).map((entryId) =>
        entryId === replace.id ? id : entryId,
      )
    : [...(state.tabOrder ?? []), id];
  return projectEntry(
    {
      ...state,
      tabs,
      tabOrder: order,
      closedTabs: state.closedTabs.filter((closed) => closed.id !== id),
    },
    id,
  );
}

function activateViewOrEntry(state: Workspace, id: string): Workspace {
  const entry = entryFor(state, id);
  if (!entry) return state;
  let next = state;
  if (entry.kind === "split" && entry.id !== id)
    next = {
      ...state,
      splitTabs: state.splitTabs!.map((split) =>
        split.id === entry.id
          ? {
              ...split,
              activePaneId: split.panes.find((pane) => pane.tabId === id)!.id,
            }
          : split,
      ),
    };
  return projectEntry(next, entry.id);
}

function combineEntries(state: Workspace, ids: string[]): Workspace {
  const entries = [
    ...new Set(
      ids
        .map((id) => entryFor(state, id)?.id)
        .filter((id): id is string => !!id),
    ),
  ].flatMap((id) => {
    const entry = entryFor(state, id);
    return entry ? [entry] : [];
  });
  const tabIds = [...new Set(entries.flatMap((entry) => entry.tabIds))];
  if (
    entries.length < 2 ||
    tabIds.length < 2 ||
    tabIds.length > MAX_SPLIT_PANES
  )
    return state;
  const existing = entries.find((entry) => entry.kind === "split");
  const previous = state.splitTabs?.find((split) => split.id === existing?.id);
  const id = previous?.id ?? nextId("split", entryIdentities(state));
  const panes = tabIds.map((tabId, index) => ({
    id: `pane-${index + 1}`,
    tabId,
  }));
  const split: SplitTab = {
    ...previous,
    ...(previous?.pinned !== undefined ||
    entries.some((entry) => entry.pinned !== undefined)
      ? { pinned: previous?.pinned ?? entries[0].pinned ?? false }
      : {}),
    id,
    panes,
    layout: legacyLayout(panes.map((pane) => pane.id)),
    activePaneId: panes[0].id,
  };
  const selected = new Set(entries.map((entry) => entry.id));
  const order: string[] = [];
  for (const entryId of state.tabOrder ??
    workspaceEntries(state).map((entry) => entry.id)) {
    if (!selected.has(entryId)) order.push(entryId);
    else if (!order.includes(id)) order.push(id);
  }
  return projectEntry(
    {
      ...state,
      tabs: state.tabs.map((tab) =>
        tabIds.includes(tab.id) ? { ...tab, preview: false } : tab,
      ),
      splitTabs: [
        ...(state.splitTabs ?? []).filter((split) => !selected.has(split.id)),
        split,
      ],
      tabOrder: order,
    },
    id,
  );
}

function graftLayout(
  layout: PaneLayout,
  paneId: string,
  inserted: PaneLayout,
  edge: SplitEdge,
): PaneLayout {
  if (layout.type === "leaf") {
    if (layout.paneId !== paneId) return layout;
    const before = edge === "left" || edge === "top";
    return {
      type: "split",
      axis: edge === "left" || edge === "right" ? "horizontal" : "vertical",
      ratio: 0.5,
      first: before ? inserted : layout,
      second: before ? layout : inserted,
    };
  }
  return {
    ...layout,
    first: graftLayout(layout.first, paneId, inserted, edge),
    second: graftLayout(layout.second, paneId, inserted, edge),
  };
}

/** Pure drop projection shared by rendering and the committed reducer action. */
/** Removes a view from its split without closing or recreating the view. */
function extractSplitPanel(state: Workspace, tabId: string): Workspace | null {
  const split = state.splitTabs?.find((split) =>
    split.panes.some((pane) => pane.tabId === tabId),
  );
  const source = split?.panes.find((pane) => pane.tabId === tabId);
  if (!split || !source) return null;
  const panes = split.panes.filter((pane) => pane.id !== source.id);
  const remaining = panes.length === 1 ? panes[0].tabId! : split.id;
  const splitTabs = state.splitTabs!.flatMap((current) => {
    if (current.id !== split.id) return [current];
    if (panes.length < 2) return [];
    return [
      {
        ...split,
        panes,
        layout: removeLayoutPane(split.layout, source.id)!,
        activePaneId: panes.some((pane) => pane.id === split.activePaneId)
          ? split.activePaneId
          : panes[0].id,
      },
    ];
  });
  const active = activeEntryId(state);
  return projectEntry(
    {
      ...state,
      splitTabs,
      tabs: state.tabs.map((tab) =>
        (tab.id === tabId || (panes.length === 1 && tab.id === remaining)) &&
        split.pinned !== undefined
          ? { ...tab, pinned: split.pinned }
          : tab,
      ),
      tabOrder: (state.tabOrder ?? []).flatMap((id) =>
        id === split.id ? [remaining, tabId] : [id],
      ),
    },
    active === split.id ? remaining : active,
  );
}

export function projectWorkspaceDrop(
  input: Workspace,
  entryId: string,
  paneId: string,
  edge: SplitEdge | null,
): Workspace | null {
  const state = modelState(input),
    destination = entryFor(state, activeEntryId(state) ?? "");
  const target = state.panes.find((pane) => pane.id === paneId);
  const source = entryFor(state, entryId);
  if (!target || !source) return null;
  if (!destination || !target.tabId)
    return activateViewOrEntry(state, source.id);
  if (source.id === destination.id) {
    if (source.kind === "split") {
      // A pane member can be moved internally; dragging the combined tab onto
      // itself never duplicates the entire workspace entry.
      if (entryId === source.id) return null;
      const from = state.panes.find((pane) => pane.tabId === entryId);
      if (!from || from.id === target.id) return null;
      if (edge !== null) {
        const layout = splitLayout(
          removeLayoutPane(state.layout!, from.id)!,
          target.id,
          from.id,
          edge,
        );
        return projectEntry(
          saveActiveProjection({ ...state, layout, activePaneId: from.id }),
          source.id,
        );
      }
      const panes = state.panes.map((pane) =>
        pane.id === from.id
          ? { ...pane, tabId: target.tabId }
          : pane.id === target.id
            ? { ...pane, tabId: from.tabId }
            : pane,
      );
      return projectEntry(
        saveActiveProjection({ ...state, panes, activePaneId: target.id }),
        source.id,
      );
    }
    if (edge === null || state.tabs.length >= 100) return null;
    const original = state.tabs.find((tab) => tab.id === source.id)!;
    const copy = {
      ...structuredClone(original),
      id: nextId("tab", entryIdentities(state)),
      preview: false,
    };
    const next = {
      ...state,
      tabs: [...state.tabs, copy],
      tabOrder: [...(state.tabOrder ?? []), copy.id],
    };
    return projectWorkspaceDrop(next, copy.id, paneId, edge);
  }
  if (source.kind === "split" && entryId !== source.id) {
    const extracted = extractSplitPanel(state, entryId);
    return extracted
      ? projectWorkspaceDrop(extracted, entryId, paneId, edge)
      : null;
  }
  if (source.tabIds.length + destination.tabIds.length > MAX_SPLIT_PANES)
    return null;
  const destinationSplit = state.splitTabs?.find(
    (split) => split.id === destination.id,
  );
  const sourceSplit = state.splitTabs?.find((split) => split.id === source.id);
  const panes = [...state.panes];
  const idMap = new Map<string, string>();
  const inserted = sourceSplit
    ? sourceSplit.panes.map((pane) => {
        const id = nextId("pane", panes);
        const next = { id, tabId: pane.tabId };
        panes.push(next);
        idMap.set(pane.id, id);
        return next;
      })
    : (() => {
        const pane = { id: nextId("pane", panes), tabId: source.id };
        panes.push(pane);
        return [pane];
      })();
  const sourceLayout = sourceSplit
    ? mapLayoutIds(sourceSplit.layout, idMap)
    : { type: "leaf" as const, paneId: inserted[0].id };
  const currentLayout =
    state.layout ?? legacyLayout(state.panes.map((pane) => pane.id));
  const effectiveEdge =
    edge ??
    (nextSplitAxis(currentLayout, paneId) === "horizontal"
      ? "right"
      : "bottom");
  const layout = graftLayout(
    currentLayout,
    paneId,
    sourceLayout,
    effectiveEdge,
  );
  const id = destinationSplit?.id ?? nextId("split", entryIdentities(state));
  const split: SplitTab = {
    ...destinationSplit,
    ...(destination.pinned !== undefined || source.pinned !== undefined
      ? { pinned: destination.pinned ?? false }
      : {}),
    id,
    panes,
    layout,
    activePaneId: inserted[0].id,
  };
  const order = (state.tabOrder ?? []).flatMap((current) =>
    current === source.id ? [] : [current === destination.id ? id : current],
  );
  const members = new Set([...destination.tabIds, ...source.tabIds]);
  return projectEntry(
    {
      ...state,
      tabs: state.tabs.map((tab) =>
        members.has(tab.id) ? { ...tab, preview: false } : tab,
      ),
      splitTabs: [
        ...(state.splitTabs ?? []).filter(
          (value) => value.id !== source.id && value.id !== destination.id,
        ),
        split,
      ],
      tabOrder: order,
    },
    id,
  );
}

function resourceTabWithPreset(state: Workspace, tab: LogTab): LogTab {
  const preset = state.presets.find(
    (preset) =>
      preset.logGroup &&
      tab.sources.some((source) => source.logGroup === preset.logGroup),
  );
  return preset ? { ...tab, view: structuredClone(preset.view) } : tab;
}

/** Project Explorer insertion without publishing a draft view or starting a query. */
export function projectResourceDrop(
  input: Workspace,
  draft: LogTab | LogTab[],
  paneId: string,
  edge: SplitEdge | null,
): Workspace | null {
  const state = modelState(input);
  const drafts = Array.isArray(draft) ? draft : [draft];
  const ids = new Set(drafts.map((tab) => tab.id));
  if (
    !drafts.length ||
    drafts.length > MAX_SPLIT_PANES ||
    state.tabs.length + drafts.length > 100 ||
    ids.size !== drafts.length ||
    entryIdentities(state).some((entry) => ids.has(entry.id)) ||
    !state.panes.some((pane) => pane.id === paneId)
  )
    return null;
  const tabs: LogTab[] = [];
  for (const draft of drafts) {
    if (
      draft.sources.some(
        (source) =>
          source.connectionId &&
          !state.connections.some(
            (connection) => connection.id === source.connectionId,
          ),
      )
    )
      return null;
    const tab = parseTab(draft, state.connections);
    if (!tab) return null;
    tabs.push({ ...resourceTabWithPreset(state, tab), preview: false });
  }
  let next: Workspace = {
    ...state,
    tabs: [...state.tabs, ...tabs],
    tabOrder: [...(state.tabOrder ?? []), ...tabs.map((tab) => tab.id)],
  };
  let sourceId = tabs[0].id;
  if (tabs.length > 1) {
    next = combineEntries(
      next,
      tabs.map((tab) => tab.id),
    );
    sourceId = activeEntryId(next)!;
    next = projectEntry(
      { ...next, panes: state.panes, activePaneId: state.activePaneId },
      activeEntryId(state),
    );
  }
  return projectWorkspaceDrop(next, sourceId, paneId, edge);
}

/** Expand a selection into independent group or explicit-stream views. */
export function createResourceTabs(payload: ResourcePayload): LogTab[] {
  const parsed = decodeResourceDrop(JSON.stringify(payload));
  if (!parsed) throw new Error("Select valid log groups or streams.");
  const sources = mergeSources(
    [],
    parsed.sources,
    parsed.connectionId,
    MAX_SPLIT_PANES,
  );
  const expanded = sources.flatMap((source) =>
    source.logStreams?.length
      ? source.logStreams.map((stream) => ({ ...source, logStreams: [stream] }))
      : [source],
  );
  if (expanded.length > MAX_SPLIT_PANES)
    throw new Error(`A split can include at most ${MAX_SPLIT_PANES} panes.`);
  return expanded.map((source) => {
    const { connectionId, ...resource } = source;
    return {
      ...createTab(connectionId ?? parsed.connectionId, [resource]),
      preview: false,
    };
  });
}

function addResourceRecents(state: Workspace, tabs: LogTab[]): Workspace {
  let next = state;
  for (const tab of tabs)
    for (const source of tab.sources)
      next = legacyWorkspaceReducer(next, {
        type: "recents/add",
        favorite: {
          connectionId: source.connectionId ?? tab.connectionId,
          logGroup: source.logGroup,
          ...(source.logStreams?.length === 1
            ? { logStream: source.logStreams[0] }
            : {}),
        },
      });
  return next;
}

/** Apply the complete Explorer selection atomically, reporting actionable failures. */
export function projectResourceAction(
  input: Workspace,
  payload: ResourcePayload,
  mode: ResourceActionMode,
): { workspace: Workspace; error?: string } {
  try {
    const parsed = decodeResourceDrop(JSON.stringify(payload));
    if (!parsed) throw new Error("Select valid log groups or streams.");
    const state = modelState(input);
    const referenced = [
      parsed.connectionId,
      ...parsed.sources.map(
        (source) => source.connectionId ?? parsed.connectionId,
      ),
    ];
    if (
      referenced.some(
        (id) => !state.connections.some((connection) => connection.id === id),
      )
    )
      throw new Error("A selected source connection no longer exists.");
    if (mode === "new-multisource" || mode === "add-sources") {
      const active =
        mode === "add-sources"
          ? state.tabs.find(
              (tab) =>
                tab.id ===
                state.panes.find((pane) => pane.id === state.activePaneId)
                  ?.tabId,
            )
          : undefined;
      const connectionId = active?.connectionId ?? parsed.connectionId;
      const sources = mergeSources(
        active?.sources ?? [],
        parsed.sources.map((source) => ({
          ...source,
          connectionId: source.connectionId ?? parsed.connectionId,
        })),
        connectionId,
      );
      const tab = active
        ? {
            ...active,
            sources,
            preview: false,
            ...(active.customTitle ? {} : { title: tabTitle(sources) }),
          }
        : { ...createTab(connectionId, sources), preview: false };
      if (!active && state.tabs.length >= 100)
        throw new Error("A workspace can include at most 100 views.");
      const next = active
        ? {
            ...state,
            tabs: state.tabs.map((current) =>
              current.id === active.id ? tab : current,
            ),
          }
        : addView(state, resourceTabWithPreset(state, tab), false);
      return { workspace: addResourceRecents(next, [tab]) };
    }
    if (mode !== "new-split" && mode !== "add-splits")
      throw new Error("Choose a valid resource action.");
    const drafts = createResourceTabs(parsed);
    if (state.tabs.length + drafts.length > 100)
      throw new Error("A workspace can include at most 100 views.");
    if (mode === "add-splits" && state.tabs.length) {
      const next = projectResourceDrop(state, drafts, state.activePaneId, null);
      if (!next)
        throw new Error(
          `A split can include at most ${MAX_SPLIT_PANES} panes.`,
        );
      return { workspace: addResourceRecents(next, drafts) };
    }
    let next = state;
    for (const tab of drafts)
      next = addView(next, resourceTabWithPreset(state, tab), false);
    if (drafts.length > 1)
      next = combineEntries(
        next,
        drafts.map((tab) => tab.id),
      );
    return { workspace: addResourceRecents(next, drafts) };
  } catch (error) {
    return {
      workspace: input,
      error:
        error instanceof Error
          ? error.message
          : "Unable to apply the selected sources.",
    };
  }
}

function setEntryPinned(
  state: Workspace,
  id: string,
  pinned: boolean,
): Workspace {
  const entry = entryFor(state, id);
  if (!entry) return state;
  return entry.kind === "split"
    ? {
        ...state,
        splitTabs: state.splitTabs?.map((split) =>
          split.id === entry.id ? { ...split, pinned } : split,
        ),
      }
    : {
        ...state,
        tabs: state.tabs.map((tab) =>
          tab.id === entry.id
            ? { ...tab, pinned, ...(pinned ? { preview: false } : {}) }
            : tab,
        ),
      };
}

function moveStripEntry(
  state: Workspace,
  id: string,
  before: string | null,
): Workspace {
  const entries = workspaceEntries(state);
  const order = reorder(entries, id, before).map((entry) => entry.id);
  const next = { ...state, tabOrder: order };
  return orderedFlatTabs({
    ...next,
    tabOrder: workspaceEntries(next).map((entry) => entry.id),
  });
}

export function workspaceReducer(
  input: Workspace,
  action: WorkspaceAction,
): Workspace {
  if (action.type === "workspace/restore")
    return restoreWorkspace(action.workspace);
  const state = modelState(input);
  switch (action.type) {
    case "tab/pin": {
      const entry = entryFor(state, action.tabId);
      if (!entry) return input;
      const next = setEntryPinned(state, entry.id, action.pinned);
      const remaining = workspaceEntries(next).filter(
        (item) => item.id !== entry.id,
      );
      const boundary = remaining.find((item) => !item.pinned)?.id ?? null;
      return moveStripEntry(next, entry.id, boundary);
    }
    case "tab/move": {
      if (
        !entryFor(state, action.tabId) ||
        (action.beforeTabId !== null &&
          !workspaceEntries(state).some(
            (entry) => entry.id === action.beforeTabId,
          ))
      )
        return input;
      return moveStripEntry(
        setEntryPinned(state, action.tabId, action.pinned),
        action.tabId,
        action.beforeTabId,
      );
    }
    case "tabs/insert": {
      const entries = workspaceEntries(state);
      if (
        !action.tabs.length ||
        state.tabs.length + action.tabs.length > 100 ||
        (action.beforeTabId !== null &&
          !entries.some((entry) => entry.id === action.beforeTabId))
      )
        return input;
      const parsed = action.tabs.map((tab) => parseTab(tab, state.connections));
      if (parsed.some((tab) => !tab)) return input;
      let next = state;
      const added: string[] = [];
      for (const tab of parsed) {
        next = addView(
          next,
          {
            ...resourceTabWithPreset(state, tab!),
            pinned: action.pinned,
            preview: false,
          },
          false,
        );
        added.push(activeEntryId(next)!);
      }
      for (const id of added)
        next = moveStripEntry(next, id, action.beforeTabId);
      return addResourceRecents(
        projectEntry(next, added[0]),
        added.flatMap((id) => next.tabs.find((tab) => tab.id === id) ?? []),
      );
    }
    case "resources/apply":
      return projectResourceAction(input, action.payload, action.mode)
        .workspace;
    case "favorites/save":
      return projectFavoriteSave(state, action.tabId).workspace;
    case "favorites/rename": {
      const title = action.title.trim().slice(0, 120);
      if (!title) return input;
      return {
        ...state,
        favorites: state.favorites.map((favorite) =>
          favorite.id === action.favoriteId ? { ...favorite, title } : favorite,
        ),
      };
    }
    case "favorites/remove":
      return {
        ...state,
        favorites: state.favorites.filter(
          (favorite) => favorite.id !== action.favoriteId,
        ),
      };
    case "favorites/open":
      return projectFavoriteOpen(state, action.favoriteId).workspace;
    case "tab/update":
      return legacyWorkspaceReducer(state, action);
    case "connection/select":
      return state.connections.some(
        (connection) => connection.id === action.connectionId,
      )
        ? { ...state, activeConnectionId: action.connectionId }
        : input;
    case "tab/select":
      if (action.paneId)
        return (
          projectWorkspaceDrop(state, action.tabId, action.paneId, null) ??
          input
        );
      return entryFor(state, action.tabId)
        ? activateViewOrEntry(state, action.tabId)
        : input;
    case "tab/open":
    case "tab/preview":
    case "tab/open-resource": {
      if (
        action.paneId &&
        !state.panes.some((pane) => pane.id === action.paneId)
      )
        return input;
      if (action.type !== "tab/open") {
        const parsed = parseTab(action.tab, state.connections);
        if (!parsed) return input;
        const existing = state.tabs.find(
          (tab) => resourceKey(tab) === resourceKey(parsed),
        );
        if (existing) {
          const next =
            action.type === "tab/open-resource"
              ? {
                  ...state,
                  tabs: state.tabs.map((tab) =>
                    tab.id === existing.id ? { ...tab, preview: false } : tab,
                  ),
                }
              : state;
          return action.paneId
            ? (projectWorkspaceDrop(next, existing.id, action.paneId, null) ??
                input)
            : activateViewOrEntry(next, existing.id);
        }
      }
      const opened = addView(
        state,
        action.tab,
        action.type === "tab/preview",
        action.type === "tab/preview",
      );
      if (opened === state) return input;
      if (!action.paneId) return opened;
      const newId = activeEntryId(opened)!;
      const restored = projectEntry(opened, activeEntryId(state));
      return (
        projectWorkspaceDrop(restored, newId, action.paneId, null) ?? input
      );
    }
    case "tab/rename": {
      const entry = entryFor(state, action.tabId),
        title = string(action.title, "", 512).trim();
      if (!entry || !title) return input;
      return entry.kind === "split"
        ? {
            ...state,
            splitTabs: state.splitTabs!.map((split) =>
              split.id === entry.id ? { ...split, title } : split,
            ),
          }
        : {
            ...state,
            tabs: state.tabs.map((tab) =>
              tab.id === entry.id
                ? { ...tab, customTitle: title, preview: false }
                : tab,
            ),
          };
    }
    case "tab/duplicate": {
      const entry = entryFor(state, action.tabId);
      if (!entry || state.tabs.length + entry.tabIds.length > 100) return input;
      let tabs = [...state.tabs];
      const map = new Map<string, string>();
      for (const tabId of entry.tabIds) {
        const original = tabs.find((tab) => tab.id === tabId)!;
        const copy = {
          ...structuredClone(original),
          id: nextId("tab", entryIdentities(state, tabs)),
          preview: false,
        };
        tabs.push(copy);
        map.set(tabId, copy.id);
      }
      const split = state.splitTabs?.find((split) => split.id === entry.id);
      const id = split
        ? nextId("split", entryIdentities(state, tabs))
        : map.get(entry.id)!;
      const copySplit = split
        ? {
            ...structuredClone(split),
            id,
            panes: split.panes.map((pane) => ({
              ...pane,
              tabId: map.get(pane.tabId!)!,
            })),
          }
        : undefined;
      const order = (state.tabOrder ?? []).flatMap((current) =>
        current === entry.id ? [current, id] : [current],
      );
      return orderedFlatTabs(
        projectEntry(
          {
            ...state,
            tabs,
            tabOrder: order,
            splitTabs: copySplit
              ? [...(state.splitTabs ?? []), copySplit]
              : state.splitTabs,
          },
          id,
        ),
      );
    }
    case "tab/close": {
      const entry = workspaceEntries(state).find(
        (entry) => entry.id === action.tabId,
      );
      if (entry?.pinned && !action.allowPinned) return input;
      const ids =
        entry?.tabIds ??
        (state.tabs.some((tab) => tab.id === action.tabId)
          ? [action.tabId]
          : []);
      return ids.length ? closeViews(state, ids) : input;
    }
    case "tab/reopen": {
      const closedTabs = recentClosedTabs(
        state.closedTabs,
        state.preferences.closedTabHistoryDays,
      );
      const tab = action.tabId
        ? closedTabs.find((tab) => tab.id === action.tabId)
        : closedTabs[0];
      if (!tab || state.tabs.length >= 100) return { ...state, closedTabs };
      const { customTitle: _closedAlias, closedAt: _closedAt, ...rest } = tab;
      return addView(
        {
          ...state,
          closedTabs: closedTabs.filter((closed) => closed.id !== tab.id),
        },
        { ...rest, preview: false },
        false,
      );
    }
    case "tab/reorder": {
      const entries = workspaceEntries(state),
        source = entryFor(state, action.tabId);
      if (
        !source ||
        (action.beforeTabId !== null &&
          !entries.some((entry) => entry.id === action.beforeTabId))
      )
        return input;
      return moveStripEntry(state, source.id, action.beforeTabId);
    }
    case "split/exit": {
      const split = state.splitTabs?.find((split) => split.id === action.tabId);
      if (!split) return input;
      const ids = splitMembers(split),
        active =
          split.panes.find((pane) => pane.id === split.activePaneId)?.tabId ??
          ids[0];
      const next = {
        ...state,
        splitTabs: state.splitTabs!.filter((item) => item.id !== split.id),
        tabs: state.tabs.map((tab) =>
          ids.includes(tab.id)
            ? {
                ...tab,
                preview: false,
                ...(split.pinned !== undefined ? { pinned: split.pinned } : {}),
              }
            : tab,
        ),
        tabOrder: (state.tabOrder ?? []).flatMap((id) =>
          id === split.id ? ids : [id],
        ),
      };
      return projectEntry(
        next,
        activeEntryId(state) === split.id ? active : activeEntryId(state),
      );
    }
    case "pane/show-tabs":
      return combineEntries(state, action.tabIds);
    case "pane/detach": {
      if (
        action.beforeTabId !== null &&
        !workspaceEntries(state).some(
          (entry) => entry.id === action.beforeTabId,
        )
      )
        return input;
      const split = state.splitTabs?.find((split) =>
        split.panes.some((pane) => pane.tabId === action.tabId),
      );
      const panel = extractSplitPanel(state, action.tabId);
      const extracted =
        panel && action.pinned !== undefined
          ? setEntryPinned(panel, action.tabId, action.pinned)
          : panel;
      if (!split || !extracted) return input;
      const before =
        action.beforeTabId === split.id && split.panes.length === 2
          ? split.panes.find((pane) => pane.tabId !== action.tabId)!.tabId
          : action.beforeTabId;
      const order = reorder(
        workspaceEntries(extracted),
        action.tabId,
        before,
      ).map((entry) => entry.id);
      return orderedFlatTabs(
        projectEntry({ ...extracted, tabOrder: order }, action.tabId),
      );
    }
    case "pane/drop-resource": {
      const next = projectResourceDrop(
        state,
        action.tab,
        action.paneId,
        action.edge,
      );
      if (!next) return input;
      return addResourceRecents(
        next,
        Array.isArray(action.tab) ? action.tab : [action.tab],
      );
    }
    case "pane/drop-tab":
      return (
        projectWorkspaceDrop(state, action.tabId, action.paneId, action.edge) ??
        input
      );
    case "pane/assign":
      return action.tabId
        ? (projectWorkspaceDrop(state, action.tabId, action.paneId, null) ??
            input)
        : input;
    case "pane/split": {
      const paneId = action.paneId ?? state.activePaneId;
      if (
        !state.panes.some((pane) => pane.id === paneId) ||
        state.panes.length >= MAX_SPLIT_PANES
      )
        return input;
      const edge =
        action.edge ??
        (nextSplitAxis(state.layout!, paneId) === "horizontal"
          ? "right"
          : "bottom");
      const id = action.tabId;
      if (id && !entryFor(state, id)) return input;
      if (id && entryFor(state, id)?.id !== activeEntryId(state))
        return projectWorkspaceDrop(state, id, paneId, edge) ?? input;
      const original = state.tabs.find(
        (tab) =>
          tab.id ===
          (action.tabId ??
            state.panes.find((pane) => pane.id === paneId)?.tabId),
      );
      if (!original || state.tabs.length >= 100) return input;
      const copy = {
        ...structuredClone(original),
        id: nextId("tab", entryIdentities(state)),
        preview: false,
      };
      return (
        projectWorkspaceDrop(
          {
            ...state,
            tabs: [...state.tabs, copy],
            tabOrder: [...(state.tabOrder ?? []), copy.id],
          },
          copy.id,
          paneId,
          edge,
        ) ?? input
      );
    }
    case "pane/close": {
      const entry = entryFor(state, activeEntryId(state) ?? "");
      const pane = state.panes.find((pane) => pane.id === action.paneId);
      return entry?.kind === "split" && pane?.tabId
        ? closeViews(state, [pane.tabId])
        : input;
    }
    case "pane/swap": {
      const one = state.panes.find((pane) => pane.id === action.paneId),
        two = state.panes.find((pane) => pane.id === action.overPaneId);
      if (!one || !two || one === two) return input;
      const panes = state.panes.map((pane) =>
        pane.id === one.id
          ? { ...pane, tabId: two.tabId }
          : pane.id === two.id
            ? { ...pane, tabId: one.tabId }
            : pane,
      );
      const activePaneId =
        state.activePaneId === one.id
          ? two.id
          : state.activePaneId === two.id
            ? one.id
            : state.activePaneId;
      return saveActiveProjection({ ...state, panes, activePaneId });
    }
    case "pane/activate": {
      if (!state.panes.some((pane) => pane.id === action.paneId)) return input;
      const next = saveActiveProjection({
        ...state,
        activePaneId: action.paneId,
      });
      return projectEntry(next, activeEntryId(next));
    }
    case "pane/reorder":
    case "pane/resize": {
      const next = legacyWorkspaceReducer(state, action);
      return next === state ? input : saveActiveProjection(next);
    }
    case "connections/set": {
      const next = legacyWorkspaceReducer(state, action);
      const valid = new Set(next.tabs.map((tab) => tab.id));
      const missing = state.tabs
        .filter((tab) => !valid.has(tab.id))
        .map((tab) => tab.id);
      const repaired = missing.length
        ? closeViews({ ...state, connections: next.connections }, missing)
        : state;
      return projectEntry(
        {
          ...next,
          splitTabs: repaired.splitTabs,
          tabOrder: repaired.tabOrder,
          activeTabId: repaired.activeTabId,
          activeConnectionId: state.activeConnectionId,
        },
        repaired.activeTabId,
      );
    }
    default:
      return legacyWorkspaceReducer(state, action);
  }
}
