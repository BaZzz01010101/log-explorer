import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { useDroppable } from "@dnd-kit/core";
import { Button, Group, Modal, Text, TextInput } from "@mantine/core";
import { Menu } from "./AppMenu";
import { IconLayoutColumns, IconStar, IconTrash } from "@tabler/icons-react";
import type { ViewFavorite } from "../../shared/contracts";
import { favoriteTooltip } from "../favorite-tooltip";
import { InlineDeleteConfirmation } from "./InlineDeleteConfirmation";
import { SOURCE_DROP_EVENT } from "./ResourceDragLabel";
import type { ResourcePayload } from "../resource-drag";
import "./view-favorites.css";

/** Reuse the favorite's open tab or the preview tab, or open another tab. */
export type FavoriteOpenMode = "reuse" | "new" | "double-click";

function FavoriteItem({
  favorite,
  onOpen,
  onRemove,
  onRename,
  opened,
  onMenuChange,
  onMoveUp,
  onMoveDown,
  onReorderStart,
  consumeClick,
  dropBefore,
  dragging,
}: {
  opened: boolean;
  onMenuChange(opened: boolean): void;
  onMoveUp?(): void;
  onMoveDown?(): void;
  onReorderStart?(event: ReactPointerEvent<HTMLButtonElement>): void;
  /** True once after a reorder drag, so the trailing click does not open it. */
  consumeClick?(): boolean;
  dropBefore?: boolean;
  dragging?: boolean;
  favorite: ViewFavorite;
  onOpen?(id: string, mode?: FavoriteOpenMode): void;
  onRemove?(id: string): void;
  onRename?(id: string, title: string): void;
}) {
  const [renaming, setRenaming] = useState(false);
  const [name, setName] = useState(favorite.title);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const requestDelete = () => {
    setConfirmingDelete(true);
    onMenuChange(false);
  };
  return (
    <>
      <Menu
        opened={opened}
        onChange={onMenuChange}
        position="bottom-start"
        offset={4}
        transitionProps={{ duration: 0 }}
        withinPortal
      >
        <Menu.ContextMenu>
          <div
            className={`saved-view-favorite-row${confirmingDelete ? " is-confirming-delete" : ""}${dropBefore ? " is-drop-before" : ""}${dragging ? " is-reordering" : ""}`}
            data-favorite-id={favorite.id}
            data-confirming-delete={confirmingDelete || undefined}
          >
            <button
              type="button"
              className="quick-resource saved-view-favorite"
              onClick={(event) => {
                // The second click of a double-click only opens the new tab.
                if (!consumeClick?.() && !(event?.detail > 1))
                  onOpen?.(favorite.id);
              }}
              onDoubleClick={() => {
                if (!consumeClick?.()) onOpen?.(favorite.id, "double-click");
              }}
              onPointerDown={onReorderStart}
              onKeyDown={(event) => {
                if (
                  event.key === "ContextMenu" ||
                  (event.shiftKey && event.key === "F10")
                ) {
                  event.preventDefault();
                  event.stopPropagation();
                  const rect = event.currentTarget.getBoundingClientRect();
                  event.currentTarget.dispatchEvent(
                    new MouseEvent("contextmenu", {
                      bubbles: true,
                      cancelable: true,
                      // Keep the virtual anchor inside the scroll-clipped row.
                      clientX: rect.left + 8,
                      clientY: rect.top + rect.height / 2,
                    }),
                  );
                }
              }}
              aria-label={favorite.title}
              aria-description={
                favorite.split ? "Saved split view" : "Saved view"
              }
              data-tooltip={
                opened || confirmingDelete
                  ? undefined
                  : favoriteTooltip(favorite)
              }
            >
              {favorite.split ? (
                <IconLayoutColumns size={14} />
              ) : (
                <IconStar size={14} />
              )}
              <span>{favorite.title}</span>
            </button>
            {confirmingDelete ? (
              <InlineDeleteConfirmation
                className="favorite-delete-confirmation"
                label={`Delete favorite ${favorite.title}`}
                onDelete={() => {
                  setConfirmingDelete(false);
                  onRemove?.(favorite.id);
                }}
                onCancel={() => setConfirmingDelete(false)}
              />
            ) : (
              <button
                type="button"
                className="favorite-delete-trigger"
                aria-label={`Delete favorite ${favorite.title}`}
                onPointerDown={(event) => event.stopPropagation()}
                onClick={(event) => {
                  event.stopPropagation();
                  requestDelete();
                }}
              >
                <IconTrash size={14} />
              </button>
            )}
          </div>
        </Menu.ContextMenu>
        <Menu.Dropdown>
          <Menu.Item onClick={() => onOpen?.(favorite.id)}>Open</Menu.Item>
          <Menu.Item onClick={() => onOpen?.(favorite.id, "new")}>
            Open in new tab
          </Menu.Item>
          <Menu.Item
            onClick={() => {
              setName(favorite.title);
              setRenaming(true);
            }}
          >
            Rename
          </Menu.Item>
          {(onMoveUp || onMoveDown) && (
            <>
              <Menu.Item disabled={!onMoveUp} onClick={onMoveUp}>
                Move up
              </Menu.Item>
              <Menu.Item disabled={!onMoveDown} onClick={onMoveDown}>
                Move down
              </Menu.Item>
            </>
          )}
          <Menu.Item
            color="red"
            leftSection={<IconTrash size={14} />}
            onClick={requestDelete}
          >
            Delete
          </Menu.Item>
        </Menu.Dropdown>
      </Menu>
      <Modal
        opened={renaming}
        onClose={() => setRenaming(false)}
        title="Rename favorite"
        size="sm"
      >
        <form
          onSubmit={(event) => {
            event.preventDefault();
            if (!name.trim()) return;
            onRename?.(favorite.id, name.trim());
            setRenaming(false);
          }}
        >
          <TextInput
            label="Favorite name"
            data-autofocus
            maxLength={120}
            value={name}
            onChange={(event) => setName(event.currentTarget.value)}
          />
          <Group justify="flex-end" mt="md">
            <Button variant="default" onClick={() => setRenaming(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={!name.trim()}>
              Rename
            </Button>
          </Group>
        </form>
      </Modal>
    </>
  );
}

export function ViewFavorites({
  favorites,
  onOpen,
  onRemove,
  onRename,
  onMove,
  onDropResources,
  dropId = "view-favorites",
}: {
  favorites: ViewFavorite[];
  onOpen?(id: string, mode?: FavoriteOpenMode): void;
  onRemove?(id: string): void;
  onRename?(id: string, title: string): void;
  /** Moves a favorite before another one, or to the end when `beforeId` is null. */
  onMove?(id: string, beforeId: string | null): void;
  /** Saves log groups, streams or sources dragged from an Explorer. */
  onDropResources?(payload: ResourcePayload): void;
  dropId?: string;
}) {
  const [menuId, setMenuId] = useState<string | null>(null);
  // Reordering uses its own pointer gesture; dnd-kit keeps tab drops.
  const [reorder, setReorder] = useState<{
    id: string;
    before: string | null | undefined;
  } | null>(null);
  const list = useRef<HTMLDivElement | null>(null);
  const suppressClick = useRef(false);
  const stopReorder = useRef<() => void>(() => {});
  useEffect(() => () => stopReorder.current(), []);
  const startReorder = (
    event: ReactPointerEvent<HTMLButtonElement>,
    id: string,
  ) => {
    if (!onMove || event.button !== 0 || favorites.length < 2) return;
    stopReorder.current();
    const pointerId = event.pointerId;
    const start = { x: event.clientX, y: event.clientY };
    let active = false;
    let before: string | null | undefined;
    const slot = (y: number) => {
      const rows = [
        ...(list.current?.querySelectorAll<HTMLElement>("[data-favorite-id]") ??
          []),
      ];
      const scroller = list.current;
      if (scroller) {
        const box = scroller.getBoundingClientRect();
        if (y < box.top + 12) scroller.scrollTop -= 8;
        else if (y > box.bottom - 12) scroller.scrollTop += 8;
      }
      for (const row of rows) {
        const box = row.getBoundingClientRect();
        if (y < box.top + box.height / 2) return row.dataset.favoriteId ?? null;
      }
      return null;
    };
    const finish = (commit: boolean) => {
      window.removeEventListener("pointermove", move, true);
      window.removeEventListener("pointerup", up, true);
      window.removeEventListener("pointercancel", cancel, true);
      window.removeEventListener("keydown", key, true);
      document.body.style.removeProperty("cursor");
      document.body.style.removeProperty("user-select");
      stopReorder.current = () => {};
      setReorder(null);
      if (!active) return;
      suppressClick.current = true;
      setTimeout(() => {
        suppressClick.current = false;
      }, 0);
      if (commit && before !== undefined) {
        const index = favorites.findIndex((favorite) => favorite.id === id);
        const next =
          before === null
            ? null
            : favorites.findIndex((favorite) => favorite.id === before);
        // Dropping onto its own slot leaves the order unchanged.
        const unchanged =
          before === id ||
          (before === null
            ? index === favorites.length - 1
            : next === index + 1);
        if (!unchanged) onMove(id, before);
      }
    };
    const move = (next: PointerEvent) => {
      if (next.pointerId !== pointerId) return;
      if (
        !active &&
        Math.hypot(next.clientX - start.x, next.clientY - start.y) < 6
      )
        return;
      active = true;
      next.preventDefault();
      document.body.style.cursor = "grabbing";
      document.body.style.userSelect = "none";
      before = slot(next.clientY);
      setReorder({ id, before });
    };
    const up = (next: PointerEvent) => {
      if (next.pointerId === pointerId) finish(true);
    };
    const cancel = () => finish(false);
    const key = (next: KeyboardEvent) => {
      if (next.key !== "Escape" || !active) return;
      next.preventDefault();
      next.stopPropagation();
      finish(false);
    };
    window.addEventListener("pointermove", move, true);
    window.addEventListener("pointerup", up, true);
    window.addEventListener("pointercancel", cancel, true);
    window.addEventListener("keydown", key, true);
    stopReorder.current = () => finish(false);
  };
  const { setNodeRef, isOver } = useDroppable({
    id: dropId,
    data: { kind: "view-favorites" },
  });
  // Explorer resources use a captured pointer gesture rather than dnd-kit.
  const [resourceOver, setResourceOver] = useState(false);
  const section = useRef<HTMLElement | null>(null);
  const setSection = useCallback(
    (element: HTMLElement | null) => {
      section.current = element;
      setNodeRef(element);
    },
    [setNodeRef],
  );
  const dropResources = useRef(onDropResources);
  dropResources.current = onDropResources;
  useEffect(() => {
    const element = section.current;
    if (!element) return;
    const enter = () => setResourceOver(true);
    const leave = () => setResourceOver(false);
    const drop = (event: Event) => {
      setResourceOver(false);
      const payload = (event as CustomEvent<ResourcePayload>).detail;
      // A source badge dragged from a view is saved as a copy; the view keeps it.
      if (payload) dropResources.current?.({ ...payload, origin: undefined });
    };
    element.addEventListener("explorer:source-drag-enter", enter);
    element.addEventListener("explorer:source-drag-leave", leave);
    element.addEventListener(SOURCE_DROP_EVENT, drop);
    return () => {
      element.removeEventListener("explorer:source-drag-enter", enter);
      element.removeEventListener("explorer:source-drag-leave", leave);
      element.removeEventListener(SOURCE_DROP_EVENT, drop);
    };
  }, []);
  return (
    <section
      ref={setSection}
      className={
        "sidebar-view-favorites" +
        (isOver || resourceOver ? " is-drop-target" : "")
      }
      data-view-favorites
      aria-label="Favorite views"
    >
      <Text size="xs" fw={700} c="dimmed">
        FAVORITES
      </Text>
      <div
        ref={list}
        className={
          "favorite-views-list" +
          (reorder?.before === null ? " is-drop-end" : "")
        }
      >
        {favorites.map((favorite, index) => (
          <FavoriteItem
            key={favorite.id}
            favorite={favorite}
            dragging={reorder?.id === favorite.id}
            dropBefore={reorder?.before === favorite.id}
            onReorderStart={(event) => startReorder(event, favorite.id)}
            consumeClick={() => suppressClick.current}
            onMoveUp={
              onMove && index > 0
                ? () => onMove(favorite.id, favorites[index - 1]!.id)
                : undefined
            }
            onMoveDown={
              onMove && index < favorites.length - 1
                ? () => onMove(favorite.id, favorites[index + 2]?.id ?? null)
                : undefined
            }
            opened={menuId === favorite.id}
            onMenuChange={(opened) =>
              setMenuId((current) =>
                opened ? favorite.id : current === favorite.id ? null : current,
              )
            }
            onOpen={onOpen}
            onRemove={onRemove}
            onRename={onRename}
          />
        ))}
        {!favorites.length && (
          <Text size="xs" c="dimmed" className="favorite-views-empty">
            Drag a tab or log source here to save its view
          </Text>
        )}
      </div>
    </section>
  );
}
