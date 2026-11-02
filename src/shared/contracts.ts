export type DataMode = "offline" | "aws";
export interface Connection {
  enabled?: boolean;
  id: string;
  name: string;
  profile: string;
  region: string;
  mode: DataMode;
}
export interface LogGroup {
  name: string;
  arn?: string;
  storedBytes?: number;
  retentionDays?: number;
  logClass?: string;
}
export interface LogStream {
  name: string;
  lastEventTime?: number;
}
export interface Page<T> {
  items: T[];
  cursor?: string;
}
export interface LogSource {
  connectionId?: string;
  logGroup: string;
  logStreams?: string[];
}
export interface LogEvent {
  connectionId?: string;
  id: string;
  timestamp: number;
  ingestionTime?: number;
  message: string;
  logGroup: string;
  logStream: string;
}
export interface QueryRequest {
  requestId: string;
  connection: Connection;
  connections?: Connection[];
  sources: LogSource[];
  startTime: number;
  endTime: number;
  kind: "events" | "insights";
  filterPattern: string;
  query: string;
  limit: number;
  cursor?: string;
}
export interface QueryStats {
  recordsMatched?: number;
  recordsScanned?: number;
  bytesScanned?: number;
  elapsedMs?: number;
}
export type LiveState = "connecting" | "streaming" | "stopped";
export interface QueryUpdate {
  requestId: string;
  state: "queued" | "running" | "complete" | "cancelled" | "error";
  events?: LogEvent[];
  replace?: boolean;
  cursor?: string;
  stats?: QueryStats;
  error?: string;
  sampled?: boolean;
  truncated?: boolean;
  liveState?: LiveState;
}
export type ViewMode = "hybrid" | "table" | "json";
export interface ColumnConfig {
  path: string;
  width: number;
  format?: "auto" | "json" | "bytes" | "milliseconds" | "datetime";
  pinned?: boolean;
  hidden?: boolean;
}
export interface ViewConfig {
  inspectorWrap?: boolean;
  inspectorExpanded?: boolean;
  highlightText?: string;
  highlightRegex?: boolean;
  highlightCaseSensitive?: boolean;
  localSearchWidth?: number;
  highlightTextWidth?: number;
  inspectorInfoCollapsed?: boolean;
  mode: ViewMode;
  columns: ColumnConfig[];
  localSearch: string;
  localSearchRegex?: boolean;
  localSearchCaseSensitive?: boolean;
  level: string;
  levels?: string[];
  wrap: boolean;
  sort?: { path: string; desc: boolean };
}
export interface LogTab {
  id: string;
  closedAt?: number;
  pinned?: boolean;
  preview?: boolean;
  title: string;
  customTitle?: string;
  connectionId: string;
  sources: LogSource[];
  kind: "events" | "insights";
  filterPattern: string;
  filterMode?: "plain" | "pattern" | "auto";
  query: string;
  timePreset: string;
  customStart?: string;
  customEnd?: string;
  view: ViewConfig;
}

export interface Pane {
  id: string;
  tabId: string | null;
}
export type SplitAxis = "horizontal" | "vertical";
export type SplitEdge = "left" | "right" | "top" | "bottom";
export type PaneLayout =
  | { type: "leaf"; paneId: string }
  | {
      type: "split";
      axis: SplitAxis;
      ratio: number;
      first: PaneLayout;
      second: PaneLayout;
    };
export interface SplitTab {
  id: string;
  pinned?: boolean;
  title?: string;
  panes: Pane[];
  layout: PaneLayout;
  activePaneId: string;
}
export interface SavedQuery {
  id: string;
  name: string;
  kind: "events" | "insights";
  text: string;
  filterMode?: "plain" | "pattern" | "auto";
}
export interface Favorite {
  connectionId: string;
  logGroup: string;
  logStream?: string;
}

/** An independent, configuration-only snapshot of one normal or combined tab. */
export interface ViewFavorite {
  id: string;
  title: string;
  tabs: LogTab[];
  connections: Connection[];
  split?: SplitTab;
  timezone: "local" | "utc";
}
export interface VisualizationPreset {
  id: string;
  name: string;
  logGroup?: string;
  view: ViewConfig;
}
export interface RelativeTimeTemplate {
  id: string;
  label: string;
  duration: number;
  unit: "m" | "h" | "d" | "w";
}
export interface Preferences {
  settingsDetached?: boolean;
  relativeTimeTemplates?: {
    quick: RelativeTimeTemplate[];
    dropdown: RelativeTimeTemplate[];
  };
  profileVisibility?: Record<string, boolean>;
  highlightProfiles?: import("./highlights").HighlightProfile[];
  theme: "dark" | "light";
  density: "compact" | "comfortable";
  tabBarLayout: "scroll" | "wrap";
  pinnedTabsSeparateRow?: boolean;
  closedTabHistoryDays?: number;
  recentSearchesLimit?: number;
  sourceDetailsHeight?: number;
  fontSize: number;
  maxEvents: number;
  timezone: "local" | "utc";
  highlightText: string;
  autoExpandFilterMatches?: boolean;
  shortcuts: Record<string, string>;
}
export interface Workspace {
  version: 1;
  name: string;
  connections: Connection[];
  tabs: LogTab[];
  splitTabs?: SplitTab[];
  tabOrder?: string[];
  activeTabId?: string | null;
  activeConnectionId?: string;
  closedTabs: LogTab[];
  panes: Pane[];
  layout?: PaneLayout;
  activePaneId: string;
  sidebarWidth: number;
  sidebarVisible: boolean;
  splitSizes?: { horizontal: number; vertical: number };
  favorites: ViewFavorite[];
  recents: Favorite[];
  savedQueries: SavedQuery[];
  history: SavedQuery[];
  presets: VisualizationPreset[];
  preferences: Preferences;
}
export interface EnvironmentInfo {
  version: string;
  platform: string;
  packaged: boolean;
  awsEnabled: boolean;
  canEnableAws?: boolean;
}
export interface WorkspaceLoad {
  workspace: unknown | null;
  warning?: string;
}
export interface ExplorerApi {
  windowAction(action: import("./window-chrome").WindowAction): Promise<void>;
  setWindowTheme(theme: "light" | "dark"): Promise<void>;
  environment(): Promise<EnvironmentInfo>;
  enableAws(enabled: boolean): Promise<EnvironmentInfo>;
  profiles(): Promise<string[]>;
  listGroups(
    connection: Connection,
    prefix: string,
    cursor?: string,
  ): Promise<Page<LogGroup>>;
  listStreams(
    connection: Connection,
    logGroup: string,
    prefix: string,
    cursor?: string,
  ): Promise<Page<LogStream>>;
  query(request: QueryRequest): Promise<void>;
  live(request: QueryRequest): Promise<void>;
  cancel(requestId: string): Promise<void>;
  onUpdate(listener: (update: QueryUpdate) => void): () => void;
  onBeforeClose(listener: () => Promise<void>): () => void;
  loadWorkspace(): Promise<WorkspaceLoad>;
  saveWorkspace(workspace: Workspace): Promise<void>;
  exportData(
    content: string,
    extension: "json" | "csv" | "jsonl",
  ): Promise<boolean>;
  copy(text: string): Promise<void>;
}
declare global {
  interface Window {
    explorer: ExplorerApi;
  }
}
