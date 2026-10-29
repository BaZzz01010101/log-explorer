import { useEffect, useLayoutEffect, useRef, type ReactNode } from "react";
import { ActionIcon, Button } from "@mantine/core";
import {
  IconChevronDown,
  IconChevronRight,
  IconGripVertical,
  IconPencil,
  IconTrash,
} from "@tabler/icons-react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

interface Props {
  id: string;
  kind: "profile" | "rule";
  label: string;
  position: number;
  selected: boolean;
  expanded: boolean;
  editing: boolean;
  confirming: boolean;
  isNew: boolean;
  invalid: boolean;
  onSelect(): void;
  onExpand(keepOthers: boolean): void;
  onEdit(keepOthers: boolean): void;
  onSave(): void;
  onCancelEdit(): void;
  onDelete(): void;
  onCancelDelete(): void;
  onConfirmDelete(): void;
  columns: number;
  children: ReactNode;
  detail: ReactNode;
}

export function HighlightSettingsRow({
  id,
  kind,
  label,
  position,
  selected,
  expanded,
  editing,
  confirming,
  isNew,
  invalid,
  onSelect,
  onExpand,
  onEdit,
  onSave,
  onCancelEdit,
  onDelete,
  onCancelDelete,
  onConfirmDelete,
  columns,
  children,
  detail,
}: Props) {
  const sortable = useSortable({ id });
  const bodyRef = useRef<HTMLTableSectionElement | null>(null);
  const rowRef = useRef<HTMLTableRowElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const popup = confirming ? "delete" : editing ? "edit" : null;
  const rowState = confirming
    ? "deleting"
    : isNew
      ? "new"
      : editing
        ? "editing"
        : undefined;
  const lastReveal = useRef({ expanded: false, position, dragging: false });
  useLayoutEffect(() => {
    const previous = lastReveal.current;
    lastReveal.current = { expanded, position, dragging: sortable.isDragging };
    const needsReveal =
      !previous.expanded || previous.position !== position || previous.dragging;
    const body = bodyRef.current,
      scroll = body?.closest<HTMLElement>(".highlight-items-scroll");
    if (
      !expanded ||
      !needsReveal ||
      !selected ||
      sortable.isDragging ||
      !body ||
      !scroll
    )
      return;
    const reveal = () => {
      const bounds = scroll.getBoundingClientRect(),
        item = body.getBoundingClientRect();
      const headerHeight =
        scroll.querySelector("thead")?.getBoundingClientRect().height ?? 0;
      const top = bounds.top + headerHeight,
        bottom = bounds.top + scroll.clientHeight;
      if (item.height > bottom - top || item.top < top)
        scroll.scrollTop += item.top - top;
      else if (item.bottom > bottom) scroll.scrollTop += item.bottom - bottom;
    };
    reveal();
    const frame = requestAnimationFrame(reveal);
    return () => cancelAnimationFrame(frame);
  }, [expanded, position, selected, sortable.isDragging]);
  useLayoutEffect(() => {
    if (popup) cancelRef.current?.focus({ preventScroll: true });
  }, [popup]);
  useEffect(() => {
    const doc = rowRef.current?.ownerDocument;
    if (!confirming || !doc) return;
    const outside = (event: globalThis.PointerEvent) => {
      if (!rowRef.current?.contains(event.target as Node)) onCancelDelete();
    };
    doc.addEventListener("pointerdown", outside, true);
    return () => doc.removeEventListener("pointerdown", outside, true);
  }, [confirming, onCancelDelete]);

  return (
    <tbody
      ref={(node) => {
        bodyRef.current = node;
        sortable.setNodeRef(node);
      }}
      className="highlight-sortable-item"
      data-dragging={sortable.isDragging}
      data-row-state={rowState}
      data-mantine-stop-propagation={popup ? "true" : undefined}
      style={{
        transform: CSS.Transform.toString(sortable.transform),
        transition: sortable.transition,
        position: "relative",
        zIndex: sortable.isDragging ? 4 : popup ? 2 : undefined,
      }}
      onKeyDown={(event) => {
        const target = event.target as HTMLElement;
        if (event.key !== "Escape" || !popup || sortable.isDragging) return;
        if (
          event.defaultPrevented ||
          target.getAttribute("aria-expanded") === "true" ||
          (target.classList.contains("mantine-ColorInput-input") &&
            target.ownerDocument.querySelector(
              ".mantine-ColorInput-dropdown",
            )) ||
          target.closest(
            ".mantine-Popover-dropdown, .mantine-Combobox-dropdown",
          )
        ) {
          event.stopPropagation();
          return;
        }
        event.preventDefault();
        event.stopPropagation();
        if (confirming) onCancelDelete();
        else onCancelEdit();
      }}
    >
      <tr
        ref={rowRef}
        className="highlight-summary-row"
        {...(kind === "profile"
          ? { "data-profile-id": id }
          : { "data-rule-id": id, "data-highlight-rule": position })}
        aria-selected={selected}
        tabIndex={0}
        onClick={onSelect}
        onDoubleClick={(event) => onExpand(event.shiftKey)}
        onKeyDown={(event) => {
          if (
            event.target !== event.currentTarget ||
            (event.key !== "Enter" && event.key !== " ")
          )
            return;
          event.preventDefault();
          onSelect();
          onExpand(event.shiftKey);
        }}
      >
        <td
          className="highlight-grip-cell"
          onClick={(event) => event.stopPropagation()}
          onDoubleClick={(event) => event.stopPropagation()}
        >
          <button
            ref={sortable.setActivatorNodeRef}
            {...sortable.attributes}
            {...sortable.listeners}
            className="highlight-rule-handle"
            aria-label={`Reorder ${kind} ${position + 1}`}
            data-mantine-stop-propagation={
              sortable.isDragging ? "true" : undefined
            }
          >
            <IconGripVertical size={14} />
          </button>
        </td>
        <td
          className="highlight-expand-cell"
          onClick={(event) => event.stopPropagation()}
          onDoubleClick={(event) => event.stopPropagation()}
        >
          <ActionIcon
            size="sm"
            variant="subtle"
            aria-expanded={expanded}
            aria-label={`${expanded ? "Collapse" : "Expand"} ${kind} ${label}`}
            onClick={(event) => onExpand(event.shiftKey)}
          >
            {expanded ? (
              <IconChevronDown size={15} />
            ) : (
              <IconChevronRight size={15} />
            )}
          </ActionIcon>
        </td>
        <td className="highlight-priority-cell">{position + 1}</td>
        {children}
        <td
          className="highlight-delete-cell highlight-row-actions"
          onClick={(event) => event.stopPropagation()}
          onDoubleClick={(event) => event.stopPropagation()}
        >
          <span className="highlight-row-icons" inert={Boolean(popup)}>
            <ActionIcon
              size="sm"
              variant="subtle"
              aria-label={`Edit ${kind} ${label}`}
              data-tooltip={`Edit ${kind}`}
              onClick={(event) => onEdit(event.shiftKey)}
            >
              <IconPencil size={14} />
            </ActionIcon>
            <ActionIcon
              size="sm"
              color="red"
              variant="subtle"
              aria-label={`Delete ${kind} ${label}`}
              data-tooltip={`Delete ${kind}`}
              onClick={onDelete}
            >
              <IconTrash size={14} />
            </ActionIcon>
          </span>
          {popup && (
            <div
              key={popup}
              className="highlight-action-strip"
              data-action={popup}
              role={confirming ? "alertdialog" : "group"}
              aria-label={
                confirming ? `Delete ${kind}?` : `Edit ${kind} actions`
              }
            >
              <Button
                variant="subtle"
                color={confirming ? "red" : "green"}
                size="compact-xs"
                aria-label={
                  confirming ? `Confirm delete ${kind}` : `Save ${kind}`
                }
                disabled={!confirming && invalid}
                onClick={confirming ? onConfirmDelete : onSave}
              >
                {confirming ? "Delete" : "Save"}
              </Button>
              <Button
                ref={cancelRef}
                variant="subtle"
                size="compact-xs"
                aria-label={
                  confirming ? "Cancel deletion" : `Cancel ${kind} edit`
                }
                onClick={confirming ? onCancelDelete : onCancelEdit}
              >
                Cancel
              </Button>
            </div>
          )}
        </td>
      </tr>
      {expanded && (
        <tr className="highlight-detail-row">
          <td colSpan={columns} className="highlight-item-detail">
            <div
              role="region"
              aria-label={`${kind === "profile" ? "Profile" : "Rule"} ${label} details`}
            >
              {detail}
            </div>
          </td>
        </tr>
      )}
    </tbody>
  );
}
