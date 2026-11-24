/** Saved views: saving, opening and the links of open views to them. */
import type { Connection, ViewFavorite, LogTab, Workspace } from "./contracts";
import type { ResourcePayload } from "./resource-payload";
import { comparableGcp } from "./source-identity";
import { projectResourceAction } from "./workspace-drop";
import { activeEntryId, workspaceEntries } from "./workspace-entries";
import {
  unlinkFavorite,
  modelState,
  orderedFlatTabs,
  previewEntry,
  activateViewOrEntry,
} from "./workspace-entry-state";
import {
  entryIdentities,
  nextId,
  parseTab,
  projectEntry,
} from "./workspace-parse";
import { setConnections } from "./workspace-settings";
import type { WorkspaceAction } from "./workspace-types";

/** Configuration of a view for a favorite, which is never pinned. */
export function favoriteView<
  T extends { favoriteId?: string; pinned?: boolean },
>(view: T): T {
  const copy = { ...unlinkFavorite(view) };
  delete copy.pinned;
  return structuredClone(copy);
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
    favoriteView(state.tabs.find((tab) => tab.id === id)!),
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
    ...(split ? { split: favoriteView(split) } : {}),
    timezone: state.preferences.timezone,
  };
}

/** The saved configuration, without the favorite's own ID and name. */
export function favoriteSnapshot({
  id: _id,
  title: _title,
  ...saved
}: ViewFavorite) {
  return JSON.stringify({
    ...saved,
    // Pinning and preview belong to the tab; older favorites saved them.
    tabs: saved.tabs.map(
      ({ pinned: _pinned, preview: _preview, ...tab }) => tab,
    ),
    split: saved.split && favoriteView(saved.split),
  });
}

/** Clicking a favorite shows the view it was saved from while that is open. */
export function linkFavorite(
  state: Workspace,
  entryId: string,
  favoriteId: string,
): Workspace {
  const link = <T extends { id: string; favoriteId?: string }>(view: T) =>
    view.id === entryId && view.favoriteId !== favoriteId
      ? { ...view, favoriteId }
      : view;
  return {
    ...state,
    tabs: state.tabs.map(link),
    splitTabs: state.splitTabs?.map(link),
  };
}

export function projectFavoriteSave(
  input: Workspace,
  tabId: string,
): { workspace: Workspace; error?: string } {
  const state = modelState(input),
    favorite = captureViewFavorite(state, tabId);
  if (!favorite) return { workspace: input };
  const entryId = favorite.split?.id ?? favorite.tabs[0].id;
  const snapshot = favoriteSnapshot(favorite);
  const existing = state.favorites.find(
    (saved) => favoriteSnapshot(saved) === snapshot,
  );
  if (existing) return { workspace: linkFavorite(state, entryId, existing.id) };
  if (state.favorites.length >= 500)
    return {
      workspace: input,
      error:
        "The workspace can hold up to 500 saved views. Remove an unused favorite and try again.",
    };
  const next = linkFavorite(
    { ...state, favorites: [...state.favorites, favorite] },
    entryId,
    favorite.id,
  );
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

/**
 * Save dragged Explorer resources as a favorite view: the selection becomes one
 * multi-source view, exactly as "Open in new tab" would build it, without
 * opening it or registering its connection in the live workspace.
 */
export function projectResourceFavorite(
  input: Workspace,
  payload: ResourcePayload,
): { workspace: Workspace; error?: string } {
  const state = modelState(input);
  let staged = state;
  const missing = (payload.connections ?? []).filter(
    (connection, index, all) =>
      all.findIndex((item) => item.id === connection.id) === index &&
      !state.connections.some((item) => item.id === connection.id),
  );
  if (missing.length) {
    if (state.connections.length + missing.length > 50)
      return {
        workspace: input,
        error:
          "Connection limit reached. Remove an unused connection and retry.",
      };
    staged = setConnections(state, [...state.connections, ...missing]);
  }
  const opened = projectResourceAction(staged, payload, "new-multisource");
  if (opened.error) return { workspace: input, error: opened.error };
  const entry = activeEntryId(opened.workspace);
  if (!entry || opened.workspace === staged) return { workspace: input };
  const saved = projectFavoriteSave(opened.workspace, entry);
  if (saved.error) return { workspace: input, error: saved.error };
  const added = saved.workspace.favorites.at(-1);
  if (saved.workspace.favorites === opened.workspace.favorites || !added)
    return { workspace: input };
  // Fresh tabs get new ids, so compare the saved configuration without them.
  const shape = ({ id: _id, title: _title, tabs, ...rest }: ViewFavorite) =>
    JSON.stringify({ ...rest, tabs: tabs.map(({ id: _tab, ...tab }) => tab) });
  if (state.favorites.some((favorite) => shape(favorite) === shape(added)))
    return { workspace: input };
  return { workspace: { ...state, favorites: saved.workspace.favorites } };
}

export function openViewFavorite(
  input: Workspace,
  favorite: ViewFavorite,
  reuse = false,
): Workspace {
  const state = modelState(input);
  // One reusable preview tab, shared with the Explorer; splits have none.
  const replace =
    reuse && !favorite.split ? previewEntry(state)?.id : undefined;
  if (!replace && state.tabs.length + favorite.tabs.length > 100) return input;
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
        ...favoriteView(saved),
        id: nextId("tab", entryIdentities(state, tabs)),
        preview: reuse && !favorite.split,
        ...(!favorite.split
          ? { customTitle: favorite.title, favoriteId: favorite.id }
          : {}),
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
    const index = tabs.findIndex((tab) => tab.id === replace);
    if (index >= 0) tabs[index] = copy;
    else tabs.push(copy);
    tabIds.set(saved.id, copy.id);
  }
  const id = favorite.split
    ? nextId("split", entryIdentities(state, tabs))
    : tabIds.get(favorite.tabs[0].id)!;
  const savedSplit = favorite.split ? { ...favorite.split } : undefined;
  const split = savedSplit
    ? {
        ...favoriteView(savedSplit),
        title: favorite.title,
        favoriteId: favorite.id,
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
        tabOrder: replace
          ? (state.tabOrder ?? []).map((entryId) =>
              entryId === replace ? id : entryId,
            )
          : [...(state.tabOrder ?? []), id],
        preferences: { ...state.preferences, timezone: favorite.timezone },
      },
      id,
    ),
  );
}

/** The views of a tab or split as the set of sources each one reads. */
export function paneSources(tabs: LogTab[], connections: Connection[]): string {
  return JSON.stringify(
    tabs
      .map((tab) =>
        JSON.stringify(
          tab.sources
            .map((source) => {
              const id = source.connectionId ?? tab.connectionId;
              const connection = connections.find((item) => item.id === id);
              // Opening a favorite finds its connections by the same fields.
              return JSON.stringify([
                connection?.mode,
                connection?.profile,
                connection?.region,
                source.logGroup,
                comparableGcp(source.gcp),
                [...(source.logStreams ?? [])].sort(),
              ]);
            })
            .sort(),
        ),
      )
      .sort(),
  );
}

export function projectFavoriteOpen(
  input: Workspace,
  favoriteId: string,
  reuse = false,
): { workspace: Workspace; error?: string } {
  const favorite = input.favorites.find(
    (favorite) => favorite.id === favoriteId,
  );
  if (!favorite) return { workspace: input };
  if (reuse) {
    const state = modelState(input);
    // A view that joined a split is no longer the favorite's own tab.
    const entries = new Map(
      workspaceEntries(state).map((entry) => [entry.id, entry]),
    );
    const saved = paneSources(favorite.tabs, favorite.connections);
    // Nor is one whose panes or sources changed since.
    const open = (favorite.split ? (state.splitTabs ?? []) : state.tabs).filter(
      (view) => {
        const entry = entries.get(view.id);
        return (
          view.favoriteId === favoriteId &&
          entry &&
          paneSources(
            entry.tabIds.map((id) => state.tabs.find((tab) => tab.id === id)!),
            state.connections,
          ) === saved
        );
      },
    );
    const active = activeEntryId(state);
    let shown: { id: string } | undefined =
      open.find((view) => view.id === active) ?? open[0];
    if (!shown) {
      // Favorites saved before links existed: their unchanged original view.
      const id = favorite.split?.id ?? favorite.tabs[0].id;
      const original = entries.has(id) && captureViewFavorite(state, id);
      if (original && favoriteSnapshot(original) === favoriteSnapshot(favorite))
        shown = { id };
    }
    if (shown) return { workspace: activateViewOrEntry(state, shown.id) };
  }
  const next = openViewFavorite(input, favorite, reuse);
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

/** Saved views. */
export function reduceFavorites(
  state: Workspace,
  input: Workspace,
  action: WorkspaceAction,
): Workspace | undefined {
  switch (action.type) {
    case "favorites/save":
      return projectFavoriteSave(state, action.tabId).workspace;
    case "favorites/save-resources":
      return projectResourceFavorite(state, action.payload).workspace;
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
    case "favorites/move": {
      const moving = state.favorites.find(
        (favorite) => favorite.id === action.favoriteId,
      );
      if (!moving || action.beforeFavoriteId === moving.id) return input;
      const rest = state.favorites.filter((favorite) => favorite !== moving);
      const at =
        action.beforeFavoriteId === null
          ? rest.length
          : rest.findIndex(
              (favorite) => favorite.id === action.beforeFavoriteId,
            );
      if (at < 0) return input;
      const favorites = [...rest.slice(0, at), moving, ...rest.slice(at)];
      return favorites.every(
        (favorite, index) => favorite === state.favorites[index],
      )
        ? input
        : { ...state, favorites };
    }
    case "favorites/remove": {
      // A later favorite can get this ID again.
      const unlink = <T extends { favoriteId?: string }>(view: T) =>
        view.favoriteId === action.favoriteId ? unlinkFavorite(view) : view;
      return {
        ...state,
        tabs: state.tabs.map(unlink),
        closedTabs: state.closedTabs.map(unlink),
        splitTabs: state.splitTabs?.map(unlink),
        favorites: state.favorites.filter(
          (favorite) => favorite.id !== action.favoriteId,
        ),
      };
    }
    case "favorites/open":
      return projectFavoriteOpen(state, action.favoriteId, action.reuse)
        .workspace;
    default:
      return undefined;
  }
}
