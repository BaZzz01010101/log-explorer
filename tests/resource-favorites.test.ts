import { expect, it } from "vitest";
import type { Connection } from "../src/shared/contracts";
import {
  createWorkspace,
  projectFavoriteOpen,
  projectResourceFavorite,
  workspaceReducer,
} from "../src/shared/workspace";

it("saves dragged log groups and streams as one favorite view without opening it", () => {
  const state = createWorkspace();
  const connectionId = state.connections[0]!.id;
  const result = projectResourceFavorite(state, {
    connectionId,
    sources: [
      { logGroup: "/aws/lambda/orders" },
      { logGroup: "/aws/lambda/billing", logStreams: ["worker-1"] },
    ],
  });
  expect(result.error).toBeUndefined();
  const next = result.workspace;
  expect(next.tabs).toEqual(state.tabs);
  expect(next.recents).toEqual(state.recents);
  expect(next.favorites).toHaveLength(1);
  const [favorite] = next.favorites;
  expect(favorite!.split).toBeUndefined();
  expect(favorite!.tabs).toHaveLength(1);
  expect(favorite!.tabs[0]!.sources.map((source) => source.logGroup)).toEqual([
    "/aws/lambda/orders",
    "/aws/lambda/billing",
  ]);
  // Saving the same selection again keeps a single favorite.
  expect(
    projectResourceFavorite(next, {
      connectionId,
      sources: favorite!.tabs[0]!.sources.map(({ connectionId: _id, ...source }) => source),
    }).workspace,
  ).toBe(next);
  // The saved view opens as a new tab.
  const opened = projectFavoriteOpen(next, favorite!.id);
  expect(opened.error).toBeUndefined();
  expect(opened.workspace.tabs).toHaveLength(state.tabs.length + 1);
});

it("captures a new Google Cloud connection in the favorite without registering it", () => {
  const state = createWorkspace();
  const connection: Connection = {
    id: "gcp-drag",
    name: "Google Cloud · europe-west1",
    profile: "default",
    region: "europe-west1",
    mode: "gcp",
    gcpIdentity: { configuration: "default", account: "dev@example.com" },
  };
  const result = projectResourceFavorite(state, {
    connectionId: connection.id,
    connections: [connection],
    sources: [
      {
        logGroup: "orders",
        gcp: { kind: "function", project: "demo-project", region: "europe-west1", functionName: "orders", generation: "v2" },
      },
    ],
  });
  expect(result.error).toBeUndefined();
  expect(result.workspace.connections).toEqual(state.connections);
  const [favorite] = result.workspace.favorites;
  expect(favorite!.connections.map((item) => item.id)).toEqual([connection.id]);
  expect(favorite!.tabs[0]!.connectionId).toBe(connection.id);
  const opened = workspaceReducer(result.workspace, { type: "favorites/open", favoriteId: favorite!.id });
  expect(opened.connections.some((item) => item.mode === "gcp")).toBe(true);
});

it("reports a drag whose connection is unknown", () => {
  const state = createWorkspace();
  const result = projectResourceFavorite(state, { connectionId: "missing", sources: [{ logGroup: "/a" }] });
  expect(result.workspace).toBe(state);
  expect(result.error).toMatch(/connection/i);
});

it("captures every new Google Cloud region connection of a multi-source drag", () => {
  const state = createWorkspace();
  const gcp = (id: string, region: string): Connection => ({
    id,
    name: `Google Cloud · ${region}`,
    profile: "default",
    region,
    mode: "gcp",
    gcpIdentity: { configuration: "default", account: "dev@example.com" },
  });
  const west = gcp("gcp-west", "europe-west1");
  const east = gcp("gcp-east", "us-east1");
  const source = (name: string, region: string, connectionId: string) => ({
    connectionId,
    logGroup: name,
    gcp: { kind: "function" as const, project: "demo-project", region, functionName: name, generation: "v2" as const },
  });
  const result = projectResourceFavorite(state, {
    connectionId: west.id,
    connections: [west, east],
    sources: [source("orders", "europe-west1", west.id), source("billing", "us-east1", east.id)],
  });
  expect(result.error).toBeUndefined();
  const [favorite] = result.workspace.favorites;
  expect(favorite!.connections.map((item) => item.id).sort()).toEqual([east.id, west.id]);
  expect(favorite!.tabs[0]!.sources).toHaveLength(2);
});
