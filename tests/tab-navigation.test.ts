import { expect, it } from "vitest";
import {
  cycleRecentTabs,
  finishRecentTabCycle,
  observeTabFocus,
  visualTabId,
  type TabNavigationState,
} from "../src/renderer/tab-navigation";

const ids = ["a", "b", "c"];
function focused(): TabNavigationState {
  let state: TabNavigationState = { recentIds: [] };
  for (const id of ["c", "a", "b"]) state = observeTabFocus(state, ids, id);
  return state;
}

it("freezes recent order while cycling and commits only the final selection on release", () => {
  let state = focused();
  expect(state.recentIds).toEqual(["b", "a", "c"]);
  const selected: string[] = [];
  for (const expected of ["a", "c", "b", "a"]) {
    const next = cycleRecentTabs(state, ids, selected.at(-1) ?? "b", 1);
    expect(next.tabId).toBe(expected);
    selected.push(next.tabId!);
    state = observeTabFocus(next.state, ids, next.tabId!);
    expect(state.recentIds).toEqual(["b", "a", "c"]);
  }
  state = finishRecentTabCycle(state);
  expect(state.recentIds).toEqual(["a", "b", "c"]);
  expect(cycleRecentTabs(state, ids, "a", 1).tabId).toBe("b");
});

it("moves backwards through the same recent snapshot and supports changing direction", () => {
  const first = cycleRecentTabs(focused(), ids, "b", -1);
  expect(first.tabId).toBe("c");
  const reverse = cycleRecentTabs(
    observeTabFocus(first.state, ids, "c"),
    ids,
    "c",
    -1,
  );
  expect(reverse.tabId).toBe("a");
  expect(cycleRecentTabs(reverse.state, ids, "a", 1).tabId).toBe("c");
});

it("prunes closed tabs while a cycle keeps its current selection and ordering", () => {
  const first = cycleRecentTabs(focused(), ids, "b", 1);
  const state = observeTabFocus(first.state, ["a", "c"], "a");
  expect(state.recentIds).toEqual(["a", "c"]);
  const next = cycleRecentTabs(state, ["a", "c"], "a", 1);
  expect(next.tabId).toBe("c");
  expect(finishRecentTabCycle(next.state).recentIds).toEqual(["c", "a"]);
});

it("ends a cycle when its selected tab closes and tracks the replacement focus", () => {
  const first = cycleRecentTabs(focused(), ids, "b", 1);
  const state = observeTabFocus(first.state, ["b", "c"], "c");
  expect(state.cycle).toBeUndefined();
  expect(state.recentIds).toEqual(["c", "b"]);
  expect(cycleRecentTabs(state, ["b", "c"], "c", 1).tabId).toBe("b");
});

it("keeps newly opened background tabs out of a held cycle and includes them in the next cycle", () => {
  const first = cycleRecentTabs(focused(), ids, "b", 1);
  const open = [...ids, "new"];
  const state = observeTabFocus(first.state, open, "a");
  expect(cycleRecentTabs(state, open, "a", -1).tabId).toBe("b");
  const committed = finishRecentTabCycle(state);
  expect(cycleRecentTabs(committed, open, "a", -1).tabId).toBe("new");
});

it("records a newly focused tab and direct mouse selections immediately", () => {
  const first = cycleRecentTabs(focused(), ids, "b", 1);
  const state = observeTabFocus(first.state, [...ids, "new"], "new");
  expect(state.cycle).toBeUndefined();
  expect(state.recentIds).toEqual(["new", "b", "a", "c"]);
  expect(observeTabFocus(state, [...ids, "new"], "c").recentIds).toEqual([
    "c",
    "new",
    "b",
    "a",
  ]);
});

it("handles empty workspaces, one remaining tab and repeated identifiers", () => {
  expect(cycleRecentTabs(focused(), [], null, 1).tabId).toBeUndefined();
  const one = cycleRecentTabs(focused(), ["a", "a"], "a", 1);
  expect(one.tabId).toBe("a");
  expect(finishRecentTabCycle(one.state).recentIds).toEqual(["a"]);
});

it("navigates visual tab order independently of recency and wraps in both directions", () => {
  const visual = ["pinned", "split", "normal"];
  expect(visualTabId(visual, "split", 1)).toBe("normal");
  expect(visualTabId(visual, "split", -1)).toBe("pinned");
  expect(visualTabId(visual, "normal", 1)).toBe("pinned");
  expect(visualTabId(visual, "pinned", -1)).toBe("normal");
  expect(visualTabId([], null, 1)).toBeUndefined();
  expect(visualTabId(visual, "closed", 1)).toBe("pinned");
  expect(visualTabId(visual, "closed", -1)).toBe("normal");
});
