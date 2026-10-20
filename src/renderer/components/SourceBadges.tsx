import { useEffect, useRef, useState } from "react";
import { IconX } from "@tabler/icons-react";
import type { Connection, LogSource } from "../../shared/contracts";
import { removeSource, sourceBadges } from "../../shared/source-labels";
import { decodeResourceDrop, mergeSources } from "../source-management";
import {
  RESOURCE_DRAG_START,
  RESOURCE_DRAG_END,
  isResourceDragging,
} from "../resource-drag";
import { SOURCE_DROP_EVENT } from "./ResourceDragLabel";
import "./sources.css";

export function SourceBadges({
  sources,
  connectionId,
  connections,
  onChange,
}: {
  sources: LogSource[];
  connectionId: string;
  connections: Connection[];
  onChange(sources: LogSource[]): void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [resourceDragging, setResourceDragging] = useState(isResourceDragging);
  useEffect(() => {
    if (typeof window === "undefined") return;
    const start = () => setResourceDragging(true);
    const end = () => setResourceDragging(false);
    window.addEventListener(RESOURCE_DRAG_START, start);
    window.addEventListener(RESOURCE_DRAG_END, end);
    return () => {
      window.removeEventListener(RESOURCE_DRAG_START, start);
      window.removeEventListener(RESOURCE_DRAG_END, end);
    };
  }, []);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    const strip = ref.current;
    if (!strip) return;
    const leave = () => setDragging(false);
    const enter = () => setDragging(true);
    const drop = (event: Event) => {
      leave();
      const payload = decodeResourceDrop(
        JSON.stringify((event as CustomEvent).detail),
      );
      if (
        !payload ||
        !connections.some(
          (connection) => connection.id === payload.connectionId,
        )
      ) {
        setError("This source connection is no longer available.");
        return;
      }
      try {
        const scoped = payload.sources.map((source) => ({
          ...source,
          ...(payload.connectionId !== connectionId
            ? { connectionId: payload.connectionId }
            : { connectionId: undefined }),
        }));
        const next = mergeSources(sources, scoped, connectionId);
        setError("");
        if (JSON.stringify(next) !== JSON.stringify(sources)) onChange(next);
      } catch (error) {
        setError(error instanceof Error ? error.message : String(error));
      }
    };
    strip.addEventListener("explorer:source-drag-enter", enter);
    strip.addEventListener("explorer:source-drag-leave", leave);
    strip.addEventListener(SOURCE_DROP_EVENT, drop);
    return () => {
      strip.removeEventListener("explorer:source-drag-enter", enter);
      strip.removeEventListener("explorer:source-drag-leave", leave);
      strip.removeEventListener(SOURCE_DROP_EVENT, drop);
    };
  }, [sources, connectionId, connections, onChange]);
  const badges = sourceBadges(sources);
  const multipleConnections =
    new Set(sources.map((source) => source.connectionId ?? connectionId)).size >
    1;
  const multipleProfiles =
    new Set(
      sources.map(
        (source) =>
          connections.find(
            (connection) =>
              connection.id === (source.connectionId ?? connectionId),
          )?.profile,
      ),
    ).size > 1;
  return (
    <div
      className="source-control"
      hidden={badges.length === 1 && !resourceDragging}
    >
      <div
        ref={ref}
        className={`source-badges${dragging ? " source-drop-active" : ""}`}
        role="group"
        aria-label="Log sources"
        title="Drag log groups or streams here to add sources"
      >
        <span className="source-strip-label">{badges.length} Sources</span>
        <div className="source-badge-list">
          {badges.map(({ sourceIndex, stream, label }) => {
            const source = sources[sourceIndex];
            const connection = connections.find(
              (connection) =>
                connection.id === (source.connectionId ?? connectionId),
            );
            const fullName = `${source.logGroup}${stream ? ` / ${stream}` : ""}`;
            return (
              <span
                className="source-badge"
                key={JSON.stringify([sourceIndex, stream])}
                title={`${fullName}\n${connection?.profile ?? ""} · ${connection?.region ?? ""}`}
                data-source-group={source.logGroup}
                data-source-stream={stream}
                data-source-connection={source.connectionId ?? connectionId}
              >
                <span>
                  {label}
                  {multipleConnections && connection
                    ? ` · ${multipleProfiles ? connection.profile + "/" : ""}${connection.region}`
                    : ""}
                </span>
                <button
                  type="button"
                  aria-label={`Remove source ${fullName} (${connection?.region ?? ""})`}
                  onClick={() => {
                    setError("");
                    onChange(removeSource(sources, sourceIndex, stream));
                  }}
                >
                  <IconX size={12} />
                </button>
              </span>
            );
          })}
          {!badges.length && (
            <span className="source-empty">
              Drop a log group or stream here
            </span>
          )}
        </div>
      </div>
      {error && (
        <div role="alert" className="source-error">
          {error}
        </div>
      )}
    </div>
  );
}
