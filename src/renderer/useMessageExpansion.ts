import { useMemo, useState } from "react";
import type { ViewConfig } from "../shared/contracts";

type Expansion = { all: boolean; exceptions: Set<string> };

export function useMessageExpansion(mode: ViewConfig["mode"]) {
  const [modes, setModes] = useState<Record<ViewConfig["mode"], Expansion>>(
    () => ({
      json: { all: true, exceptions: new Set() },
      table: { all: false, exceptions: new Set() },
      hybrid: { all: false, exceptions: new Set() },
    }),
  );
  const current = modes[mode];
  return useMemo(
    () => ({
      all: current.all,
      isExpanded: (id: string) =>
        current.exceptions.has(id) ? !current.all : current.all,
      toggle: (id: string) =>
        setModes((previous) => {
          const exceptions = new Set(previous[mode].exceptions);
          if (exceptions.has(id)) exceptions.delete(id);
          else exceptions.add(id);
          return {
            ...previous,
            [mode]: { ...previous[mode], exceptions },
          };
        }),
      toggleAll: () =>
        setModes((previous) => ({
          ...previous,
          [mode]: { all: !previous[mode].all, exceptions: new Set() },
        })),
    }),
    [current, mode],
  );
}
