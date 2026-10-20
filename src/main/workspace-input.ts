import {
  workspaceSchema,
  viewFavoriteSchema,
  legacyFavoriteSchema,
} from "./security";
import { restoreWorkspace } from "../renderer/workspace";
import { z } from "zod";

// View data remains strict. Layout/membership references are repaired by the
// bounded restoration path before strict validation of the resulting state.
const workspaceData = z
  .object(workspaceSchema.shape)
  .extend({
    favorites: z
      .array(z.union([viewFavoriteSchema, legacyFavoriteSchema]))
      .max(500),
  })
  .omit({
    splitTabs: true,
    tabOrder: true,
    activeTabId: true,
    activeConnectionId: true,
    panes: true,
    layout: true,
    activePaneId: true,
  });
const legacyData = z.object({
  version: z.literal(0),
  connections: z.array(z.unknown()).max(50),
  tabs: z.array(z.unknown()).max(100),
});

/** Existing file/import validation, separate from strict renderer IPC saves. */
export function parseWorkspaceInput(value: unknown) {
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    !("version" in value)
  )
    throw new Error("Unsupported workspace version");
  if (value.version === 1) workspaceData.parse(value);
  else if (value.version === 0) legacyData.parse(value);
  else throw new Error("Unsupported workspace version");
  return workspaceSchema.parse(restoreWorkspace(value));
}
