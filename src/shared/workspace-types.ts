import type {
  Connection,
  Favorite,
  LogSource,
  LogTab,
  SplitEdge,
  Preferences,
  SavedQuery,
  VisualizationPreset,
  Workspace,
} from "./contracts";
import type { ResourcePayload, ResourceActionMode } from "./resource-payload";

export type WorkspaceAction =
  | { type: "tab/merge-sources"; tabId: string; targetTabId: string }
  | {
      type: "source/move";
      origin: { tabId: string; sourceIndex: number; stream?: string };
      destination:
        | { kind: "sources"; tabId: string }
        | { kind: "split"; paneId: string; edge: SplitEdge | null }
        | { kind: "tab"; beforeTabId: string | null; pinned: boolean };
    }
  | {
      type: "gcp/open-source";
      connection: Connection;
      source: LogSource;
      mode: "preview" | "permanent";
    }
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
  | { type: "favorites/save-resources"; payload: ResourcePayload }
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
