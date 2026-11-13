import { useEffect, useRef, useState, type Dispatch } from "react";
import { createPortal } from "react-dom";
import type { Connection, LogTab, Workspace } from "../../shared/contracts";
import { createResourceTabs, type WorkspaceAction } from "../workspace";
import { notifications } from "@mantine/notifications";
import { activeEntryId, workspaceEntries } from "../workspace-entries";
import {
  RESOURCE_DRAG_MOVE,
  RESOURCE_DRAG_END,
  type ResourceDragMove,
  type ResourceOrigin,
  RESOURCE_CONNECTION,
  RESOURCE_DROP_TARGETS,
  SOURCE_MOVE_DROP,
} from "../resource-drag";
import { dragDestination } from "./WorkspaceTabs";

/** Bridges Explorer's captured pointer gesture to the same projection as tab drags. */
export function ResourceDropSurface({
  workspace,
  dispatch,
}: {
  workspace: Workspace;
  dispatch: Dispatch<WorkspaceAction>;
}) {
  const current = useRef(workspace);
  current.current = workspace;
  const rejected = useRef<string | null>(null);
  const lastPoint = useRef<ResourceDragMove["point"] | null>(null);
  const session = useRef<{
    tabs: LogTab[];
    point: ResourceDragMove["point"];
    origin: string | null;
    hovered: boolean;
    resourceOrigin?: ResourceOrigin;
    connection?: Connection;
  } | null>(null);
  const hover = useRef<{
    id: string;
    timer: ReturnType<typeof setTimeout>;
  } | null>(null);
  const [placement, setPlacement] =
    useState<ReturnType<typeof dragDestination>["placement"]>(null);
  const [insertion, setInsertion] =
    useState<ReturnType<typeof dragDestination>["insertion"]>(null);
  const [preview, setPreview] = useState<{
    x: number;
    y: number;
    label: string;
  } | null>(null);
  const refresh = () => {
    const drag = session.current;
    const sourceStrip =
      drag &&
      document
        .elementFromPoint(drag.point.x, drag.point.y)
        ?.closest(RESOURCE_DROP_TARGETS);
    const next =
      drag && !sourceStrip
        ? dragDestination(
            current.current,
            drag.tabs[0].id,
            drag.point,
            false,
            drag.tabs,
          )
        : null;
    setPlacement((previous) =>
      JSON.stringify(previous) === JSON.stringify(next?.placement ?? null)
        ? previous
        : (next?.placement ?? null),
    );
    setInsertion((previous) =>
      JSON.stringify(previous) === JSON.stringify(next?.insertion ?? null)
        ? previous
        : (next?.insertion ?? null),
    );
    return next;
  };
  const refreshRef = useRef(refresh);
  refreshRef.current = refresh;
  useEffect(() => {
    const clearHover = () => {
      if (hover.current) clearTimeout(hover.current.timer);
      hover.current = null;
    };
    const move = (event: Event) => {
      const { payload, point } = (event as CustomEvent<ResourceDragMove>)
        .detail;
      setPreview({
        x: point.x + 16,
        y: point.y + 12,
        label:
          (payload.sources[0].logStreams?.[0] ?? payload.sources[0].logGroup) +
          (payload.sources.length > 1 ? ` +${payload.sources.length - 1}` : ""),
      });
      lastPoint.current = point;
      if (rejected.current) return;
      if (!session.current) {
        let tabs: LogTab[];
        try {
          tabs = createResourceTabs(payload);
        } catch (error) {
          rejected.current =
            error instanceof Error
              ? error.message
              : "Unable to split selected sources.";
          return;
        }
        session.current = {
          tabs,
          point,
          origin: activeEntryId(current.current),
          hovered: false,
          resourceOrigin: payload.origin,
          connection: payload.connection,
        };
      }
      session.current.point = point;
      refreshRef.current();
      const id = document
        .elementFromPoint(point.x, point.y)
        ?.closest<HTMLElement>(".workspace-tab-list [data-tab-id]")
        ?.dataset.tabId;
      if (!id || id === activeEntryId(current.current)) {
        clearHover();
        return;
      }
      if (hover.current?.id === id) return;
      clearHover();
      hover.current = {
        id,
        timer: setTimeout(() => {
          if (
            session.current &&
            workspaceEntries(current.current).some((entry) => entry.id === id)
          ) {
            session.current.hovered = true;
            dispatch({
              type: "tab/select",
              tabId: id,
              preserveConnection: true,
            });
          }
          hover.current = null;
        }, 450),
      };
    };
    /** Registers a dragged source's connection (Google Cloud) before it is used. */
    const ensureConnection = (connection?: Connection) => {
      const connections = current.current.connections;
      if (!connection || connections.some((item) => item.id === connection.id)) return;
      if (connections.length >= 50) return;
      const next = [...connections, connection];
      // Later dispatches in the same gesture must see the registration.
      current.current = { ...current.current, connections: next };
      dispatch({ type: "connections/set", connections: next });
    };
    const finish = (event: Event) => {
      clearHover();
      if (
        rejected.current &&
        (event as CustomEvent<{ drop: boolean }>).detail.drop
      ) {
        const point = lastPoint.current;
        if (
          point &&
          !document
            .elementFromPoint(point.x, point.y)
            ?.closest(RESOURCE_DROP_TARGETS)
        )
          notifications.show({ color: "red", message: rejected.current });
      }
      rejected.current = null;
      lastPoint.current = null;
      const drag = session.current;
      setPreview(null);
      if (!drag) return;
      const destination =
        (event as CustomEvent<{ drop: boolean }>).detail.drop &&
        refreshRef.current();
      if (destination && (destination.insertion || destination.placement) && !drag.resourceOrigin)
        ensureConnection(drag.connection);
      if (destination && destination.insertion && drag.resourceOrigin)
        dispatch({
          type: "source/move",
          origin: drag.resourceOrigin,
          destination: {
            kind: "tab",
            beforeTabId: destination.insertion.beforeTabId,
            pinned: destination.insertion.pinned ?? false,
          },
        });
      else if (destination && destination.placement && drag.resourceOrigin)
        dispatch({
          type: "source/move",
          origin: drag.resourceOrigin,
          destination: {
            kind: "split",
            paneId: destination.placement.paneId,
            edge: destination.placement.edge,
          },
        });
      else if (destination && destination.insertion)
        dispatch({
          type: "tabs/insert",
          tabs: drag.tabs,
          beforeTabId: destination.insertion.beforeTabId,
          pinned: destination.insertion.pinned ?? false,
        });
      else if (destination && destination.placement)
        dispatch({
          type: "pane/drop-resource",
          tab: drag.tabs,
          paneId: destination.placement.paneId,
          edge: destination.placement.edge,
        });
      else if (
        !(
          (event as CustomEvent<{ sourceDrop?: boolean }>).detail.sourceDrop &&
          drag.resourceOrigin
        ) &&
        drag.hovered &&
        drag.origin &&
        workspaceEntries(current.current).some(
          (entry) => entry.id === drag.origin,
        )
      )
        dispatch({
          type: "tab/select",
          tabId: drag.origin,
          preserveConnection: true,
        });
      session.current = null;
      setPreview(null);
      setPlacement(null);
      setInsertion(null);
    };
    window.addEventListener(RESOURCE_DRAG_MOVE, move);
    window.addEventListener(RESOURCE_DRAG_END, finish);
    const sourceDrop = (event: Event) => {
      const { origin, tabId } = (
        event as CustomEvent<{ origin: ResourceOrigin; tabId: string }>
      ).detail;
      dispatch({
        type: "source/move",
        origin,
        destination: { kind: "sources", tabId },
      });
    };
    window.addEventListener(SOURCE_MOVE_DROP, sourceDrop);
    const connectionRequest = (event: Event) =>
      ensureConnection((event as CustomEvent<Connection>).detail);
    window.addEventListener(RESOURCE_CONNECTION, connectionRequest);
    return () => {
      window.removeEventListener(RESOURCE_CONNECTION, connectionRequest);
      clearHover();
      window.removeEventListener(RESOURCE_DRAG_MOVE, move);
      window.removeEventListener(RESOURCE_DRAG_END, finish);
      window.removeEventListener(SOURCE_MOVE_DROP, sourceDrop);
    };
  }, [dispatch]);
  useEffect(() => {
    if (!session.current) return;
    const frame = requestAnimationFrame(() => refreshRef.current());
    return () => cancelAnimationFrame(frame);
  }, [workspace]);
  return (
    (placement || insertion || preview) &&
    createPortal(
      <>
        {preview && (
          <div
            className="resource-drag-preview"
            style={{ left: preview.x, top: preview.y }}
          >
            {preview.label}
          </div>
        )}
        {insertion && (
          <div
            className="workspace-tab-insertion"
            data-resource-tab-insertion={insertion.beforeTabId ?? "__end__"}
            data-pin-drop={insertion.pinned ? "true" : "false"}
            style={insertion.rect}
            aria-hidden="true"
          />
        )}
        {placement && (
          <div
            className="pane-drop-overlay"
            data-resource-split-preview={placement.edge ?? "center"}
            style={placement.rect}
            aria-hidden="true"
          >
            <span>Split {placement.edge ?? "pane"}</span>
          </div>
        )}
      </>,
      document.body,
    )
  );
}
