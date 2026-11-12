import { useState } from "react";
import { useDroppable } from "@dnd-kit/core";
import { Button, Group, Modal, Text, TextInput } from "@mantine/core";
import { Menu } from "./AppMenu";
import { IconLayoutColumns, IconStar, IconTrash } from "@tabler/icons-react";
import type { ViewFavorite } from "../../shared/contracts";
import { favoriteTooltip } from "../favorite-tooltip";
import { InlineDeleteConfirmation } from "./InlineDeleteConfirmation";
import "./view-favorites.css";

function FavoriteItem({
  favorite,
  onOpen,
  onRemove,
  onRename,
  opened,
  onMenuChange,
}: {
  opened: boolean;
  onMenuChange(opened: boolean): void;
  favorite: ViewFavorite;
  onOpen?(id: string): void;
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
            className={`saved-view-favorite-row${confirmingDelete ? " is-confirming-delete" : ""}`}
            data-favorite-id={favorite.id}
            data-confirming-delete={confirmingDelete || undefined}
          >
            <button
              type="button"
              className="quick-resource saved-view-favorite"
              onClick={() => onOpen?.(favorite.id)}
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
          <Menu.Item
            onClick={() => {
              setName(favorite.title);
              setRenaming(true);
            }}
          >
            Rename
          </Menu.Item>
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
  dropId = "view-favorites",
}: {
  favorites: ViewFavorite[];
  onOpen?(id: string): void;
  onRemove?(id: string): void;
  onRename?(id: string, title: string): void;
  dropId?: string;
}) {
  const [menuId, setMenuId] = useState<string | null>(null);
  const { setNodeRef, isOver } = useDroppable({
    id: dropId,
    data: { kind: "view-favorites" },
  });
  return (
    <section
      ref={setNodeRef}
      className={"sidebar-view-favorites" + (isOver ? " is-drop-target" : "")}
      data-view-favorites
      aria-label="Favorite views"
    >
      <Text size="xs" fw={700} c="dimmed">
        FAVORITES
      </Text>
      <div className="favorite-views-list">
        {favorites.map((favorite) => (
          <FavoriteItem
            key={favorite.id}
            favorite={favorite}
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
            Drag a tab here to save its view
          </Text>
        )}
      </div>
    </section>
  );
}
