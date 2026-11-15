import { afterEach, expect, it } from "vitest";
import {
  createWorkspace,
  restoreWorkspace,
  setFixturesAvailable,
} from "../src/shared/workspace";
import { workspaceSchema } from "../src/main/security";
import { createLogService } from "../src/main/log-service";

afterEach(() => setFixturesAvailable(true));

it("starts release builds with an AWS connection and no fixture views", () => {
  setFixturesAvailable(false);
  const workspace = createWorkspace();
  expect(workspace.connections.map((connection) => connection.mode)).toEqual([
    "aws",
  ]);
  expect(workspace.tabs).toEqual([]);
  expect(workspaceSchema.safeParse(workspace).success).toBe(true);
  expect(restoreWorkspace(workspace).tabs).toEqual([]);
});

it("drops fixture connections and fixture-only views from saved workspaces", () => {
  const saved = createWorkspace();
  const aws = {
    id: "prod",
    name: "Prod",
    profile: "default",
    region: "us-east-1",
    mode: "aws" as const,
  };
  const fixtureTab = saved.tabs[0]!;
  const mixed = {
    ...structuredClone(fixtureTab),
    id: "mixed",
    sources: [
      { logGroup: "/fixture" },
      { logGroup: "/prod/api", connectionId: "prod" },
    ],
  };
  setFixturesAvailable(false);
  const restored = restoreWorkspace({
    ...saved,
    connections: [...saved.connections, aws],
    tabs: [fixtureTab, mixed],
    tabOrder: [fixtureTab.id, mixed.id],
  });
  expect(restored.connections.map((connection) => connection.id)).toEqual([
    "prod",
  ]);
  expect(restored.tabs.map((tab) => tab.id)).toEqual(["mixed"]);
  expect(restored.tabs[0]!.connectionId).toBe("prod");
  expect(restored.tabs[0]!.sources.map((source) => source.logGroup)).toEqual([
    "/prod/api",
  ]);
});

it("rejects fixture connections in the service when fixtures are unavailable", async () => {
  const service = createLogService(() => {}, {
    allowAws: () => false,
    allowOffline: () => false,
  });
  await expect(
    service.listGroups(createWorkspace().connections[0]!, ""),
  ).rejects.toThrow(/not available/);
  await service.shutdown();
});
