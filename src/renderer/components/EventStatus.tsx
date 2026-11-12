import type { TabRuntime } from "../useLogJobs";
import { IconArrowDown, IconRadio } from "@tabler/icons-react";
import "./event-feedback.css";

interface Props {
  runtime?: TabRuntime;
  eventsShown: number;
  eventsLoaded: number;
  followLive?: boolean;
  onToggleFollow?(): void;
}

export function EventStatus({
  runtime,
  eventsShown,
  eventsLoaded,
  followLive,
  onToggleFollow,
}: Props) {
  const state = runtime?.state ?? "idle";
  const label =
    state === "error"
      ? runtime?.liveState
        ? "Live Tail failed"
        : "Query failed"
        : runtime?.incomplete && state === "complete"
          ? "Search incomplete · scroll to continue"
        : runtime?.liveState === "stopped"
        ? "Live stopped"
        : runtime?.liveState === "connecting"
          ? "Connecting to Live Tail"
          : state === "cancelled"
            ? "Cancelled"
            : runtime?.live && (state === "queued" || state === "running")
              ? runtime.liveState === "streaming"
                ? "Live stream · connected"
                : "Live stream"
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
      data-live-state={runtime?.liveState}
      data-live-received={runtime?.liveReceived}
      role="status"
      aria-live="polite"
    >
      <div className="event-status-items">
        {label && (
          <span
            className={runtime?.live ? "event-live-state" : undefined}
            data-tooltip={
              runtime?.live
                ? "Live receives new events automatically. Inactive tabs pause Live; time range changes load history."
                : undefined
            }
          >
            {runtime?.live && <IconRadio size={12} />}
            {label}
          </span>
        )}
        <span>
          {eventsShown !== eventsLoaded &&
            `${eventsShown.toLocaleString()} shown / `}
          {eventsLoaded.toLocaleString()} loaded
        </span>
        {runtime?.request?.gcpLocalFilter?.kind === "aws-json" && <span data-tooltip="AWS JSON patterns are checked after Google Cloud events are fetched. Sparse matches can take longer to load.">GCP filter after fetch</span>}
        {runtime?.liveReceived !== undefined && (
          <span>
            {runtime.liveReceived.toLocaleString()} new in this session
          </span>
        )}
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
      {runtime?.live && (
        <button
          type="button"
          className="event-follow-live"
          aria-label="Follow Live"
          aria-pressed={Boolean(followLive)}
          onClick={onToggleFollow}
          data-tooltip="Scroll down while at the bottom to follow new events. Scroll up or select text to pause following. Reception continues."
        >
          <IconArrowDown size={12} />
          {followLive ? "Following Live" : "Follow Live"}
        </button>
      )}
    </div>
  );
}
