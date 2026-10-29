import type { KeyboardCoordinateGetter } from "@dnd-kit/core";
import { hasSortableData } from "@dnd-kit/sortable";

/** Aim at the next sibling's center, including when expanded rows differ in
 * height. The default sortable getter aligns the future gap's top edge, which
 * can leave closestCenter colliding with the original tall row. */
export const highlightTableKeyboardCoordinates: KeyboardCoordinateGetter = (
  event,
  { currentCoordinates, context },
) => {
  const direction =
    event.code === "ArrowDown" ? 1 : event.code === "ArrowUp" ? -1 : 0;
  if (!direction || !hasSortableData(context.active) || !context.collisionRect)
    return;
  event.preventDefault();
  const { items, containerId } = context.active.data.current.sortable;
  const over =
    hasSortableData(context.over) &&
    context.over.data.current.sortable.containerId === containerId
      ? context.over
      : context.active;
  let index = items.indexOf(over.id) + direction;
  while (index >= 0 && index < items.length) {
    const id = items[index],
      target = context.droppableContainers.get(id),
      rect = context.droppableRects.get(id);
    if (target && !target.disabled && rect) {
      return {
        x:
          currentCoordinates.x +
          rect.left +
          rect.width / 2 -
          context.collisionRect.left -
          context.collisionRect.width / 2,
        y:
          currentCoordinates.y +
          rect.top +
          rect.height / 2 -
          context.collisionRect.top -
          context.collisionRect.height / 2,
      };
    }
    index += direction;
  }
};
