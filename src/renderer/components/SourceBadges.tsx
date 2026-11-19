import { useEffect, useRef, useState } from "react";
import { IconEye, IconEyeOff, IconPencil, IconTrash, IconX } from "@tabler/icons-react";
import type { Connection, LogSource } from "../../shared/contracts";
import {
  pruneHiddenSources,
  removeSource,
  sourceBadgeKey,
  sourceBadges,
} from "../../shared/source-labels";
import { decodeResourceDrop, mergeSources } from "../../shared/source-management";
import {
  RESOURCE_CONNECTION,
  SOURCE_MOVE_DROP,
  type ResourceOrigin,
} from "../resource-drag";
import { Menu } from "./AppMenu";
import { ResourceDragLabel, SOURCE_DROP_EVENT } from "./ResourceDragLabel";
import { SourceEditor, type SourceEdit } from "./SourceEditor";
import "./sources.css";

export function SourceBadges({
  sources,
  connectionId,
  connections,
  onChange,
  hiddenSources,
  onHiddenChange,
  tabId,
}: {
  sources: LogSource[];
  connectionId: string;
  connections: Connection[];
  /** `hiddenSources` is passed when the change also changes the hidden badges. */
  onChange(sources: LogSource[], hiddenSources?: string[]): void;
  /** Badge keys whose events the view hides locally. */
  hiddenSources?: string[];
  onHiddenChange?(hiddenSources: string[]): void;
  tabId: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState("");
  const [editing, setEditing] = useState<{
    sourceIndex: number;
    stream?: string;
  } | null>(null);
  // One menu, mounted only while open, at the pointer of the right-click.
  const [menu, setMenu] = useState<{
    sourceIndex: number;
    stream?: string;
    x: number;
    y: number;
  } | null>(null);
  const removeBadge = (sourceIndex: number, stream: string | undefined) => {
    setError("");
    commit(removeSource(sources, sourceIndex, stream));
  };
  const hidden = new Set(hiddenSources ?? []);
  /** Applies new sources and keeps the hidden badges that still exist. */
  const commit = (next: LogSource[], rename?: { from: string; to: string }) => {
    const current = hiddenSources ?? [];
    const renamed =
      rename && current.includes(rename.from)
        ? [...current.filter((key) => key !== rename.from), rename.to]
        : current;
    const kept = pruneHiddenSources(next, renamed, connectionId);
    onChange(
      next,
      kept.length === current.length &&
        kept.every((key, index) => key === current[index])
        ? undefined
        : kept,
    );
  };
  const toggleHidden = (key: string) =>
    onHiddenChange?.(
      hidden.has(key)
        ? (hiddenSources ?? []).filter((item) => item !== key)
        : [...(hiddenSources ?? []), key],
    );
  // A single click waits briefly so a double-click (edit) does not also solo.
  const soloTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => clearTimeout(soloTimer.current), []);
  const saveEdit = (
    sourceIndex: number,
    stream: string | undefined,
    edit: SourceEdit,
  ) => {
    const source = sources[sourceIndex];
    const list = sources.slice();
    // Editing one stream of a multi-stream source splits that stream off.
    if (stream && (source.logStreams?.length ?? 0) > 1) {
      list[sourceIndex] = {
        ...source,
        logStreams: source.logStreams!.filter((item) => item !== stream),
      };
      list.splice(sourceIndex + 1, 0, edit.source);
    } else list[sourceIndex] = edit.source;
    try {
      const next = mergeSources([], list, connectionId);
      if (edit.connection)
        window.dispatchEvent(
          new CustomEvent(RESOURCE_CONNECTION, { detail: edit.connection }),
        );
      setError("");
      setEditing(null);
      if (JSON.stringify(next) === JSON.stringify(sources)) return;
      commit(next, {
        from: sourceBadgeKey(source, stream, connectionId),
        to: sourceBadgeKey(
          edit.source,
          stream ? edit.source.logStreams?.[0] : undefined,
          connectionId,
        ),
      });
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : String(failure));
    }
  };
  useEffect(() => {
    const strip = ref.current;
    if (!strip) return;
    const leave = () => setDragging(false);
    const enter = () => setDragging(true);
    const drop = (event: Event) => {
      leave();
      const origin = (event as CustomEvent<{ origin?: ResourceOrigin }>).detail
        ?.origin;
      if (origin) {
        window.dispatchEvent(
          new CustomEvent(SOURCE_MOVE_DROP, { detail: { origin, tabId } }),
        );
        return;
      }
      const payload = decodeResourceDrop(
        JSON.stringify((event as CustomEvent).detail),
      );
      // A Google Cloud drag registers its connections just before the drop.
      const registering =
        (event as CustomEvent<{ connections?: Connection[] }>).detail
          ?.connections ?? [];
      const known = (id: string) =>
        connections.some((connection) => connection.id === id) ||
        registering.some((connection) => connection.id === id);
      if (
        !payload ||
        !known(payload.connectionId) ||
        !payload.sources.every((source) =>
          known(source.connectionId ?? payload.connectionId),
        )
      ) {
        setError("This source connection is no longer available.");
        return;
      }
      try {
        const scoped = payload.sources.map((source) => {
          const owner = source.connectionId ?? payload.connectionId;
          return {
            ...source,
            connectionId: owner !== connectionId ? owner : undefined,
          };
        });
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
  }, [sources, connectionId, connections, onChange, tabId]);
  useEffect(() => {
    const strip = list.current;
    if (!strip) return;
    // The strip only scrolls sideways, so a plain vertical wheel scrolls it
    // too. A native listener, because React's wheel listeners are passive.
    const wheel = (event: WheelEvent) => {
      if (
        event.ctrlKey ||
        Math.abs(event.deltaX) >= Math.abs(event.deltaY) ||
        strip.scrollWidth <= strip.clientWidth
      )
        return;
      event.preventDefault();
      const step = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? strip.clientWidth : 1;
      strip.scrollLeft += event.deltaY * step;
    };
    strip.addEventListener("wheel", wheel, { passive: false });
    return () => strip.removeEventListener("wheel", wheel);
  }, []);
  const badges = sourceBadges(sources);
  const hiddenCount = badges.filter(({ sourceIndex, stream }) =>
    hidden.has(sourceBadgeKey(sources[sourceIndex], stream, connectionId)),
  ).length;
  const sourcesWord = badges.length === 1 ? "Source" : "Sources";
  const badgeKeys = badges.map(({ sourceIndex, stream }) =>
    sourceBadgeKey(sources[sourceIndex], stream, connectionId),
  );
  /**
   * Clicking a badge shows only that source; clicking the only visible source
   * shows all sources again.
   */
  const soloSource = (key: string) => {
    if (!onHiddenChange || badgeKeys.length < 2) return;
    const visible = badgeKeys.filter((item) => !hidden.has(item));
    onHiddenChange(
      visible.length === 1 && visible[0] === key
        ? []
        : badgeKeys.filter((item) => item !== key),
    );
  };
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
    // Always shown, including for a single source, so the sources of a view
    // are visible and it is always a drop target.
    <div className="source-control">
      <div
        ref={ref}
        className={`source-badges${dragging ? " source-drop-active" : ""}`}
        role="group"
        aria-label="Log sources"
        data-source-tab-id={tabId}
        data-tooltip="Drag log groups or streams here to add sources"
      >
        {/* The label always reserves the width of its "shown/total" form, so
            hiding a source changes its text without moving the badges. */}
        <span
          className="source-strip-label"
          data-reserve={`${badges.length}/${badges.length} ${sourcesWord}`}
          data-hidden-count={hiddenCount || undefined}
          title={
            hiddenCount
              ? `${hiddenCount} of ${badges.length} ${sourcesWord.toLowerCase()} hidden`
              : undefined
          }
        >
          <span className="source-strip-count">
            {hiddenCount
              ? `${badges.length - hiddenCount}/${badges.length}`
              : badges.length}{" "}
            {sourcesWord}
          </span>
        </span>
        <div className="source-badge-list" ref={list}>
          {badges.map(({ sourceIndex, stream, label }) => {
            const source = sources[sourceIndex];
            const connection = connections.find(
              (connection) =>
                connection.id === (source.connectionId ?? connectionId),
            );
            const fullName = `${source.logGroup}${stream ? ` / ${stream}` : ""}`;
            const key = sourceBadgeKey(source, stream, connectionId);
            const isHidden = hidden.has(key);
            return (
              <span
                key={JSON.stringify([sourceIndex, stream])}
                onContextMenu={(event) => {
                  event.preventDefault();
                  setMenu({
                    sourceIndex,
                    stream,
                    x: event.clientX,
                    y: event.clientY,
                  });
                }}
                className={`source-badge${isHidden ? " source-badge-hidden" : ""}`}
                data-tooltip={`${fullName}\n${connection?.profile ?? ""} · ${connection?.region ?? ""}${isHidden ? "\nHidden: its events are not shown" : ""}${onHiddenChange && badges.length > 1 ? "\nClick to show only this source, again to show all" : ""}`}
                data-source-group={source.logGroup}
                data-source-stream={stream}
                data-source-connection={source.connectionId ?? connectionId}
                data-hidden={isHidden || undefined}
              >
                {onHiddenChange && (
                  <button
                    type="button"
                    className="source-visibility"
                    aria-label={`${isHidden ? "Show" : "Hide"} source ${fullName}`}
                    aria-pressed={isHidden}
                    data-tooltip={
                      isHidden
                        ? "Show this source's events"
                        : "Hide this source's events in the view (no new query)"
                    }
                    onClick={() => toggleHidden(key)}
                  >
                    {isHidden ? <IconEyeOff size={12} /> : <IconEye size={12} />}
                  </button>
                )}
                <ResourceDragLabel
                  className="source-badge-drag-label"
                  ariaLabel={`Drag source ${fullName}`}
                  payload={{
                    connectionId: source.connectionId ?? connectionId,
                    sources: [
                      {
                        ...source,
                        ...(stream ? { logStreams: [stream] } : {}),
                      },
                    ],
                    origin: {
                      tabId,
                      sourceIndex,
                      ...(stream ? { stream } : {}),
                    },
                  }}
                  onClick={(event) => {
                    clearTimeout(soloTimer.current);
                    if ((event?.detail ?? 1) > 1) return;
                    soloTimer.current = setTimeout(
                      () => soloSource(key),
                      250,
                    );
                  }}
                  onDoubleClick={() => {
                    clearTimeout(soloTimer.current);
                    setEditing({ sourceIndex, stream });
                  }}
                >
                  {label}
                  {multipleConnections && connection
                    ? ` · ${multipleProfiles ? connection.profile + "/" : ""}${connection.region}`
                    : ""}
                </ResourceDragLabel>
                <button
                  type="button"
                  aria-label={`Remove source ${fullName} (${connection?.region ?? ""})`}
                  onClick={() => removeBadge(sourceIndex, stream)}
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
      {menu &&
        sources[menu.sourceIndex] &&
        (() => {
          const { sourceIndex, stream } = menu;
          const key = sourceBadgeKey(sources[sourceIndex], stream, connectionId);
          const isHidden = hidden.has(key);
          return (
            <Menu
              opened
              withinPortal
              position="bottom-start"
              offset={2}
              transitionProps={{ duration: 0 }}
              onChange={(opened) => {
                if (!opened) setMenu(null);
              }}
            >
              <Menu.Target>
                <span
                  aria-hidden="true"
                  style={{
                    position: "fixed",
                    left: menu.x,
                    top: menu.y,
                    width: 0,
                    height: 0,
                  }}
                />
              </Menu.Target>
              <Menu.Dropdown>
                <Menu.Item
                  leftSection={<IconPencil size={13} />}
                  onClick={() => setEditing({ sourceIndex, stream })}
                >
                  Edit source…
                </Menu.Item>
                {onHiddenChange && (
                  <Menu.Item
                    leftSection={
                      isHidden ? <IconEye size={13} /> : <IconEyeOff size={13} />
                    }
                    onClick={() => toggleHidden(key)}
                  >
                    {isHidden ? "Show source" : "Hide source"}
                  </Menu.Item>
                )}
                <Menu.Divider />
                <Menu.Item
                  color="red"
                  leftSection={<IconTrash size={13} />}
                  onClick={() => removeBadge(sourceIndex, stream)}
                >
                  Remove source
                </Menu.Item>
              </Menu.Dropdown>
            </Menu>
          );
        })()}
      {editing && sources[editing.sourceIndex] && (
        <SourceEditor
          source={sources[editing.sourceIndex]}
          stream={editing.stream}
          connectionId={connectionId}
          connections={connections}
          onClose={() => setEditing(null)}
          onSave={(edit) =>
            saveEdit(editing.sourceIndex, editing.stream, edit)
          }
        />
      )}
    </div>
  );
}
