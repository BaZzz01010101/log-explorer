import type { LogTab, Workspace } from "../shared/contracts";

export const logTabLabel = (tab: LogTab) => tab.customTitle ?? tab.title;

export interface WorkspaceEntry {
  id: string;
  title: string;
  groupId?: string;
  preview?: boolean;
  kind: "single" | "split";
  tabIds: string[];
}

/** Top-level strip entries; log-view configurations remain flat for job ownership. */
export function workspaceEntries(workspace: Workspace): WorkspaceEntry[] {
  const splits = workspace.splitTabs ?? [];
  const members = new Set(
    splits.flatMap((split) =>
      split.panes.flatMap((pane) => (pane.tabId ? [pane.tabId] : [])),
    ),
  );
  const entries: WorkspaceEntry[] = workspace.tabs
    .filter((tab) => !members.has(tab.id))
    .map((tab) => ({
      id: tab.id,
      title: logTabLabel(tab),
      groupId: tab.groupId,
      preview: tab.preview,
      kind: "single",
      tabIds: [tab.id],
    }));
  for (const split of splits) {
    const tabIds = split.panes.flatMap((pane) =>
      pane.tabId ? [pane.tabId] : [],
    );
    entries.push({
      id: split.id,
      title:
        split.title ??
        tabIds
          .map((id) => {
            const tab = workspace.tabs.find((tab) => tab.id === id);
            return tab ? logTabLabel(tab) : "Log view";
          })
          .join(" + "),
      groupId: split.groupId,
      kind: "split",
      tabIds,
    });
  }
  const byId = new Map(entries.map((entry) => [entry.id, entry]));
  const ordered = [...new Set(workspace.tabOrder ?? [])].flatMap((id) => {
    const entry = byId.get(id);
    if (entry) byId.delete(id);
    return entry ? [entry] : [];
  });
  return [...ordered, ...byId.values()];
}

export function activeEntryId(workspace: Workspace): string | null {
  const entries = workspaceEntries(workspace);
  if (workspace.activeTabId !== undefined)
    return entries.some((entry) => entry.id === workspace.activeTabId)
      ? workspace.activeTabId
      : null;
  const tabId = workspace.panes.find(
    (pane) => pane.id === workspace.activePaneId,
  )?.tabId;
  return (
    entries.find((entry) => entry.tabIds.includes(tabId ?? ""))?.id ??
    entries[0]?.id ??
    null
  );
}
