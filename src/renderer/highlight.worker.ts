import { highlightEvent } from "./highlight-engine";
import type { HighlightProfile } from "../shared/highlights";
import type { ColumnConfig, LogEvent, Preferences } from "../shared/contracts";

self.onmessage = (
  event: MessageEvent<{
    events: LogEvent[];
    profiles: HighlightProfile[];
    theme: Preferences["theme"];
    columns: ColumnConfig[];
    timezone: Preferences["timezone"];
  }>,
) => {
  const { events, profiles, theme, columns, timezone } = event.data;
  self.postMessage({ ready: true });
  for (const item of events)
    self.postMessage({
      id: item.id,
      result: highlightEvent(item, profiles, theme, columns, timezone),
    });
  self.postMessage({ done: true });
};
