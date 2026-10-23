import type { LogTab, Workspace } from "../shared/contracts";

import { sourceCount } from "../shared/source-labels";

export const logTabLabel = (tab: LogTab) =>
  tab.customTitle ??
  (sourceCount(tab.sources) > 1
    ? `Mixed Sources (${sourceCount(tab.sources)})`
    : tab.title);

export interface WorkspaceEntry {
  id: string;
  pinned?: boolean;
  title: string;
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
      preview: tab.preview,
      ...(tab.pinned !== undefined ? { pinned: tab.pinned } : {}),
      kind: "single",
      tabIds: [tab.id],
    }));
  for (const split of splits) {
    const tabIds = split.panes.flatMap((pane) =>
      pane.tabId ? [pane.tabId] : [],
    );
    const count = tabIds.reduce(
      (count, id) =>
        count +
        sourceCount(workspace.tabs.find((tab) => tab.id === id)?.sources ?? []),
      0,
    );
    entries.push({
      id: split.id,
      title: split.title ?? `Mixed Sources (${count})`,
      ...(split.pinned !== undefined ? { pinned: split.pinned } : {}),
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
  const all = [...ordered, ...byId.values()];
  return [
    ...all.filter((entry) => entry.pinned),
    ...all.filter((entry) => !entry.pinned),
  ];
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
