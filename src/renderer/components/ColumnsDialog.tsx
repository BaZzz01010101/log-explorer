import { useState } from "react";
import {
  ActionIcon,
  Button,
  Group,
  Modal,
  Select,
  Switch,
  Text,
  TextInput,
} from "@mantine/core";
import {
  IconArrowDown,
  IconArrowUp,
  IconEye,
  IconEyeOff,
  IconGripVertical,
  IconPin,
  IconX,
} from "@tabler/icons-react";
import type { ColumnConfig } from "../../shared/contracts";
import { applyColumnAction, isProtectedColumn } from "../column-actions";
import { initialColumns, titleFor } from "../log-columns";
import { Tooltip } from "./AppTooltip";

/** Edits a view's columns: order, visibility, format, pinning and additions. */
export function ColumnsDialog({
  opened,
  onClose,
  columns,
  onChange,
  paths,
  onAdd,
  wrap,
  onWrapChange,
  notice,
}: {
  opened: boolean;
  onClose(): void;
  columns: ColumnConfig[];
  onChange(columns: ColumnConfig[]): void;
  /** Field paths found in loaded events. */
  paths: { list: string[]; limited: boolean };
  /** False when the path cannot be added; the reason is in `notice`. */
  onAdd(path: string): boolean;
  wrap: boolean;
  onWrapChange(wrap: boolean): void;
  notice: string;
}) {
  const [columnNotice, setColumnNotice] = useState("");
  const [columnInput, setColumnInput] = useState("");
  const [draggedColumn, setDraggedColumn] = useState<string | null>(null);
  const change = (next: ColumnConfig[]) => {
    setColumnNotice("");
    onChange(next);
  };
  const add = (path: string) => {
    if (onAdd(path)) setColumnInput("");
  };
  const moveColumn = (path: string, destination: number) => {
    const next = [...columns];
    const index = next.findIndex((column) => column.path === path);
    if (index < 0 || destination < 0 || destination >= next.length) return;
    next.splice(destination, 0, next.splice(index, 1)[0]!);
    change(next);
  };
  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title="Customize columns"
      size="lg"
    >
      <Text size="xs" c="dimmed" mb="sm">
        Drag columns or use arrows to change their order. Sizes, formatting,
        visibility, pinning and sorting stay with this tab. Formats change
        displayed cells; sorting, inspection and export retain the original
        values.
      </Text>
      <div className="column-list">
        {columns.map((column, index) => (
          <div
            className={`column-config ${draggedColumn === column.path ? "column-dragging" : ""}${column.hidden ? " column-hidden" : ""}`}
            key={column.path}
            draggable
            onDragStart={(event) => {
              setDraggedColumn(column.path);
              event.dataTransfer.effectAllowed = "move";
              event.dataTransfer.setData("text/plain", column.path);
            }}
            onDragEnd={() => setDraggedColumn(null)}
            onDragOver={(event) => event.preventDefault()}
            onDrop={(event) => {
              event.preventDefault();
              if (draggedColumn !== null) moveColumn(draggedColumn, index);
              setDraggedColumn(null);
            }}
          >
            <IconGripVertical size={15} className="column-grip" />
            <Tooltip label={column.hidden ? "Show column" : "Hide column"}>
              <ActionIcon
                aria-label={`${column.hidden ? "Show" : "Hide"} ${titleFor(column.path)}`}
                aria-pressed={!column.hidden}
                variant="subtle"
                color={column.hidden ? "gray" : undefined}
                onClick={() => {
                  const hidden = !column.hidden;
                  if (
                    hidden &&
                    columns.filter((entry) => !entry.hidden).length === 1
                  ) {
                    setColumnNotice("Keep at least one column visible.");
                    return;
                  }
                  change(
                    columns.map((entry) =>
                      entry.path === column.path ? { ...entry, hidden } : entry,
                    ),
                  );
                }}
              >
                {column.hidden ? (
                  <IconEyeOff size={15} />
                ) : (
                  <IconEye size={15} />
                )}
              </ActionIcon>
            </Tooltip>
            <span className="column-path" data-tooltip={column.path}>
              {titleFor(column.path)}
            </span>
            <span className="column-width">{Math.round(column.width)} px</span>
            <Select
              aria-label={`Format ${titleFor(column.path)}`}
              data-tooltip="Format displayed values"
              size="xs"
              style={{ flex: "0 0 116px", width: 116 }}
              value={column.format ?? "auto"}
              allowDeselect={false}
              data={[
                { value: "auto", label: "Auto" },
                { value: "json", label: "JSON" },
                { value: "bytes", label: "Bytes (IEC)" },
                { value: "milliseconds", label: "Duration (ms)" },
                { value: "datetime", label: "Date & time" },
              ]}
              onChange={(format) =>
                change(
                  columns.map((entry) =>
                    entry.path === column.path
                      ? {
                          ...entry,
                          format: (format ?? "auto") as ColumnConfig["format"],
                        }
                      : entry,
                  ),
                )
              }
            />
            <Tooltip label={column.pinned ? "Unpin" : "Pin"}>
              <ActionIcon
                aria-label={`${column.pinned ? "Unpin" : "Pin"} ${titleFor(column.path)}`}
                aria-pressed={column.pinned ?? false}
                variant={column.pinned ? "light" : "subtle"}
                onClick={() =>
                  change(
                    applyColumnAction(
                      columns,
                      column.path,
                      column.pinned ? "unpin" : "pin",
                    ),
                  )
                }
              >
                <IconPin size={14} />
              </ActionIcon>
            </Tooltip>
            <ActionIcon
              aria-label={`Move ${titleFor(column.path)} up`}
              variant="subtle"
              disabled={index === 0}
              onClick={() => moveColumn(column.path, index - 1)}
            >
              <IconArrowUp size={14} />
            </ActionIcon>
            <ActionIcon
              aria-label={`Move ${titleFor(column.path)} down`}
              variant="subtle"
              disabled={index === columns.length - 1}
              onClick={() => moveColumn(column.path, index + 1)}
            >
              <IconArrowDown size={14} />
            </ActionIcon>
            {isProtectedColumn(column.path) ? (
              <span className="column-delete-placeholder" aria-hidden="true" />
            ) : (
              <ActionIcon
                aria-label={`Remove ${titleFor(column.path)}`}
                variant="subtle"
                color="gray"
                disabled={
                  applyColumnAction(columns, column.path, "remove") === columns
                }
                onClick={() =>
                  change(applyColumnAction(columns, column.path, "remove"))
                }
              >
                <IconX size={14} />
              </ActionIcon>
            )}
          </div>
        ))}
      </div>
      {columnNotice && (
        <Text size="xs" c="orange" mt="xs" role="status">
          {columnNotice}
        </Text>
      )}
      <Group mt="md" align="end">
        <Select
          style={{ flex: 1 }}
          label="Discovered field"
          placeholder="Choose a property…"
          searchable
          clearable
          data={paths.list
            .filter(
              (path) =>
                !columns.some(
                  (column) => column.path === path && !column.hidden,
                ),
            )
            .map((path) => ({
              value: path || "__root__",
              label: titleFor(path),
            }))}
          value={null}
          onChange={(path) => {
            if (path !== null) add(path === "__root__" ? "" : path);
          }}
        />
      </Group>
      <Group mt="xs" align="end">
        <TextInput
          style={{ flex: 1 }}
          label="JSON Pointer"
          placeholder="/request/id or /items/0/name"
          value={columnInput}
          onChange={(event) => setColumnInput(event.currentTarget.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") add(columnInput);
          }}
        />
        <Button variant="light" onClick={() => add(columnInput)}>
          Add column
        </Button>
      </Group>
      <Text size="xs" c="dimmed" mt="xs">
        Discovery examines up to 500 loaded events and 200 field paths.
        {paths.limited
          ? " Some fields were omitted; add their JSON Pointer directly or from the inspector."
          : ""}{" "}
        Literal dotted keys stay intact: /user.id differs from /user/id. Escape
        / as ~1 and ~ as ~0.
      </Text>
      <Group justify="space-between" mt="md">
        <Switch
          label="Wrap message lines"
          checked={wrap}
          onChange={(event) => onWrapChange(event.currentTarget.checked)}
        />
        <Button
          variant="subtle"
          size="xs"
          onClick={() =>
            change(initialColumns.map((column) => ({ ...column })))
          }
        >
          Reset columns
        </Button>
      </Group>
      {notice && (
        <Text size="xs" c="cyan" mt="xs" role="status">
          {notice}
        </Text>
      )}
    </Modal>
  );
}
