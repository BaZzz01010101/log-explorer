/** Actions on splits and their panes. */
import type { Workspace } from "./contracts";
import {
  legacyLayout,
  resizeLayout,
  mapLayoutIds,
  nextSplitAxis,
  MAX_SPLIT_PANES,
  MAX_LAYOUT_DEPTH,
} from "./pane-layout";
import {
  projectWorkspaceDrop,
  projectResourceDrop,
  addResourceRecents,
} from "./workspace-drop";
import { activeEntryId, workspaceEntries } from "./workspace-entries";
import {
  reorder,
  unlinkFavorite,
  entryFor,
  saveActiveProjection,
  orderedFlatTabs,
  closeViews,
  combineEntries,
  extractSplitPanel,
  setEntryPinned,
} from "./workspace-entry-state";
import { entryIdentities, nextId, projectEntry } from "./workspace-parse";
import type { WorkspaceAction } from "./workspace-types";

function reorderPanes(
  state: Workspace,
  paneId: string,
  beforePaneId: Extract<
    WorkspaceAction,
    { type: "pane/reorder" }
  >["beforePaneId"],
): Workspace {
  const panes = reorder(state.panes, paneId, beforePaneId);
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

function resizePanes(state: Workspace, path: string, ratio: number): Workspace {
  if (
    !/^[01]*$/.test(path) ||
    path.length >= MAX_LAYOUT_DEPTH ||
    !Number.isFinite(ratio)
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
      path,
      ratio,
    ),
  };
}

/** Splits and their panes. */
export function reducePanes(
  state: Workspace,
  input: Workspace,
  action: WorkspaceAction,
): Workspace | undefined {
  switch (action.type) {
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
        ...structuredClone(unlinkFavorite(original)),
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
      const next =
        action.type === "pane/reorder"
          ? reorderPanes(state, action.paneId, action.beforePaneId)
          : resizePanes(state, action.path, action.ratio);
      return next === state ? input : saveActiveProjection(next);
    }
    default:
      return undefined;
  }
}
