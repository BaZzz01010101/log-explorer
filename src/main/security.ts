import { z } from "zod";
import type { PaneLayout } from "../shared/contracts";
import { layoutPaneIds } from "../shared/pane-layout";

const id = z.string().min(1).max(160);
const text = z.string().max(10000);
export const connectionSchema = z.object({
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
  logGroup: z.string().min(1).max(512),
  logStreams: z.array(z.string().min(1).max(512)).max(100).optional(),
});
export const querySchema = z
  .object({
    requestId: id,
    connection: connectionSchema,
    sources: z.array(sourceSchema).min(1).max(50),
    startTime: z.number().int().nonnegative(),
    endTime: z.number().int().nonnegative(),
    kind: z.enum(["events", "insights"]),
    filterPattern: text,
    query: text,
    limit: z.number().int().min(1).max(10000),
    cursor: z.string().max(100000).optional(),
  })
  .refine((v) => v.endTime > v.startTime, "End time must be after start time");
const viewSchema = z.object({
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
  level: z.string().max(40),
  wrap: z.boolean(),
  sort: z.object({ path: z.string().max(2048), desc: z.boolean() }).optional(),
});
const tabSchema = z.object({
  id,
  title: z.string().max(512),
  connectionId: id,
  sources: z.array(sourceSchema).max(50),
  groupId: id.optional(),
  preview: z.boolean().optional(),
  kind: z.enum(["events", "insights"]),
  filterPattern: text,
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
});
// A workspace has at most four panes, so no valid split tree needs more than
// three levels. A finite schema bounds parsing and strips unknown nested keys.
function boundedPaneLayoutSchema(depth = 0): z.ZodType<PaneLayout> {
  const leaf = z.object({ type: z.literal("leaf"), paneId: id });
  if (depth === 3) return leaf;
  const child = boundedPaneLayoutSchema(depth + 1);
  return z.union([
    leaf,
    z.object({
      type: z.literal("split"),
      axis: z.enum(["horizontal", "vertical"]),
      ratio: z.number().min(0.2).max(0.8),
      first: child,
      second: child,
    }),
  ]);
}
export const workspaceSchema = z
  .object({
    version: z.literal(1),
    name: z.string().max(120),
    connections: z.array(connectionSchema).min(1).max(50),
    tabs: z.array(tabSchema).max(100),
    closedTabs: z.array(tabSchema).max(30),
    groups: z
      .array(
        z.object({
          id,
          name: z.string().max(120),
          color: z.string().max(40),
          collapsed: z.boolean().optional(),
        }),
      )
      .max(100),
    panes: z
      .array(z.object({ id, tabId: id.nullable() }))
      .min(1)
      .max(4),
    activePaneId: id,
    layout: boundedPaneLayoutSchema().optional(),
    sidebarWidth: z.number().min(180).max(600),
    sidebarVisible: z.boolean(),
    splitSizes: z
      .object({
        horizontal: z.number().min(0.2).max(0.8),
        vertical: z.number().min(0.2).max(0.8),
      })
      .optional(),
    favorites: z.array(favorite).max(500),
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
      theme: z.enum(["dark", "light"]),
      density: z.enum(["compact", "comfortable"]),
      fontSize: z.number().min(10).max(20),
      maxEvents: z.number().int().min(100).max(100000),
      refreshSeconds: z.number().int().min(0).max(3600),
      timezone: z.enum(["local", "utc"]),
      highlightText: z.string().max(1000),
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
  });

/** Authorization is deliberately process-local. Persisted state can never enable AWS. */
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
