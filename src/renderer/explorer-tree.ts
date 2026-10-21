import type { Connection, LogGroup, LogStream } from "../shared/contracts";
import type { RegionResources } from "./useExplorerResources";
import { resourceScope } from "./useExplorerResources";
import { ownValue } from "../shared/records";

type Base = { key: string; parent?: string; level: number };
export type ExplorerRow = Base &
  (
    | { kind: "group"; connection: Connection; group: LogGroup }
    | {
        kind: "stream";
        connection: Connection;
        group: LogGroup;
        stream: LogStream;
      }
    | {
        kind: "loading" | "empty" | "more-groups" | "error-groups";
        connection: Connection;
        message?: string;
      }
    | {
        kind: "more-streams" | "error-streams";
        connection: Connection;
        group: LogGroup;
        message?: string;
      }
  );
export const groupKey = (id: string, name: string) =>
  JSON.stringify(["group", id, name]);
export function buildExplorerRows(
  connection: Connection | undefined,
  groups: ReadonlySet<string>,
  cache: Record<string, RegionResources>,
  search: string,
  regex = false,
  caseSensitive = true,
): ExplorerRow[] {
  if (!connection) return [];
  const rows: ExplorerRow[] = [];
  const cached = ownValue(cache, connection.id);
  const data =
    cached?.scope === resourceScope(connection, search, regex, caseSensitive)
      ? cached
      : undefined;
  const state = data?.groups;
  for (const group of state?.items ?? []) {
    const key = groupKey(connection.id, group.name);
    rows.push({ kind: "group", key, level: 1, connection, group });
    if (!groups.has(key)) continue;
    const streams = ownValue(data?.streams, group.name);
    for (const stream of streams?.items ?? [])
      rows.push({
        kind: "stream",
        key: JSON.stringify(["stream", connection.id, group.name, stream.name]),
        parent: key,
        level: 2,
        connection,
        group,
        stream,
      });
    if (!streams || streams.loading)
      rows.push({
        kind: "loading",
        key: key + "-loading",
        parent: key,
        level: 2,
        connection,
        message: "Loading streams…",
      });
    else if (streams.error)
      rows.push({
        kind: "error-streams",
        key: key + "-error",
        parent: key,
        level: 2,
        connection,
        group,
        message: streams.error,
      });
    else if (streams.cursor)
      rows.push({
        kind: "more-streams",
        key: key + "-more",
        parent: key,
        level: 2,
        connection,
        group,
      });
  }
  const prefix = JSON.stringify(["groups", connection.id]);
  if (!state || state.loading)
    rows.push({
      kind: "loading",
      key: prefix + "-loading",
      level: 1,
      connection,
      message: state?.items.length ? "Loading more groups…" : "Loading groups",
    });
  else if (state.error)
    rows.push({
      kind: "error-groups",
      key: prefix + "-error",
      level: 1,
      connection,
      message: state.error,
    });
  else if (state.cursor)
    rows.push({
      kind: "more-groups",
      key: prefix + "-more",
      level: 1,
      connection,
    });
  else if (!state.items.length)
    rows.push({
      kind: "empty",
      key: prefix + "-empty",
      level: 1,
      connection,
      message: regex
        ? "No log groups match this expression."
        : "No log groups contain this text.",
    });
  return rows;
}
export function navigateExplorer(
  rows: ExplorerRow[],
  expanded: ReadonlySet<string>,
  current: number,
  key: string,
  pageSize = 10,
): { index: number; action?: "toggle" | "open" | "select" | "load" } | null {
  const focusable = rows.flatMap((row, index) =>
    row.kind === "loading" || row.kind === "empty" ? [] : [index],
  );
  if (!focusable.length) return null;
  const position = Math.max(0, focusable.indexOf(current)),
    index = focusable[position],
    row = rows[index];
  const move = (delta: number) => ({
    index:
      focusable[Math.max(0, Math.min(focusable.length - 1, position + delta))],
  });
  if (key === "Home") return { index: focusable[0] };
  if (key === "End") return { index: focusable.at(-1)! };
  if (key === "ArrowDown")
    return focusable.includes(current) ? move(1) : { index };
  if (key === "ArrowUp")
    return focusable.includes(current) ? move(-1) : { index };
  if (key === "PageDown") return move(pageSize);
  if (key === "PageUp") return move(-pageSize);
  const branch = row.kind === "group";
  if (key === "Enter")
    return {
      index,
      action: row.kind === "stream" || row.kind === "group" ? "open" : "load",
    };
  if (key === " ")
    return {
      index,
      ...(row.kind === "group" || row.kind === "stream"
        ? { action: "select" as const }
        : branch
          ? { action: "toggle" as const }
          : {}),
    };
  if (key === "ArrowRight" && branch) {
    if (!expanded.has(row.key)) return { index, action: "toggle" };
    const child = focusable[position + 1];
    return {
      index:
        child !== undefined && rows[child].parent === row.key ? child : index,
    };
  }
  if (key === "ArrowLeft") {
    if (branch && expanded.has(row.key)) return { index, action: "toggle" };
    const parent = rows.findIndex((item) => item.key === row.parent);
    return { index: parent >= 0 ? parent : index };
  }
  return key === "ArrowRight" ? { index } : null;
}
