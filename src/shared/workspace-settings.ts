/** Actions on connections, preferences and saved searches. */
import { recentClosedTabs } from "./closed-tab-history";
import type { Connection, Workspace } from "./contracts";
import { DEFAULT_RECENT_SEARCHES_LIMIT } from "./query-history";
import { addRecent } from "./workspace-drop";
import { cleanLinks, closeViews } from "./workspace-entry-state";
import {
  OFFLINE_CONNECTION,
  number,
  parseConnection,
  parsePreferences,
  parsePreset,
  parseQuery,
  parseSplitSizes,
  projectEntry,
  string,
  unique,
} from "./workspace-parse";
import type { WorkspaceAction } from "./workspace-types";

/** Replaces the connections; views and favorites keep only existing ones. */
function withConnections(
  state: Workspace,
  replacement: readonly Connection[],
): Workspace {
  const connections = unique(
    replacement
      .slice(0, 50)
      .map(parseConnection)
      .filter((connection): connection is Connection => connection !== null),
  );
  return cleanLinks({
    ...state,
    connections: connections.length ? connections : [{ ...OFFLINE_CONNECTION }],
  });
}

/** Replaces the connections and closes the views that lost theirs. */
export function setConnections(
  state: Workspace,
  connections: readonly Connection[],
): Workspace {
  const next = withConnections(state, connections);
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

/** Connections, preferences and saved searches. */
export function reduceSettings(
  state: Workspace,
  input: Workspace,
  action: WorkspaceAction,
): Workspace | undefined {
  switch (action.type) {
    case "connection/select":
      return state.connections.some(
        (connection) => connection.id === action.connectionId,
      )
        ? { ...state, activeConnectionId: action.connectionId }
        : input;
    case "connections/set":
      return setConnections(state, action.connections);
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
    case "recents/add":
      return addRecent(state, action.favorite);
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
      return undefined;
  }
}
