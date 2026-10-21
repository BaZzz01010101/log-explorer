import { highlightEvent, type EventHighlights } from "./highlight-engine";
import type { HighlightProfile } from "../shared/highlights";
import type { ColumnConfig, LogEvent, Preferences } from "../shared/contracts";

self.onmessage = (
  event: MessageEvent<{
    events: LogEvent[];
    profiles: HighlightProfile[];
    theme: Preferences["theme"];
    columns: ColumnConfig[];
    timezone: Preferences["timezone"];
    overview?: boolean;
    needle?: string;
  }>,
) => {
  const {
    events,
    profiles,
    theme,
    columns,
    timezone,
    overview,
    needle = "",
  } = event.data;
  self.postMessage({ ready: true });
  let batch: { id: string; result: EventHighlights }[] = [];
  let lastProgress = performance.now();
  for (const item of events) {
    const result = highlightEvent(
      item,
      profiles,
      theme,
      columns,
      timezone,
      overview,
      needle,
    );
    if (overview) {
      if (result.overview!.length) batch.push({ id: item.id, result });
    } else batch.push({ id: item.id, result });
    if (performance.now() - lastProgress > 16) {
      self.postMessage({ batch });
      batch = [];
      lastProgress = performance.now();
    }
  }
  self.postMessage({ batch });
  self.postMessage({ done: true });
};
