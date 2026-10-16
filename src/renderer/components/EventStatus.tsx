import type { TabRuntime } from "../useLogJobs";
import "./event-feedback.css";

interface Props {
  runtime?: TabRuntime;
  eventsShown: number;
  eventsLoaded: number;
}

export function EventStatus({ runtime, eventsShown, eventsLoaded }: Props) {
  const state = runtime?.state ?? "idle";
  const label =
    state === "error"
      ? "Query failed"
      : state === "cancelled"
        ? "Cancelled"
        : runtime?.live && (state === "queued" || state === "running")
          ? "Live stream"
          : runtime?.live && state === "complete"
            ? "Live stream stopped"
            : state === "queued"
              ? "Queued"
              : state === "running"
                ? "Loading events"
                : undefined;
  return (
    <div
      className="query-status event-status"
      data-query-state={state}
      role="status"
      aria-live="polite"
    >
      <div className="event-status-items">
        {label && <span>{label}</span>}
        <span>
          {eventsShown !== eventsLoaded &&
            `${eventsShown.toLocaleString()} shown / `}
          {eventsLoaded.toLocaleString()} loaded
        </span>
        {runtime?.stats?.bytesScanned !== undefined && (
          <span>
            {(runtime.stats.bytesScanned / 1048576).toFixed(2)} MiB scanned
          </span>
        )}
        {runtime?.stats?.recordsScanned !== undefined && (
          <span>{runtime.stats.recordsScanned.toLocaleString()} scanned</span>
        )}
        {runtime?.stats?.elapsedMs !== undefined && (
          <span>{(runtime.stats.elapsedMs / 1000).toFixed(1)}s</span>
        )}
      </div>
    </div>
  );
}
