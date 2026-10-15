export interface TabSelection {
  ids: string[];
  anchorId: string | null;
}

export function selectWorkspaceEntry(
  previous: TabSelection,
  order: string[],
  activeId: string | null,
  clickedId: string,
  modifiers: { shift?: boolean; toggle?: boolean },
): TabSelection {
  if (!order.includes(clickedId)) return previous;
  if (!modifiers.shift && !modifiers.toggle)
    return { ids: [], anchorId: clickedId };
  const valid = previous.ids.filter((id) => order.includes(id));
  const selected = new Set(
    valid.length
      ? valid
      : activeId && order.includes(activeId)
        ? [activeId]
        : [],
  );
  if (modifiers.shift) {
    const anchorId =
      previous.anchorId && order.includes(previous.anchorId)
        ? previous.anchorId
        : activeId && order.includes(activeId)
          ? activeId
          : clickedId;
    const start = order.indexOf(anchorId);
    const end = order.indexOf(clickedId);
    const range = order.slice(Math.min(start, end), Math.max(start, end) + 1);
    return {
      ids: modifiers.toggle
        ? order.filter((id) => selected.has(id) || range.includes(id))
        : range,
      anchorId,
    };
  }
  if (selected.has(clickedId)) selected.delete(clickedId);
  else selected.add(clickedId);
  return { ids: order.filter((id) => selected.has(id)), anchorId: clickedId };
}
