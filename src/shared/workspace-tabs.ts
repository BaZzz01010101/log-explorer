/** Actions on the tab strip and its views. */
import { recentClosedTabs } from "./closed-tab-history";
import type { Workspace } from "./contracts";
import { tabTitle } from "./source-labels";
import { projectWorkspaceDrop, addResourceRecents } from "./workspace-drop";
import { activeEntryId, workspaceEntries } from "./workspace-entries";
import {
  unlinkFavorite,
  resourceKey,
  entryFor,
  orderedFlatTabs,
  closeViews,
  addView,
  activateViewOrEntry,
  setEntryPinned,
  resourceTabWithPreset,
  moveStripEntry,
} from "./workspace-entry-state";
import {
  entryIdentities,
  nextId,
  parseTab,
  projectEntry,
  splitMembers,
  string,
} from "./workspace-parse";
import type { WorkspaceAction } from "./workspace-types";

/** Applies a patch; an edited preview becomes a permanent tab. */
function updateTab(
  state: Workspace,
  tabId: string,
  patch: Extract<WorkspaceAction, { type: "tab/update" }>["patch"],
): Workspace {
  return {
    ...state,
    tabs: state.tabs.map((tab) => {
      if (tab.id !== tabId) return tab;
      const parsed =
        parseTab(
          {
            ...tab,
            ...patch,
            ...(patch.sources && !tab.customTitle
              ? { title: tabTitle(patch.sources) }
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
}

/** Opening, closing, arranging and editing tabs. */
export function reduceTabs(
  state: Workspace,
  input: Workspace,
  action: WorkspaceAction,
): Workspace | undefined {
  switch (action.type) {
    case "tab/promote":
      return {
        ...state,
        tabs: state.tabs.map((tab) =>
          tab.id === action.tabId ? { ...tab, preview: false } : tab,
        ),
      };
    case "tab/update":
      return updateTab(state, action.tabId, action.patch);
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
          ...structuredClone(unlinkFavorite(original)),
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
            ...structuredClone(unlinkFavorite(split)),
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
    default:
      return undefined;
  }
}
