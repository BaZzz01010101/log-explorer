import type {
  Connection,
  Favorite,
  LogSource,
  LogTab,
  Pane,
  SplitEdge,
  Preferences,
  SavedQuery,
  TabGroup,
  ViewConfig,
  VisualizationPreset,
  Workspace,
} from "../shared/contracts";
import {
  legacyLayout,
  normalizeLayout,
  removeLayoutPane,
  splitLayout,
  resizeLayout,
  mapLayoutIds,
  nextSplitAxis,
} from "../shared/pane-layout";

export type WorkspaceAction =
  | { type: "tab/open"; tab: LogTab; paneId?: string }
  | { type: "tab/preview" | "tab/open-resource"; tab: LogTab; paneId?: string }
  | { type: "tab/promote"; tabId: string }
  | { type: "tab/select"; tabId: string; paneId?: string }
  | { type: "tab/update"; tabId: string; patch: Partial<LogTab> }
  | { type: "tab/close"; tabId: string }
  | { type: "tab/reopen" }
  | { type: "tab/reorder"; tabId: string; beforeTabId: string | null }
  | { type: "tab/group"; tabIds: string[]; groupId?: string }
  | { type: "pane/split"; tabId?: string; paneId?: string; edge?: SplitEdge }
  | { type: "pane/drop-tab"; tabId: string; paneId: string; edge: SplitEdge }
  | { type: "pane/show-tabs"; tabIds: string[] }
  | { type: "pane/resize"; path: string; ratio: number }
  | { type: "pane/close"; paneId: string }
  | { type: "pane/assign"; paneId: string; tabId: string | null }
  | { type: "pane/reorder"; paneId: string; beforePaneId: string | null }
  | { type: "pane/activate"; paneId: string }
  | { type: "group/add"; group: TabGroup }
  | { type: "group/update"; groupId: string; patch: Partial<TabGroup> }
  | { type: "group/remove"; groupId: string }
  | { type: "group/reorder"; groupId: string; beforeGroupId: string | null }
  | { type: "connections/set"; connections: Connection[] }
  | { type: "preferences/update"; patch: Partial<Preferences> }
  | { type: "favorites/toggle"; favorite: Favorite }
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
  theme: "dark",
  density: "compact",
  fontSize: 12,
  maxEvents: 10000,
  refreshSeconds: 0,
  timezone: "local",
  highlightText: "",
  shortcuts: {
    closeTab: "Control+W",
    reopenTab: "Control+Shift+T",
    nextTab: "Control+Tab",
    previousTab: "Control+Shift+Tab",
    splitPane: "Control+\\",
    toggleSidebar: "Control+B",
    runQuery: "Control+Enter",
  },
};
const GROUP_COLORS = new Set([
  "blue",
  "cyan",
  "teal",
  "green",
  "yellow",
  "orange",
  "red",
  "pink",
  "grape",
  "violet",
]);
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
function defaultView(): ViewConfig {
  return {
    mode: "hybrid",
    columns: [
      { path: "@timestamp", width: 194, pinned: true },
      { path: "@level", width: 84 },
      { path: "/service/name", width: 150 },
      { path: "@message", width: 420 },
      { path: "/request/id", width: 220 },
    ],
    localSearch: "",
    level: "",
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
  return {
    mode: raw.mode === "table" || raw.mode === "json" ? raw.mode : "hybrid",
    columns: columns.filter(
      (column, index) =>
        columns.findIndex((other) => other.path === column.path) === index,
    ),
    localSearch: string(raw.localSearch),
    level: string(raw.level, "", 40),
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
      const logStreams = list(raw.logStreams, 100)
        .filter((stream): stream is string => typeof stream === "string")
        .map((stream) => stream.slice(0, 512))
        .filter(Boolean);
      return {
        logGroup: string(raw.logGroup, "", 512),
        ...(logStreams.length ? { logStreams: [...new Set(logStreams)] } : {}),
      };
    })
    .filter((source) => source.logGroup);
  return sources.filter(
    (source, index) =>
      sources.findIndex(
        (other) =>
          other.logGroup === source.logGroup &&
          JSON.stringify(other.logStreams) ===
            JSON.stringify(source.logStreams),
      ) === index,
  );
}
function tabTitle(sources: LogSource[]): string {
  if (!sources.length) return "Log view";
  const title =
    sources[0].logGroup.split("/").filter(Boolean).at(-1) ||
    sources[0].logGroup;
  return sources.length > 1 ? title + " +" + (sources.length - 1) : title;
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
    query:
      "fields @timestamp, @message, @logStream\n| sort @timestamp desc\n| limit 1000",
    timePreset: "1h",
    view: defaultView(),
  };
}
function parseTab(
  value: unknown,
  connections: Connection[],
  groups: TabGroup[],
): LogTab | null {
  const raw = record(value);
  const id = string(raw.id, "", 160);
  const connectionId = string(raw.connectionId, "", 160);
  if (!id || !connections.some((connection) => connection.id === connectionId))
    return null;
  const sources = parseSources(raw.sources);
  const defaults = baseTab(id, connectionId, sources);
  const groupId = string(raw.groupId, "", 160);
  return {
    ...defaults,
    ...(typeof raw.preview === "boolean" ? { preview: raw.preview } : {}),
    title: string(raw.title, defaults.title, 512),
    kind: raw.kind === "insights" ? "insights" : "events",
    filterPattern: string(raw.filterPattern),
    query: string(raw.query, defaults.query, 10000),
    timePreset: [
      "5m",
      "15m",
      "30m",
      "1h",
      "3h",
      "6h",
      "12h",
      "24h",
      "7d",
      "custom",
    ].includes(String(raw.timePreset))
      ? String(raw.timePreset)
      : "1h",
    ...(typeof raw.customStart === "string"
      ? { customStart: string(raw.customStart, "", 100) }
      : {}),
    ...(typeof raw.customEnd === "string"
      ? { customEnd: string(raw.customEnd, "", 100) }
      : {}),
    ...(groups.some((group) => group.id === groupId) ? { groupId } : {}),
    view: parseView(raw.view),
  };
}
function parseConnection(value: unknown): Connection | null {
  const raw = record(value);
  const id = string(raw.id, "", 160);
  if (!id) return null;
  const region = string(raw.region, "eu-west-1", 40);
  return {
    id,
    name: string(raw.name, "Connection", 120) || "Connection",
    profile: string(raw.profile, "default", 256) || "default",
    region: /^[a-z]{2}(?:-[a-z]+)+-\d+$/.test(region) ? region : "eu-west-1",
    mode: raw.mode === "aws" ? "aws" : "offline",
  };
}
function parseGroup(value: unknown): TabGroup | null {
  const raw = record(value);
  const id = string(raw.id, "", 160);
  if (!id) return null;
  const color = string(raw.color, "blue", 40);
  return {
    id,
    name: string(raw.name, "Group", 120),
    color: GROUP_COLORS.has(color) ? color : "blue",
    ...(typeof raw.collapsed === "boolean" ? { collapsed: raw.collapsed } : {}),
  };
}
function parsePreferences(value: unknown): Preferences {
  const raw = record(value);
  const shortcuts: Record<string, string> = {
    ...DEFAULT_PREFERENCES.shortcuts,
  };
  for (const [name, shortcut] of Object.entries(record(raw.shortcuts)).slice(
    0,
    50,
  )) {
    if (
      Object.hasOwn(DEFAULT_PREFERENCES.shortcuts, name) &&
      typeof shortcut === "string"
    )
      shortcuts[name] = shortcut.slice(0, 80);
  }
  return {
    theme: raw.theme === "light" ? "light" : "dark",
    density: raw.density === "comfortable" ? "comfortable" : "compact",
    fontSize: number(raw.fontSize, 12, 10, 20),
    maxEvents: Math.round(number(raw.maxEvents, 10000, 100, 100000)),
    refreshSeconds:
      raw.refreshSeconds === 0
        ? 0
        : Math.round(number(raw.refreshSeconds, 30, 5, 3600)),
    timezone: raw.timezone === "utc" ? "utc" : "local",
    highlightText: string(raw.highlightText, "", 1000),
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
  const validConnection = (tab: LogTab) =>
    state.connections.some((connection) => connection.id === tab.connectionId);
  const cleanTab = (tab: LogTab): LogTab => {
    if (!tab.groupId || state.groups.some((group) => group.id === tab.groupId))
      return tab;
    const { groupId: _removed, ...rest } = tab;
    return rest;
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
    favorites: state.favorites.filter((favorite) =>
      state.connections.some(
        (connection) => connection.id === favorite.connectionId,
      ),
    ),
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
    closedTabs: [],
    groups: [],
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
  const groups = unique(list(raw.groups, 100).map(parseGroup).filter(valid));
  const tabs = Array.isArray(raw.tabs)
    ? unique(
        list(raw.tabs, 100)
          .map((tab) => parseTab(tab, connections, groups))
          .filter(valid),
      )
    : defaults.tabs.filter((tab) =>
        connections.some((connection) => connection.id === tab.connectionId),
      );
  const closedTabs = unique(
    list(raw.closedTabs, 30)
      .map((tab) => parseTab(tab, connections, groups))
      .filter(valid),
  ).filter((tab) => !tabs.some((open) => open.id === tab.id));
  const shown = new Set<string>();
  const panes: Pane[] = unique(
    list(raw.panes, 4).map((value, index) => {
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
  return {
    version: 1,
    name: string(raw.name, defaults.name, 120),
    connections,
    tabs,
    closedTabs,
    groups,
    panes,
    activePaneId: panes.some((pane) => pane.id === activePaneId)
      ? activePaneId
      : panes[0].id,
    sidebarWidth: number(raw.sidebarWidth, 280, 180, 600),
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
    favorites: favorites(raw.favorites, 500),
    recents: favorites(raw.recents, 100),
    savedQueries: unique(
      list(raw.savedQueries, 500).map(parseQuery).filter(valid),
    ),
    history: unique(list(raw.history, 100).map(parseQuery).filter(valid)),
    presets: unique(list(raw.presets, 500).map(parsePreset).filter(valid)),
    preferences: parsePreferences(raw.preferences),
  };
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
      source.logGroup,
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
  const parsed = parseTab(input, state.connections, state.groups);
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
    return workspaceReducer(next, {
      type: "tab/select",
      tabId: existing.id,
      paneId,
    });
  }
  const tab = {
    ...parsed,
    id: state.tabs.some((tab) => tab.id === parsed.id)
      ? nextId("tab", [...state.tabs, ...state.closedTabs])
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
    return workspaceReducer(state, { type: "tab/open", tab, paneId: targetId });
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

export function workspaceReducer(
  state: Workspace,
  action: WorkspaceAction,
): Workspace {
  switch (action.type) {
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
          600,
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
      const parsed = parseTab(action.tab, state.connections, state.groups);
      if (!parsed) return state;
      const tab = {
        ...parsed,
        id: state.tabs.some((tab) => tab.id === parsed.id)
          ? nextId("tab", [...state.tabs, ...state.closedTabs])
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
              { ...tab, ...action.patch, id: tab.id },
              state.connections,
              state.groups,
            ) ?? tab;
          const edited =
            parsed.filterPattern !== tab.filterPattern ||
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
      return workspaceReducer(
        { ...state, closedTabs: state.closedTabs.slice(1) },
        { type: "tab/open", tab: { ...tab, preview: false } },
      );
    }
    case "tab/reorder":
      return {
        ...state,
        tabs: reorder(state.tabs, action.tabId, action.beforeTabId),
      };
    case "tab/group": {
      if (
        action.groupId &&
        !state.groups.some((group) => group.id === action.groupId)
      )
        return state;
      return {
        ...state,
        tabs: state.tabs.map((tab) => {
          if (!action.tabIds.includes(tab.id)) return tab;
          const { groupId: _previous, ...rest } = tab;
          return action.groupId ? { ...rest, groupId: action.groupId } : rest;
        }),
      };
    }
    case "pane/split": {
      if (state.panes.length >= 4) return state;
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
          id: nextId("tab", [...state.tabs, ...state.closedTabs]),
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
        ? workspaceReducer(state, { type: "pane/close", paneId: from.id })
        : state;
      return workspaceReducer(next, {
        type: "pane/split",
        paneId: target.id,
        tabId: source.id,
        edge: action.edge,
      });
    }
    case "pane/show-tabs": {
      const ids = [...new Set(action.tabIds)].filter((id) =>
        state.tabs.some((tab) => tab.id === id),
      );
      if (ids.length < 2 || ids.length > 4) return state;
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
      if (!/^[01]{0,3}$/.test(action.path) || !Number.isFinite(action.ratio))
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
    case "group/add": {
      const group = parseGroup(action.group);
      return group &&
        !state.groups.some((existing) => existing.id === group.id) &&
        state.groups.length < 100
        ? { ...state, groups: [...state.groups, group] }
        : state;
    }
    case "group/update":
      return {
        ...state,
        groups: state.groups.map((group) =>
          group.id === action.groupId
            ? (parseGroup({ ...group, ...action.patch, id: group.id }) ?? group)
            : group,
        ),
      };
    case "group/remove":
      return cleanLinks({
        ...state,
        groups: state.groups.filter((group) => group.id !== action.groupId),
      });
    case "group/reorder":
      return {
        ...state,
        groups: reorder(state.groups, action.groupId, action.beforeGroupId),
      };
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
    case "preferences/update":
      return {
        ...state,
        preferences: parsePreferences({
          ...state.preferences,
          ...action.patch,
        }),
      };
    case "favorites/toggle": {
      const favorite = parseFavorite(action.favorite, state.connections);
      if (!favorite) return state;
      return {
        ...state,
        favorites: state.favorites.some((item) => sameFavorite(item, favorite))
          ? state.favorites.filter((item) => !sameFavorite(item, favorite))
          : [...state.favorites, favorite].slice(-500),
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
                  (item.kind !== query.kind || item.text !== query.text),
              ),
            ].slice(0, 100),
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
