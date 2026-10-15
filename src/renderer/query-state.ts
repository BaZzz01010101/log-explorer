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

export function parseRangeTime(value: string | undefined): number {
  const match = value?.match(
    /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,3}))?)?(Z|[+-]\d{2}:\d{2})?$/,
  );
  if (!match) return NaN;
  const [, year, month, day, hour, minute, second = "0", fraction = "", zone] =
    match;
  const fields = [
    Number(year),
    Number(month) - 1,
    Number(day),
    Number(hour),
    Number(minute),
    Number(second),
    Number(fraction.padEnd(3, "0")),
  ];
  const timestamp = Date.parse(value!);
  if (!Number.isFinite(timestamp)) return NaN;
  // Date.parse silently rolls invalid dates and nonexistent DST wall times forward.
  // Local inputs must name an actual local instant; explicit offsets retain their meaning.
  const calendar = zone
    ? new Date(
        `${year}-${month}-${day}T${hour}:${minute}:${second.padStart(2, "0")}.${fraction.padEnd(3, "0")}Z`,
      )
    : new Date(timestamp);
  const actual = zone
    ? [
        calendar.getUTCFullYear(),
        calendar.getUTCMonth(),
        calendar.getUTCDate(),
        calendar.getUTCHours(),
        calendar.getUTCMinutes(),
        calendar.getUTCSeconds(),
        calendar.getUTCMilliseconds(),
      ]
    : [
        calendar.getFullYear(),
        calendar.getMonth(),
        calendar.getDate(),
        calendar.getHours(),
        calendar.getMinutes(),
        calendar.getSeconds(),
        calendar.getMilliseconds(),
      ];
  return fields.every((field, index) => field === actual[index])
    ? timestamp
    : NaN;
}

export function resolveTimeRange(
  preset: string,
  start?: string,
  end?: string,
  now = Date.now(),
): { startTime: number; endTime: number } {
  if (preset === "clear") return { startTime: 0, endTime: now };
  if (preset === "custom") {
    const startTime = parseRangeTime(start);
    const endTime = parseRangeTime(end);
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
      "30m": 1800000,
      "1h": 3600000,
      "3h": 10800000,
      "6h": 21600000,
      "12h": 43200000,
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
