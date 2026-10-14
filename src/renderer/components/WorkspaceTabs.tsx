import {
  useState,
  createContext,
  useContext,
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
  IconPlus,
  IconRestore,
  IconTerminal2,
  IconTrash,
  IconX,
} from "@tabler/icons-react";
import type { LogTab, Pane, TabGroup, Workspace } from "../../shared/contracts";
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
  const duplicate = () => {
    const copy = createTab(tab.connectionId, tab.sources);
    dispatch({
      type: "tab/open",
      tab: { ...structuredClone(tab), id: copy.id, title: tab.title + " copy" },
    });
  };
  return (
    <div
      ref={setNodeRef}
      role="presentation"
      className={`workspace-tab ${active ? "is-active" : ""} ${selected ? "is-selected" : ""} ${group ? "is-grouped" : ""} ${isDragging ? "is-dragging" : ""}`}
      style={{
        ...colorStyle(group?.color),
        transform: CSS.Transform.toString(transform),
        transition,
      }}
    >
      <button
        className="tab-grip"
        aria-label={`Drag ${tab.title} to reorder or move to a pane`}
        {...attributes}
        {...listeners}
      >
        <IconGripVertical size={12} />
      </button>
      <button
        type="button"
        className="workspace-tab-label"
        role="tab"
        aria-selected={active}
        id={`tab-${tab.id}`}
        aria-controls={`view-${tab.id}`}
        tabIndex={active ? 0 : -1}
        onClick={onSelect}
        onKeyDown={onKeyDown}
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
      <Menu position="bottom-start" width={230}>
        <Menu.Target>
          <button
            type="button"
            className="tab-menu-button"
            aria-label={`Actions for ${tab.title}`}
          >
            <IconDots size={13} />
          </button>
        </Menu.Target>
        <Menu.Dropdown>
          <Menu.Label>View</Menu.Label>
          <Menu.Item leftSection={<IconCopy size={14} />} onClick={duplicate}>
            Duplicate independent view
          </Menu.Item>
          <Menu.Item
            leftSection={<IconLayoutColumns size={14} />}
            disabled={workspace.panes.length >= 4}
            onClick={() => dispatch({ type: "pane/split", tabId: tab.id })}
          >
            Move to a new split
          </Menu.Item>
          {workspace.panes.map((pane, paneIndex) => (
            <Menu.Item
              key={pane.id}
              onClick={() =>
                dispatch({
                  type: "pane/assign",
                  paneId: pane.id,
                  tabId: tab.id,
                })
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
          {workspace.groups.map((group) => (
            <Menu.Item
              key={group.id}
              leftSection={
                <span className="group-dot" style={colorStyle(group.color)} />
              }
              onClick={() =>
                dispatch({
                  type: "tab/group",
                  tabIds: [tab.id],
                  groupId: group.id,
                })
              }
            >
              {group.name}
            </Menu.Item>
          ))}
          <Menu.Item
            disabled={!tab.groupId}
            onClick={() => dispatch({ type: "tab/group", tabIds: [tab.id] })}
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
      <button
        type="button"
        className="tab-close"
        aria-label={`Close ${tab.title}`}
        onClick={() => dispatch({ type: "tab/close", tabId: tab.id })}
      >
        <IconX size={13} />
      </button>
    </div>
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

/** A shared drag surface for the tab bar, group chips and actual pane panels. */
export function WorkspaceDragSurface({
  workspace,
  dispatch,
  children,
}: Props & { children: ReactNode }) {
  const [selected, setSelected] = useState<string[]>([]);
  const [draggedTabId, setDraggedTabId] = useState<string | null>(null);
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
    if (!over || active.id === over.id) return;
    const source = active.data.current;
    const target = over.data.current;
    if (source?.kind === "tab") {
      if (target?.kind === "pane")
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
      <DndContext
        sensors={sensors}
        collisionDetection={(args) => {
          const kind = args.active.data.current?.kind;
          const eligible = args.droppableContainers.filter(
            (container) =>
              kind === "tab" || container.data.current?.kind === kind,
          );
          const targetArgs = { ...args, droppableContainers: eligible };
          const hits = pointerWithin(targetArgs);
          return args.pointerCoordinates ? hits : closestCenter(targetArgs);
        }}
        onDragEnd={handleDragEnd}
        onDragStart={({ active }) =>
          setDraggedTabId(
            active.data.current?.kind === "tab"
              ? active.data.current.tabId
              : null,
          )
        }
        onDragCancel={() => setDraggedTabId(null)}
      >
        {children}
        {createPortal(
          <DragOverlay dropAnimation={null}>
            {draggedTab && (
              <div className="workspace-drag-preview">
                <IconTerminal2 size={15} />
                <span>{draggedTab.title}</span>
              </div>
            )}
          </DragOverlay>,
          document.body,
        )}
      </DndContext>
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
  const { setNodeRef, isOver } = useDroppable({
    id: "pane-panel:" + paneId,
    data: { kind: "pane", paneId },
    disabled: active?.data.current?.kind !== "tab",
  });
  return (
    <div
      ref={setNodeRef}
      className={"pane-drop-target" + (isOver ? " is-over" : "")}
      data-pane-drop-target={paneId}
    >
      {children}
      {isOver && (
        <div className="pane-drop-overlay" aria-hidden="true">
          Move view to this pane
        </div>
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
          <Tooltip label="Add split pane">
            <ActionIcon
              variant="subtle"
              aria-label="Add split pane"
              disabled={workspace.panes.length >= 4}
              onClick={() => dispatch({ type: "pane/split" })}
            >
              <IconLayoutColumns size={16} />
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
