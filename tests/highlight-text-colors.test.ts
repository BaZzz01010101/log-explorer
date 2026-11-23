import { expect, it } from "vitest";
import { workspaceSchema } from "../src/main/security";
import { parsePreferences } from "../src/shared/workspace-parse";
import { createWorkspace } from "../src/shared/workspace";

it("keeps only predefined highlight text colors, separately for each theme", () => {
  const colors = (value: unknown) =>
    parsePreferences({ highlightTextColors: value }).highlightTextColors;
  expect(colors({ light: "pink", dark: "cyan" })).toEqual({
    light: "pink",
    dark: "cyan",
  });
  expect(colors({ light: "#ff0000", dark: "lime" })).toEqual({ dark: "lime" });
  expect(colors("pink")).toEqual({});
  const workspace = createWorkspace();
  workspace.preferences.highlightTextColors = { light: "pink" };
  expect(
    workspaceSchema.parse(workspace).preferences.highlightTextColors,
  ).toEqual({ light: "pink" });
});
