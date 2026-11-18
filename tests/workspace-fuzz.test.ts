import { expect, it } from "vitest";
import { workspaceSchema } from "../src/main/security";
import {
  consistentProjection,
  createTab,
  createWorkspace,
  persistedWorkspace,
  restoreWorkspace,
  workspaceReducer,
  type WorkspaceAction,
} from "../src/shared/workspace";
import {
  activeEntryId,
  workspaceEntries,
} from "../src/shared/workspace-entries";
import { layoutPaneIds } from "../src/shared/pane-layout";
import type { SplitEdge, Workspace } from "../src/shared/contracts";

/** Structural invariants every reducer state must keep; returns the first broken one. */
function broken(state: Workspace): string | undefined {
  const parsed = workspaceSchema.safeParse(state);
  if (!parsed.success)
    return `schema: ${parsed.error.issues[0]?.path.join(".")} ${parsed.error.issues[0]?.message}`;
  const tabIds = new Set(state.tabs.map((tab) => tab.id));
  if (tabIds.size !== state.tabs.length) return "duplicate tab id";
  const splits = state.splitTabs ?? [];
  const splitIds = new Set(splits.map((split) => split.id));
  if (splitIds.size !== splits.length) return "duplicate split id";
  if (splits.some((split) => tabIds.has(split.id)))
    return "split id equals a tab id";
  const members = splits.flatMap((split) =>
    split.panes.flatMap((pane) => (pane.tabId ? [pane.tabId] : [])),
  );
  if (new Set(members).size !== members.length)
    return "view in two split panes";
  if (members.some((id) => !tabIds.has(id)))
    return "split pane shows a missing view";
  for (const split of splits) {
    if (
      layoutPaneIds(split.layout).sort().join() !==
      split.panes
        .map((pane) => pane.id)
        .sort()
        .join()
    )
      return "split layout and panes differ";
    if (!split.panes.some((pane) => pane.id === split.activePaneId))
      return "split active pane missing";
  }
  if (
    state.layout &&
    layoutPaneIds(state.layout).sort().join() !==
      state.panes
        .map((pane) => pane.id)
        .sort()
        .join()
  )
    return "projection layout and panes differ";
  if (!state.panes.some((pane) => pane.id === state.activePaneId))
    return "active pane missing";
  const shown = state.panes.flatMap((pane) => (pane.tabId ? [pane.tabId] : []));
  if (new Set(shown).size !== shown.length) return "view shown in two panes";
  if (shown.some((id) => !tabIds.has(id))) return "pane shows a missing view";
  const entries = workspaceEntries(state);
  if (
    typeof state.activeTabId === "string" &&
    !entries.some((entry) => entry.id === state.activeTabId)
  )
    return "active entry missing";
  if (entries.length && activeEntryId(state) === null)
    return "no active entry while entries exist";
  // The saved file must load back to the same strip and active entry.
  let restored: Workspace;
  try {
    restored = restoreWorkspace(
      JSON.parse(
        JSON.stringify(persistedWorkspace(consistentProjection(state))),
      ),
    );
  } catch (error) {
    return `restore throws: ${(error as Error).message}`;
  }
  const strip = (workspace: Workspace) =>
    JSON.stringify(
      workspaceEntries(workspace).map((entry) => [
        entry.id,
        entry.tabIds,
        Boolean(entry.pinned),
      ]),
    );
  if (strip(restored) !== strip(state)) return "reload changes the tab strip";
  if (activeEntryId(restored) !== activeEntryId(state))
    return "reload changes the active entry";
  return undefined;
}

// Seeded runs reach several combined splits with many panes and views, so the
// drag-and-drop, split and close actions meet each other in many orders.
it("keeps every reducer state consistent across random sequences of all layout actions", () => {
  let seed = 11;
  const random = () => (seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31;
  const pick = <T>(items: readonly T[]): T | undefined =>
    items.length ? items[Math.floor(random() * items.length)] : undefined;
  const failures = new Map<
    string,
    { count: number; trace: WorkspaceAction[] }
  >();
  const groups = ["/a", "/b", "/c"];
  const edges: (SplitEdge | null)[] = ["left", "right", "top", "bottom", null];
  for (let run = 0; run < 120; run++) {
    let state = createWorkspace();
    const trace: WorkspaceAction[] = [];
    for (let step = 0; step < 50; step++) {
      const fresh = () =>
        createTab(state.tabs[0]?.connectionId ?? "offline", [
          { logGroup: pick(groups)! },
        ]);
      const entryIds = workspaceEntries(state).map((entry) => entry.id);
      const tabId = pick(state.tabs.map((tab) => tab.id)) ?? "missing";
      const entryId = pick(entryIds) ?? "missing";
      const anyId = random() < 0.5 ? tabId : entryId;
      const paneId = pick(state.panes.map((pane) => pane.id)) ?? "pane-1";
      const before = random() < 0.3 ? null : (pick(entryIds) ?? null);
      const copy = random() < 0.3;
      const pinned = random() < 0.3;
      const actions: WorkspaceAction[] = [
        { type: "tab/open", tab: fresh() },
        { type: "tab/preview", tab: fresh() },
        { type: "tab/open-resource", tab: fresh(), paneId },
        { type: "tab/promote", tabId },
        { type: "tab/select", tabId: anyId },
        { type: "tab/select", tabId, paneId },
        { type: "tab/close", tabId: anyId, allowPinned: random() < 0.5 },
        { type: "tab/reopen" },
        { type: "tab/rename", tabId: anyId, title: `name ${step}` },
        { type: "tab/pin", tabId: anyId, pinned },
        { type: "tab/duplicate", tabId: anyId },
        { type: "tab/reorder", tabId: anyId, beforeTabId: before, copy },
        { type: "tab/move", tabId: anyId, beforeTabId: before, pinned, copy },
        {
          type: "tabs/insert",
          tabs: [fresh(), fresh()],
          beforeTabId: before,
          pinned,
        },
        {
          type: "tab/merge-sources",
          tabId,
          targetTabId: pick(state.tabs.map((tab) => tab.id)) ?? tabId,
          copy,
        },
        {
          type: "source/move",
          origin: { tabId, sourceIndex: 0 },
          copy,
          destination: pick([
            {
              kind: "sources",
              tabId: pick(state.tabs.map((tab) => tab.id)) ?? tabId,
            },
            { kind: "split", paneId, edge: pick(edges)! },
            { kind: "tab", beforeTabId: before, pinned },
          ] as const)!,
        },
        { type: "split/exit", tabId: state.activeTabId ?? entryId },
        { type: "pane/split", tabId, edge: pick(edges) ?? undefined },
        { type: "pane/split", paneId },
        {
          type: "pane/drop-tab",
          tabId: anyId,
          paneId,
          edge: pick(edges)!,
          copy,
        },
        {
          type: "pane/drop-resource",
          tab: random() < 0.5 ? fresh() : [fresh(), fresh()],
          paneId,
          edge: pick(edges)!,
        },
        {
          type: "pane/show-tabs",
          tabIds: state.tabs
            .slice(0, 2 + Math.floor(random() * 3))
            .map((tab) => tab.id),
        },
        {
          type: "pane/resize",
          path: pick(["", "0", "1", "01"])!,
          ratio: 0.2 + random() * 0.6,
        },
        { type: "pane/close", paneId },
        { type: "pane/assign", paneId, tabId: random() < 0.2 ? null : tabId },
        {
          type: "pane/reorder",
          paneId,
          beforePaneId: pick(state.panes.map((pane) => pane.id)) ?? null,
        },
        { type: "pane/activate", paneId },
        {
          type: "pane/swap",
          paneId,
          overPaneId: pick(state.panes.map((pane) => pane.id)) ?? paneId,
        },
        { type: "pane/detach", tabId, beforeTabId: before, pinned, copy },
        { type: "favorites/save", tabId },
        {
          type: "favorites/open",
          favoriteId:
            pick(state.favorites.map((favorite) => favorite.id)) ?? "missing",
        },
        // Serialized below only when picked; it is the costliest action.
        { type: "workspace/restore", workspace: null },
      ];
      let action = pick(actions)!;
      if (action.type === "workspace/restore")
        action = {
          type: "workspace/restore",
          workspace: JSON.parse(
            JSON.stringify(persistedWorkspace(consistentProjection(state))),
          ),
        };
      trace.push(action);
      let problem: string | undefined;
      try {
        state = workspaceReducer(state, action);
        problem = broken(state);
      } catch (error) {
        problem = `throws: ${(error as Error).message}`;
      }
      if (problem) {
        const key = `${problem} after ${action.type}`;
        const known = failures.get(key);
        if (!known || trace.length < known.trace.length)
          failures.set(key, {
            count: (known?.count ?? 0) + 1,
            trace: [...trace],
          });
        else known.count++;
        break;
      }
    }
  }
  for (const [key, { count, trace }] of failures)
    console.log(
      `${count}× ${key}\n  shortest trace: ${JSON.stringify(trace.map(({ type, ...rest }) => [type, Object.keys(rest).length ? rest : undefined]))}`.slice(
        0,
        3000,
      ),
    );
  expect([...failures.keys()]).toEqual([]);
  // Thousands of save-and-reload checks; allow for a busy parallel run.
}, 60_000);
