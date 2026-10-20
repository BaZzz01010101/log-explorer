import { expect, it } from "vitest";
import { mergeSources } from "../src/renderer/source-management";
import {
  createWorkspace,
  workspaceReducer,
  restoreWorkspace,
} from "../src/renderer/workspace";
import { createLogService } from "../src/main/log-service";
import { requestMatchesTab } from "../src/renderer/query-state";
import type { QueryRequest, QueryUpdate } from "../src/shared/contracts";

it("keeps identical group names and stream selections isolated by connection", () => {
  expect(
    mergeSources(
      [{ connectionId: "west", logGroup: "/same", logStreams: ["one"] }],
      [
        { connectionId: "east", logGroup: "/same", logStreams: ["two"] },
        { connectionId: "west", logGroup: "/same", logStreams: ["three"] },
      ],
    ),
  ).toEqual([
    { connectionId: "west", logGroup: "/same", logStreams: ["one", "three"] },
    { connectionId: "east", logGroup: "/same", logStreams: ["two"] },
  ]);
});

it("refreshes automatic titles for multiple streams while preserving a manual name and region on restore", () => {
  let workspace = createWorkspace();
  const tabId = workspace.tabs[0].id;
  workspace.connections.push({
    ...workspace.connections[0],
    id: "east",
    region: "us-east-1",
  });
  const sources = [
    {
      connectionId: "east",
      logGroup: "/aws/lambda/worker",
      logStreams: ["abcdef123", "ghijkl456"],
    },
  ];
  workspace = workspaceReducer(workspace, {
    type: "tab/update",
    tabId,
    patch: { sources },
  });
  expect(workspace.tabs[0].title).toBe("Mixed Sources (2)");
  expect(restoreWorkspace(workspace).tabs[0].sources).toEqual(sources);
  workspace = workspaceReducer(workspace, {
    type: "tab/rename",
    tabId,
    title: "Investigation",
  });
  workspace = workspaceReducer(workspace, {
    type: "tab/update",
    tabId,
    patch: { sources: [] },
  });
  expect(workspace.tabs[0].customTitle).toBe("Investigation");
});

it("queries equal fixture groups in two regions without collapsing their event identities and continues both", async () => {
  const workspace = createWorkspace();
  const west = workspace.connections[0],
    east = { ...west, id: "east", region: "us-east-1" };
  const updates: QueryUpdate[] = [];
  const service = createLogService((update) => updates.push(update), {
    allowAws: () => false,
  });
  const request: QueryRequest = {
    requestId: "regions",
    connection: west,
    connections: [east],
    sources: [
      { logGroup: "/aws/lambda/orders-api" },
      { connectionId: east.id, logGroup: "/aws/lambda/orders-api" },
    ],
    startTime: 0,
    endTime: Date.now(),
    kind: "events",
    filterPattern: "",
    query: "",
    limit: 8,
  };
  try {
    await service.query(request);
    await expect
      .poll(() => updates.find((update) => update.state === "complete"))
      .toBeTruthy();
    const first = updates.find((update) => update.state === "complete")!;
    expect(new Set(first.events!.map((event) => event.connectionId))).toEqual(
      new Set([west.id, east.id]),
    );
    expect(new Set(first.events!.map((event) => event.id)).size).toBe(8);
    expect(first.cursor).toBeTruthy();
    await service.query({
      ...request,
      requestId: "next",
      cursor: first.cursor,
    });
    await expect
      .poll(() =>
        updates.find(
          (update) =>
            update.requestId === "next" && update.state === "complete",
        ),
      )
      .toBeTruthy();
    const next = updates.find(
      (update) => update.requestId === "next" && update.state === "complete",
    )!;
    expect(
      new Set([...first.events!, ...next.events!].map((event) => event.id))
        .size,
    ).toBe(16);
    expect(
      Math.max(...first.events!.map((event) => event.timestamp)),
    ).toBeLessThanOrEqual(
      Math.min(...next.events!.map((event) => event.timestamp)),
    );
  } finally {
    await service.shutdown();
  }
});

it("removes references to a deleted secondary connection without losing the view or its manual title", () => {
  let workspace = createWorkspace();
  const primary = workspace.connections[0];
  workspace.connections.push({ ...primary, id: "east", region: "us-east-1" });
  workspace.tabs[0].sources.push({ connectionId: "east", logGroup: "/other" });
  workspace.tabs[0].customTitle = "Investigation";
  workspace = workspaceReducer(workspace, {
    type: "connections/set",
    connections: [primary],
  });
  expect(workspace.tabs).toHaveLength(1);
  expect(workspace.tabs[0].sources).toEqual([
    { logGroup: "/aws/lambda/orders-api" },
  ]);
  expect(workspace.tabs[0].customTitle).toBe("Investigation");
});

it("retains a secondary-only view when its unused primary connection is removed", () => {
  let workspace = createWorkspace();
  const primary = workspace.connections[0],
    secondary = { ...primary, id: "east", region: "us-east-1" };
  workspace.connections.push(secondary);
  workspace.tabs[0].sources = [{ connectionId: "east", logGroup: "/other" }];
  workspace.tabs[0].customTitle = "Investigation";
  workspace = workspaceReducer(workspace, {
    type: "connections/set",
    connections: [secondary],
  });
  expect(workspace.tabs).toHaveLength(1);
  expect(workspace.tabs[0]).toMatchObject({
    connectionId: "east",
    sources: [{ logGroup: "/other" }],
    customTitle: "Investigation",
  });
});

it("does not mark results stale when only an unused primary connection changes", () => {
  const workspace = createWorkspace(),
    primary = workspace.connections[0];
  const secondary = { ...primary, id: "east", region: "us-east-1" };
  const tab = {
    ...workspace.tabs[0],
    timePreset: "clear",
    sources: [{ connectionId: "east", logGroup: "/other" }],
  };
  const request: QueryRequest = {
    requestId: "q",
    connection: primary,
    connections: [secondary],
    sources: tab.sources,
    kind: "events",
    filterPattern: "",
    query: "",
    startTime: 0,
    endTime: 100,
    limit: 10,
  };
  const updated = { ...primary, region: "us-west-2" };
  expect(requestMatchesTab(request, tab, updated, [updated, secondary])).toBe(
    true,
  );
});
