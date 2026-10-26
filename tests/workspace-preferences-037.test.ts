import { afterEach, expect, it, vi } from "vitest";
import { workspaceSchema } from "../src/main/security";
import {
  createTab,
  createWorkspace,
  restoreWorkspace,
  workspaceReducer,
} from "../src/renderer/workspace";

afterEach(() => vi.restoreAllMocks());

it("persists a 1200px pane and clamps larger widths to the new limit", () => {
  const initial = createWorkspace();
  const state = workspaceReducer(initial, {
    type: "workspace/update",
    patch: { sidebarWidth: 1200 },
  });
  expect(state.sidebarWidth).toBe(1200);
  expect(workspaceSchema.safeParse(state).success).toBe(true);
  expect(restoreWorkspace(state).sidebarWidth).toBe(1200);
  expect(
    workspaceReducer(state, {
      type: "workspace/update",
      patch: { sidebarWidth: 3000 },
    }).sidebarWidth,
  ).toBe(1200);
});

it("preserves detached Settings and independent time-template lists across restore and validation", () => {
  const state = workspaceReducer(createWorkspace(), {
    type: "preferences/update",
    patch: {
      settingsDetached: true,
      relativeTimeTemplates: {
        quick: [{ id: "quick-7", label: "7 min", duration: 7, unit: "m" }],
        dropdown: [{ id: "drop-2", label: "2 days", duration: 2, unit: "d" }],
      },
    },
  });
  const restored = restoreWorkspace(workspaceSchema.parse(state));
  expect(restored.preferences.settingsDetached).toBe(true);
  expect(restored.preferences.relativeTimeTemplates).toEqual(
    state.preferences.relativeTimeTemplates,
  );
  expect(
    restored.preferences.relativeTimeTemplates?.quick.map(
      (entry) => entry.duration,
    ),
  ).toContain(7);
});

it("records close time and reopens a chosen closed tab without disturbing newer history", () => {
  vi.spyOn(Date, "now").mockReturnValue(1000);
  let state = createWorkspace();
  const another = createTab("offline", [
    { logGroup: "/aws/lambda/payments-worker" },
  ]);
  state = workspaceReducer(state, { type: "tab/open", tab: another });
  state = workspaceReducer(state, { type: "tab/close", tabId: "tab-orders" });
  vi.spyOn(Date, "now").mockReturnValue(2000);
  state = workspaceReducer(state, { type: "tab/close", tabId: another.id });
  expect(state.closedTabs.map((tab) => tab.closedAt)).toEqual([2000, 1000]);
  const reopened = workspaceReducer(state, {
    type: "tab/reopen",
    tabId: "tab-orders",
  });
  expect(reopened.tabs.some((tab) => tab.id === "tab-orders")).toBe(true);
  expect(
    reopened.tabs.find((tab) => tab.id === "tab-orders")?.closedAt,
  ).toBeUndefined();
  expect(reopened.closedTabs.map((tab) => tab.id)).toEqual([another.id]);
  expect(
    restoreWorkspace(workspaceSchema.parse(state)).closedTabs.map(
      (tab) => tab.closedAt,
    ),
  ).toEqual([2000, 1000]);
});
