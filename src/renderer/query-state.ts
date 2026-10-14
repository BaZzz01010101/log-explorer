import type {
  LogEvent,
  LogTab,
  QueryRequest,
  Connection,
} from "../shared/contracts";

export function mergeEvents(
  previous: LogEvent[],
  incoming: LogEvent[],
  limit: number,
  maxMessageCharacters = 16_000_000,
  preserveOrder = false,
): { events: LogEvent[]; evicted: number } {
  const seen = new Set(
    previous.map(
      (event) => `${event.logGroup}\0${event.logStream}\0${event.id}`,
    ),
  );
  const events = [...previous];
  for (const event of incoming) {
    const key = `${event.logGroup}\0${event.logStream}\0${event.id}`;
    if (!seen.has(key)) {
      events.push(event);
      seen.add(key);
    }
  }
  if (!preserveOrder) events.sort((a, b) => a.timestamp - b.timestamp);
  let evicted = Math.max(0, events.length - limit);
  let characters = events
    .slice(evicted)
    .reduce((sum, event) => sum + event.message.length, 0);
  while (characters > maxMessageCharacters && evicted < events.length)
    characters -= events[evicted++].message.length;
  return { events: evicted ? events.slice(evicted) : events, evicted };
}

export function resolveTimeRange(
  preset: string,
  start?: string,
  end?: string,
  now = Date.now(),
): { startTime: number; endTime: number } {
  if (preset === "custom") {
    const startTime = Date.parse(start ?? "");
    const endTime = Date.parse(end ?? "");
    if (
      !Number.isFinite(startTime) ||
      !Number.isFinite(endTime) ||
      startTime < 0
    )
      throw new Error("Choose valid start and end times");
    if (endTime <= startTime)
      throw new Error("End time must be after start time");
    return { startTime, endTime };
  }
  const duration = (
    {
      "5m": 300000,
      "15m": 900000,
      "1h": 3600000,
      "6h": 21600000,
      "24h": 86400000,
      "7d": 604800000,
    } as Record<string, number>
  )[preset];
  if (!duration) throw new Error("Choose a supported time range");
  return { startTime: Math.max(0, now - duration), endTime: now };
}

export function requestMatchesTab(
  request: QueryRequest,
  tab: LogTab,
  connection?: Connection,
): boolean {
  if (
    !connection ||
    request.connection.id !== connection.id ||
    request.connection.profile !== connection.profile ||
    request.connection.region !== connection.region ||
    request.connection.mode !== connection.mode ||
    request.kind !== tab.kind ||
    JSON.stringify(request.sources) !== JSON.stringify(tab.sources)
  )
    return false;
  if (
    tab.kind === "events"
      ? request.filterPattern !== tab.filterPattern
      : request.query !== tab.query
  )
    return false;
  try {
    const range = resolveTimeRange(
      tab.timePreset,
      tab.customStart,
      tab.customEnd,
      request.endTime,
    );
    return (
      range.startTime === request.startTime && range.endTime === request.endTime
    );
  } catch {
    return false;
  }
}
