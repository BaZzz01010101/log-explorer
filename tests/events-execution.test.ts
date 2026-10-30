import { expect, it, vi } from "vitest";
import { createLogService } from "../src/main/log-service";
import { createOfflineAdapter } from "../src/main/offline-adapter";
import { querySchema, workspaceSchema } from "../src/main/security";
import { createWorkspace } from "../src/renderer/workspace";
import type { QueryRequest } from "../src/shared/contracts";

function legacyRequest(mode: "offline" | "aws"): QueryRequest {
  return {
    requestId: "legacy-query",
    connection: {
      id: "legacy",
      name: "Legacy",
      mode,
      profile: "unused",
      region: "eu-west-1",
    },
    sources: [{ logGroup: "/aws/lambda/orders-api" }],
    startTime: 0,
    endTime: Date.now(),
    kind: "insights",
    filterPattern: "",
    query: "fields @message",
    limit: 10,
  };
}

it("accepts Events execution and rejects legacy Insights at the IPC boundary", () => {
  const legacy = legacyRequest("offline");
  expect(querySchema.safeParse({ ...legacy, kind: "events" }).success).toBe(
    true,
  );
  expect(querySchema.safeParse(legacy).success).toBe(false);
});

it.each([
  ["query", "offline"],
  ["live", "offline"],
  ["query", "aws"],
  ["live", "aws"],
] as const)(
  "rejects legacy %s execution for %s before constructing an adapter or queuing work",
  async (operation, mode) => {
    const factory = vi.fn(createOfflineAdapter),
      emit = vi.fn();
    const service = createLogService(emit, {
      allowAws: () => true,
      offlineAdapterFactory: factory,
      awsAdapterFactory: factory,
    });
    try {
      await expect(service[operation](legacyRequest(mode))).rejects.toThrow(
        /only Events/i,
      );
      expect(factory).not.toHaveBeenCalled();
      expect(emit).not.toHaveBeenCalled();
    } finally {
      await service.shutdown();
    }
  },
);

it("loads legacy SQL records in stored tabs, closed tabs, favorites and saved searches", () => {
  const workspace = createWorkspace();
  workspace.tabs[0].kind = "insights";
  workspace.tabs[0].query = "fields @message";
  workspace.closedTabs = [{ ...workspace.tabs[0], id: "closed-legacy" }];
  workspace.favorites = [
    {
      id: "legacy-favorite",
      title: "Legacy favorite",
      tabs: [structuredClone(workspace.tabs[0])],
      connections: structuredClone(workspace.connections),
      timezone: "utc",
    },
  ];
  workspace.savedQueries = [
    {
      id: "legacy-saved",
      name: "Legacy SQL",
      kind: "insights",
      text: "fields @message",
    },
  ];
  workspace.history = [
    {
      id: "legacy-history",
      name: "Legacy SQL",
      kind: "insights",
      text: "fields @message",
    },
  ];
  const stored = workspaceSchema.parse(workspace);
  expect(stored.tabs[0].kind).toBe("insights");
  expect(stored.closedTabs[0].kind).toBe("insights");
  expect(stored.favorites[0].tabs[0].kind).toBe("insights");
  expect(stored.savedQueries[0].kind).toBe("insights");
  expect(stored.history[0].kind).toBe("insights");
});
