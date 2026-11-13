import { expect, it } from "vitest";
import {
  createWorkspace,
  projectResourceAction,
  workspaceReducer,
} from "../src/renderer/workspace";

it("moves a stream into another tab and removes it from the origin", () => {
  let state = createWorkspace();
  const origin = state.tabs[0].id;
  state = workspaceReducer(state, {
    type: "tab/update",
    tabId: origin,
    patch: { sources: [{ logGroup: "/group", logStreams: ["a", "b"] }] },
  });
  state = projectResourceAction(
    state,
    { connectionId: "offline", sources: [{ logGroup: "/target" }] },
    "new-multisource",
  ).workspace;
  const target = state.tabs.at(-1)!.id;
  state = workspaceReducer(state, {
    type: "source/move",
    origin: { tabId: origin, sourceIndex: 0, stream: "a" },
    destination: { kind: "sources", tabId: target },
  });
  expect(state.tabs.find((t) => t.id === origin)!.sources).toEqual([
    { logGroup: "/group", logStreams: ["b"] },
  ]);
  expect(state.tabs.find((t) => t.id === target)!.sources).toEqual([
    { logGroup: "/target" },
    { logGroup: "/group", logStreams: ["a"] },
  ]);
});

it("keeps the origin unchanged when the destination is invalid", () => {
  const state = createWorkspace();
  expect(
    workspaceReducer(state, {
      type: "source/move",
      origin: { tabId: state.tabs[0].id, sourceIndex: 0 },
      destination: { kind: "sources", tabId: "missing" },
    }),
  ).toBe(state);
});

it("merges a tab into another and lets a whole group supersede its streams", () => {
  let state = createWorkspace();
  const origin = state.tabs[0].id;
  state = workspaceReducer(state, {
    type: "tab/update",
    tabId: origin,
    patch: { sources: [{ logGroup: "/group" }] },
  });
  state = projectResourceAction(
    state,
    {
      connectionId: "offline",
      sources: [
        { logGroup: "/group", logStreams: ["a"] },
        { logGroup: "/other" },
      ],
    },
    "new-multisource",
  ).workspace;
  const target = state.tabs.at(-1)!.id;
  state = workspaceReducer(state, {
    type: "tab/merge-sources",
    tabId: origin,
    targetTabId: target,
  });
  expect(state.tabs.some((t) => t.id === origin)).toBe(false);
  expect(state.tabs.find((t) => t.id === target)!.sources).toEqual([
    { logGroup: "/group" },
    { logGroup: "/other" },
  ]);
});

it("drops an already represented stream while keeping its target group", () => {
  let state = createWorkspace();
  const origin = state.tabs[0].id;
  state = workspaceReducer(state, { type: 'tab/update', tabId: origin, patch: { sources: [{ logGroup: '/group', logStreams: ['a', 'b'] }] } });
  state = projectResourceAction(state, { connectionId: 'offline', sources: [{ logGroup: '/group' }] }, 'new-multisource').workspace;
  const target = state.tabs.at(-1)!.id;
  state = workspaceReducer(state, { type: 'source/move', origin: { tabId: origin, sourceIndex: 0, stream: 'a' }, destination: { kind: 'sources', tabId: target } });
  expect(state.tabs.find(t => t.id === origin)!.sources[0].logStreams).toEqual(['b']);
  expect(state.tabs.find(t => t.id === target)!.sources).toEqual([{ logGroup: '/group' }]);
});

it("does not remove the origin when adding would exceed the source limit", () => {
  let state = createWorkspace();
  const origin = state.tabs[0].id;
  state = workspaceReducer(state, { type: 'tab/update', tabId: origin, patch: { sources: [{ logGroup: '/one' }, { logGroup: '/two' }] } });
  state = projectResourceAction(state, { connectionId: 'offline', sources: Array.from({length: 50}, (_, i) => ({logGroup: `/target-${i}`})) }, 'new-multisource').workspace;
  const target = state.tabs.at(-1)!.id;
  const next = workspaceReducer(state, { type: 'source/move', origin: { tabId: origin, sourceIndex: 0 }, destination: { kind: 'sources', tabId: target } });
  expect(next).toBe(state);
});
