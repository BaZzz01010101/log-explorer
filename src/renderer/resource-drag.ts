import type { LogSource } from "../shared/contracts";

export type ResourcePayload = { connectionId: string; sources: LogSource[] };
export type ResourceActionMode =
  "new-multisource" | "new-split" | "add-sources" | "add-splits";
export type ResourcePoint = { x: number; y: number };
export type ResourceDragMove = {
  payload: ResourcePayload;
  point: ResourcePoint;
};
export const RESOURCE_DRAG_START = "explorer:resource-drag-start";
export const RESOURCE_DRAG_MOVE = "explorer:resource-drag-move";
export const RESOURCE_DRAG_END = "explorer:resource-drag-end";
let dragging = false;
export const isResourceDragging = () => dragging;
export function announceResourceDragStart() {
  dragging = true;
  window.dispatchEvent(new Event(RESOURCE_DRAG_START));
}
export function announceResourceDragEnd(drop: boolean) {
  dragging = false;
  window.dispatchEvent(
    new CustomEvent(RESOURCE_DRAG_END, { detail: { drop } }),
  );
}
