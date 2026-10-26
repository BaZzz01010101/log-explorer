import { expect, it, vi } from "vitest";
import {
  closedTabHistory,
  recentClosedTabs,
} from "../src/renderer/closed-tab-history";
import {
  createTab,
  createWorkspace,
  workspaceReducer,
  restoreWorkspace,
} from "../src/renderer/workspace";

it("expires closed tabs after the configured number of days without changing closing order", () => {
  const now = Date.now();
  const day = 86400000;
  const tabs = [1, 7, 8, 2].map((days) => ({
    ...createTab("offline", []),
    closedAt: now - days * day,
  }));
  expect(recentClosedTabs(tabs, 7, now)).toEqual([tabs[0], tabs[1], tabs[3]]);
  expect(recentClosedTabs(tabs, 1, now)).toEqual([tabs[0]]);
});

it("defaults to seven days, migrates undated history once and drops expired entries on restore", () => {
  vi.useFakeTimers();
  try {
    const now = new Date(2026, 9, 26, 12).getTime();
    vi.setSystemTime(now);
    const workspace = createWorkspace();
    const legacy = { ...createTab("offline", []), id: "legacy-history" };
    const old = {
      ...createTab("offline", []),
      id: "old-history",
      closedAt: now - 8 * 86400000,
    };
    workspace.closedTabs = [legacy, old];
    const restored = restoreWorkspace(workspace);
    expect(restored.preferences.closedTabHistoryDays).toBe(7);
    expect(restored.closedTabs.map((tab) => tab.id)).toEqual([legacy.id]);
    expect(restored.closedTabs[0].closedAt).toBe(now);
    vi.setSystemTime(now + 8 * 86400000);
    expect(restoreWorkspace(restored).closedTabs).toEqual([]);
  } finally {
    vi.useRealTimers();
  }
});

it("prunes immediately when retention is reduced and cannot reopen an expired entry", () => {
  const now = Date.now();
  let workspace = createWorkspace();
  workspace.closedTabs = [2, 6].map((days) => ({
    ...createTab("offline", []),
    id: `closed-${days}`,
    closedAt: now - days * 86400000,
  }));
  workspace = workspaceReducer(workspace, {
    type: "preferences/update",
    patch: { closedTabHistoryDays: 3 },
  });
  expect(workspace.closedTabs.map((tab) => tab.id)).toEqual(["closed-2"]);
  workspace.closedTabs = [
    {
      ...createTab("offline", []),
      id: "expired",
      closedAt: now - 8 * 86400000,
    },
  ];
  const next = workspaceReducer(workspace, {
    type: "tab/reopen",
    tabId: "expired",
  });
  expect(next.tabs.some((tab) => tab.id === "expired")).toBe(false);
  expect(next.closedTabs).toEqual([]);
});

it("groups newest closed views by local day without inventing dates for legacy entries", () => {
  const legacy = createTab("offline", []);
  const yesterday = {
    ...createTab("offline", []),
    closedAt: new Date(2026, 9, 22, 23, 59).getTime(),
  };
  const today = {
    ...createTab("offline", []),
    closedAt: new Date(2026, 9, 23, 0, 1).getTime(),
  };
  const sections = closedTabHistory(
    [today, yesterday, legacy],
    new Date(2026, 9, 23, 12),
  );
  expect(
    sections.map((section) => [
      section.label,
      section.tabs.map((tab) => tab.id),
    ]),
  ).toEqual([
    ["Today", [today.id]],
    ["Yesterday", [yesterday.id]],
    ["Earlier", [legacy.id]],
  ]);
});

it("keeps closing order even when stored timestamps differ from that order", () => {
  const first = {
    ...createTab("offline", []),
    closedAt: new Date(2026, 9, 23, 12).getTime(),
  };
  const last = {
    ...createTab("offline", []),
    closedAt: new Date(2026, 9, 23, 10).getTime(),
  };
  expect(
    closedTabHistory([last, first], new Date(2026, 9, 23, 13))[0].tabs.map(
      (tab) => tab.id,
    ),
  ).toEqual([last.id, first.id]);
});

it("uses Earlier for invalid legacy dates and preserves repeated date sections in closing order", () => {
  const today = {
    ...createTab("offline", []),
    closedAt: new Date(2026, 9, 23, 12).getTime(),
  };
  const invalid = { ...createTab("offline", []), closedAt: Number.NaN };
  const newest = {
    ...createTab("offline", []),
    closedAt: new Date(2026, 9, 23, 13).getTime(),
  };
  const sections = closedTabHistory(
    [newest, invalid, today],
    new Date(2026, 9, 23, 14),
  );
  expect(
    sections.map((section) => [section.label, section.tabs[0].id]),
  ).toEqual([
    ["Today", newest.id],
    ["Earlier", invalid.id],
    ["Today", today.id],
  ]);
});

it("preserves newest-first history emitted by closing tabs in the workspace reducer", () => {
  let workspace = createWorkspace();
  const first = workspace.tabs[0];
  const second = createTab("offline", [{ logGroup: "second" }]);
  workspace = workspaceReducer(workspace, { type: "tab/open", tab: second });
  workspace = workspaceReducer(workspace, {
    type: "tab/close",
    tabId: first.id,
  });
  workspace = workspaceReducer(workspace, {
    type: "tab/close",
    tabId: second.id,
  });
  expect(
    closedTabHistory(workspace.closedTabs).flatMap((section) =>
      section.tabs.map((tab) => tab.id),
    ),
  ).toEqual([second.id, first.id]);
});
