import type {
  Connection,
  LogEvent,
  LogSource,
  ViewConfig,
  Workspace,
} from "../shared/contracts";
import type { TabRuntime } from "./useLogJobs";
import { logTabLabel } from "./workspace-entries";
import { ownValue } from "../shared/records";

export interface SettingsPreviewSnapshot {
  tabId: string;
  label: string;
  events: LogEvent[];
  view: ViewConfig;
  sourceContext: {
    sources: LogSource[];
    connections: Connection[];
    connectionId: string;
  };
}

export function captureSettingsPreview(
  workspace: Workspace,
  runtimes: Record<string, TabRuntime>,
): SettingsPreviewSnapshot | null {
  const pane =
    workspace.panes.find((pane) => pane.id === workspace.activePaneId) ??
    workspace.panes[0];
  const tab = workspace.tabs.find((tab) => tab.id === pane?.tabId);
  if (!tab) return null;
  const runtime = ownValue(runtimes, tab.id);
  const request = runtime?.request;
  return structuredClone({
    tabId: tab.id,
    label: logTabLabel(tab),
    events: runtime?.events ?? [],
    view: tab.view,
    sourceContext: {
      sources: request?.sources ?? tab.sources,
      connections: request
        ? [request.connection, ...(request.connections ?? [])]
        : workspace.connections,
      connectionId: request?.connection.id ?? tab.connectionId,
    },
  });
}
