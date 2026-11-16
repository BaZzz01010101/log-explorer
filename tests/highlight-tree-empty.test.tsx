// @vitest-environment happy-dom
import { cleanup, render, screen } from "@testing-library/react";
import { MantineProvider } from "@mantine/core";
import { afterEach, expect, it } from "vitest";
import { HighlightTreeEditor } from "../src/renderer/components/HighlightTreeEditor";
import { createWorkspace } from "../src/shared/workspace";

afterEach(cleanup);

// A new workspace has no highlight profiles; opening Highlights must not crash.
it("renders the highlights editor for a workspace without profiles", () => {
  const { preferences } = createWorkspace();
  expect(preferences.highlightProfiles).toEqual([]);
  render(
    <MantineProvider env="test">
      <HighlightTreeEditor preferences={preferences} onChange={() => {}} />
    </MantineProvider>,
  );
  expect(
    screen.getByRole("button", { name: "Add highlight profile" }),
  ).toBeTruthy();
});
