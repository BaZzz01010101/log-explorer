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
  /** A connection that drops register first when the workspace lacks it (Google Cloud sources). */
  connection?: Connection;
};
export type ResourceActionMode =
  "new-multisource" | "new-split" | "add-sources" | "add-splits";
