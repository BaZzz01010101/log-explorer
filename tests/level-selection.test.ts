import { describe, expect, it } from "vitest";
import { matchesLocalFilter, parseLogMessage } from "../src/shared/log-data";
import { createWorkspace, restoreWorkspace } from "../src/renderer/workspace";
import { workspaceSchema } from "../src/main/security";
import type { LogEvent } from "../src/shared/contracts";

describe("multiple local levels", () => {
  const match = (level: string, levels: string[], query = "") => {
    const event: LogEvent = {
      id: level,
      timestamp: 0,
      message: JSON.stringify({ level, message: "needle" }),
      logGroup: "/test",
      logStream: "stream",
    };
    return matchesLocalFilter(
      event,
      parseLogMessage(event.message),
      query,
      levels,
    );
  };
  it("includes any checked level and still applies local text", () => {
    expect(match("info", ["info", "error"])).toBe(true);
    expect(match("error", ["info", "error"])).toBe(true);
    expect(match("warn", ["info", "error"])).toBe(false);
    expect(match("error", ["info", "error"], "absent")).toBe(false);
    expect(match("error", ["info", "error"], "needle")).toBe(true);
  });
  it("treats an explicitly empty selection as no matching events", () => {
    expect(match("info", [])).toBe(false);
    expect(match("other", ["unknown"])).toBe(true);
  });
  it("migrates legacy single levels and all without losing explicit empty selections", () => {
    const workspace = createWorkspace();
    delete workspace.tabs[0].view.levels;
    workspace.tabs[0].view.level = "error";
    expect(restoreWorkspace(workspace).tabs[0].view.levels).toEqual(["error"]);
    workspace.tabs[0].view.level = "all";
    expect(restoreWorkspace(workspace).tabs[0].view.levels).toEqual([
      "trace",
      "debug",
      "info",
      "warn",
      "error",
      "fatal",
      "unknown",
    ]);
    Object.assign(workspace.tabs[0].view, { levels: [] });
    expect(restoreWorkspace(workspace).tabs[0].view.levels).toEqual([]);
    Object.assign(workspace.tabs[0].view, {
      levels: ["error", "info", "error", "invalid"],
    });
    expect(restoreWorkspace(workspace).tabs[0].view.levels).toEqual([
      "error",
      "info",
    ]);
  });
  it("preserves level selections across validation and restore", () => {
    const workspace = createWorkspace();
    Object.assign(workspace.tabs[0].view, { levels: ["info", "error"] });
    const restored = restoreWorkspace(workspaceSchema.parse(workspace));
    expect(restored.tabs[0].view.levels).toEqual(["info", "error"]);
    Object.assign(workspace.tabs[0].view, { levels: [] });
    expect(workspaceSchema.parse(workspace).tabs[0].view.levels).toEqual([]);
  });
  it("rejects unsupported or unbounded level selections at the IPC boundary", () => {
    const workspace = createWorkspace();
    Object.assign(workspace.tabs[0].view, { levels: ["invalid"] });
    expect(workspaceSchema.safeParse(workspace).success).toBe(false);
    Object.assign(workspace.tabs[0].view, { levels: Array(8).fill("info") });
    expect(workspaceSchema.safeParse(workspace).success).toBe(false);
  });
});
