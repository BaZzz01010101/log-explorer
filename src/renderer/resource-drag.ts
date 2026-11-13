import type { LogSource } from "../shared/contracts";

export type ResourceOrigin = {
  tabId: string;
  sourceIndex: number;
  stream?: string;
};
export type ResourcePayload = {
  connectionId: string;
  sources: LogSource[];
  origin?: ResourceOrigin;
};
export const SOURCE_MOVE_DROP = "explorer:source-move-drop";
export const TAB_SOURCE_DRAG_START = "explorer:tab-source-drag-start";
export const TAB_SOURCE_DRAG_END = "explorer:tab-source-drag-end";
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
let tabDragging = false;
export const isResourceDragging = () => dragging;
export const isTabSourceDragging = () => tabDragging;
export function announceTabSourceDrag(active: boolean) {
  tabDragging = active;
  window.dispatchEvent(
    new Event(active ? TAB_SOURCE_DRAG_START : TAB_SOURCE_DRAG_END),
  );
}
export function announceResourceDragStart() {
  dragging = true;
  window.dispatchEvent(new Event(RESOURCE_DRAG_START));
}
export function announceResourceDragEnd(drop: boolean, sourceDrop = false) {
  dragging = false;
  window.dispatchEvent(
    new CustomEvent(RESOURCE_DRAG_END, { detail: { drop, sourceDrop } }),
  );
}
