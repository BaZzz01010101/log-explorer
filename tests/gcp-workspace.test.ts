import { describe, expect, it } from "vitest";
import { createTab, createWorkspace, restoreWorkspace, workspaceReducer } from "../src/renderer/workspace";
import { workspaceSchema } from "../src/main/security";
import { scopedQueries } from "../src/main/multi-source-events";

const connection = { id: "gcp-1", name: "Google", profile: "work", region: "europe-west2", mode: "gcp" as const, gcpIdentity: { configuration: "work", account: "user@example.com" } };
const source = { logGroup: "/gcp/kubernetes/worker/dev", gcp: { kind: "kubernetes" as const, project: "demo-123", region: "europe-west2", cluster: "dev", namespace: "default", container: "worker" } };

describe("Google Cloud workspace identity", () => {
  it("preserves source and account through tab creation, persistence, and query partitioning", () => {
    let workspace = createWorkspace();
    workspace = workspaceReducer(workspace, { type: "connections/set", connections: [...workspace.connections, connection] });
    const tab = createTab(connection.id, [source]);
    workspace = workspaceReducer(workspace, { type: "tab/open", tab });
    const saved = workspaceSchema.parse(workspace);
    const restored = restoreWorkspace(saved);
    expect(restored.connections.find((item) => item.id === connection.id)).toMatchObject(connection);
    expect(restored.tabs.find((item) => item.id === tab.id)?.sources).toEqual([source]);
    const [partition] = scopedQueries({ requestId: "x", connection, sources: [source], kind: "events", filterPattern: "", query: "", startTime: 1, endTime: 2, limit: 10 });
    expect(partition.sources).toEqual([source]);
  });
  it("opens repeated clicks atomically without creating duplicate connections", () => {
    let workspace = createWorkspace();
    const action = { type: "gcp/open-source" as const, connection, source, mode: "preview" as const };
    workspace = workspaceReducer(workspace, action);
    workspace = workspaceReducer(workspace, { ...action, connection: { ...connection, id: "another-id" }, mode: "permanent" });
    expect(workspace.connections.filter((item) => item.mode === "gcp")).toHaveLength(1);
    const tabs = workspace.tabs.filter((item) => item.sources.some((item) => item.gcp));
    expect(tabs).toHaveLength(1);
    expect(tabs[0].preview).toBe(false);
  });
  it("persists the selected Google log type", () => {
    let workspace = createWorkspace();
    workspace = workspaceReducer(workspace, { type: "connections/set", connections: [...workspace.connections, connection] });
    const tab = { ...createTab(connection.id, [source]), gcpLogType: "audit" as const };
    workspace = workspaceReducer(workspace, { type: "tab/open", tab });
    expect(restoreWorkspace(workspaceSchema.parse(workspace)).tabs.find((item) => item.id === tab.id)?.gcpLogType).toBe("audit");
  });
});
