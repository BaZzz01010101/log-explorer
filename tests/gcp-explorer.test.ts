import { describe, expect, it, vi } from "vitest";
import {
  createGcpExplorer,
  createGoogleRequest,
} from "../src/main/gcp-explorer";
import {
  createWorkspace,
  restoreWorkspace,
  workspaceReducer,
} from "../src/renderer/workspace";
import { workspaceSchema } from "../src/main/security";

describe("GCP explorer", () => {
  it("authorizes each request using the selected CLI identity without exposing the token", async () => {
    const getToken = vi.fn().mockResolvedValue("private-token");
    const transport = vi
      .fn()
      .mockResolvedValue(
        new Response(JSON.stringify({ projects: [] }), { status: 200 }),
      );
    const request = createGoogleRequest(getToken, transport);
    const identity = {
      configuration: "work",
      account: "user@example.com",
      quotaProject: "billing-project",
    };
    await request(
      {
        url: "https://cloudresourcemanager.googleapis.com/v1/projects",
        params: { pageSize: 100 },
        timeout: 30000,
      },
      identity,
    );
    expect(getToken).toHaveBeenCalledWith(identity);
    expect(transport.mock.calls[0][1].headers).toMatchObject({
      Authorization: "Bearer private-token",
      "X-Goog-User-Project": "billing-project",
    });
  });
  it("preserves the last selected project through workspace persistence", () => {
    const workspace = workspaceReducer(createWorkspace(), {
      type: "preferences/update",
      patch: {
        gcpProjectId: "demo-123",
        gcpConfiguration: "work",
        gcpAccount: "user@example.com",
      },
    });
    expect(workspaceSchema.safeParse(workspace).success).toBe(true);
    expect(restoreWorkspace(workspace).preferences.gcpProjectId).toBe(
      "demo-123",
    );
    expect(restoreWorkspace(workspace).preferences.gcpConfiguration).toBe(
      "work",
    );
    expect(restoreWorkspace(workspace).preferences.gcpAccount).toBe(
      "user@example.com",
    );
  });
  it("lists accessible projects and preserves pagination", async () => {
    const request = vi.fn().mockResolvedValue({
      data: {
        projects: [
          { projectId: "demo-123", name: "Demo", lifecycleState: "ACTIVE" },
          {
            projectId: "old-123",
            name: "Old",
            lifecycleState: "DELETE_REQUESTED",
          },
        ],
        nextPageToken: "next",
      },
    });
    const explorer = createGcpExplorer(request);
    expect(await explorer.projects()).toEqual({
      items: [{ id: "demo-123", name: "Demo" }],
      cursor: "next",
    });
    expect(request.mock.calls[0][0]).toMatchObject({
      url: "https://cloudresourcemanager.googleapis.com/v1/projects",
      params: { pageSize: 100 },
    });
  });

  it("lists logs only within a validated project and decodes log labels", async () => {
    const request = vi.fn().mockResolvedValue({
      data: {
        logNames: [
          "projects/demo-123/logs/cloudfunctions.googleapis.com%2Fcloud-functions",
        ],
        nextPageToken: "more",
      },
    });
    const explorer = createGcpExplorer(request);
    expect(await explorer.logs("demo-123", "token")).toEqual({
      items: [
        {
          name: "projects/demo-123/logs/cloudfunctions.googleapis.com%2Fcloud-functions",
          label: "cloudfunctions.googleapis.com/cloud-functions",
        },
      ],
      cursor: "more",
    });
    expect(request.mock.calls[0][0]).toMatchObject({
      url: "https://logging.googleapis.com/v2/projects/demo-123/logs",
      params: { pageSize: 100, pageToken: "token" },
    });
    await expect(explorer.logs("../other")).rejects.toThrow();
    expect(request).toHaveBeenCalledTimes(1);
  });

  it("accepts project numbers when Google returns canonical project IDs", async () => {
    const request = vi.fn().mockResolvedValue({
      data: { logNames: ["projects/demo-123/logs/stdout"] },
    });
    const explorer = createGcpExplorer(request);
    expect(await explorer.logs("123456789012")).toEqual({
      items: [{ name: "projects/demo-123/logs/stdout", label: "stdout" }],
    });
  });
});
