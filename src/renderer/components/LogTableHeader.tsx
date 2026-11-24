import { IconArrowDown, IconArrowUp, IconPin } from "@tabler/icons-react";
import { flexRender, type Table } from "@tanstack/react-table";
import type { ColumnConfig } from "../../shared/contracts";
import {
  clampColumnWidth,
  columnPath,
  DEFAULT_COLUMN_WIDTH,
  initialColumns,
  MAX_COLUMN_WIDTH,
  MIN_COLUMN_WIDTH,
  pinClass,
  pinStyle,
  titleFor,
} from "../log-columns";
import type { useColumnHeaderDrag } from "../useColumnHeaderDrag";
import type { useColumnResize } from "../useColumnResize";
import type { ColumnHeaderMenuTarget } from "./ColumnHeaderMenu";

/** Column headers: sorting, reordering, resizing and their context menu. */
export function LogTableHeader<T>({
  table,
  hybrid,
  columns,
  drag,
  resize,
  onChange,
  onMenu,
}: {
  table: Table<T>;
  /** Rows have a gutter before the first column. */
  hybrid: boolean;
  columns: ColumnConfig[];
  drag: ReturnType<typeof useColumnHeaderDrag>;
  resize: ReturnType<typeof useColumnResize>;
  onChange(columns: ColumnConfig[]): void;
  onMenu(target: ColumnHeaderMenuTarget): void;
}) {
  return (
    <div
      className="log-table-header"
      role="row"
      onClickCapture={drag.onClickCapture}
      style={{
        minWidth: table.getTotalSize() + (hybrid ? 32 : 0),
      }}
    >
      {hybrid && <div className="hybrid-gutter" />}
      {table.getHeaderGroups()[0]?.headers.map((header, index, headers) => (
        <div
          className={`log-header-cell ${pinClass(header.column)}${drag.visual?.sourcePath === columnPath(header.id) ? " is-reordering" : ""}${drag.visual?.targetPath === columnPath(header.id) ? ` column-drop-${drag.visual.edge}` : ""}`}
          key={header.id}
          data-column-path={columnPath(header.id)}
          style={{
            ...pinStyle(header.column),
            // Keep a pinned header's centered resize handle above
            // the next pinned header without covering the rest.
            ...(header.column.getIsPinned()
              ? { zIndex: headers.length - index + 2 }
              : {}),
            ...(header.column.getIsPinned() && hybrid
              ? { left: header.column.getStart("left") + 32 }
              : {}),
          }}
          role="columnheader"
          onContextMenu={(event) => {
            event.preventDefault();
            event.stopPropagation();
            drag.cancel();
            resize.finish(true);
            onMenu({
              path: columnPath(header.id),
              origin:
                event.currentTarget.querySelector<HTMLElement>(
                  ".column-sort",
                ) ?? undefined,
              x: event.clientX,
              y: event.clientY,
            });
          }}
          onKeyDown={(event) => {
            if (
              event.key !== "ContextMenu" &&
              !(event.shiftKey && event.key === "F10")
            )
              return;
            event.preventDefault();
            event.stopPropagation();
            const rect = event.currentTarget.getBoundingClientRect();
            onMenu({
              path: columnPath(header.id),
              origin:
                event.currentTarget.querySelector<HTMLElement>(
                  ".column-sort",
                ) ?? undefined,
              x: rect.left + Math.min(16, rect.width / 2),
              y: rect.top + rect.height / 2,
            });
          }}
          aria-sort={
            header.column.getIsSorted() === "asc"
              ? "ascending"
              : header.column.getIsSorted() === "desc"
                ? "descending"
                : "none"
          }
        >
          <button
            className="column-sort"
            data-tooltip={`Sort by ${titleFor(columnPath(header.id))}`}
            onClick={header.column.getToggleSortingHandler()}
            draggable={false}
            onDragStart={(event) => event.preventDefault()}
            onPointerDown={(event) => {
              resize.finish(true);
              drag.begin(columnPath(header.id), event);
            }}
            onPointerMove={drag.move}
            onPointerUp={drag.end}
            onPointerCancel={drag.cancel}
            onLostPointerCapture={drag.cancel}
          >
            {flexRender(header.column.columnDef.header, header.getContext())}
            {header.column.getIsPinned() && <IconPin size={11} />}
            {header.column.getIsSorted() === "asc" ? (
              <IconArrowUp size={12} />
            ) : header.column.getIsSorted() === "desc" ? (
              <IconArrowDown size={12} />
            ) : null}
          </button>
          <div
            className={`column-resizer ${resize.resizing === header.id ? "resizing" : ""}`}
            role="separator"
            aria-label={`Resize ${titleFor(columnPath(header.id))}`}
            aria-orientation="vertical"
            aria-valuemin={MIN_COLUMN_WIDTH}
            aria-valuemax={MAX_COLUMN_WIDTH}
            aria-valuenow={Math.round(header.getSize())}
            tabIndex={0}
            draggable={false}
            onDragStart={(event) => event.preventDefault()}
            onPointerDownCapture={drag.cancel}
            {...resize.handlers(
              header.id,
              columnPath(header.id),
              header.getSize(),
            )}
            onKeyDown={(event) => {
              if (event.key !== "ArrowLeft" && event.key !== "ArrowRight")
                return;
              event.preventDefault();
              const width = clampColumnWidth(
                header.getSize() + (event.key === "ArrowRight" ? 10 : -10),
              );
              onChange(
                columns.map((column) =>
                  column.path === columnPath(header.id)
                    ? { ...column, width }
                    : column,
                ),
              );
            }}
            onDoubleClick={() =>
              onChange(
                columns.map((column) =>
                  column.path === columnPath(header.id)
                    ? {
                        ...column,
                        width:
                          initialColumns.find(
                            (entry) => entry.path === column.path,
                          )?.width ?? DEFAULT_COLUMN_WIDTH,
                      }
                    : column,
                ),
              )
            }
          />
        </div>
      ))}
    </div>
  );
}
