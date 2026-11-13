import {
  highlightEvent,
  type EventHighlights,
  type HighlightFilters,
} from "./highlight-engine";
import type { HighlightProfile } from "../shared/highlights";
import type { ColumnConfig, LogEvent, Preferences } from "../shared/contracts";
import type { QuickHighlightOptions } from "../shared/quick-highlight";

self.onmessage = (
  event: MessageEvent<{
    events: (LogEvent & { messageComplete?: boolean })[];
    profiles: HighlightProfile[];
    theme: Preferences["theme"];
    columns: ColumnConfig[];
    timezone: Preferences["timezone"];
    overview?: boolean;
    needle?: string;
    quick?: QuickHighlightOptions;
    filters?: HighlightFilters;
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
    quick,
    filters,
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
      filters,
      item.messageComplete,
      quick,
    );
    if (overview) {
      if (result.overview!.length || needle) batch.push({ id: item.id, result });
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
