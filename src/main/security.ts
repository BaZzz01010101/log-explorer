import { z } from "zod";
import { highlightProfilesSchema } from "../shared/highlights";
import type { PaneLayout } from "../shared/contracts";
import {
  layoutPaneIds,
  isPaneLayout,
  normalizeLayout,
  MAX_SPLIT_PANES,
} from "../shared/pane-layout";

const id = z.string().min(1).max(160);
const text = z.string().max(10000);
export const connectionSchema = z.object({
  enabled: z.boolean().optional(),
  id,
  name: z.string().min(1).max(120),
  profile: z.string().min(1).max(256),
  region: z
    .string()
    .regex(/^[a-z]{2}(?:-[a-z]+)+-\d+$/)
    .max(40),
  mode: z.enum(["offline", "aws"]),
});
export const sourceSchema = z.object({
  connectionId: id.optional(),
  logGroup: z.string().min(1).max(512),
  logStreams: z.array(z.string().min(1).max(512)).max(100).optional(),
});
export const querySchema = z
  .object({
    requestId: id,
    connection: connectionSchema,
    connections: z.array(connectionSchema).max(49).optional(),
    sources: z.array(sourceSchema).min(1).max(50),
    startTime: z.number().int().nonnegative(),
    endTime: z.number().int().nonnegative(),
    kind: z.literal("events"),
    filterPattern: text,
    query: text,
    limit: z.number().int().min(1).max(10000),
    cursor: z.string().max(100000).optional(),
  })
  .refine((v) => v.endTime > v.startTime, "End time must be after start time");
const viewSchema = z.object({
  inspectorWrap: z.boolean().optional(),
  highlightText: z.string().max(200).optional(),
  highlightRegex: z.boolean().optional(),
  highlightCaseSensitive: z.boolean().optional(),
  localSearchWidth: z.number().min(140).max(2400).optional(),
  highlightTextWidth: z.number().min(140).max(2400).optional(),
  inspectorInfoCollapsed: z.boolean().optional(),
  mode: z.enum(["hybrid", "table", "json"]),
  columns: z
    .array(
      z.object({
        path: z.string().max(2048),
        width: z.number().min(40).max(2000),
        pinned: z.boolean().optional(),
        hidden: z.boolean().optional(),
        format: z
          .enum(["auto", "json", "bytes", "milliseconds", "datetime"])
          .optional(),
      }),
    )
    .max(100),
  localSearch: text,
  localSearchRegex: z.boolean().optional(),
  localSearchCaseSensitive: z.boolean().optional(),
  level: z.string().max(40),
  levels: z
    .array(
      z.enum(["trace", "debug", "info", "warn", "error", "fatal", "unknown"]),
    )
    .max(7)
    .optional(),
  wrap: z.boolean(),
  sort: z.object({ path: z.string().max(2048), desc: z.boolean() }).optional(),
});
const tabSchema = z.object({
  closedAt: z.number().finite().min(0).optional(),
  pinned: z.boolean().optional(),
  id,
  title: z.string().max(512),
  customTitle: z.string().max(512).optional(),
  connectionId: id,
  sources: z.array(sourceSchema).max(50),
  preview: z.boolean().optional(),
  kind: z.enum(["events", "insights"]),
  filterPattern: text,
  filterMode: z.enum(["plain", "pattern", "auto"]).optional(),
  query: text,
  timePreset: z.string().max(40),
  customStart: z.string().max(100).optional(),
  customEnd: z.string().max(100).optional(),
  view: viewSchema,
});
const favorite = z.object({
  connectionId: id,
  logGroup: z.string().max(512),
  logStream: z.string().max(512).optional(),
});
const savedQuery = z.object({
  id,
  name: z.string().max(256),
  kind: z.enum(["events", "insights"]),
  text,
  filterMode: z.enum(["plain", "pattern", "auto"]).optional(),
});
// Validate a finite node budget before recursively sanitizing the layout.
function boundedPaneLayoutSchema(): z.ZodType<PaneLayout> {
  return z
    .custom<PaneLayout>(isPaneLayout, "Invalid or oversized pane layout")
    .transform((layout) => normalizeLayout(layout, layoutPaneIds(layout))!);
}
const splitSchema = z.object({
  pinned: z.boolean().optional(),
  id,
  title: z.string().max(512).optional(),
  panes: z
    .array(z.object({ id, tabId: id }))
    .min(2)
    .max(MAX_SPLIT_PANES),
  layout: boundedPaneLayoutSchema(),
  activePaneId: id,
});
export const viewFavoriteSchema = z
  .object({
    id,
    title: z.string().min(1).max(512),
    tabs: z.array(tabSchema).min(1).max(MAX_SPLIT_PANES),
    connections: z.array(connectionSchema).min(1).max(50),
    split: splitSchema.optional(),
    timezone: z.enum(["local", "utc"]),
  })
  .superRefine((view, context) => {
    const issue = (message: string) =>
      context.addIssue({ code: "custom", message });
    const tabs = new Set(view.tabs.map((tab) => tab.id)),
      connections = new Set(
        view.connections.map((connection) => connection.id),
      );
    if (
      tabs.size !== view.tabs.length ||
      connections.size !== view.connections.length
    )
      issue("Saved view IDs must be unique");
    if (
      view.tabs.some(
        (tab) =>
          !connections.has(tab.connectionId) ||
          tab.sources.some(
            (source) =>
              source.connectionId && !connections.has(source.connectionId),
          ),
      )
    )
      issue("Saved source connections must exist");
    if (view.split) {
      const panes = new Set(view.split.panes.map((pane) => pane.id)),
        members = view.split.panes.map((pane) => pane.tabId),
        leaves = layoutPaneIds(view.split.layout);
      if (
        panes.size !== view.split.panes.length ||
        !panes.has(view.split.activePaneId) ||
        leaves.length !== panes.size ||
        new Set(leaves).size !== leaves.length ||
        leaves.some((id) => !panes.has(id)) ||
        members.length !== tabs.size ||
        new Set(members).size !== members.length ||
        members.some((id) => !tabs.has(id))
      )
        issue("Saved split membership and layout must match its views");
    } else if (tabs.size !== 1)
      issue("Multiple saved views require a split layout");
  });
export const legacyFavoriteSchema = favorite;
export const workspaceSchema = z
  .object({
    version: z.literal(1),
    name: z.string().max(120),
    connections: z.array(connectionSchema).min(1).max(50),
    tabs: z.array(tabSchema).max(100),
    splitTabs: z
      .array(
        z.object({
          pinned: z.boolean().optional(),
          id,
          title: z.string().max(512).optional(),
          panes: z
            .array(z.object({ id, tabId: id }))
            .min(2)
            .max(MAX_SPLIT_PANES),
          layout: boundedPaneLayoutSchema(),
          activePaneId: id,
        }),
      )
      .max(50)
      .optional(),
    tabOrder: z.array(id).max(100).optional(),
    activeTabId: id.nullable().optional(),
    activeConnectionId: id.optional(),
    closedTabs: z.array(tabSchema).max(30),
    panes: z
      .array(z.object({ id, tabId: id.nullable() }))
      .min(1)
      .max(MAX_SPLIT_PANES),
    activePaneId: id,
    layout: boundedPaneLayoutSchema().optional(),
    sidebarWidth: z.number().min(180).max(1200),
    sidebarVisible: z.boolean(),
    splitSizes: z
      .object({
        horizontal: z.number().min(0.2).max(0.8),
        vertical: z.number().min(0.2).max(0.8),
      })
      .optional(),
    favorites: z.array(viewFavoriteSchema).max(500),
    recents: z.array(favorite).max(100),
    savedQueries: z.array(savedQuery).max(500),
    history: z.array(savedQuery).max(100),
    presets: z
      .array(
        z.object({
          id,
          name: z.string().max(120),
          logGroup: z.string().max(512).optional(),
          view: viewSchema,
        }),
      )
      .max(500),
    preferences: z.object({
      settingsDetached: z.boolean().optional(),
      closedTabHistoryDays: z.number().int().min(1).max(365).optional(),
      recentSearchesLimit: z.number().int().min(1).max(100).optional(),
      relativeTimeTemplates: z
        .object({
          quick: z
            .array(
              z.object({
                id,
                label: z.string().max(80),
                duration: z.number().int().min(1).max(9999),
                unit: z.enum(["m", "h", "d", "w"]),
              }),
            )
            .max(30),
          dropdown: z
            .array(
              z.object({
                id,
                label: z.string().max(80),
                duration: z.number().int().min(1).max(9999),
                unit: z.enum(["m", "h", "d", "w"]),
              }),
            )
            .max(30),
        })
        .optional(),
      profileVisibility: z
        .record(z.string().min(1).max(256), z.boolean())
        .refine(
          (value) => Object.keys(value).length <= 50,
          "At most 50 profiles",
        )
        .optional(),
      theme: z.enum(["dark", "light"]),
      density: z.enum(["compact", "comfortable"]),
      fontSize: z.number().min(10).max(20),
      maxEvents: z.number().int().min(100).max(100000),
      sourceDetailsHeight: z.number().min(80).max(1000).optional(),
      timezone: z.enum(["local", "utc"]),
      tabBarLayout: z.enum(["scroll", "wrap"]).optional(),
      pinnedTabsSeparateRow: z.boolean().optional(),
      highlightText: z.string().max(1000),
      autoExpandFilterMatches: z.boolean().optional(),
      highlightProfiles: highlightProfilesSchema.optional(),
      shortcuts: z.record(z.string().max(60), z.string().max(80)),
    }),
  })
  .superRefine((workspace, context) => {
    const paneIds = new Set(workspace.panes.map((pane) => pane.id));
    const tabIds = new Set(workspace.tabs.map((tab) => tab.id));
    const assigned = workspace.panes
      .filter((pane) => pane.tabId !== null)
      .map((pane) => pane.tabId);
    const issue = (path: string, message: string) =>
      context.addIssue({ code: "custom", path: [path], message });
    if (paneIds.size !== workspace.panes.length)
      issue("panes", "Pane IDs must be unique");
    if (tabIds.size !== workspace.tabs.length)
      issue("tabs", "Tab IDs must be unique");
    if (!paneIds.has(workspace.activePaneId))
      issue("activePaneId", "Active pane must exist");
    if (
      new Set(assigned).size !== assigned.length ||
      assigned.some((tabId) => !tabIds.has(tabId!))
    )
      issue("panes", "Pane tabs must refer to distinct open tabs");
    if (workspace.layout) {
      const layoutIds = layoutPaneIds(workspace.layout);
      if (
        layoutIds.length !== paneIds.size ||
        new Set(layoutIds).size !== layoutIds.length ||
        layoutIds.some((paneId) => !paneIds.has(paneId))
      )
        issue("layout", "Layout must contain each workspace pane exactly once");
    }
    const connectionIds = new Set(
      workspace.connections.map((connection) => connection.id),
    );
    if (connectionIds.size !== workspace.connections.length)
      issue("connections", "Connection IDs must be unique");
    if (
      [...workspace.tabs, ...workspace.closedTabs].some(
        (tab) =>
          !connectionIds.has(tab.connectionId) ||
          tab.sources.some(
            (source) =>
              source.connectionId && !connectionIds.has(source.connectionId),
          ),
      )
    )
      issue("tabs", "View connections must exist");
    const splits = workspace.splitTabs ?? [];
    const splitIds = new Set(splits.map((split) => split.id));
    const members = new Set<string>();
    if (
      splitIds.size !== splits.length ||
      splits.some((split) => tabIds.has(split.id))
    )
      issue(
        "splitTabs",
        "Combined entry IDs must be unique and distinct from view IDs",
      );
    for (const split of splits) {
      const ids = split.panes.map((pane) => pane.id);
      const layoutIds = layoutPaneIds(split.layout);
      if (
        new Set(ids).size !== ids.length ||
        !ids.includes(split.activePaneId) ||
        layoutIds.length !== ids.length ||
        new Set(layoutIds).size !== layoutIds.length ||
        layoutIds.some((id) => !ids.includes(id))
      )
        issue(
          "splitTabs",
          "Each combined layout must reference its unique panes exactly once",
        );
      for (const pane of split.panes) {
        if (!tabIds.has(pane.tabId) || members.has(pane.tabId))
          issue(
            "splitTabs",
            "Each combined member must be an existing view with one owner",
          );
        members.add(pane.tabId);
      }
    }
    const entryIds = new Set([
      ...workspace.tabs
        .filter((tab) => !members.has(tab.id))
        .map((tab) => tab.id),
      ...splitIds,
    ]);
    if (
      workspace.tabOrder &&
      (workspace.tabOrder.length !== entryIds.size ||
        new Set(workspace.tabOrder).size !== workspace.tabOrder.length ||
        workspace.tabOrder.some((id) => !entryIds.has(id)))
    )
      issue(
        "tabOrder",
        "Top-level order must contain every entry exactly once",
      );
    if (
      workspace.activeTabId !== undefined &&
      (workspace.activeTabId === null
        ? entryIds.size !== 0
        : !entryIds.has(workspace.activeTabId))
    )
      issue(
        "activeTabId",
        "Active entry must exist or be null only when no entries remain",
      );
    if (
      workspace.activeConnectionId &&
      !connectionIds.has(workspace.activeConnectionId)
    )
      issue("activeConnectionId", "Selected connection must exist");
    if (workspace.activeTabId !== undefined) {
      const split = splits.find((split) => split.id === workspace.activeTabId);
      if (split) {
        if (
          workspace.activePaneId !== split.activePaneId ||
          JSON.stringify(workspace.panes) !== JSON.stringify(split.panes) ||
          JSON.stringify(workspace.layout) !== JSON.stringify(split.layout)
        )
          issue("panes", "Rendered panes must match the active combined entry");
      } else if (
        workspace.panes.length !== 1 ||
        workspace.panes[0].tabId !== workspace.activeTabId ||
        workspace.layout?.type !== "leaf" ||
        workspace.layout.paneId !== workspace.panes[0].id
      )
        issue(
          "panes",
          "A normal or empty entry must render one full-size pane",
        );
    }
  });

/** Low-level process gate; only the separate application preference can restore access. Workspace imports cannot. */
export class AwsAccessGate {
  private authorized = false;
  constructor(private readonly packaged: boolean) {}
  get enabled(): boolean {
    return this.packaged && this.authorized;
  }
  setEnabled(enabled: boolean): void {
    if (enabled && !this.packaged)
      throw new Error(
        "AWS access is disabled in development. Only a packaged application can enable it.",
      );
    this.authorized = enabled;
  }
}
