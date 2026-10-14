import {
  useState,
  createContext,
  useContext,
  useRef,
  type CSSProperties,
  type Dispatch,
  type KeyboardEvent,
  type ReactNode,
  type SetStateAction,
} from "react";
import { createPortal } from "react-dom";
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
  useDndContext,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  horizontalListSortingStrategy,
  sortableKeyboardCoordinates,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  ActionIcon,
  Button,
  Group,
  Menu,
  Modal,
  Select,
  Stack,
  Text,
  TextInput,
  Tooltip,
} from "@mantine/core";
import {
  IconChevronDown,
  IconChevronLeft,
  IconChevronRight,
  IconCopy,
  IconDots,
  IconGripVertical,
  IconLayoutColumns,
  IconLayoutRows,
  IconPlus,
  IconRestore,
  IconTerminal2,
  IconTrash,
  IconX,
} from "@tabler/icons-react";
import type {
  LogTab,
  Pane,
  SplitEdge,
  TabGroup,
  Workspace,
} from "../../shared/contracts";
import { legacyLayout, nextSplitAxis } from "../../shared/pane-layout";
import { projectPaneDrop, type LayoutRect } from "../../shared/layout-geometry";
import { createTab, type WorkspaceAction } from "../workspace";
import "./workspace-tabs.css";

type Props = { workspace: Workspace; dispatch: Dispatch<WorkspaceAction> };
const COLORS = [
  "blue",
  "cyan",
  "teal",
  "green",
  "yellow",
  "orange",
  "red",
  "pink",
  "grape",
  "violet",
];
const colorStyle = (color = "blue") =>
  ({ "--group-color": `var(--mantine-color-${color}-5)` }) as CSSProperties;

function SortableTab({
  tab,
  group,
  active,
  selected,
  workspace,
  dispatch,
  onSelect,
  onKeyDown,
}: {
  tab: LogTab;
  group?: TabGroup;
  active: boolean;
  selected: boolean;
  workspace: Workspace;
  dispatch: Dispatch<WorkspaceAction>;
  onSelect: (event: React.MouseEvent) => void;
  onKeyDown: (event: KeyboardEvent<HTMLButtonElement>) => void;
}) {
  const { selected: selection, setSelected } = useContext(WorkspaceSelection);
  const { mode } = useContext(WorkspaceDragMode);
  const [menuOpen, setMenuOpen] = useState(false);
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
  });
  const index = workspace.tabs.findIndex((item) => item.id === tab.id);
  const chosen = selection.includes(tab.id)
    ? selection.filter((id) => workspace.tabs.some((item) => item.id === id))
    : [tab.id];
  const axis = nextSplitAxis(
    workspace.layout ?? legacyLayout(workspace.panes.map((p) => p.id)),
    workspace.activePaneId,
  );
  const SplitIcon = axis === "horizontal" ? IconLayoutColumns : IconLayoutRows;
  const duplicate = () => {
    const copy = createTab(tab.connectionId, tab.sources);
    dispatch({
      type: "tab/open",
      tab: {
        ...structuredClone(tab),
        id: copy.id,
        title: tab.title + " copy",
        preview: false,
      },
    });
  };
  return (
    <Menu
      opened={menuOpen}
      onChange={(open) => {
        if (!open) setMenuOpen(false);
      }}
      position="bottom-start"
      width={230}
    >
      <Menu.Target>
        <div
          ref={setNodeRef}
          role="presentation"
          data-tab-id={tab.id}
          className={`workspace-tab ${active ? "is-active" : ""} ${selected ? "is-selected" : ""} ${group ? "is-grouped" : ""} ${isDragging ? "is-dragging" : ""} ${tab.preview ? "is-preview" : ""}`}
          style={{
            ...colorStyle(group?.color),
            transform: CSS.Transform.toString(
              isDragging
                ? mode === "reorder" && transform
                  ? { ...transform, y: 0 }
                  : null
                : transform,
            ),
            transition,
          }}
          onPointerDown={(event) => {
            if (
              event.button === 0 &&
              !(event.target as HTMLElement).closest("[data-tab-control]")
            )
              listeners?.onPointerDown?.(event);
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
            onAuxClick={(event) => {
              if (event.button === 1)
                dispatch({ type: "tab/close", tabId: tab.id });
            }}
            title={`${group ? group.name + " · " : ""}${tab.title}\n${tab.sources.map((source) => source.logGroup).join("\n")}`}
          >
            <IconTerminal2 size={14} className="tab-source-icon" />
            <span>{tab.title}</span>
            {tab.kind === "insights" && <span className="tab-kind">SQL</span>}
          </button>
          <button
            type="button"
            data-tab-control
            className="tab-close"
            aria-label={`Close ${tab.title}`}
            onClick={() => dispatch({ type: "tab/close", tabId: tab.id })}
          >
            <IconX size={13} />
          </button>
        </div>
      </Menu.Target>
      <Menu.Dropdown>
        <Menu.Label>View</Menu.Label>
        {tab.preview && (
          <Menu.Item
            onClick={() => dispatch({ type: "tab/promote", tabId: tab.id })}
          >
            Keep tab open
          </Menu.Item>
        )}
        <Menu.Item leftSection={<IconCopy size={14} />} onClick={duplicate}>
          Duplicate independent view
        </Menu.Item>
        <Menu.Item
          leftSection={<SplitIcon size={14} />}
          disabled={chosen.length < 2 || chosen.length > 4}
          onClick={() => {
            dispatch({ type: "pane/show-tabs", tabIds: chosen });
            setSelected([]);
          }}
        >
          Show in split mode
        </Menu.Item>
        <Menu.Item
          leftSection={<SplitIcon size={14} />}
          disabled={workspace.panes.length >= 4}
          onClick={() => dispatch({ type: "pane/split", tabId: tab.id })}
        >
          Move to a new split
        </Menu.Item>
        {workspace.panes.map((pane, paneIndex) => (
          <Menu.Item
            key={pane.id}
            onClick={() =>
              dispatch({ type: "pane/assign", paneId: pane.id, tabId: tab.id })
            }
          >
            Move to pane {paneIndex + 1}
          </Menu.Item>
        ))}
        <Menu.Divider />
        <Menu.Label>Tab order</Menu.Label>
        <Menu.Item
          leftSection={<IconChevronLeft size={14} />}
          disabled={index === 0}
          onClick={() =>
            dispatch({
              type: "tab/reorder",
              tabId: tab.id,
              beforeTabId: workspace.tabs[index - 1]?.id ?? null,
            })
          }
        >
          Move left
        </Menu.Item>
        <Menu.Item
          leftSection={<IconChevronRight size={14} />}
          disabled={index === workspace.tabs.length - 1}
          onClick={() =>
            dispatch({
              type: "tab/reorder",
              tabId: tab.id,
              beforeTabId: workspace.tabs[index + 2]?.id ?? null,
            })
          }
        >
          Move right
        </Menu.Item>
        <Menu.Divider />
        <Menu.Label>Group</Menu.Label>
        {workspace.groups.map((item) => (
          <Menu.Item
            key={item.id}
            leftSection={
              <span className="group-dot" style={colorStyle(item.color)} />
            }
            onClick={() =>
              dispatch({ type: "tab/group", tabIds: chosen, groupId: item.id })
            }
          >
            {item.name}
          </Menu.Item>
        ))}
        <Menu.Item
          disabled={!tab.groupId}
          onClick={() => dispatch({ type: "tab/group", tabIds: chosen })}
        >
          Remove from group
        </Menu.Item>
        <Menu.Divider />
        <Menu.Item
          color="red"
          leftSection={<IconX size={14} />}
          onClick={() => dispatch({ type: "tab/close", tabId: tab.id })}
        >
          Close tab
        </Menu.Item>
      </Menu.Dropdown>
    </Menu>
  );
}

function GroupChip({
  group,
  count,
  dispatch,
  onEdit,
}: {
  group: TabGroup;
  count: number;
  dispatch: Dispatch<WorkspaceAction>;
  onEdit: () => void;
}) {
  const { setNodeRef, transform, transition, attributes, listeners, isOver } =
    useSortable({
      id: `group:${group.id}`,
      data: { kind: "group", groupId: group.id },
    });
  return (
    <div
      ref={setNodeRef}
      className={`group-chip ${isOver ? "is-over" : ""}`}
      style={{
        ...colorStyle(group.color),
        transform: CSS.Transform.toString(transform),
        transition,
      }}
    >
      <button
        className="chip-grip"
        aria-label={`Reorder ${group.name} group`}
        {...attributes}
        {...listeners}
      >
        <IconGripVertical size={12} />
      </button>
      <button
        className="group-chip-name"
        aria-expanded={!group.collapsed}
        title={`Drop tabs here to add to ${group.name}`}
        onClick={() =>
          dispatch({
            type: "group/update",
            groupId: group.id,
            patch: { collapsed: !group.collapsed },
          })
        }
      >
        <span className="group-dot" />
        <span>{group.name}</span>
        <span className="group-count">{count}</span>
        <IconChevronDown
          size={11}
          style={{ transform: group.collapsed ? "rotate(-90deg)" : undefined }}
        />
      </button>
      <Menu position="bottom-start" width={180}>
        <Menu.Target>
          <button className="chip-menu" aria-label={`Manage ${group.name}`}>
            <IconDots size={12} />
          </button>
        </Menu.Target>
        <Menu.Dropdown>
          <Menu.Item onClick={onEdit}>Rename or recolor</Menu.Item>
          <Menu.Item
            color="red"
            leftSection={<IconTrash size={14} />}
            onClick={() =>
              dispatch({ type: "group/remove", groupId: group.id })
            }
          >
            Remove group
          </Menu.Item>
        </Menu.Dropdown>
      </Menu>
    </div>
  );
}

function PaneChip({
  pane,
  index,
  active,
  title,
  workspace,
  dispatch,
}: {
  pane: Pane;
  index: number;
  active: boolean;
  title?: string;
  workspace: Workspace;
  dispatch: Dispatch<WorkspaceAction>;
}) {
  const { setNodeRef, transform, transition, attributes, listeners, isOver } =
    useSortable({
      id: `pane:${pane.id}`,
      data: { kind: "pane", paneId: pane.id },
    });
  return (
    <div
      ref={setNodeRef}
      className={`pane-chip ${active ? "is-active" : ""} ${isOver ? "is-over" : ""}`}
      style={{ transform: CSS.Transform.toString(transform), transition }}
    >
      <button
        className="chip-grip"
        aria-label={`Reorder pane ${index + 1}`}
        {...attributes}
        {...listeners}
      >
        <IconGripVertical size={11} />
      </button>
      <button
        className="pane-chip-label"
        aria-pressed={active}
        title={`Drop a tab here to move its view to pane ${index + 1}`}
        onClick={() => dispatch({ type: "pane/activate", paneId: pane.id })}
      >
        <span className="pane-number">{index + 1}</span>
        <span>{title || "Empty pane"}</span>
      </button>
      {workspace.panes.length > 1 && (
        <button
          className="chip-menu"
          aria-label={`Close pane ${index + 1}`}
          onClick={() => dispatch({ type: "pane/close", paneId: pane.id })}
        >
          <IconX size={11} />
        </button>
      )}
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
const WorkspaceDragMode = createContext<{
  mode: "reorder" | "placement";
  placement: DragPlacement | null;
}>({ mode: "reorder", placement: null });

function dragDestination(
  workspace: Workspace,
  tabId: string,
  point: { x: number; y: number },
) {
  const strip = document
    .querySelector(".workspace-tab-list")
    ?.getBoundingClientRect();
  const distance = strip
    ? Math.hypot(
        Math.max(strip.left - point.x, 0, point.x - strip.right),
        Math.max(strip.top - point.y, 0, point.y - strip.bottom),
      )
    : Infinity;
  const mode = distance <= 28 ? "reorder" : "placement";
  let placement: DragPlacement | null = null;
  if (mode === "placement") {
    for (const element of document.querySelectorAll<HTMLElement>(
      "[data-pane-drop-target]",
    )) {
      const rect = element.getBoundingClientRect();
      if (
        point.x < rect.left ||
        point.x > rect.right ||
        point.y < rect.top ||
        point.y > rect.bottom
      )
        continue;
      const paneId = element.dataset.paneDropTarget!;
      const source = workspace.panes.find((pane) => pane.tabId === tabId);
      const canSplit =
        (workspace.panes.length < 4 || (!!source && source.id !== paneId)) &&
        (source?.id !== paneId || workspace.tabs.length < 100);
      const distances: [SplitEdge, number][] = [
        ["left", (point.x - rect.left) / rect.width],
        ["right", (rect.right - point.x) / rect.width],
        ["top", (point.y - rect.top) / rect.height],
        ["bottom", (rect.bottom - point.y) / rect.height],
      ];
      distances.sort((a, b) => a[1] - b[1]);
      const edge = canSplit && distances[0][1] <= 0.25 ? distances[0][0] : null;
      const root = document
        .querySelector(".pane-layout-root")
        ?.getBoundingClientRect();
      const projected =
        root && projectPaneDrop(workspace, tabId, paneId, edge, root);
      placement = projected
        ? {
            paneId,
            edge: projected.kind === "split" ? edge : null,
            rect: projected.rect,
          }
        : null;
      break;
    }
  }
  return { mode, placement } as {
    mode: "reorder" | "placement";
    placement: DragPlacement | null;
  };
}

/** A shared drag surface for the tab bar, group chips and actual pane panels. */
export function WorkspaceDragSurface({
  workspace,
  dispatch,
  children,
}: Props & { children: ReactNode }) {
  const [selected, setSelected] = useState<string[]>([]);
  const [draggedTabId, setDraggedTabId] = useState<string | null>(null);
  const [dragMode, setDragMode] = useState<{
    mode: "reorder" | "placement";
    placement: DragPlacement | null;
  }>({ mode: "reorder", placement: null });
  const destinationRef = useRef(dragMode);
  const draggedTab = workspace.tabs.find((tab) => tab.id === draggedTabId);
  const selectedIds = selected.filter((id) =>
    workspace.tabs.some((tab) => tab.id === id),
  );
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );
  const handleDragEnd = ({ active, over }: DragEndEvent) => {
    setDraggedTabId(null);
    const destination = destinationRef.current;
    setDragMode({ mode: "reorder", placement: null });
    if (!over || active.id === over.id) return;
    const source = active.data.current;
    const target = over.data.current;
    if (source?.kind === "tab") {
      if (
        target?.kind === "pane" &&
        destination.placement &&
        destination.placement.paneId === target.paneId &&
        destination.placement.edge
      )
        dispatch({
          type: "pane/drop-tab",
          tabId: source.tabId,
          paneId: target.paneId,
          edge: destination.placement.edge,
        });
      else if (target?.kind === "pane")
        dispatch({
          type: "pane/assign",
          paneId: target.paneId,
          tabId: source.tabId,
        });
      else if (target?.kind === "group")
        dispatch({
          type: "tab/group",
          tabIds: selectedIds.includes(source.tabId)
            ? selectedIds
            : [source.tabId],
          groupId: target.groupId,
        });
      else if (target?.kind === "tab") {
        const oldIndex = workspace.tabs.findIndex(
          (tab) => tab.id === source.tabId,
        );
        const newIndex = workspace.tabs.findIndex(
          (tab) => tab.id === target.tabId,
        );
        dispatch({
          type: "tab/reorder",
          tabId: source.tabId,
          beforeTabId:
            oldIndex < newIndex
              ? (workspace.tabs[newIndex + 1]?.id ?? null)
              : target.tabId,
        });
      }
    } else if (source?.kind === "pane" && target?.kind === "pane") {
      const oldIndex = workspace.panes.findIndex(
        (pane) => pane.id === source.paneId,
      );
      const newIndex = workspace.panes.findIndex(
        (pane) => pane.id === target.paneId,
      );
      dispatch({
        type: "pane/reorder",
        paneId: source.paneId,
        beforePaneId:
          oldIndex < newIndex
            ? (workspace.panes[newIndex + 1]?.id ?? null)
            : target.paneId,
      });
    } else if (source?.kind === "group" && target?.kind === "group") {
      const oldIndex = workspace.groups.findIndex(
        (group) => group.id === source.groupId,
      );
      const newIndex = workspace.groups.findIndex(
        (group) => group.id === target.groupId,
      );
      dispatch({
        type: "group/reorder",
        groupId: source.groupId,
        beforeGroupId:
          oldIndex < newIndex
            ? (workspace.groups[newIndex + 1]?.id ?? null)
            : target.groupId,
      });
    }
  };

  return (
    <WorkspaceSelection.Provider value={{ selected, setSelected }}>
      <WorkspaceDragMode.Provider value={dragMode}>
        <DndContext
          sensors={sensors}
          collisionDetection={(args) => {
            const kind = args.active.data.current?.kind;
            const mode =
              kind === "tab" && args.pointerCoordinates
                ? dragDestination(
                    workspace,
                    args.active.data.current!.tabId,
                    args.pointerCoordinates,
                  ).mode
                : "reorder";
            const eligible = args.droppableContainers.filter((container) =>
              kind === "tab"
                ? mode === "reorder"
                  ? container.data.current?.kind === "tab"
                  : ["pane", "group"].includes(container.data.current?.kind)
                : container.data.current?.kind === kind,
            );
            const targetArgs = { ...args, droppableContainers: eligible };
            const hits = pointerWithin(targetArgs);
            return args.pointerCoordinates ? hits : closestCenter(targetArgs);
          }}
          onDragEnd={handleDragEnd}
          onDragMove={({ active, activatorEvent, delta }) => {
            if (
              active.data.current?.kind !== "tab" ||
              !("clientX" in activatorEvent)
            )
              return;
            const point = {
              x: (activatorEvent as MouseEvent).clientX + delta.x,
              y: (activatorEvent as MouseEvent).clientY + delta.y,
            };
            const destination = dragDestination(
              workspace,
              active.data.current.tabId,
              point,
            );
            destinationRef.current = destination;
            setDragMode((previous) =>
              previous.mode === destination.mode &&
              previous.placement?.paneId === destination.placement?.paneId &&
              previous.placement?.edge === destination.placement?.edge &&
              previous.placement?.rect.left ===
                destination.placement?.rect.left &&
              previous.placement?.rect.top ===
                destination.placement?.rect.top &&
              previous.placement?.rect.width ===
                destination.placement?.rect.width &&
              previous.placement?.rect.height ===
                destination.placement?.rect.height
                ? previous
                : destination,
            );
          }}
          onDragStart={({ active }) => {
            destinationRef.current = { mode: "reorder", placement: null };
            setDragMode(destinationRef.current);
            setDraggedTabId(
              active.data.current?.kind === "tab"
                ? active.data.current.tabId
                : null,
            );
          }}
          onDragCancel={() => {
            setDraggedTabId(null);
            setDragMode({ mode: "reorder", placement: null });
          }}
        >
          {children}
          {createPortal(
            <DragOverlay dropAnimation={null}>
              {draggedTab && dragMode.mode === "placement" && (
                <div className="workspace-drag-preview">
                  <IconTerminal2 size={15} />
                  <span>{draggedTab.title}</span>
                </div>
              )}
            </DragOverlay>,
            document.body,
          )}
        </DndContext>
      </WorkspaceDragMode.Provider>
    </WorkspaceSelection.Provider>
  );
}

/** Panel target IDs differ from the sortable pane chips so both remain valid targets. */
export function PaneDropTarget({
  paneId,
  children,
}: {
  paneId: string;
  children: ReactNode;
}) {
  const { active } = useDndContext();
  const { mode, placement } = useContext(WorkspaceDragMode);
  const { setNodeRef, isOver } = useDroppable({
    id: "pane-panel:" + paneId,
    data: { kind: "pane", paneId },
    disabled: active?.data.current?.kind !== "tab" || mode !== "placement",
  });
  return (
    <div
      ref={setNodeRef}
      className={
        "pane-drop-target" + (isOver && !placement?.edge ? " is-over" : "")
      }
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
            {placement.edge
              ? `Split ${placement.edge}`
              : "Move view to this pane"}
          </div>,
          document.body,
        )}
    </div>
  );
}

export function WorkspaceTabs({ workspace, dispatch }: Props) {
  const { selected, setSelected } = useContext(WorkspaceSelection);
  const [editing, setEditing] = useState<TabGroup | "new" | null>(null);
  const [groupName, setGroupName] = useState("");
  const [groupColor, setGroupColor] = useState("blue");
  const activeTabId = workspace.panes.find(
    (pane) => pane.id === workspace.activePaneId,
  )?.tabId;
  const splitAxis = nextSplitAxis(
    workspace.layout ?? legacyLayout(workspace.panes.map((pane) => pane.id)),
    workspace.activePaneId,
  );
  const SplitIcon =
    splitAxis === "horizontal" ? IconLayoutColumns : IconLayoutRows;
  const selectedIds = selected.filter((id) =>
    workspace.tabs.some((tab) => tab.id === id),
  );
  const affectedIds = selectedIds.length
    ? selectedIds
    : activeTabId
      ? [activeTabId]
      : [];
  const visibleTabs = workspace.tabs.filter(
    (tab) =>
      !workspace.groups.find((group) => group.id === tab.groupId)?.collapsed ||
      tab.id === activeTabId,
  );
  const editGroup = (group: TabGroup | "new") => {
    setEditing(group);
    setGroupName(group === "new" ? "" : group.name);
    setGroupColor(group === "new" ? "blue" : group.color);
  };
  const onTabKey = (event: KeyboardEvent<HTMLButtonElement>, tab: LogTab) => {
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
      dispatch({ type: "tab/select", tabId: next.id });
      document.getElementById(`tab-${next.id}`)?.focus();
    }
  };

  return (
    <>
      <div className="workspace-tab-bar">
        <SortableContext
          items={visibleTabs.map((tab) => `tab:${tab.id}`)}
          strategy={horizontalListSortingStrategy}
        >
          <div
            className="workspace-tab-list"
            role="tablist"
            aria-label="Log views"
          >
            {visibleTabs.map((tab) => (
              <SortableTab
                key={tab.id}
                tab={tab}
                group={workspace.groups.find(
                  (group) => group.id === tab.groupId,
                )}
                active={tab.id === activeTabId}
                selected={selectedIds.includes(tab.id)}
                workspace={workspace}
                dispatch={dispatch}
                onKeyDown={(event) => onTabKey(event, tab)}
                onSelect={(event) => {
                  if (event.ctrlKey || event.metaKey || event.shiftKey) {
                    setSelected((previous) =>
                      previous.includes(tab.id)
                        ? previous.filter((id) => id !== tab.id)
                        : [...previous, tab.id],
                    );
                  } else {
                    setSelected([]);
                    dispatch({ type: "tab/select", tabId: tab.id });
                  }
                }}
              />
            ))}
            {!workspace.tabs.length && (
              <span className="empty-tabs">Open a log group to begin</span>
            )}
          </div>
        </SortableContext>
        <div className="workspace-tab-tools">
          <Tooltip label="New view">
            <ActionIcon
              variant="subtle"
              aria-label="New log view"
              onClick={() =>
                dispatch({
                  type: "tab/open",
                  tab: createTab(workspace.connections[0].id, []),
                })
              }
            >
              <IconPlus size={16} />
            </ActionIcon>
          </Tooltip>
          <Tooltip
            label={
              splitAxis === "horizontal"
                ? "Split side by side"
                : "Split above and below"
            }
          >
            <ActionIcon
              variant="subtle"
              aria-label="Add split pane"
              aria-description={
                splitAxis === "horizontal"
                  ? "Split side by side"
                  : "Split above and below"
              }
              data-split-axis={splitAxis}
              disabled={workspace.panes.length >= 4}
              onClick={() => dispatch({ type: "pane/split" })}
            >
              <SplitIcon size={16} />
            </ActionIcon>
          </Tooltip>
          <Menu width={235} position="bottom-end">
            <Menu.Target>
              <ActionIcon variant="subtle" aria-label="Workspace tab menu">
                <IconChevronDown size={15} />
              </ActionIcon>
            </Menu.Target>
            <Menu.Dropdown>
              <Menu.Item
                leftSection={<IconRestore size={14} />}
                disabled={!workspace.closedTabs.length}
                onClick={() => dispatch({ type: "tab/reopen" })}
              >
                Reopen closed tab
              </Menu.Item>
              <Menu.Item onClick={() => editGroup("new")}>
                New named group
                {affectedIds.length
                  ? ` from ${affectedIds.length} tab${affectedIds.length === 1 ? "" : "s"}`
                  : ""}
              </Menu.Item>
              {workspace.groups.map((group) => (
                <Menu.Item
                  key={group.id}
                  disabled={!affectedIds.length}
                  leftSection={
                    <span
                      className="group-dot"
                      style={colorStyle(group.color)}
                    />
                  }
                  onClick={() => {
                    dispatch({
                      type: "tab/group",
                      tabIds: affectedIds,
                      groupId: group.id,
                    });
                    setSelected([]);
                  }}
                >
                  Add to {group.name}
                </Menu.Item>
              ))}
              <Menu.Item
                disabled={!affectedIds.length}
                onClick={() => {
                  dispatch({ type: "tab/group", tabIds: affectedIds });
                  setSelected([]);
                }}
              >
                Ungroup selected tabs
              </Menu.Item>
              <Menu.Divider />
              <Menu.Label>Open views</Menu.Label>
              {workspace.tabs.map((tab) => (
                <Menu.Item
                  key={tab.id}
                  onClick={() =>
                    dispatch({ type: "tab/select", tabId: tab.id })
                  }
                >
                  {tab.title}
                </Menu.Item>
              ))}
            </Menu.Dropdown>
          </Menu>
        </div>
      </div>
      <div className="workspace-arrangement">
        {workspace.groups.length > 0 && (
          <SortableContext
            items={workspace.groups.map((group) => `group:${group.id}`)}
            strategy={horizontalListSortingStrategy}
          >
            <div className="workspace-group-list" aria-label="Tab groups">
              {workspace.groups.map((group) => (
                <GroupChip
                  key={group.id}
                  group={group}
                  count={
                    workspace.tabs.filter((tab) => tab.groupId === group.id)
                      .length
                  }
                  dispatch={dispatch}
                  onEdit={() => editGroup(group)}
                />
              ))}
            </div>
          </SortableContext>
        )}
        <div className="workspace-pane-list" aria-label="Split panes">
          <span className="pane-list-caption">PANES</span>
          <SortableContext
            items={workspace.panes.map((pane) => `pane:${pane.id}`)}
            strategy={horizontalListSortingStrategy}
          >
            {workspace.panes.map((pane, index) => (
              <PaneChip
                key={pane.id}
                pane={pane}
                index={index}
                active={pane.id === workspace.activePaneId}
                title={
                  workspace.tabs.find((tab) => tab.id === pane.tabId)?.title
                }
                workspace={workspace}
                dispatch={dispatch}
              />
            ))}
          </SortableContext>
        </div>
        {selectedIds.length > 0 && (
          <Text size="xs" c="dimmed" className="selection-caption">
            {selectedIds.length} selected
          </Text>
        )}
      </div>
      <Modal
        opened={editing !== null}
        onClose={() => setEditing(null)}
        title={editing === "new" ? "Create tab group" : "Edit tab group"}
        size="sm"
      >
        <form
          onSubmit={(event) => {
            event.preventDefault();
            if (!groupName.trim() || !editing) return;
            if (editing === "new") {
              const group = {
                id: `group-${crypto.randomUUID()}`,
                name: groupName.trim(),
                color: groupColor,
              };
              dispatch({ type: "group/add", group });
              dispatch({
                type: "tab/group",
                tabIds: affectedIds,
                groupId: group.id,
              });
              setSelected([]);
            } else
              dispatch({
                type: "group/update",
                groupId: editing.id,
                patch: { name: groupName.trim(), color: groupColor },
              });
            setEditing(null);
          }}
        >
          <Stack gap="md">
            <TextInput
              label="Group name"
              data-autofocus
              maxLength={100}
              value={groupName}
              onChange={(event) => setGroupName(event.currentTarget.value)}
              required
            />
            <Select
              label="Group color"
              value={groupColor}
              onChange={(color) => setGroupColor(color ?? "blue")}
              data={COLORS.map((color) => ({
                value: color,
                label: color[0].toUpperCase() + color.slice(1),
              }))}
            />
            <Group justify="flex-end">
              <Button variant="default" onClick={() => setEditing(null)}>
                Cancel
              </Button>
              <Button type="submit" disabled={!groupName.trim()}>
                Save group
              </Button>
            </Group>
          </Stack>
        </form>
      </Modal>
    </>
  );
}
