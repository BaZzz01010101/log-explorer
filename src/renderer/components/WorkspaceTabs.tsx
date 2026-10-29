import {
  useState,
  useEffect,
  useLayoutEffect,
  createContext,
  useContext,
  useRef,
  type Dispatch,
  type KeyboardEvent,
  type ReactNode,
  type SetStateAction,
} from "react";
import { createPortal } from "react-dom";
import { TabRowCrossingPreview } from "./TabRowCrossingPreview";
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  pointerWithin,
  useSensor,
  useSensors,
  useDroppable,
  useDraggable,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  horizontalListSortingStrategy,
  rectSortingStrategy,
  sortableKeyboardCoordinates,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { notifications } from "@mantine/notifications";
import {
  ActionIcon,
  Button,
  Group,
  Modal,
  Stack,
  Text,
  TextInput,
} from "@mantine/core";
import { Tooltip } from "./AppTooltip";
import { Menu } from "./AppMenu";
import {
  IconChevronDown,
  IconChevronLeft,
  IconChevronRight,
  IconCopy,
  IconEdit,
  IconLayoutColumns,
  IconLoader2,
  IconPlus,
  IconPin,
  IconRestore,
  IconRadio,
  IconTerminal2,
  IconStack2,
  IconStar,
  IconX,
} from "@tabler/icons-react";
import type { LogTab, SplitEdge, Workspace } from "../../shared/contracts";
import { sourceCount } from "../../shared/source-labels";
import { MAX_SPLIT_PANES } from "../../shared/pane-layout";
import { paneLayoutRect, type LayoutRect } from "../../shared/layout-geometry";
import {
  createTab,
  projectWorkspaceDrop,
  projectResourceDrop,
  projectFavoriteSave,
  type WorkspaceAction,
} from "../workspace";
import {
  activeEntryId,
  logTabLabel,
  workspaceEntries,
  type WorkspaceEntry,
} from "../workspace-entries";
import { selectWorkspaceEntry } from "../tab-selection";
import { atPinnedRowEdge, tabInsertionAt } from "../tab-insertion";
import {
  RESOURCE_DRAG_MOVE,
  RESOURCE_DRAG_END,
  type ResourceDragMove,
} from "../resource-drag";
import { tabOverlapTarget } from "../tab-hover";
import {
  closedTabHistory,
  closedTabTooltip,
  recentClosedTabs,
} from "../closed-tab-history";
import {
  tabReorderPreview,
  tabSlotRect,
  type TabReorderPreview,
} from "../tab-reorder-preview";
import "./workspace-tabs.css";

type TabActivityRuntime = {
  state: string;
  live: boolean;
  livePaused?: boolean;
};
type Props = {
  workspace: Workspace;
  dispatch: Dispatch<WorkspaceAction>;
  runtimes?: Record<string, TabActivityRuntime | undefined>;
};
function saveFavorite(
  workspace: Workspace,
  dispatch: Dispatch<WorkspaceAction>,
  tabId: string,
) {
  const result = projectFavoriteSave(workspace, tabId);
  if (result.error)
    notifications.show({
      color: "red",
      title: "Favorite could not be saved",
      message: result.error,
    });
  else if (result.workspace !== workspace)
    dispatch({ type: "favorites/save", tabId });
}

function SortableTab({
  tab,
  active,
  selected,
  workspace,
  dispatch,
  runtimes,
  onSelect,
  onKeyDown,
}: {
  tab: WorkspaceEntry;
  active: boolean;
  selected: boolean;
  workspace: Workspace;
  dispatch: Dispatch<WorkspaceAction>;
  runtimes?: Props["runtimes"];
  onSelect: (event: React.MouseEvent) => void;
  onKeyDown: (event: KeyboardEvent<HTMLButtonElement>) => void;
}) {
  const { selected: selection, setSelected } = useContext(WorkspaceSelection);
  const { mode, sourceKind, reorderPreview, pointerDrag, insertion } =
    useContext(WorkspaceDragMode);
  const [menuOpen, setMenuOpen] = useState(false);
  const [renameOpened, setRenameOpened] = useState(false);
  const [name, setName] = useState(tab.title);
  const {
    setNodeRef,
    attributes,
    listeners,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: `tab:${tab.id}`,
    data: { kind: "tab", tabId: tab.id },
    animateLayoutChanges: () => false,
  });
  const entries = workspaceEntries(workspace);
  const index = entries.findIndex((item) => item.id === tab.id);
  const chosen = selection.includes(tab.id)
    ? selection.filter((id) => entries.some((item) => item.id === id))
    : [tab.id];
  const chosenMembers = new Set(
    entries
      .filter((item) => chosen.includes(item.id))
      .flatMap((item) => item.tabIds),
  );
  const members = tab.tabIds.flatMap(
    (id) => workspace.tabs.find((member) => member.id === id) ?? [],
  );
  const split = tab.kind === "split";
  const memberRuntimes = tab.tabIds.flatMap((id) => runtimes?.[id] ?? []);
  const liveMembers = memberRuntimes.filter(
    (runtime) =>
      runtime.live &&
      (runtime.livePaused ||
        runtime.state === "queued" ||
        runtime.state === "running"),
  );
  const live = liveMembers.length > 0;
  const livePaused = live && liveMembers.every((runtime) => runtime.livePaused);
  const activityLabel = live
    ? livePaused
      ? "Live paused"
      : "Live active"
    : "Query running";
  const querying = memberRuntimes.some(
    (runtime) =>
      !runtime.live &&
      (runtime.state === "queued" || runtime.state === "running"),
  );
  const tooltip = (
    <Stack gap={3} className="split-tab-tooltip">
      <Text size="xs" fw={600}>
        {split ? "Split workspace" : tab.title}
      </Text>
      {split &&
        members.map((member) => (
          <Text size="xs" key={member.id}>
            {logTabLabel(member)}
          </Text>
        ))}
      {!split &&
        members[0]?.sources.map((source) => (
          <Text size="xs" key={source.logGroup}>
            {source.logGroup}
          </Text>
        ))}
    </Stack>
  );
  return (
    <>
      <Menu
        opened={menuOpen}
        onChange={(open) => {
          if (!open) setMenuOpen(false);
        }}
        position="bottom-start"
        width={235}
      >
        <Menu.Target>
          <div
            ref={setNodeRef}
            role="presentation"
            data-tab-id={tab.id}
            data-entry-kind={tab.kind}
            data-pinned={tab.pinned ? "true" : "false"}
            data-tab-reorder-before={
              isDragging && insertion
                ? (insertion.beforeTabId ?? "__end__")
                : undefined
            }
            className={`workspace-tab ${active ? "is-active" : ""} ${selected ? "is-selected" : ""} ${isDragging ? "is-dragging" : ""} ${tab.preview ? "is-preview" : ""}`}
            style={{
              visibility:
                reorderPreview?.crossingSource?.id === tab.id
                  ? "hidden"
                  : undefined,
              transform: CSS.Translate.toString(
                mode === "reorder"
                  ? (reorderPreview?.translations[tab.id] ??
                      (pointerDrag
                        ? null
                        : transform && {
                            ...transform,
                            y:
                              workspace.preferences.tabBarLayout === "wrap"
                                ? transform.y
                                : 0,
                          }))
                  : null,
              ),
              transition: reorderPreview
                ? "transform 160ms ease"
                : sourceKind !== null
                  ? transition
                  : undefined,
            }}
            onPointerDown={(event) => {
              if (event.button === 1) {
                event.preventDefault();
                return;
              }
              if (
                event.button === 0 &&
                !(event.target as HTMLElement).closest("[data-tab-control]")
              )
                listeners?.onPointerDown?.(event);
            }}
            onAuxClick={(event) => {
              if (event.button !== 1) return;
              event.preventDefault();
              event.stopPropagation();
              if (!tab.pinned) dispatch({ type: "tab/close", tabId: tab.id });
            }}
            onDragStart={(event) => event.preventDefault()}
            onContextMenu={(event) => {
              event.preventDefault();
              if ((event.target as HTMLElement).closest("[data-tab-control]"))
                return;
              if (!selected) setSelected([tab.id]);
              setMenuOpen(true);
            }}
          >
            <Tooltip
              label={tooltip}
              styles={{
                tooltip: {
                  background: "var(--mantine-color-body)",
                  color: "var(--mantine-color-text)",
                  border: "1px solid var(--mantine-color-default-border)",
                  boxShadow: "0 4px 16px #0002",
                },
              }}
              openDelay={500}
              multiline
              w={330}
              disabled={menuOpen || sourceKind !== null}
            >
              <button
                type="button"
                className="workspace-tab-label"
                role="tab"
                aria-selected={active}
                id={`tab-${tab.id}`}
                aria-controls={`view-${tab.id}`}
                aria-describedby={attributes["aria-describedby"]}
                tabIndex={active ? 0 : -1}
                onClick={onSelect}
                onDoubleClick={() =>
                  dispatch({ type: "tab/promote", tabId: tab.id })
                }
                onKeyDown={(event) => {
                  if (
                    (event.shiftKey && event.key === "F10") ||
                    event.key === "ContextMenu"
                  ) {
                    event.preventDefault();
                    if (!selected) setSelected([tab.id]);
                    setMenuOpen(true);
                  } else {
                    listeners?.onKeyDown?.(event);
                    if (!event.defaultPrevented) onKeyDown(event);
                  }
                }}
              >
                {split ? (
                  <IconLayoutColumns
                    size={15}
                    className="tab-source-icon"
                    data-split-tab-icon
                  />
                ) : sourceCount(members[0]?.sources ?? []) > 1 ? (
                  <IconStack2 size={14} className="tab-source-icon" />
                ) : (
                  <IconTerminal2 size={14} className="tab-source-icon" />
                )}
                <span>{tab.title}</span>
                {tab.sourceCount > 1 && (
                  <span
                    className="tab-source-count"
                    aria-label={`${tab.sourceCount} sources`}
                  >
                    {tab.sourceCount}
                  </span>
                )}
              </button>
            </Tooltip>
            <span className="tab-activity-slot">
              {(live || querying) && (
                <span
                  className={live ? "tab-activity is-live" : "tab-activity"}
                  data-tab-activity={live ? "live" : "query"}
                  aria-label={activityLabel}
                  data-tooltip={activityLabel}
                >
                  {live ? (
                    <IconRadio size={13} />
                  ) : (
                    <IconLoader2 size={13} className="tab-query-spinner" />
                  )}
                </span>
              )}
            </span>
            <button
              type="button"
              data-tab-control
              className="tab-close"
              aria-label={`${tab.pinned ? "Unpin" : "Close"} ${tab.title}`}
              data-tooltip={tab.pinned ? "Unpin tab" : "Close tab"}
              onClick={() =>
                dispatch(
                  tab.pinned
                    ? { type: "tab/pin", tabId: tab.id, pinned: false }
                    : { type: "tab/close", tabId: tab.id },
                )
              }
            >
              {tab.pinned ? <IconPin size={13} /> : <IconX size={13} />}
            </button>
          </div>
        </Menu.Target>
        <Menu.Dropdown>
          <Menu.Label>{split ? "Split workspace" : "View"}</Menu.Label>
          {tab.preview && (
            <Menu.Item
              onClick={() => dispatch({ type: "tab/promote", tabId: tab.id })}
            >
              Keep tab open
            </Menu.Item>
          )}
          <Menu.Item
            leftSection={<IconPin size={14} />}
            onClick={() => {
              for (const id of chosen)
                dispatch({ type: "tab/pin", tabId: id, pinned: !tab.pinned });
            }}
          >
            {tab.pinned ? "Unpin tab" : "Pin tab"}
          </Menu.Item>
          <Menu.Item
            leftSection={<IconEdit size={14} />}
            onClick={() => {
              setName(tab.title);
              setRenameOpened(true);
            }}
          >
            Rename tab
          </Menu.Item>
          <Menu.Item
            leftSection={<IconStar size={14} />}
            onClick={() => saveFavorite(workspace, dispatch, tab.id)}
          >
            Save view to Favorites
          </Menu.Item>
          <Menu.Item
            leftSection={<IconCopy size={14} />}
            onClick={() => {
              dispatch({ type: "tab/duplicate", tabId: tab.id });
              setSelected([]);
            }}
          >
            Duplicate independent view
          </Menu.Item>
          <Menu.Item
            leftSection={<IconLayoutColumns size={14} />}
            disabled={chosen.length < 2 || chosenMembers.size > MAX_SPLIT_PANES}
            onClick={() => {
              dispatch({ type: "pane/show-tabs", tabIds: chosen });
              setSelected([]);
            }}
          >
            Show in split mode
          </Menu.Item>
          {split ? (
            <Menu.Item
              onClick={() => dispatch({ type: "split/exit", tabId: tab.id })}
            >
              Exit split screen
            </Menu.Item>
          ) : (
            <Menu.Item
              disabled={workspace.panes.length >= MAX_SPLIT_PANES}
              onClick={() => dispatch({ type: "pane/split", tabId: tab.id })}
            >
              Move to a new split
            </Menu.Item>
          )}
          <Menu.Divider />
          <Menu.Label>Tab order</Menu.Label>
          <Menu.Item
            leftSection={<IconChevronLeft size={14} />}
            disabled={index === 0}
            onClick={() =>
              dispatch({
                type: "tab/reorder",
                tabId: tab.id,
                beforeTabId: entries[index - 1]?.id ?? null,
              })
            }
          >
            Move left
          </Menu.Item>
          <Menu.Item
            leftSection={<IconChevronRight size={14} />}
            disabled={index === entries.length - 1}
            onClick={() =>
              dispatch({
                type: "tab/reorder",
                tabId: tab.id,
                beforeTabId: entries[index + 2]?.id ?? null,
              })
            }
          >
            Move right
          </Menu.Item>
          <Menu.Divider />
          <Menu.Item
            color="red"
            leftSection={<IconX size={14} />}
            onClick={() =>
              dispatch({ type: "tab/close", tabId: tab.id, allowPinned: true })
            }
          >
            Close tab
          </Menu.Item>
        </Menu.Dropdown>
      </Menu>
      <Modal
        opened={renameOpened}
        onClose={() => setRenameOpened(false)}
        title="Rename tab"
        size="sm"
      >
        <form
          onSubmit={(event) => {
            event.preventDefault();
            if (!name.trim()) return;
            dispatch({ type: "tab/rename", tabId: tab.id, title: name.trim() });
            setRenameOpened(false);
          }}
        >
          <TextInput
            label="Tab name"
            data-autofocus
            maxLength={120}
            value={name}
            onChange={(event) => setName(event.currentTarget.value)}
          />
          <Group justify="flex-end" mt="md">
            <Button variant="default" onClick={() => setRenameOpened(false)}>
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

export function PaneDragHeader({
  paneId,
  children,
}: {
  paneId: string;
  children: ReactNode;
}) {
  const { panelsDraggable } = useContext(WorkspaceDragMode);
  const { setNodeRef, listeners, attributes, isDragging } = useDraggable({
    id: `pane-header:${paneId}`,
    data: { kind: "pane-header", paneId },
    disabled: !panelsDraggable,
  });
  return (
    <div
      ref={setNodeRef}
      className={`pane-heading pane-drag-header ${panelsDraggable ? "can-drag" : ""} ${isDragging ? "is-dragging" : ""}`}
      data-pane-drag-header={paneId}
      data-pane-header={paneId}
      role="group"
      tabIndex={panelsDraggable ? 0 : undefined}
      aria-label={
        panelsDraggable ? "Drag panel header to move panel" : "Pane header"
      }
      aria-describedby={attributes["aria-describedby"]}
      onPointerDown={(event) => {
        if (
          !panelsDraggable ||
          event.button !== 0 ||
          (event.target as HTMLElement).closest(
            "button,input,select,textarea,a,[data-pane-control]",
          )
        )
          return;
        listeners?.onPointerDown?.(event);
      }}
      onKeyDown={(event) => {
        if (event.target === event.currentTarget) listeners?.onKeyDown?.(event);
      }}
      onDragStart={(event) => event.preventDefault()}
    >
      {children}
    </div>
  );
}

const WorkspaceSelection = createContext<{
  selected: string[];
  setSelected: Dispatch<SetStateAction<string[]>>;
}>({
  selected: [],
  setSelected: () => {},
});

type DragPlacement = {
  paneId: string;
  edge: SplitEdge | null;
  rect: LayoutRect;
};
type DragSource = {
  kind: "tab" | "pane-header";
  tabId: string;
  title: string;
  entryKind: "single" | "split";
};
type DragDestination = {
  mode: "reorder" | "placement";
  placement: DragPlacement | null;
  insertion: {
    beforeTabId: string | null;
    pinned?: boolean;
    rect: LayoutRect;
  } | null;
};
const WorkspaceDragMode = createContext<
  DragDestination & {
    panelsDraggable: boolean;
    sourceKind: DragSource["kind"] | null;
    reorderPreview?: TabReorderPreview | null;
    pointerDrag?: boolean;
    revealEmptyPinnedRow?: boolean;
  }
>({
  mode: "reorder",
  placement: null,
  insertion: null,
  panelsDraggable: false,
  sourceKind: null,
});

export function dragDestination(
  workspace: Workspace,
  tabId: string,
  point: { x: number; y: number },
  panel = false,
  resource?: LogTab | LogTab[],
): DragDestination {
  const strip = document
    .querySelector(".workspace-tab-list")
    ?.getBoundingClientRect();
  const distance = strip
    ? Math.hypot(
        Math.max(strip.left - point.x, 0, point.x - strip.right),
        Math.max(strip.top - point.y, 0, point.y - strip.bottom),
      )
    : Infinity;
  const stripInsertion = tabInsertionAt(workspace, point);
  const mode =
    !resource && (stripInsertion || distance <= 28) ? "reorder" : "placement";
  let placement: DragPlacement | null = null;
  let insertion: DragDestination["insertion"] = null;
  if (
    panel &&
    strip &&
    point.x >= strip.left &&
    point.x <= strip.right &&
    point.y >= strip.top &&
    point.y <= strip.bottom
  ) {
    const tabs = [
      ...document.querySelectorAll<HTMLElement>(
        ".workspace-tab-list [data-tab-id]",
      ),
    ].map((element) => ({ element, rect: element.getBoundingClientRect() }));
    // Choose a visual row before comparing horizontal midpoints. At a row's
    // trailing blank space the insertion belongs before the following row.
    const rows: { tabs: typeof tabs; top: number; bottom: number }[] = [];
    for (const tab of tabs) {
      if (!tab.rect.width || !tab.rect.height) continue;
      const row = rows.find(
        (row) => tab.rect.top < row.bottom && tab.rect.bottom > row.top,
      );
      if (row) {
        row.tabs.push(tab);
        row.top = Math.min(row.top, tab.rect.top);
        row.bottom = Math.max(row.bottom, tab.rect.bottom);
      } else
        rows.push({ tabs: [tab], top: tab.rect.top, bottom: tab.rect.bottom });
    }
    const row = rows.reduce<(typeof rows)[number] | undefined>(
      (closest, candidate) => {
        const distance = (value: (typeof rows)[number]) =>
          Math.max(value.top - point.y, 0, point.y - value.bottom);
        return !closest || distance(candidate) < distance(closest)
          ? candidate
          : closest;
      },
      undefined,
    );
    const before = row?.tabs.find(
      ({ rect }) => point.x < rect.left + rect.width / 2,
    );
    const last = row?.tabs.at(-1);
    const next = before ?? (last ? tabs[tabs.indexOf(last) + 1] : undefined);
    const boundary = before
      ? before.rect.left
      : (last?.rect.right ?? strip.left);
    const top = Math.max(strip.top, row?.top ?? strip.top);
    insertion = {
      beforeTabId: next?.element.dataset.tabId ?? null,
      rect: {
        left: Math.min(strip.right - 2, Math.max(strip.left, boundary - 1)),
        top,
        width: 3,
        height: Math.max(
          1,
          Math.min(strip.bottom, row?.bottom ?? strip.bottom) - top,
        ),
      },
    };
  }
  insertion = stripInsertion ?? insertion;
  if (mode === "placement" && !insertion) {
    for (const element of document.querySelectorAll<HTMLElement>(
      "[data-pane-drop-target]",
    )) {
      const bounds = element.getBoundingClientRect();
      if (
        point.x < bounds.left ||
        point.x > bounds.right ||
        point.y < bounds.top ||
        point.y > bounds.bottom
      )
        continue;
      const paneId = element.dataset.paneDropTarget!;
      const distances: [SplitEdge, number][] = [
        ["left", (point.x - bounds.left) / bounds.width],
        ["right", (bounds.right - point.x) / bounds.width],
        ["top", (point.y - bounds.top) / bounds.height],
        ["bottom", (bounds.bottom - point.y) / bounds.height],
      ];
      distances.sort((a, b) => a[1] - b[1]);
      const edge = distances[0][1] <= 0.25 ? distances[0][0] : null;
      const root = document
        .querySelector(".pane-layout-root")
        ?.getBoundingClientRect();
      const projected =
        root &&
        (resource
          ? projectResourceDrop(workspace, resource, paneId, edge)
          : projectWorkspaceDrop(workspace, tabId, paneId, edge));
      if (root && projected?.layout && projected !== workspace) {
        const source = workspaceEntries(workspace).find(
          (entry) => entry.id === tabId,
        );
        const resources = resource
          ? Array.isArray(resource)
            ? resource
            : [resource]
          : null;
        const rectangles =
          resources || source?.kind === "split"
            ? projected.panes
                .filter(
                  (pane) =>
                    pane.tabId &&
                    (resources
                      ? resources.some((tab) => tab.id === pane.tabId)
                      : source!.tabIds.includes(pane.tabId)),
                )
                .flatMap(
                  (pane) =>
                    paneLayoutRect(projected.layout!, pane.id, root) ?? [],
                )
            : [
                paneLayoutRect(projected.layout, projected.activePaneId, root),
              ].filter((rect): rect is LayoutRect => Boolean(rect));
        if (rectangles.length) {
          const left = Math.min(...rectangles.map((rect) => rect.left));
          const top = Math.min(...rectangles.map((rect) => rect.top));
          placement = {
            paneId,
            edge,
            rect: {
              left,
              top,
              width:
                Math.max(...rectangles.map((rect) => rect.left + rect.width)) -
                left,
              height:
                Math.max(...rectangles.map((rect) => rect.top + rect.height)) -
                top,
            },
          };
        }
      }
      break;
    }
  }
  return { mode, placement, insertion };
}

/** A shared drag surface for the tab bar and actual pane panels. */
export function WorkspaceDragSurface({
  workspace,
  dispatch,
  children,
}: Props & { children: ReactNode }) {
  const [selected, setSelected] = useState<string[]>([]);
  const [draggedSource, setDraggedSource] = useState<DragSource | null>(null);
  const [revealEmptyPinnedRow, setRevealEmptyPinnedRow] = useState(false);
  const pointerCapture = useRef<{ element: HTMLElement; id: number } | null>(
    null,
  );
  const [dragMode, setDragMode] = useState<DragDestination>({
    mode: "reorder",
    placement: null,
    insertion: null,
  });
  const [reorderPreview, setReorderPreview] =
    useState<TabReorderPreview | null>(null);
  const destinationRef = useRef(dragMode);
  const workspaceRef = useRef(workspace);
  workspaceRef.current = workspace;
  // Header nodes unmount when hovering another tab. Keep their view identity
  // and preview label for the entire drag instead of reading unmounted data.
  const sourceRef = useRef<DragSource | null>(null);
  const originRef = useRef<string | null>(null);
  const hoverActivated = useRef(false);
  const lastPoint = useRef<{ x: number; y: number } | null>(null);
  const grabX = useRef<number | null>(null);
  const hover = useRef<{
    id: string;
    point: { x: number; y: number };
    timer: ReturnType<typeof setTimeout>;
  } | null>(null);
  const entries = workspaceEntries(workspace);
  const selectedIds = selected.filter((id) =>
    entries.some((tab) => tab.id === id),
  );
  const clearHover = () => {
    if (hover.current) clearTimeout(hover.current.timer);
    hover.current = null;
  };
  const resolveDestination = (
    point: { x: number; y: number },
    source: DragSource,
  ) => {
    let destination = dragDestination(
      workspaceRef.current,
      source.tabId,
      point,
      source.kind === "pane-header",
    );
    let preview: TabReorderPreview | null = null;
    if (
      source.kind === "tab" &&
      grabX.current !== null &&
      destination.mode === "reorder"
    ) {
      const base = destination.insertion ?? destinationRef.current.insertion;
      if (base) {
        const pinned =
          base.pinned ??
          !!workspaceEntries(workspaceRef.current).find(
            (entry) => entry.id === source.tabId,
          )?.pinned;
        const previous = destinationRef.current.insertion;
        preview = tabReorderPreview(
          workspaceRef.current,
          source.tabId,
          {
            beforeTabId:
              previous && previous.pinned === pinned
                ? previous.beforeTabId
                : base.beforeTabId,
            pinned,
          },
          { point, grabX: grabX.current },
        );
        if (preview)
          destination = {
            ...destination,
            insertion: { ...preview.insertion, rect: preview.marker },
          };
      }
    }
    return { destination, preview };
  };
  const hoverTarget = (
    source: DragSource,
    point: { x: number; y: number },
    preview: TabReorderPreview | null,
    preferredId?: string,
  ) => {
    const targets = [...document.querySelectorAll<HTMLElement>("[data-tab-id]")]
      .filter((element) => element.dataset.tabId !== source.tabId)
      .map((element) => {
        const id = element.dataset.tabId!;
        const slot = preview
          ? tabSlotRect(element)
          : element.getBoundingClientRect();
        const shift = preview?.translations[id];
        return {
          id,
          rect: {
            left: slot.left + (shift?.x ?? 0),
            top: slot.top + (shift?.y ?? 0),
            width: slot.width,
            height: slot.height,
          },
          clip: element.closest?.("[data-tab-strip]")?.getBoundingClientRect(),
        };
      });
    if (source.kind === "tab" && preview?.crossingSource)
      return tabOverlapTarget(
        preview.crossingSource.rect,
        targets,
        preferredId,
      );
    // Pane-header previews retain point-based tab activation, using the visible
    // positions rather than the original slots of any shifted tabs.
    return (
      targets.find(
        ({ rect, clip }) =>
          point.x >= Math.max(rect.left, clip?.left ?? -Infinity) &&
          point.x <=
            Math.min(
              rect.left + rect.width,
              clip ? clip.left + clip.width : Infinity,
            ) &&
          point.y >= Math.max(rect.top, clip?.top ?? -Infinity) &&
          point.y <=
            Math.min(
              rect.top + rect.height,
              clip ? clip.top + clip.height : Infinity,
            ),
      )?.id ?? null
    );
  };
  const updateDestination = (
    point: { x: number; y: number },
    source: DragSource,
  ) => {
    if (atPinnedRowEdge(workspaceRef.current, point))
      setRevealEmptyPinnedRow(true);
    const { destination, preview } = resolveDestination(point, source);
    destinationRef.current = destination;
    setReorderPreview((previous) =>
      JSON.stringify(previous) === JSON.stringify(preview) ? previous : preview,
    );
    setDragMode((previous) =>
      JSON.stringify(previous) === JSON.stringify(destination)
        ? previous
        : destination,
    );
    const id = hoverTarget(source, point, preview, hover.current?.id);
    if (!id || id === activeEntryId(workspaceRef.current)) {
      clearHover();
      return;
    }
    if (
      hover.current?.id === id &&
      Math.hypot(
        point.x - hover.current.point.x,
        point.y - hover.current.point.y,
      ) <= 8
    )
      return;
    clearHover();
    hover.current = {
      id,
      point,
      timer: setTimeout(() => {
        const currentSource = sourceRef.current;
        const currentPoint = lastPoint.current;
        if (
          currentSource &&
          currentPoint &&
          hover.current?.id === id &&
          hoverTarget(
            currentSource,
            currentPoint,
            resolveDestination(currentPoint, currentSource).preview,
            id,
          ) === id &&
          workspaceEntries(workspaceRef.current).some(
            (entry) => entry.id === id,
          )
        ) {
          hoverActivated.current = true;
          dispatch({ type: "tab/select", tabId: id });
        }
        hover.current = null;
      }, 450),
    };
  };
  const restoreActivation = () => {
    if (
      hoverActivated.current &&
      originRef.current &&
      workspaceEntries(workspaceRef.current).some(
        (entry) => entry.id === originRef.current,
      )
    )
      dispatch({ type: "tab/select", tabId: originRef.current });
    hoverActivated.current = false;
  };
  const finishDrag = () => {
    clearHover();
    sourceRef.current = null;
    lastPoint.current = null;
    grabX.current = null;
    const capture = pointerCapture.current;
    if (capture?.element.hasPointerCapture(capture.id))
      capture.element.releasePointerCapture(capture.id);
    pointerCapture.current = null;
    setRevealEmptyPinnedRow(false);
    setReorderPreview(null);
    setDraggedSource(null);
    setDragMode({ mode: "reorder", placement: null, insertion: null });
  };
  useEffect(() => () => clearHover(), []);
  useEffect(() => {
    if (
      typeof window === "undefined" ||
      typeof window.addEventListener !== "function"
    )
      return;
    const move = (event: Event) => {
      const { point } = (event as CustomEvent<ResourceDragMove>).detail;
      if (atPinnedRowEdge(workspaceRef.current, point))
        setRevealEmptyPinnedRow(true);
    };
    const end = () => setRevealEmptyPinnedRow(false);
    window.addEventListener(RESOURCE_DRAG_MOVE, move);
    window.addEventListener(RESOURCE_DRAG_END, end);
    return () => {
      window.removeEventListener(RESOURCE_DRAG_MOVE, move);
      window.removeEventListener(RESOURCE_DRAG_END, end);
    };
  }, []);
  const previewHeights = JSON.stringify(reorderPreview?.heights ?? {});
  useLayoutEffect(() => {
    if (!draggedSource || !lastPoint.current) return;
    updateDestination(lastPoint.current, draggedSource);
  }, [workspace, draggedSource, previewHeights, revealEmptyPinnedRow]);
  const pointerDrag =
    draggedSource?.kind === "tab" && lastPoint.current !== null;
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );
  const handleDragEnd = ({ active, over }: DragEndEvent) => {
    const source = sourceRef.current;
    const destination =
      source && lastPoint.current
        ? resolveDestination(lastPoint.current, source).destination
        : destinationRef.current;
    const target = over?.data.current;
    finishDrag();
    if ((!over || active.id === over.id) && !destination.insertion) {
      restoreActivation();
      return;
    }
    if (source) {
      if (destination.insertion) {
        if (source.kind === "pane-header")
          dispatch({
            type: "pane/detach",
            tabId: source.tabId,
            beforeTabId: destination.insertion.beforeTabId,
            ...(destination.insertion.pinned !== undefined
              ? { pinned: destination.insertion.pinned }
              : {}),
          });
        else
          dispatch({
            type: "tab/move",
            tabId: source.tabId,
            beforeTabId: destination.insertion.beforeTabId,
            pinned:
              destination.insertion.pinned ??
              !!entries.find((entry) => entry.id === source.tabId)?.pinned,
          });
        restoreActivation();
      } else if (source.kind === "tab" && target?.kind === "view-favorites") {
        saveFavorite(workspaceRef.current, dispatch, source.tabId);
        restoreActivation();
      } else if (
        target?.kind === "pane" &&
        destination.placement &&
        destination.placement.paneId === target.paneId
      ) {
        dispatch({
          type: "pane/drop-tab",
          tabId: source.tabId,
          paneId: target.paneId,
          edge: destination.placement.edge,
        });
        hoverActivated.current = false;
      } else if (source.kind === "tab" && target?.kind === "tab") {
        const oldIndex = entries.findIndex((tab) => tab.id === source.tabId);
        const newIndex = entries.findIndex((tab) => tab.id === target.tabId);
        if (oldIndex >= 0 && newIndex >= 0)
          dispatch({
            type: "tab/reorder",
            tabId: source.tabId,
            beforeTabId:
              oldIndex < newIndex
                ? (entries[newIndex + 1]?.id ?? null)
                : target.tabId,
          });
        restoreActivation();
      } else restoreActivation();
    }
  };
  return (
    <WorkspaceSelection.Provider value={{ selected, setSelected }}>
      <WorkspaceDragMode.Provider
        value={{
          ...dragMode,
          reorderPreview,
          pointerDrag,
          revealEmptyPinnedRow,
          panelsDraggable: workspace.panes.length > 1,
          sourceKind: draggedSource?.kind ?? null,
        }}
      >
        <DndContext
          sensors={sensors}
          collisionDetection={(args) => {
            const source = sourceRef.current;
            const kind = source?.kind ?? args.active.data.current?.kind;
            const mode =
              source && args.pointerCoordinates
                ? dragDestination(
                    workspace,
                    source.tabId,
                    args.pointerCoordinates,
                    source.kind === "pane-header",
                  ).mode
                : source?.kind === "pane-header"
                  ? "placement"
                  : "reorder";
            const eligible = args.droppableContainers.filter((container) =>
              source
                ? mode === "reorder"
                  ? ["tab", "tab-strip"].includes(container.data.current?.kind)
                  : container.data.current?.kind === "pane" ||
                    (source.kind === "tab" &&
                      ["view-favorites"].includes(container.data.current?.kind))
                : container.data.current?.kind === kind,
            );
            const targetArgs = { ...args, droppableContainers: eligible };
            return args.pointerCoordinates
              ? pointerWithin(targetArgs)
              : closestCenter(targetArgs);
          }}
          onDragEnd={handleDragEnd}
          onDragMove={({ activatorEvent, delta }) => {
            const source = sourceRef.current;
            if (!source || !("clientX" in activatorEvent)) return;
            const point = {
              x: (activatorEvent as MouseEvent).clientX + delta.x,
              y: (activatorEvent as MouseEvent).clientY + delta.y,
            };
            lastPoint.current = point;
            updateDestination(point, source);
          }}
          onDragStart={({ active, activatorEvent }) => {
            clearHover();
            hoverActivated.current = false;
            originRef.current = activeEntryId(workspace);
            setRevealEmptyPinnedRow(false);
            if (
              activatorEvent &&
              "pointerId" in activatorEvent &&
              typeof document.body.setPointerCapture === "function"
            ) {
              const id = (activatorEvent as PointerEvent).pointerId;
              document.body.setPointerCapture(id);
              pointerCapture.current = { element: document.body, id };
            }
            const data = active.data.current;
            let source: DragSource | null = null;
            if (data?.kind === "tab") {
              const entry = entries.find((entry) => entry.id === data.tabId);
              if (entry)
                source = {
                  kind: "tab",
                  tabId: entry.id,
                  title: entry.title,
                  entryKind: entry.kind,
                };
            } else if (data?.kind === "pane-header") {
              const pane = workspace.panes.find(
                (pane) => pane.id === data.paneId,
              );
              const tab = workspace.tabs.find((tab) => tab.id === pane?.tabId);
              if (tab)
                source = {
                  kind: "pane-header",
                  tabId: tab.id,
                  title: logTabLabel(tab),
                  entryKind: "single",
                };
            }
            lastPoint.current =
              activatorEvent && "clientX" in activatorEvent
                ? {
                    x: (activatorEvent as MouseEvent).clientX,
                    y: (activatorEvent as MouseEvent).clientY,
                  }
                : null;
            sourceRef.current = source;
            const sourceNode =
              source?.kind === "tab"
                ? [
                    ...document.querySelectorAll<HTMLElement>("[data-tab-id]"),
                  ].find((element) => element.dataset.tabId === source.tabId)
                : null;
            grabX.current =
              sourceNode && lastPoint.current
                ? lastPoint.current.x - tabSlotRect(sourceNode).left
                : null;
            destinationRef.current = {
              mode: source?.kind === "pane-header" ? "placement" : "reorder",
              placement: null,
              insertion: null,
            };
            setDragMode(destinationRef.current);
            setDraggedSource(source);
            if (source && lastPoint.current)
              updateDestination(lastPoint.current, source);
          }}
          onDragCancel={() => {
            finishDrag();
            restoreActivation();
          }}
        >
          {children}
          <TabRowCrossingPreview source={reorderPreview?.crossingSource} />
          {createPortal(
            <>
              <DragOverlay dropAnimation={null}>
                {draggedSource &&
                  (draggedSource.kind === "pane-header" ||
                    dragMode.mode === "placement") && (
                    <div className="workspace-drag-preview">
                      {draggedSource.entryKind === "split" ? (
                        <IconLayoutColumns size={15} />
                      ) : (
                        <IconTerminal2 size={15} />
                      )}
                      <span>{draggedSource.title}</span>
                    </div>
                  )}
              </DragOverlay>
              {dragMode.insertion && !reorderPreview && (
                <div
                  className="workspace-tab-insertion"
                  data-tab-insertion-before={
                    dragMode.insertion.beforeTabId ?? "__end__"
                  }
                  style={{
                    left: dragMode.insertion.rect.left,
                    top: dragMode.insertion.rect.top,
                    width: dragMode.insertion.rect.width,
                    height: dragMode.insertion.rect.height,
                  }}
                  aria-hidden="true"
                />
              )}
            </>,
            document.body,
          )}
        </DndContext>
      </WorkspaceDragMode.Provider>
    </WorkspaceSelection.Provider>
  );
}

/** Pane panels accept whole-entry drops; header targets only swap active panes. */
export function PaneDropTarget({
  paneId,
  children,
}: {
  paneId: string;
  children: ReactNode;
}) {
  const { mode, placement, sourceKind } = useContext(WorkspaceDragMode);
  const { setNodeRef, isOver } = useDroppable({
    id: "pane-panel:" + paneId,
    data: { kind: "pane", paneId },
    disabled: sourceKind === null || mode !== "placement",
  });
  return (
    <div
      ref={setNodeRef}
      className="pane-drop-target"
      data-pane-drop-target={paneId}
    >
      {children}
      {isOver &&
        placement?.paneId === paneId &&
        createPortal(
          <div
            className="pane-drop-overlay"
            style={{
              position: "fixed",
              inset: "auto",
              left: placement.rect.left,
              top: placement.rect.top,
              width: placement.rect.width,
              height: placement.rect.height,
            }}
            data-split-preview={placement.edge ?? "center"}
            aria-hidden="true"
          >
            {sourceKind === "pane-header"
              ? "Move panel here"
              : placement.edge
                ? `Split ${placement.edge}`
                : "Add to this split"}
          </div>,
          document.body,
        )}
    </div>
  );
}

export function WorkspaceTabs({ workspace, dispatch, runtimes }: Props) {
  const { selected, setSelected } = useContext(WorkspaceSelection);
  const { sourceKind, reorderPreview, revealEmptyPinnedRow } =
    useContext(WorkspaceDragMode);
  const { setNodeRef: setTabStripRef } = useDroppable({
    id: "workspace-tab-strip",
    data: { kind: "tab-strip" },
    disabled: sourceKind === null,
  });
  const anchorRef = useRef<string | null>(null);
  const entries = workspaceEntries(workspace);
  const [historyNow, setHistoryNow] = useState(() => Date.now());
  const recentHistory = recentClosedTabs(
    workspace.closedTabs,
    workspace.preferences.closedTabHistoryDays,
    historyNow,
  );
  const history = closedTabHistory(recentHistory, new Date(historyNow));
  const activeTabId = activeEntryId(workspace);
  useEffect(() => {
    if (!selected.some((id) => entries.some((entry) => entry.id === id)))
      anchorRef.current = activeTabId;
  }, [activeTabId]);
  const selectedIds = selected.filter((id) =>
    entries.some((tab) => tab.id === id),
  );
  const visibleTabs = entries;
  const onTabKey = (
    event: KeyboardEvent<HTMLButtonElement>,
    tab: WorkspaceEntry,
  ) => {
    const index = visibleTabs.findIndex((item) => item.id === tab.id);
    if (event.key === "Delete") {
      event.preventDefault();
      dispatch({ type: "tab/close", tabId: tab.id });
      return;
    }
    const next =
      event.key === "ArrowRight"
        ? visibleTabs[(index + 1) % visibleTabs.length]
        : event.key === "ArrowLeft"
          ? visibleTabs[(index - 1 + visibleTabs.length) % visibleTabs.length]
          : event.key === "Home"
            ? visibleTabs[0]
            : event.key === "End"
              ? visibleTabs.at(-1)
              : undefined;
    if (next) {
      event.preventDefault();
      anchorRef.current = next.id;
      setSelected([]);
      dispatch({ type: "tab/select", tabId: next.id });
      document.getElementById(`tab-${next.id}`)?.focus();
    }
  };

  const renderTab = (tab: WorkspaceEntry) => (
    <SortableTab
      key={tab.id}
      tab={tab}
      active={tab.id === activeTabId}
      selected={selectedIds.includes(tab.id)}
      workspace={workspace}
      dispatch={dispatch}
      runtimes={runtimes}
      onKeyDown={(event) => onTabKey(event, tab)}
      onSelect={(event) => {
        const next = selectWorkspaceEntry(
          { ids: selectedIds, anchorId: anchorRef.current },
          visibleTabs.map((entry) => entry.id),
          activeTabId,
          tab.id,
          {
            shift: event.shiftKey,
            toggle: event.ctrlKey || event.metaKey,
          },
        );
        anchorRef.current = next.anchorId;
        setSelected(next.ids);
        if (event.ctrlKey || event.metaKey || event.shiftKey) {
          event.preventDefault();
        } else {
          dispatch({ type: "tab/select", tabId: tab.id });
        }
      }}
    />
  );
  const separate = workspace.preferences.pinnedTabsSeparateRow === true;
  const showPinnedRow =
    visibleTabs.some((tab) => tab.pinned) || revealEmptyPinnedRow;

  return (
    <>
      <div
        className={`workspace-tab-bar ${workspace.preferences.tabBarLayout === "wrap" ? "is-wrapped" : ""}`}
      >
        <SortableContext
          items={visibleTabs.map((tab) => `tab:${tab.id}`)}
          strategy={
            workspace.preferences.tabBarLayout === "wrap" || separate
              ? rectSortingStrategy
              : horizontalListSortingStrategy
          }
        >
          {separate ? (
            <div ref={setTabStripRef} className="workspace-tab-strips">
              {showPinnedRow && (
                <div
                  className={`workspace-tab-list pinned-tab-row ${workspace.preferences.tabBarLayout === "wrap" ? "is-wrapped" : ""}`}
                  data-tab-strip="pinned"
                  style={{ height: reorderPreview?.heights.pinned }}
                  role="tablist"
                  aria-label="Pinned log views"
                >
                  {visibleTabs.filter((tab) => tab.pinned).map(renderTab)}
                  {!visibleTabs.some((tab) => tab.pinned) && (
                    <span className="empty-pinned-tabs">
                      Drag tabs here to pin
                    </span>
                  )}
                  <div className="tab-strip-drag-space" aria-hidden="true" />
                </div>
              )}
              <div
                className={`workspace-tab-list ${workspace.preferences.tabBarLayout === "wrap" ? "is-wrapped" : ""}`}
                data-tab-strip="regular"
                style={{ height: reorderPreview?.heights.regular }}
                role="tablist"
                aria-label="Log views"
              >
                {visibleTabs.filter((tab) => !tab.pinned).map(renderTab)}
                {!visibleTabs.some((tab) => !tab.pinned) && (
                  <span className="empty-tabs">
                    {entries.length
                      ? "Drop to open an unpinned tab"
                      : "Open a log group to begin"}
                  </span>
                )}
                <div className="tab-strip-drag-space" aria-hidden="true" />
              </div>
            </div>
          ) : (
            <div
              ref={setTabStripRef}
              className={`workspace-tab-list ${workspace.preferences.tabBarLayout === "wrap" ? "is-wrapped" : ""}`}
              data-tab-strip="shared"
              style={{ height: reorderPreview?.heights.shared }}
              role="tablist"
              aria-label="Log views"
            >
              {visibleTabs.map(renderTab)}
              {!entries.length && (
                <span className="empty-tabs">Open a log group to begin</span>
              )}
              <div className="tab-strip-drag-space" aria-hidden="true" />
            </div>
          )}
        </SortableContext>
        <div className="window-drag-handle" aria-hidden="true" />
        <div className="workspace-tab-tools">
          <Tooltip label="New view">
            <ActionIcon
              variant="subtle"
              aria-label="New log view"
              onClick={() =>
                dispatch({
                  type: "tab/open",
                  tab: createTab(
                    workspace.activeConnectionId ?? workspace.connections[0].id,
                    [],
                  ),
                })
              }
            >
              <IconPlus size={16} />
            </ActionIcon>
          </Tooltip>
          <Menu position="bottom-end" onOpen={() => setHistoryNow(Date.now())}>
            <Menu.Target>
              <ActionIcon variant="subtle" aria-label="Workspace tab menu">
                <IconChevronDown size={15} />
              </ActionIcon>
            </Menu.Target>
            <Menu.Dropdown className="closed-tab-history">
              <Menu.Item
                className="closed-tab-reopen"
                leftSection={<IconRestore size={14} />}
                disabled={!recentHistory.length}
                onClick={() => dispatch({ type: "tab/reopen" })}
              >
                Reopen closed tab
              </Menu.Item>
              <Menu.Divider />
              <div className="closed-tab-history-list">
                {history.map((section, index) => (
                  <div key={`${section.key}-${index}`}>
                    <Menu.Label className="closed-tab-date">
                      {section.label}
                    </Menu.Label>
                    {section.tabs.map((tab) => (
                      <Menu.Item
                        key={tab.id}
                        data-closed-tab-id={tab.id}
                        className="closed-tab-entry"
                        data-tooltip={closedTabTooltip(tab)}
                        leftSection={
                          sourceCount(tab.sources) > 1 ? (
                            <IconStack2 size={15} className="tab-source-icon" />
                          ) : (
                            <IconTerminal2
                              size={15}
                              className="tab-source-icon"
                            />
                          )
                        }
                        rightSection={
                          sourceCount(tab.sources) > 1 ? (
                            <span
                              className="tab-source-count"
                              aria-label={`${sourceCount(tab.sources)} sources`}
                            >
                              {sourceCount(tab.sources)}
                            </span>
                          ) : undefined
                        }
                        onClick={() =>
                          dispatch({ type: "tab/reopen", tabId: tab.id })
                        }
                      >
                        <span className="closed-tab-title">
                          {logTabLabel(tab)}
                        </span>
                      </Menu.Item>
                    ))}
                  </div>
                ))}
                {!history.length && (
                  <Menu.Label>No recently closed tabs</Menu.Label>
                )}
              </div>
            </Menu.Dropdown>
          </Menu>
        </div>
      </div>
      {selectedIds.length > 0 && (
        <div className="workspace-arrangement">
          <Text size="xs" c="dimmed" className="selection-caption">
            {selectedIds.length} selected
          </Text>
        </div>
      )}
    </>
  );
}
