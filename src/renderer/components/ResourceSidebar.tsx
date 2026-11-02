import { ExplorerSidebar } from "./ExplorerSidebar";
import type { ResourceActionMode, ResourcePayload } from "../resource-drag";
import type {
  Connection,
  Favorite,
  ViewFavorite,
  LogGroup,
  LogSource,
  LogStream,
  Preferences,
} from "../../shared/contracts";

interface Props {
  preferences?: Pick<Preferences, "profileVisibility"> &
    Partial<Pick<Preferences, "shortcuts" | "sourceDetailsHeight">>;
  onSourceDetailsHeightChange?(height: number): void;
  connections: Connection[];
  activeConnectionId: string;
  onConnectionChange?(connectionId: string): void;
  onResourceAction?(payload: ResourcePayload, mode: ResourceActionMode): void;
  favorites: ViewFavorite[];
  refreshKey?: number;
  recents: Favorite[];
  onOpen(
    connectionId: string,
    sources: LogSource[],
    mode?: "preview" | "permanent",
  ): void;
  onOpenFavorite?(id: string): void;
  onRemoveFavorite?(id: string): void;
  onRenameFavorite?(id: string, title: string): void;
  onManage(): void;
}
export type ResourceRow =
  | { kind: "group"; group: LogGroup }
  | { kind: "stream"; group: LogGroup; stream: LogStream }
  | { kind: "more"; group: LogGroup }
  | { kind: "loading"; group: LogGroup }
  | { kind: "error"; group: LogGroup; message: string };
export function navigateResourceTree(
  rows: ResourceRow[],
  expanded: ReadonlySet<string>,
  currentIndex: number,
  key: string,
  pageSize = 10,
): {
  index: number;
  action?: "expand" | "collapse" | "open" | "select" | "load";
} | null {
  const keys = [
    "ArrowUp",
    "ArrowDown",
    "Home",
    "End",
    "PageUp",
    "PageDown",
    "ArrowRight",
    "ArrowLeft",
    "Enter",
    " ",
  ];
  if (!keys.includes(key)) return null;
  const focusable = rows
    .map((row, index) => (row.kind === "loading" ? -1 : index))
    .filter((index) => index >= 0);
  if (!focusable.length) return null;
  const currentPosition = focusable.indexOf(currentIndex);
  const position = currentPosition < 0 ? 0 : currentPosition;
  const index = focusable[position];
  const move = (offset: number) => ({
    index:
      focusable[Math.max(0, Math.min(focusable.length - 1, position + offset))],
  });
  if (key === "Home") return { index: focusable[0] };
  if (key === "End") return { index: focusable.at(-1)! };
  if (key === "ArrowDown") return currentPosition < 0 ? { index } : move(1);
  if (key === "ArrowUp") return currentPosition < 0 ? { index } : move(-1);
  if (key === "PageDown") return move(Math.max(1, pageSize));
  if (key === "PageUp") return move(-Math.max(1, pageSize));
  const row = rows[index];
  if (key === "Enter")
    return {
      index,
      action: row.kind === "group" || row.kind === "stream" ? "open" : "load",
    };
  if (key === " ")
    return row.kind === "group" ? { index, action: "select" } : { index };
  if (key === "ArrowRight" && row.kind === "group") {
    if (!expanded.has(row.group.name)) return { index, action: "expand" };
    const child = focusable[position + 1];
    if (
      child !== undefined &&
      rows[child].kind !== "group" &&
      rows[child].group.name === row.group.name
    )
      return { index: child };
  }
  if (key === "ArrowLeft") {
    if (row.kind === "group")
      return expanded.has(row.group.name)
        ? { index, action: "collapse" }
        : { index };
    const parent = rows.findIndex(
      (item) => item.kind === "group" && item.group.name === row.group.name,
    );
    if (parent >= 0) return { index: parent };
  }
  return { index };
}

export function ResourceSidebar(props: Props) {
  return <ExplorerSidebar {...props} />;
}
