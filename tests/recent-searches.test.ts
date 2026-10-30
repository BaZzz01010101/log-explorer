import { describe, expect, it } from "vitest";
import { workspaceSchema } from "../src/main/security";
import {
  createWorkspace,
  restoreWorkspace,
  workspaceReducer,
} from "../src/renderer/workspace";
import type { SavedQuery } from "../src/shared/contracts";

const query = (index: number): SavedQuery => ({
  id: `search-${index}`,
  name: `Search ${index}`,
  kind: "events",
  filterMode: "plain",
  text: `search ${index}`,
});

describe("recent searches preference", () => {
  it("keeps the latest 30 searches by default", () => {
    let workspace = createWorkspace();
    for (let index = 0; index < 35; index++)
      workspace = workspaceReducer(workspace, {
        type: "history/add",
        query: query(index),
      });
    expect(workspace.history).toHaveLength(30);
    expect(workspace.history[0].id).toBe("search-34");
    expect(workspace.history.at(-1)?.id).toBe("search-5");
  });

  it("honors a restored count and trims existing history when it is reduced", () => {
    let workspace = restoreWorkspace({
      ...createWorkspace(),
      preferences: {
        ...createWorkspace().preferences,
        recentSearchesLimit: 50,
      },
      history: Array.from({ length: 60 }, (_, index) => query(index)),
    });
    expect(workspace.history).toHaveLength(50);
    workspace = workspaceReducer(workspace, {
      type: "preferences/update",
      patch: { recentSearchesLimit: 12 },
    });
    expect(workspace.history.map((item) => item.id)).toEqual(
      Array.from({ length: 12 }, (_, index) => `search-${index}`),
    );
    workspace = workspaceReducer(workspace, {
      type: "history/add",
      query: query(7),
    });
    expect(workspace.history).toHaveLength(12);
    expect(workspace.history[0].id).toBe("search-7");
  });

  it.each([
    [undefined, 30],
    [Number.NaN, 30],
    [0, 1],
    [1000, 100],
    [12.8, 13],
  ])("normalizes count %s to %s", (value, expected) => {
    const workspace = restoreWorkspace({
      ...createWorkspace(),
      preferences: { recentSearchesLimit: value },
    });
    expect(workspace.preferences.recentSearchesLimit).toBe(expected);
  });

  it("persists the count at the security boundary and rejects out-of-range values", () => {
    const workspace = createWorkspace();
    workspace.preferences.recentSearchesLimit = 75;
    expect(
      workspaceSchema.parse(workspace).preferences.recentSearchesLimit,
    ).toBe(75);
    workspace.preferences.recentSearchesLimit = 101;
    expect(workspaceSchema.safeParse(workspace).success).toBe(false);
  });
});
