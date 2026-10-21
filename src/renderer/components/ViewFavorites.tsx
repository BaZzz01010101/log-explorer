import { useState } from "react";
import { useDroppable } from "@dnd-kit/core";
import { Button, Group, Modal, Text, TextInput } from "@mantine/core";
import { Menu } from "./AppMenu";
import { IconLayoutColumns, IconStar, IconTrash } from "@tabler/icons-react";
import type { ViewFavorite } from "../../shared/contracts";
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
          <button
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
            data-favorite-id={favorite.id}
            data-tooltip={
              opened
                ? undefined
                : favorite.tabs
                    .flatMap((tab) =>
                      tab.sources.map((source) => source.logGroup),
                    )
                    .join("\n")
            }
          >
            {favorite.split ? (
              <IconLayoutColumns size={14} />
            ) : (
              <IconStar size={14} />
            )}
            <span>{favorite.title}</span>
          </button>
        </Menu.ContextMenu>
        <Menu.Dropdown>
          <Menu.Item onClick={() => onOpen?.(favorite.id)}>
            Open saved view
          </Menu.Item>
          <Menu.Item
            onClick={() => {
              setName(favorite.title);
              setRenaming(true);
            }}
          >
            Rename favorite
          </Menu.Item>
          <Menu.Item
            color="red"
            leftSection={<IconTrash size={14} />}
            onClick={() => onRemove?.(favorite.id)}
          >
            Remove favorite
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
}: {
  favorites: ViewFavorite[];
  onOpen?(id: string): void;
  onRemove?(id: string): void;
  onRename?(id: string, title: string): void;
}) {
  const [menuId, setMenuId] = useState<string | null>(null);
  const { setNodeRef, isOver } = useDroppable({
    id: "view-favorites",
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
