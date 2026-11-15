import { expect, it } from "vitest";
import {
  consistentProjection,
  createWorkspace,
  persistedWorkspace,
  restoreWorkspace,
  workspaceReducer,
  type WorkspaceAction,
} from "../src/shared/workspace";
import { workspaceSchema } from "../src/main/security";
import type { Workspace } from "../src/shared/contracts";

function withSplit(): Workspace {
  let state = createWorkspace();
  const first = state.tabs[0]!;
  state = workspaceReducer(state, {
    type: "tab/open",
    tab: { ...structuredClone(first), id: "second" },
  });
  return workspaceReducer(state, { type: "pane/split", tabId: first.id });
}

it("saves a stale pane projection by re-deriving it from the active split", () => {
  const state = withSplit();
  expect(state.splitTabs?.some((split) => split.id === state.activeTabId)).toBe(
    true,
  );
  // Same panes in a different order: the old JSON.stringify check rejected this.
  const stale = { ...state, panes: [...state.panes].reverse() };
  const fixed = consistentProjection(stale);
  expect(workspaceSchema.safeParse(fixed).success).toBe(true);

  const file = persistedWorkspace(fixed);
  expect(file).not.toHaveProperty("panes");
  expect(file).not.toHaveProperty("layout");
  const loaded = restoreWorkspace(JSON.parse(JSON.stringify(file)));
  expect(workspaceSchema.safeParse(loaded).success).toBe(true);
  const active = loaded.splitTabs!.find((split) => split.id === loaded.activeTabId)!;
  expect(loaded.panes).toEqual(active.panes);
  expect(loaded.layout).toEqual(active.layout);
});

// Deterministic pseudo-random sequences of common reducer actions must always
// produce a workspace the main process accepts.
it("keeps every reducer state valid across random action sequences", () => {
  let seed = 7;
  const random = () => ((seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);
  const pick = <T,>(items: T[]): T | undefined =>
    items.length ? items[Math.floor(random() * items.length)] : undefined;
  for (let run = 0; run < 60; run++) {
    let state = createWorkspace();
    const template = state.tabs[0]!;
    const trace: WorkspaceAction[] = [];
    for (let step = 0; step < 40; step++) {
      const tabId = pick(state.tabs.map((tab) => tab.id)) ?? template.id;
      const paneId = pick(state.panes.map((pane) => pane.id)) ?? "pane-1";
      const actions: WorkspaceAction[] = [
        { type: "tab/open", tab: { ...structuredClone(template), id: `t${run}-${step}` } },
        { type: "tab/select", tabId },
        { type: "tab/close", tabId },
        { type: "tab/reopen" },
        { type: "tab/rename", tabId, title: `name ${step}` },
        { type: "tab/pin", tabId, pinned: random() < 0.5 },
        { type: "pane/split", tabId },
        { type: "pane/close", paneId },
        { type: "pane/resize", path: "", ratio: 0.2 + random() * 0.6 },
        { type: "tab/reorder", tabId, beforeTabId: pick(state.tabs.map((tab) => tab.id)) ?? null },
        { type: "split/exit", tabId: state.activeTabId ?? tabId },
      ];
      const action = pick(actions)!;
      trace.push(action);
      state = workspaceReducer(state, action);
      const result = workspaceSchema.safeParse(state);
      if (!result.success)
        throw new Error(
          `Invalid after ${JSON.stringify(trace.map((item) => item.type))}: ${result.error.issues[0]?.message}`,
        );
    }
  }
});
