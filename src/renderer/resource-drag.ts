import type { ResourcePayload } from "../shared/resource-payload";
// Payload types live in shared code because workspace parsing uses them.
export type {
  ResourceOrigin,
  ResourcePayload,
  ResourceActionMode,
} from "../shared/resource-payload";

export const SOURCE_MOVE_DROP = "explorer:source-move-drop";
/** Asks the workspace to register `detail` (a Connection) before a source drop applies. */
export const RESOURCE_CONNECTION = "explorer:resource-connection";
/** Explorer drop targets that accept resource drags, besides tab and pane surfaces. */
export const RESOURCE_DROP_TARGETS = ".source-badges, [data-view-favorites]";
const TAB_SOURCE_DRAG_START = "explorer:tab-source-drag-start";
const TAB_SOURCE_DRAG_END = "explorer:tab-source-drag-end";
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
