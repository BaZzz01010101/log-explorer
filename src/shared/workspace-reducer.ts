import type { Workspace } from "./contracts";
import { removeSource } from "./source-labels";
import { mergeSources } from "./source-management";
import { createResourceTabs, projectResourceAction } from "./workspace-drop";
import { activeEntryId, workspaceEntries } from "./workspace-entries";
import {
  createTab,
  modelState,
  closeViews,
  cloneTab,
} from "./workspace-entry-state";
import { reduceFavorites } from "./workspace-favorites";
import { reducePanes } from "./workspace-panes";
import { restoreWorkspace } from "./workspace-parse";
import { reduceSettings } from "./workspace-settings";
import { reduceTabs } from "./workspace-tabs";
import type { WorkspaceAction } from "./workspace-types";

/**
 * Ctrl-drops copy instead of move: the dragged view (or panel) is duplicated
 * and the ordinary drop applies to the duplicate, so the original stays put.
 * Returns undefined for actions without a copy, which the reducer handles.
 */
function copyDrop(
  input: Workspace,
  action: WorkspaceAction,
): Workspace | undefined {
  if (!("copy" in action) || !action.copy) return undefined;
  switch (action.type) {
    case "tab/move":
    case "tab/reorder": {
      const duplicated = workspaceReducer(input, {
        type: "tab/duplicate",
        tabId: action.tabId,
      });
      const id = activeEntryId(duplicated);
      if (duplicated === input || !id || id === action.tabId) return input;
      return workspaceReducer(duplicated, {
        ...action,
        tabId: id,
        copy: false,
      });
    }
    case "pane/detach": {
      const clone = cloneTab(modelState(input), action.tabId);
      if (!clone) return input;
      const moved = workspaceReducer(clone.state, {
        type: "tab/move",
        tabId: clone.id,
        beforeTabId: action.beforeTabId,
        pinned: action.pinned ?? false,
      });
      return workspaceReducer(moved, { type: "tab/select", tabId: clone.id });
    }
    case "pane/drop-tab": {
      const clone = cloneTab(modelState(input), action.tabId);
      if (!clone) return input;
      const dropped = workspaceReducer(clone.state, {
        ...action,
        tabId: clone.id,
        copy: false,
      });
      return dropped.tabs.some((tab) => tab.id === clone.id) ? dropped : input;
    }
    default:
      return undefined;
  }
}

/** Sources dropped, moved and opened from the Explorer. */
function reduceSources(
  state: Workspace,
  input: Workspace,
  action: WorkspaceAction,
): Workspace | undefined {
  switch (action.type) {
    case "tab/merge-sources": {
      const entry = workspaceEntries(state).find(
        (item) => item.id === action.tabId,
      );
      const target = state.tabs.find((tab) => tab.id === action.targetTabId);
      // A split may also be dropped onto one of its own panes: that tab keeps
      // its place and absorbs the other panes.
      const merged = entry?.tabIds.filter((id) => id !== target?.id) ?? [];
      if (!entry || !target || !merged.length) return input;
      const added = merged.flatMap((id) => {
        const tab = state.tabs.find((item) => item.id === id);
        return tab
          ? tab.sources.map((source) => ({
              ...source,
              connectionId: source.connectionId ?? tab.connectionId,
            }))
          : [];
      });
      try {
        const sources = mergeSources(
          target.sources,
          added,
          target.connectionId,
        );
        const updated = workspaceReducer(state, {
          type: "tab/update",
          tabId: target.id,
          patch: { sources },
        });
        if (action.copy) return updated;
        const closed = closeViews(updated, merged);
        return {
          ...(entry.tabIds.includes(target.id)
            ? workspaceReducer(closed, { type: "tab/select", tabId: target.id })
            : closed),
          closedTabs: state.closedTabs,
        };
      } catch {
        return input;
      }
    }
    case "source/move": {
      const origin = state.tabs.find((tab) => tab.id === action.origin.tabId);
      const original = origin?.sources[action.origin.sourceIndex];
      if (
        !origin ||
        !original ||
        (action.origin.stream &&
          !original.logStreams?.includes(action.origin.stream))
      )
        return input;
      if (
        action.destination.kind === "sources" &&
        action.destination.tabId === origin.id
      )
        return input;
      const remaining = removeSource(
        origin.sources,
        action.origin.sourceIndex,
        action.origin.stream,
      );
      if (!remaining.length && !action.copy) return input;
      const item = {
        ...original,
        ...(action.origin.stream ? { logStreams: [action.origin.stream] } : {}),
      };
      const payload = { connectionId: origin.connectionId, sources: [item] };
      let next = state;
      try {
        if (action.destination.kind === "sources") {
          const targetId = action.destination.tabId;
          const target = state.tabs.find((tab) => tab.id === targetId);
          if (!target) return input;
          const scoped = [
            { ...item, connectionId: item.connectionId ?? origin.connectionId },
          ];
          const sources = mergeSources(
            target.sources,
            scoped,
            target.connectionId,
          );
          next = workspaceReducer(state, {
            type: "tab/update",
            tabId: target.id,
            patch: { sources },
          });
        } else {
          // A source taken out of a view keeps that view's settings: query,
          // filters, highlights, time range, columns, wrapping and layout.
          const {
            id: _id,
            closedAt: _closedAt,
            pinned: _pinned,
            preview: _preview,
            favoriteId: _favoriteId,
            title: _title,
            customTitle: _customTitle,
            connectionId: _connectionId,
            sources: _sources,
            ...settings
          } = origin;
          const tabs = createResourceTabs(payload).map((tab) => ({
            ...tab,
            ...structuredClone(settings),
          }));
          if (action.destination.kind === "tab")
            next = workspaceReducer(state, {
              type: "tabs/insert",
              tabs,
              beforeTabId: action.destination.beforeTabId,
              pinned: action.destination.pinned,
            });
          else
            next = workspaceReducer(state, {
              type: "pane/drop-resource",
              tab: tabs,
              paneId: action.destination.paneId,
              edge: action.destination.edge,
            });
          if (
            !tabs.every((tab) =>
              next.tabs.some((candidate) => candidate.id === tab.id),
            )
          )
            return input;
        }
      } catch {
        return input;
      }
      if (action.copy) return next;
      return workspaceReducer(next, {
        type: "tab/update",
        tabId: origin.id,
        patch: { sources: remaining },
      });
    }
    case "resources/apply":
      return projectResourceAction(input, action.payload, action.mode)
        .workspace;
    case "gcp/open-source": {
      const requested = action.connection;
      const connection =
        state.connections.find(
          (item) =>
            item.mode === "gcp" &&
            item.region === requested.region &&
            item.gcpIdentity?.configuration ===
              requested.gcpIdentity?.configuration &&
            item.gcpIdentity?.account === requested.gcpIdentity?.account &&
            item.gcpIdentity?.quotaProject ===
              requested.gcpIdentity?.quotaProject,
        ) ?? requested;
      if (connection === requested && state.connections.length >= 50)
        return state;
      const next =
        connection === requested
          ? workspaceReducer(state, {
              type: "connections/set",
              connections: [...state.connections, connection],
            })
          : state;
      return workspaceReducer(next, {
        type: action.mode === "preview" ? "tab/preview" : "tab/open-resource",
        tab: createTab(connection.id, [action.source]),
      });
    }
    default:
      return undefined;
  }
}

/** Applies one action. Each group of actions has its own reducer. */
export function workspaceReducer(
  input: Workspace,
  action: WorkspaceAction,
): Workspace {
  if (action.type === "workspace/restore")
    return restoreWorkspace(action.workspace);
  const copied = copyDrop(input, action);
  if (copied) return copied;
  const state = modelState(input);
  return (
    reduceTabs(state, input, action) ??
    reducePanes(state, input, action) ??
    reduceFavorites(state, input, action) ??
    reduceSources(state, input, action) ??
    reduceSettings(state, input, action) ??
    state
  );
}
