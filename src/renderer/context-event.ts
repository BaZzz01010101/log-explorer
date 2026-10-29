import type { LogEvent } from "../shared/contracts";

export function contextEventIndex(
  events: readonly LogEvent[],
  origin: LogEvent,
): number {
  const sameSource = (event: LogEvent) =>
    event.logGroup === origin.logGroup &&
    event.logStream === origin.logStream &&
    (!event.connectionId ||
      !origin.connectionId ||
      event.connectionId === origin.connectionId);
  const exact = events.findIndex(
    (event) => sameSource(event) && event.id === origin.id,
  );
  return exact >= 0
    ? exact
    : events.findIndex(
        (event) =>
          sameSource(event) &&
          event.timestamp === origin.timestamp &&
          event.message === origin.message,
      );
}
