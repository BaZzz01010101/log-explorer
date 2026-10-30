export interface TabNavigationState {
  recentIds: string[];
  cycle?: { ids: string[]; selectedId: string };
}

function reconcileTabs(
  state: TabNavigationState,
  openIds: string[],
): TabNavigationState {
  const open = new Set(openIds);
  const recentIds = [...new Set([...state.recentIds, ...open])].filter((id) =>
    open.has(id),
  );
  return {
    recentIds,
    ...(state.cycle
      ? {
          cycle: {
            ...state.cycle,
            ids: state.cycle.ids.filter((id) => open.has(id)),
          },
        }
      : {}),
  };
}

/** Focus changes caused by a held MRU cycle keep its snapshot unchanged. */
export function observeTabFocus(
  state: TabNavigationState,
  openIds: string[],
  activeId: string | null,
): TabNavigationState {
  const next = reconcileTabs(state, openIds);
  if (!activeId || !next.recentIds.includes(activeId))
    return { recentIds: next.recentIds };
  if (next.cycle?.selectedId === activeId) return next;
  return {
    recentIds: [activeId, ...next.recentIds.filter((id) => id !== activeId)],
  };
}

export function visualTabId(
  ids: string[],
  activeId: string | null,
  direction: 1 | -1,
): string | undefined {
  if (!ids.length) return undefined;
  const index = ids.indexOf(activeId ?? "");
  if (index < 0) return direction === 1 ? ids[0] : ids.at(-1);
  return ids[(index + direction + ids.length) % ids.length];
}

/** A cycle visits a stable snapshot until its modifier is released. */
export function cycleRecentTabs(
  state: TabNavigationState,
  openIds: string[],
  activeId: string | null,
  direction: 1 | -1,
): { state: TabNavigationState; tabId: string | undefined } {
  const next = state.cycle
    ? reconcileTabs(state, openIds)
    : observeTabFocus(state, openIds, activeId);
  const ids = next.cycle?.ids ?? next.recentIds;
  const tabId = visualTabId(ids, next.cycle?.selectedId ?? activeId, direction);
  return {
    state: {
      recentIds: next.recentIds,
      ...(tabId ? { cycle: { ids, selectedId: tabId } } : {}),
    },
    tabId,
  };
}

export function finishRecentTabCycle(
  state: TabNavigationState,
): TabNavigationState {
  const selected = state.cycle?.selectedId;
  return {
    recentIds:
      selected && state.recentIds.includes(selected)
        ? [selected, ...state.recentIds.filter((id) => id !== selected)]
        : state.recentIds,
  };
}
