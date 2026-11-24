import { DEFAULT_SHORTCUTS } from "./shortcut-definitions";
import { MESSAGE_RULE_LIMIT, SOURCE_NAME_FORMAT_LIMIT } from "./display-rules";
import type {
  ColumnConfig,
  Connection,
  Favorite,
  ViewFavorite,
  LogSource,
  LogTab,
  Pane,
  SplitTab,
  Preferences,
  SavedQuery,
  ViewConfig,
  VisualizationPreset,
  Workspace,
} from "./contracts";
import { comparableGcp } from "./source-identity";
import { tabTitle } from "./source-labels";
import { historyRetentionDays, recentClosedTabs } from "./closed-tab-history";
import { HIGHLIGHT_TEXT_COLORS } from "./quick-highlight";
import { LOG_LEVELS, DEFAULT_TIMESTAMP_COLUMN_WIDTH } from "./log-data";
import { parseHighlightProfiles } from "./highlights";
import {
  legacyLayout,
  normalizeLayout,
  removeLayoutPane,
  MAX_SPLIT_PANES,
} from "./pane-layout";
import { workspaceEntries } from "./workspace-entries";
import { parseRelativePreset } from "./query-state";
import { normalizeRelativeTimeTemplates } from "./relative-time-templates";
import {
  DEFAULT_RECENT_SEARCHES_LIMIT,
  MAX_RECENT_SEARCHES_LIMIT,
} from "./query-history";
import {
  LIVE_SLEEP_BACKGROUND_MINUTES,
  LIVE_SLEEP_IDLE_MINUTES,
  MAX_LIVE_SLEEP_MINUTES,
} from "./live-catch-up";

export const OFFLINE_CONNECTION: Connection = {
  id: "offline",
  name: "Offline fixtures",
  profile: "default",
  region: "eu-west-1",
  mode: "offline",
};

const AWS_DEFAULT_CONNECTION: Connection = {
  id: "aws-default",
  name: "AWS",
  profile: "default",
  region: "eu-west-1",
  mode: "aws",
};

// Offline fixtures exist only in development, verification builds and tests.
let fixturesAvailable = true;

export function setFixturesAvailable(value: boolean): void {
  fixturesAvailable = value;
}

/** Drops fixture sources from a raw tab; a tab with only fixture sources is removed. */
function withoutFixtureSources(value: unknown, offline: Set<string>): unknown {
  const raw = record(value);
  const primary = string(raw.connectionId, "", 160);
  const sources = (Array.isArray(raw.sources) ? raw.sources : []).filter(
    (source) => {
      const id = record(source).connectionId;
      return !offline.has(typeof id === "string" && id ? id : primary);
    },
  );
  if (!sources.length) return null;
  if (!offline.has(primary)) return { ...raw, sources };
  return { ...raw, connectionId: record(sources[0]).connectionId, sources };
}

const DEFAULT_PREFERENCES: Preferences = {
  profileVisibility: {},
  theme: "dark",
  density: "compact",
  tabBarLayout: "scroll",
  pinnedTabsSeparateRow: false,
  settingsDetached: false,
  closedTabHistoryDays: 7,
  recentSearchesLimit: DEFAULT_RECENT_SEARCHES_LIMIT,
  liveSleepBackgroundMinutes: LIVE_SLEEP_BACKGROUND_MINUTES,
  liveSleepIdleMinutes: LIVE_SLEEP_IDLE_MINUTES,
  fontSize: 12,
  maxEvents: 10000,
  sourceDetailsHeight: 220,
  timezone: "local",
  highlightText: "",
  autoExpandFilterMatches: true,
  newColumnPosition: "before-message",
  shortcuts: { ...DEFAULT_SHORTCUTS },
};

const record = (value: unknown): Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};

export const string = (value: unknown, fallback = "", max = 10000): string =>
  typeof value === "string" ? value.slice(0, max) : fallback;

export const number = (
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

export function unique<T extends { id: string }>(items: T[]): T[] {
  const ids = new Set<string>();
  return items.filter(
    (item) => item.id && !ids.has(item.id) && Boolean(ids.add(item.id)),
  );
}

export function nextId(prefix: string, items: { id: string }[]): string {
  let index = 1;
  while (items.some((item) => item.id === prefix + "-" + index)) index++;
  return prefix + "-" + index;
}

/** View IDs and combined entry IDs share one namespace, including reopen history. */
export function entryIdentities(
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

function parseHome(value: unknown): Pick<ColumnConfig, "home"> {
  const { left, right } = record(value);
  const home = {
    ...(typeof left === "string" ? { left: string(left, "", 2048) } : {}),
    ...(typeof right === "string" ? { right: string(right, "", 2048) } : {}),
  };
  return Object.keys(home).length ? { home } : {};
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
            ...(column.pinned === true ? parseHome(column.home) : {}),
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
    ...(Array.isArray(raw.hiddenSources) && raw.hiddenSources.length
      ? {
          hiddenSources: [
            ...new Set(
              raw.hiddenSources.filter(
                (key): key is string =>
                  typeof key === "string" &&
                  key.length > 0 &&
                  key.length <= 4096,
              ),
            ),
          ].slice(0, 200),
        }
      : {}),
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
      const googleKind: "function" | "kubernetes" | undefined =
        google.kind === "function" || google.kind === "kubernetes"
          ? google.kind
          : undefined;
      const gcp: LogSource["gcp"] = googleKind
        ? {
            kind: googleKind,
            project: string(google.project, "", 30),
            region: string(google.region, "", 40),
            ...(typeof google.functionName === "string"
              ? { functionName: string(google.functionName, "", 253) }
              : {}),
            ...(google.generation === "v1" || google.generation === "v2"
              ? { generation: google.generation }
              : {}),
            ...(typeof google.service === "string"
              ? { service: string(google.service, "", 253) }
              : {}),
            ...(typeof google.cluster === "string"
              ? { cluster: string(google.cluster, "", 253) }
              : {}),
            ...(typeof google.namespace === "string"
              ? { namespace: string(google.namespace, "", 253) }
              : {}),
            ...(typeof google.container === "string"
              ? { container: string(google.container, "", 253) }
              : {}),
          }
        : undefined;
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
          JSON.stringify(comparableGcp(other.gcp)) ===
            JSON.stringify(comparableGcp(source.gcp)) &&
          JSON.stringify(other.logStreams) ===
            JSON.stringify(source.logStreams),
      ) === index,
  );
}

export function baseTab(
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

export function parseTab(
  value: unknown,
  connections: Connection[],
): LogTab | null {
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
    ...(typeof raw.favoriteId === "string" && raw.favoriteId
      ? { favoriteId: string(raw.favoriteId, "", 160) }
      : {}),
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
      raw.filterMode === "plain" ||
      raw.filterMode === "auto" ||
      raw.filterMode === "unified" ||
      raw.filterMode === "aws-pattern" ||
      raw.filterMode === "gcp-pattern"
        ? raw.filterMode
        : "pattern",
    ...(raw.gcpLogType === "audit" || raw.gcpLogType === "execution"
      ? { gcpLogType: raw.gcpLogType }
      : {}),
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

export function parseConnection(value: unknown): Connection | null {
  const raw = record(value);
  const id = string(raw.id, "", 160);
  if (!id) return null;
  const region = string(raw.region, "eu-west-1", 40);
  const google = record(raw.gcpIdentity);
  const googleIdentity =
    raw.mode === "gcp" &&
    typeof google.configuration === "string" &&
    !!google.configuration &&
    typeof google.account === "string" &&
    !!google.account
      ? {
          configuration: string(google.configuration, "", 256),
          account: string(google.account, "", 256),
          ...(typeof google.quotaProject === "string" && google.quotaProject
            ? { quotaProject: string(google.quotaProject, "", 256) }
            : {}),
        }
      : undefined;
  if (raw.mode === "gcp" && !googleIdentity) return null;
  return {
    id,
    name: string(raw.name, "Connection", 120) || "Connection",
    profile: string(raw.profile, "default", 256) || "default",
    region: (raw.mode === "gcp"
      ? /^[a-z][a-z0-9-]{1,39}$/
      : /^[a-z]{2}(?:-[a-z]+)+-\d+$/
    ).test(region)
      ? region
      : "eu-west-1",
    mode: raw.mode === "gcp" ? "gcp" : raw.mode === "aws" ? "aws" : "offline",
    ...(googleIdentity ? { gcpIdentity: googleIdentity } : {}),
    ...(typeof raw.enabled === "boolean" ? { enabled: raw.enabled } : {}),
  };
}

export function parsePreferences(value: unknown): Preferences {
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
    liveSleepBackgroundMinutes: number(
      raw.liveSleepBackgroundMinutes,
      LIVE_SLEEP_BACKGROUND_MINUTES,
      0,
      MAX_LIVE_SLEEP_MINUTES,
    ),
    liveSleepIdleMinutes: number(
      raw.liveSleepIdleMinutes,
      LIVE_SLEEP_IDLE_MINUTES,
      0,
      MAX_LIVE_SLEEP_MINUTES,
    ),
    relativeTimeTemplates: normalizeRelativeTimeTemplates(
      raw.relativeTimeTemplates,
    ),
    fontSize: number(raw.fontSize, 12, 10, 20),
    maxEvents: Math.round(number(raw.maxEvents, 10000, 100, 100000)),
    sourceDetailsHeight: number(raw.sourceDetailsHeight, 220, 80, 1000),
    timezone: raw.timezone === "utc" ? "utc" : "local",
    highlightText: string(raw.highlightText, "", 1000),
    highlightTextColors: Object.fromEntries(
      (["light", "dark"] as const).flatMap((theme) => {
        const color = HIGHLIGHT_TEXT_COLORS.find(
          (item) => item === record(raw.highlightTextColors)[theme],
        );
        return color ? [[theme, color]] : [];
      }),
    ),
    autoExpandFilterMatches: raw.autoExpandFilterMatches !== false,
    newColumnPosition:
      raw.newColumnPosition === "first" ||
      raw.newColumnPosition === "after-message" ||
      raw.newColumnPosition === "last"
        ? raw.newColumnPosition
        : "before-message",
    sourceNameFormats: {
      aws: string(
        record(raw.sourceNameFormats).aws,
        "",
        SOURCE_NAME_FORMAT_LIMIT,
      ),
      gcp: string(
        record(raw.sourceNameFormats).gcp,
        "",
        SOURCE_NAME_FORMAT_LIMIT,
      ),
    },
    messageRules: unique(
      list(raw.messageRules, MESSAGE_RULE_LIMIT).flatMap((value) => {
        const rule = record(value);
        return typeof rule.id === "string" && rule.id.length <= 120
          ? [
              {
                id: rule.id,
                source: string(rule.source, "", 512),
                path: string(rule.path, "", 512),
                ...(rule.regex === true ? { regex: true } : {}),
                ...(rule.caseSensitive === true ? { caseSensitive: true } : {}),
              },
            ]
          : [];
      }),
    ),
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

export function parseFavorite(
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

export function sameFavorite(one: Favorite, two: Favorite): boolean {
  return (
    one.connectionId === two.connectionId &&
    one.logGroup === two.logGroup &&
    one.logStream === two.logStream
  );
}

export function parseQuery(value: unknown): SavedQuery | null {
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
    raw.filterMode === "unified" ||
    raw.filterMode === "aws-pattern" ||
    raw.filterMode === "gcp-pattern" ||
    raw.filterMode === "pattern"
      ? { filterMode: raw.filterMode }
      : {}),
  };
}

export function parsePreset(value: unknown): VisualizationPreset | null {
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

export function parseSplitSizes(value: unknown): {
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
  if (!fixturesAvailable)
    return {
      version: 1,
      name: "Investigation workspace",
      connections: [{ ...AWS_DEFAULT_CONNECTION }],
      tabs: [],
      splitTabs: [],
      tabOrder: [],
      activeTabId: null,
      activeConnectionId: AWS_DEFAULT_CONNECTION.id,
      closedTabs: [],
      panes: [{ id: "pane-1", tabId: null }],
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
  const parsedConnections = unique(
    list(raw.connections, 50).map(parseConnection).filter(valid),
  );
  const offline = new Set(
    fixturesAvailable
      ? []
      : parsedConnections
          .filter((connection) => connection.mode === "offline")
          .map((connection) => connection.id),
  );
  const connections = parsedConnections.filter(
    (connection) => !offline.has(connection.id),
  );
  if (!connections.length)
    connections.push(
      fixturesAvailable
        ? { ...OFFLINE_CONNECTION }
        : { ...AWS_DEFAULT_CONNECTION },
    );
  const stripFixtures = (tab: unknown) =>
    offline.size ? withoutFixtureSources(tab, offline) : tab;
  const tabs = Array.isArray(raw.tabs)
    ? unique(
        list(raw.tabs, 100)
          .map(stripFixtures)
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
        .map(stripFixtures)
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

export function splitMembers(split: SplitTab): string[] {
  return split.panes.flatMap((pane) => (pane.tabId ? [pane.tabId] : []));
}

export function projectEntry(
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
export function normalizeWorkspaceEntries(
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
      ...(typeof item.favoriteId === "string" && item.favoriteId
        ? { favoriteId: string(item.favoriteId, "", 160) }
        : {}),
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
