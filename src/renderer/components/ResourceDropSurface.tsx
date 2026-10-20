import { useEffect, useRef, useState, type Dispatch } from "react";
import { createPortal } from "react-dom";
import type { LogTab, Workspace } from "../../shared/contracts";
import { createResourceTabs, type WorkspaceAction } from "../workspace";
import { notifications } from "@mantine/notifications";
import { activeEntryId, workspaceEntries } from "../workspace-entries";
import {
  RESOURCE_DRAG_MOVE,
  RESOURCE_DRAG_END,
  type ResourceDragMove,
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
  } | null>(null);
  const hover = useRef<{
    id: string;
    timer: ReturnType<typeof setTimeout>;
  } | null>(null);
  const [placement, setPlacement] =
    useState<ReturnType<typeof dragDestination>["placement"]>(null);
  const refresh = () => {
    const drag = session.current;
    const sourceStrip =
      drag &&
      document
        .elementFromPoint(drag.point.x, drag.point.y)
        ?.closest(".source-badges");
    const next =
      drag && !sourceStrip
        ? dragDestination(
            current.current,
            drag.tabs[0].id,
            drag.point,
            false,
            drag.tabs,
          ).placement
        : null;
    setPlacement((previous) =>
      JSON.stringify(previous) === JSON.stringify(next) ? previous : next,
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
            ?.closest(".source-badges")
        )
          notifications.show({ color: "red", message: rejected.current });
      }
      rejected.current = null;
      lastPoint.current = null;
      const drag = session.current;
      if (!drag) return;
      const destination =
        (event as CustomEvent<{ drop: boolean }>).detail.drop &&
        refreshRef.current();
      if (destination)
        dispatch({
          type: "pane/drop-resource",
          tab: drag.tabs,
          paneId: destination.paneId,
          edge: destination.edge,
        });
      else if (
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
      setPlacement(null);
    };
    window.addEventListener(RESOURCE_DRAG_MOVE, move);
    window.addEventListener(RESOURCE_DRAG_END, finish);
    return () => {
      clearHover();
      window.removeEventListener(RESOURCE_DRAG_MOVE, move);
      window.removeEventListener(RESOURCE_DRAG_END, finish);
    };
  }, [dispatch]);
  useEffect(() => {
    if (!session.current) return;
    const frame = requestAnimationFrame(() => refreshRef.current());
    return () => cancelAnimationFrame(frame);
  }, [workspace]);
  return (
    placement &&
    createPortal(
      <div
        className="pane-drop-overlay"
        data-resource-split-preview={placement.edge ?? "center"}
        style={placement.rect}
        aria-hidden="true"
      >
        <span>Split {placement.edge ?? "pane"}</span>
      </div>,
      document.body,
    )
  );
}
