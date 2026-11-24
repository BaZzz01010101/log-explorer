/** Tabs, panes and resources dropped onto panes and the tab strip. */
import type { LogTab, SplitEdge, SplitTab, Workspace } from "./contracts";
import {
  legacyLayout,
  removeLayoutPane,
  splitLayout,
  mapLayoutIds,
  nextSplitAxis,
  MAX_SPLIT_PANES,
} from "./pane-layout";
import type { ResourcePayload, ResourceActionMode } from "./resource-payload";
import { tabTitle } from "./source-labels";
import { decodeResourceDrop, mergeSources } from "./source-management";
import { activeEntryId } from "./workspace-entries";
import {
  createTab,
  unlinkFavorite,
  entryFor,
  modelState,
  saveActiveProjection,
  addView,
  activateViewOrEntry,
  combineEntries,
  graftLayout,
  extractSplitPanel,
  resourceTabWithPreset,
} from "./workspace-entry-state";
import {
  entryIdentities,
  nextId,
  parseFavorite,
  parseTab,
  projectEntry,
  sameFavorite,
} from "./workspace-parse";

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
      ...structuredClone(unlinkFavorite(original)),
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

/** Puts a source first in the recent list. */
export function addRecent(state: Workspace, value: unknown): Workspace {
  const favorite = parseFavorite(value, state.connections);
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

export function addResourceRecents(
  state: Workspace,
  tabs: LogTab[],
): Workspace {
  let next = state;
  for (const tab of tabs)
    for (const source of tab.sources)
      next = addRecent(next, {
        connectionId: source.connectionId ?? tab.connectionId,
        logGroup: source.logGroup,
        ...(source.logStreams?.length === 1
          ? { logStream: source.logStreams[0] }
          : {}),
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
