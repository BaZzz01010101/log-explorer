import { expect, it } from "vitest";
import {
  buildExplorerRows,
  groupKey,
  navigateExplorer,
} from "../src/renderer/explorer-tree";
import {
  resourceScope,
  type RegionResources,
} from "../src/renderer/useExplorerResources";
import type { Connection } from "../src/shared/contracts";
const east: Connection = {
  id: "east",
  name: "East",
  profile: "production",
  region: "us-east-1",
  mode: "aws",
};
const west = { ...east, id: "west", region: "eu-west-1" };
const data = (connection: Connection): RegionResources => ({
  scope: resourceScope(connection, ""),
  groups: { items: [{ name: "/same" }], loaded: true },
  streams: { "/same": { items: [{ name: "stream" }], loaded: true } },
});
it("contains only groups and streams from the selected region with levels one and two", () => {
  const rows = buildExplorerRows(
    east,
    new Set([groupKey(east.id, "/same")]),
    { east: data(east), west: data(west) },
    "",
  );
  expect(rows.map((row) => row.kind)).toEqual(["group", "stream"]);
  expect(rows.map((row) => row.level)).toEqual([1, 2]);
  expect(rows.every((row) => row.connection.id === "east")).toBe(true);
  expect(rows[0].parent).toBeUndefined();
  expect(rows[1].parent).toBe(rows[0].key);
});
it("retains distinct keys for equal names across regions and ignores stale search caches", () => {
  const cache = { east: data(east), west: data(west) };
  const first = buildExplorerRows(east, new Set(), cache, "");
  const second = buildExplorerRows(west, new Set(), cache, "");
  expect(first[0].key).not.toBe(second[0].key);
  expect(
    buildExplorerRows(east, new Set(), cache, "changed").map((row) => row.kind),
  ).toEqual(["loading"]);
  expect(buildExplorerRows(undefined, new Set(), cache, "")).toEqual([]);
});
it("navigates groups and streams without adding account or region keyboard stops", () => {
  const rows = buildExplorerRows(
    east,
    new Set([groupKey(east.id, "/same")]),
    { east: data(east) },
    "",
  );
  const expanded = new Set([groupKey(east.id, "/same")]);
  expect(navigateExplorer(rows, expanded, 0, "ArrowRight")).toEqual({
    index: 1,
  });
  expect(navigateExplorer(rows, expanded, 1, "ArrowLeft")).toEqual({
    index: 0,
  });
  expect(navigateExplorer(rows, expanded, 0, "ArrowLeft")).toEqual({
    index: 0,
    action: "toggle",
  });
  expect(navigateExplorer(rows, new Set(), 0, "ArrowLeft")).toEqual({
    index: 0,
  });
  expect(navigateExplorer(rows, expanded, 0, " ")).toEqual({
    index: 0,
    action: "select",
  });
  expect(navigateExplorer(rows, expanded, 1, "Enter")).toEqual({
    index: 1,
    action: "open",
  });
});
