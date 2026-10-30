import { expect, it } from "vitest";
import { favoriteTooltip } from "../src/renderer/favorite-tooltip";
import { createWorkspace } from "../src/renderer/workspace";

function favorite() {
  const state = createWorkspace();
  return {
    id: "favorite",
    title: "orders-api",
    tabs: [structuredClone(state.tabs[0])],
    connections: state.connections,
    timezone: state.preferences.timezone,
  };
}

it("uses only the visible automatic favorite label for one source", () => {
  expect(favoriteTooltip(favorite())).toBe("orders-api");
});

it("keeps useful short source names for renamed and multiple-source favorites", () => {
  const saved = favorite();
  saved.title = "Incident review";
  expect(favoriteTooltip(saved)).toBe(
    "Incident review\n\nSources:\norders-api",
  );
  saved.title = "Mixed Sources";
  saved.tabs[0].sources.push({ logGroup: "/aws/lambda/payments-worker" });
  expect(favoriteTooltip(saved)).toBe(
    "Mixed Sources\n\nSources:\norders-api\npayments-worker",
  );
});

it("retains member names for a split favorite", () => {
  const saved = favorite();
  saved.title = "Incident split";
  saved.tabs.push({
    ...structuredClone(saved.tabs[0]),
    id: "other",
    customTitle: "Requests",
  });
  expect(favoriteTooltip(saved)).toBe(
    "Incident split\n\norders-api\n\nRequests\n\nSources:\norders-api",
  );
});
