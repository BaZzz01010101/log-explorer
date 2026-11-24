/** The tab strip's entries and the panes projected from the active one. */
import { recentClosedTabs } from "./closed-tab-history";
import type {
  LogSource,
  LogTab,
  SplitEdge,
  SplitTab,
  PaneLayout,
  Workspace,
} from "./contracts";
import { legacyLayout, removeLayoutPane, MAX_SPLIT_PANES } from "./pane-layout";
import { comparableGcp } from "./source-identity";
import { tabTitle } from "./source-labels";
import {
  activeEntryId,
  workspaceEntries,
  type WorkspaceEntry,
} from "./workspace-entries";
import {
  baseTab,
  entryIdentities,
  nextId,
  normalizeWorkspaceEntries,
  parseTab,
  projectEntry,
} from "./workspace-parse";

export function reorder<T extends { id: string }>(
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

export function cleanLinks(state: Workspace): Workspace {
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

/** The view without its link to a favorite: copies and snapshots are separate. */
export function unlinkFavorite<T extends { favoriteId?: string }>(view: T): T {
  if (view.favoriteId === undefined) return view;
  const copy = { ...view };
  delete copy.favoriteId;
  return copy;
}

export function createTab(connectionId: string, sources: LogSource[]): LogTab {
  return baseTab(
    "tab-" + globalThis.crypto.randomUUID(),
    connectionId,
    sources,
  );
}

export function resourceKey(tab: LogTab): string {
  return JSON.stringify([
    tab.connectionId,
    tab.sources.map((source) => [
      source.connectionId ?? tab.connectionId,
      source.logGroup,
      comparableGcp(source.gcp),
      [...(source.logStreams ?? [])].sort(),
    ]),
  ]);
}

export function entryFor(
  state: Workspace,
  id: string,
): WorkspaceEntry | undefined {
  return workspaceEntries(state).find(
    (entry) => entry.id === id || entry.tabIds.includes(id),
  );
}

export function modelState(state: Workspace): Workspace {
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

/**
 * The rendered panes/layout/activePaneId are a projection of the active entry.
 * This syncs the projection into its split and re-derives it, so the two can
 * never disagree when saved.
 */
export function consistentProjection(state: Workspace): Workspace {
  const synced = saveActiveProjection(modelState(state));
  return projectEntry(synced, synced.activeTabId);
}

/** The saved file omits the projection; loading derives it from `splitTabs`. */
export function persistedWorkspace(
  state: Workspace,
): Omit<Workspace, "panes" | "layout" | "activePaneId"> {
  const {
    panes: _panes,
    layout: _layout,
    activePaneId: _active,
    ...file
  } = state;
  return file;
}

export function saveActiveProjection(state: Workspace): Workspace {
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

export function orderedFlatTabs(state: Workspace): Workspace {
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

export function closeViews(state: Workspace, ids: string[]): Workspace {
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

/** The reusable preview tab: the active one, or the first in the strip. */
export function previewEntry(state: Workspace) {
  const active = activeEntryId(state);
  const previews = workspaceEntries(state).filter(
    (entry) => entry.kind === "single" && entry.preview,
  );
  return previews.find((entry) => entry.id === active) ?? previews[0];
}

export function addView(
  state: Workspace,
  input: LogTab,
  preview: boolean,
  replacePreview = false,
): Workspace {
  const parsed = parseTab(input, state.connections);
  if (!parsed) return state;
  const replace = replacePreview ? previewEntry(state) : undefined;
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

export function activateViewOrEntry(state: Workspace, id: string): Workspace {
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

export function combineEntries(state: Workspace, ids: string[]): Workspace {
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

export function graftLayout(
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
export function extractSplitPanel(
  state: Workspace,
  tabId: string,
): Workspace | null {
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

export function resourceTabWithPreset(state: Workspace, tab: LogTab): LogTab {
  const preset = state.presets.find(
    (preset) =>
      preset.logGroup &&
      tab.sources.some((source) => source.logGroup === preset.logGroup),
  );
  return preset ? { ...tab, view: structuredClone(preset.view) } : tab;
}

export function setEntryPinned(
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

export function moveStripEntry(
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

/** A standalone copy of a tab, appended without changing the shown view. */
export function cloneTab(
  state: Workspace,
  tabId: string,
): { state: Workspace; id: string } | undefined {
  const original = state.tabs.find((tab) => tab.id === tabId);
  if (!original || state.tabs.length >= 100) return undefined;
  const id = nextId("tab", entryIdentities(state, state.tabs));
  const copy = {
    ...structuredClone(unlinkFavorite(original)),
    id,
    preview: false,
  };
  delete copy.pinned;
  return { id, state: { ...state, tabs: [...state.tabs, copy] } };
}
