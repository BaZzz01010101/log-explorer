import { useEffect, useRef, useState } from "react";

export function useEventSelectionState(initiallyOpened = true) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [opened, setOpened] = useState(initiallyOpened);
  const anchor = useRef<string | null>(null);
  const lastIndex = useRef(0);
  return {
    selectedId,
    setSelectedId,
    selected,
    setSelected,
    opened,
    setOpened,
    anchor,
    lastIndex,
  };
}

export type EventSelectionState = ReturnType<typeof useEventSelectionState>;

export function useEventSelection(
  ids: string[],
  initiallyOpened = true,
  sharedState?: EventSelectionState,
) {
  const privateState = useEventSelectionState(initiallyOpened);
  const {
    selectedId,
    setSelectedId,
    selected,
    setSelected,
    opened,
    setOpened,
    anchor,
    lastIndex,
  } = sharedState ?? privateState;
  const index = selectedId === null ? -1 : ids.indexOf(selectedId);
  if (index >= 0) lastIndex.current = index;
  useEffect(() => {
    const available = new Set(ids);
    setSelected((previous) => {
      const surviving = new Set(
        [...previous].filter((id) => available.has(id)),
      );
      return surviving.size === previous.size ? previous : surviving;
    });
    if (selectedId !== null && !available.has(selectedId)) {
      const next = ids[Math.min(lastIndex.current, ids.length - 1)] ?? null;
      setSelectedId(next);
      if (next !== null)
        setSelected((previous) => new Set([...previous, next]));
      anchor.current = next;
    } else if (opened && selectedId === null && ids.length) {
      setSelectedId(ids[0]!);
      setSelected(new Set([ids[0]!]));
      anchor.current = ids[0]!;
    } else if (anchor.current !== null && !available.has(anchor.current)) {
      anchor.current = selectedId;
    }
  }, [ids, selectedId, opened]);
  const select = (
    id: string,
    options: { additive?: boolean; range?: boolean } = {},
  ) => {
    const destination = ids.indexOf(id);
    if (destination < 0) return;
    if (options.range) {
      const anchored = ids.indexOf(anchor.current ?? selectedId ?? id);
      const start = anchored < 0 ? destination : anchored;
      const range = ids.slice(
        Math.min(start, destination),
        Math.max(start, destination) + 1,
      );
      setSelected(
        (previous) =>
          new Set(options.additive ? [...previous, ...range] : range),
      );
      if (anchored < 0 || anchor.current === null) anchor.current = ids[start]!;
    } else if (options.additive) {
      setSelected((previous) => {
        const next = new Set(previous);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        return next;
      });
      anchor.current = id;
    } else {
      setSelected(new Set([id]));
      anchor.current = id;
    }
    setSelectedId(id);
  };
  const inspect = (id: string) => {
    if (!ids.includes(id)) return;
    if (!selected.has(id)) select(id);
    else setSelectedId(id);
    setOpened(true);
  };
  const move = (
    direction: "next" | "previous" | "first" | "last",
    options: { range?: boolean; additive?: boolean } = {},
  ) => {
    const current = selectedId === null ? -1 : ids.indexOf(selectedId);
    const destination =
      direction === "first"
        ? 0
        : direction === "last"
          ? ids.length - 1
          : current < 0
            ? direction === "previous"
              ? ids.length - 1
              : 0
            : current + (direction === "next" ? 1 : -1);
    const next = Math.min(Math.max(0, destination), ids.length - 1);
    if (next >= 0) select(ids[next]!, options);
    return next;
  };
  return {
    selectedId,
    selectedIds: ids.filter((id) => selected.has(id)),
    opened,
    index,
    select,
    inspect,
    move,
    selectAll: () => {
      setSelected(new Set(ids));
      if (selectedId === null && ids.length) {
        setSelectedId(ids[0]!);
        anchor.current = ids[0]!;
      }
    },
    close: () => setOpened(false),
    toggle: () => setOpened((value) => !value),
  };
}
