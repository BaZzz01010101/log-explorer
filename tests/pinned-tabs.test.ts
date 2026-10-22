import { expect, it } from "vitest";
import { workspaceSchema } from "../src/main/security";
import {
  createWorkspace,
  createTab,
  createResourceTabs,
  restoreWorkspace,
  workspaceReducer,
} from "../src/renderer/workspace";
import { workspaceEntries } from "../src/renderer/workspace-entries";
import type { Workspace } from "../src/shared/contracts";

function fixture() {
  let state = createWorkspace();
  for (const name of ["two", "three"])
    state = workspaceReducer(state, {
      type: "tab/open",
      tab: createTab("offline", [{ logGroup: name }]),
    });
  return state;
}
const pin = (state: Workspace, tabId: string, pinned = true) =>
  workspaceReducer(state, { type: "tab/pin", tabId, pinned });
const ids = (state: Workspace) =>
  workspaceEntries(state).map((entry) => entry.id);

it("pinning promotes a preview, leads the strip and survives schema save/restore", () => {
  let state = fixture();
  const [a, b, c] = ids(state);
  state = workspaceReducer(state, {
    type: "tab/update",
    tabId: c,
    patch: { preview: true },
  });
  state = pin(state, c);
  state = pin(state, a);
  expect(ids(state)).toEqual([c, a, b]);
  expect(workspaceEntries(state).map((entry) => entry.pinned)).toEqual([
    true,
    true,
    undefined,
  ]);
  expect(state.tabs.find((tab) => tab.id === c)!.preview).toBe(false);
  state = restoreWorkspace(workspaceSchema.parse(state));
  expect(ids(state)).toEqual([c, a, b]);
  expect(workspaceEntries(state)[0].pinned).toBe(true);
  state = pin(state, c, false);
  expect(ids(state)).toEqual([a, c, b]);
});

it("pinned normal and split entries ignore ordinary close and allow explicit context close", () => {
  let state = fixture();
  const [a, b] = ids(state);
  state = pin(state, a);
  expect(
    workspaceReducer(state, { type: "tab/close", tabId: a }).tabs,
  ).toHaveLength(3);
  state = workspaceReducer(state, { type: "pane/show-tabs", tabIds: [a, b] });
  const split = workspaceEntries(state).find(
    (entry) => entry.kind === "split",
  )!;
  state = pin(state, split.id);
  expect(
    workspaceReducer(state, { type: "tab/close", tabId: split.id }).splitTabs,
  ).toHaveLength(1);
  state = workspaceReducer(state, {
    type: "tab/close",
    tabId: split.id,
    allowPinned: true,
  });
  expect(state.splitTabs).toHaveLength(0);
  expect(state.tabs).toHaveLength(1);
});

it("drag moves preserve the requested pinned boundary and ordinary reorders cannot cross sections", () => {
  let state = fixture();
  const [a, b, c] = ids(state);
  state = pin(state, a);
  state = workspaceReducer(state, {
    type: "tab/move",
    tabId: c,
    beforeTabId: a,
    pinned: true,
  });
  expect(ids(state)).toEqual([c, a, b]);
  state = workspaceReducer(state, {
    type: "tab/reorder",
    tabId: b,
    beforeTabId: c,
  });
  expect(ids(state)).toEqual([c, a, b]);
  state = workspaceReducer(state, {
    type: "tab/move",
    tabId: c,
    beforeTabId: b,
    pinned: false,
  });
  expect(ids(state)).toEqual([a, c, b]);
  expect(workspaceEntries(state)[1].pinned).toBe(false);
});

it("resource batches insert separate views contiguously at the requested position and retain stream identity", () => {
  let state = fixture();
  const [a, b, c] = ids(state);
  const tabs = createResourceTabs({
    connectionId: "offline",
    sources: [{ logGroup: "/group", logStreams: ["first", "second"] }],
  });
  state = workspaceReducer(state, {
    type: "tabs/insert",
    tabs,
    beforeTabId: b,
    pinned: true,
  });
  expect(ids(state)).toEqual([tabs[0].id, tabs[1].id, a, b, c]);
  expect(
    state.tabs
      .filter((tab) => tab.pinned)
      .map((tab) => tab.sources[0].logStreams),
  ).toEqual([["first"], ["second"]]);
  expect(workspaceSchema.safeParse(state).success).toBe(true);
});

it("invalid or overflowing resource insertion is atomic and ignores stale boundaries", () => {
  const state = fixture();
  const drafts = [
    createTab("missing", [{ logGroup: "/bad" }]),
    createTab("offline", [{ logGroup: "/good" }]),
  ];
  expect(
    workspaceReducer(state, {
      type: "tabs/insert",
      tabs: drafts,
      beforeTabId: null,
      pinned: false,
    }),
  ).toEqual(state);
  expect(
    workspaceReducer(state, {
      type: "tabs/insert",
      tabs: [drafts[1]],
      beforeTabId: "gone",
      pinned: false,
    }),
  ).toEqual(state);
  expect(
    workspaceReducer(state, {
      type: "tabs/insert",
      tabs: Array.from({ length: 98 }, () => drafts[1]),
      beforeTabId: null,
      pinned: false,
    }),
  ).toEqual(state);
});

it("pinned row preference is saved and legacy workspaces default to a shared row", () => {
  let state = fixture();
  expect(state.preferences.pinnedTabsSeparateRow).toBe(false);
  state = workspaceReducer(state, {
    type: "preferences/update",
    patch: { pinnedTabsSeparateRow: true },
  });
  expect(
    restoreWorkspace(workspaceSchema.parse(state)).preferences
      .pinnedTabsSeparateRow,
  ).toBe(true);
});

it("a split created in a pinned destination keeps the pin through save and exit", () => {
  let state = fixture();
  const [a, b] = ids(state);
  state = pin(state, a);
  state = workspaceReducer(state, { type: "tab/select", tabId: a });
  state = workspaceReducer(state, {
    type: "pane/drop-tab",
    tabId: b,
    paneId: state.activePaneId,
    edge: "right",
  });
  const split = workspaceEntries(state).find(
    (entry) => entry.kind === "split",
  )!;
  expect(split.pinned).toBe(true);
  state = restoreWorkspace(workspaceSchema.parse(state));
  expect(
    workspaceEntries(state).find((entry) => entry.id === split.id)?.pinned,
  ).toBe(true);
  state = workspaceReducer(state, { type: "split/exit", tabId: split.id });
  expect(
    workspaceEntries(state)
      .filter((entry) => entry.pinned)
      .map((entry) => entry.id),
  ).toEqual([a, b]);
});

it("dissolving a pinned split by closing or detaching a pane preserves the remaining pin", () => {
  let state = fixture();
  const [a, b] = ids(state);
  state = workspaceReducer(state, { type: "pane/show-tabs", tabIds: [a, b] });
  const splitId = workspaceEntries(state).find(
    (entry) => entry.kind === "split",
  )!.id;
  state = pin(state, splitId);
  const closed = workspaceReducer(state, {
    type: "pane/close",
    paneId: state.panes[1].id,
  });
  expect(workspaceEntries(closed).find((entry) => entry.id === a)?.pinned).toBe(
    true,
  );
  const detached = workspaceReducer(state, {
    type: "pane/detach",
    tabId: b,
    beforeTabId: null,
    pinned: false,
  });
  expect(
    workspaceEntries(detached).find((entry) => entry.id === a)?.pinned,
  ).toBe(true);
  expect(
    workspaceEntries(detached).find((entry) => entry.id === b)?.pinned,
  ).toBe(false);
});
