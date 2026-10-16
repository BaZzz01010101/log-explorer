import { useEffect, useRef, useState } from "react";

export function useEventSelection(ids: string[]) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [opened, setOpened] = useState(false);
  const lastIndex = useRef(0);
  const index = selectedId === null ? -1 : ids.indexOf(selectedId);
  if (index >= 0) lastIndex.current = index;
  useEffect(() => {
    if (selectedId !== null && !ids.includes(selectedId)) {
      setSelectedId(ids[Math.min(lastIndex.current, ids.length - 1)] ?? null);
    } else if (opened && selectedId === null && ids.length) {
      setSelectedId(ids[0]!);
    }
  }, [ids, selectedId, opened]);
  const select = (id: string) => {
    if (ids.includes(id)) setSelectedId(id);
  };
  const inspect = (id: string) => {
    if (!ids.includes(id)) return;
    setSelectedId(id);
    setOpened(true);
  };
  const move = (direction: "next" | "previous" | "first" | "last") => {
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
    if (next >= 0) setSelectedId(ids[next]!);
    return next;
  };
  return {
    selectedId,
    opened,
    index,
    select,
    inspect,
    move,
    close: () => setOpened(false),
  };
}
