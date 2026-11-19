import type { Connection, LogSource } from "./contracts";

export type ResourceOrigin = {
  tabId: string;
  sourceIndex: number;
  stream?: string;
};
export type ResourcePayload = {
  connectionId: string;
  sources: LogSource[];
  origin?: ResourceOrigin;
  /** Connections that drops register first when the workspace lacks them (Google Cloud sources, one per region). */
  connections?: Connection[];
};
export type ResourceActionMode =
  "new-multisource" | "new-split" | "add-sources" | "add-splits";
