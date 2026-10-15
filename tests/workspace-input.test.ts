import { afterEach, expect, it } from "vitest";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { join, resolve, sep } from "node:path";
import { tmpdir } from "node:os";
import {
  createTab,
  createWorkspace,
  workspaceReducer,
} from "../src/renderer/workspace";
import { parseWorkspaceInput } from "../src/main/workspace-input";
import { workspaceSchema } from "../src/main/security";
import { WorkspaceStore } from "../src/main/persistence";

let directory: string | undefined;
afterEach(async () => {
  if (directory) {
    if (
      !resolve(directory).startsWith(
        resolve(tmpdir()) + sep + "explorer-split-recovery-",
      )
    )
      throw new Error("Unsafe split recovery cleanup path");
    await rm(directory, { recursive: true, force: true });
  }
  directory = undefined;
});
function combined() {
  let state = createWorkspace();
  state = workspaceReducer(state, {
    type: "tab/open",
    tab: createTab("offline", [{ logGroup: "/second" }]),
  });
  state = workspaceReducer(state, {
    type: "tab/open",
    tab: createTab("offline", [{ logGroup: "/third" }]),
  });
  state = workspaceReducer(state, {
    type: "pane/show-tabs",
    tabIds: state.tabs.slice(0, 2).map((tab) => tab.id),
  });
  return workspaceReducer(state, {
    type: "tab/rename",
    tabId: state.activeTabId!,
    title: "Saved split",
  });
}
it("preserves a valid named combined tab through file and import validation", () => {
  const state = combined();
  expect(parseWorkspaceInput(state)).toEqual(state);
});
it("dissolves damaged combined metadata without losing valid log views", () => {
  const state = combined();
  state.splitTabs![0].panes[1].tabId = "missing-member";
  const result = parseWorkspaceInput(state);
  expect(result.tabs).toHaveLength(3);
  expect(result.splitTabs).toEqual([]);
  expect(result.tabOrder).toHaveLength(3);
  expect(workspaceSchema.safeParse(result).success).toBe(true);
});
it("repairs damaged projection and order while preserving a valid combined layout", () => {
  const state = combined();
  state.tabOrder = ["missing"];
  state.activePaneId = "missing";
  const result = parseWorkspaceInput(state);
  expect(result.tabs).toHaveLength(3);
  expect(result.splitTabs![0].title).toBe("Saved split");
  expect(workspaceSchema.safeParse(result).success).toBe(true);
});
it("keeps strict validation for malformed view data and unsupported versions", () => {
  const state = combined();
  const invalid = structuredClone(state);
  invalid.tabs[0].view.columns[0].width = -1;
  expect(() => parseWorkspaceInput(invalid)).toThrow();
  expect(() => parseWorkspaceInput({ version: 42 })).toThrow();
  expect(() => parseWorkspaceInput({ version: 1 })).toThrow();
});
it("loads current valid views instead of an older backup when only split metadata is damaged", async () => {
  directory = await mkdtemp(join(tmpdir(), "explorer-split-recovery-"));
  const store = new WorkspaceStore(directory, parseWorkspaceInput);
  await store.save(createWorkspace());
  const state = combined();
  await store.save(state);
  state.splitTabs![0].panes[1].tabId = "missing-member";
  await writeFile(join(directory, "workspace.json"), JSON.stringify(state));
  const loaded = await store.load();
  expect((loaded.workspace as typeof state).tabs).toHaveLength(3);
  expect((loaded.workspace as typeof state).splitTabs).toEqual([]);
  expect(loaded.warning).toBeUndefined();
});
