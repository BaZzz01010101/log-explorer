import { describe, expect, it } from "vitest";
import {
  navigateResourceTree,
  type ResourceRow,
} from "../src/renderer/components/ResourceSidebar";

const one = { name: "/one" };
const two = { name: "/two" };
const rows: ResourceRow[] = [
  { kind: "group", group: one },
  { kind: "loading", group: one },
  { kind: "stream", group: one, stream: { name: "stream-a" } },
  { kind: "more", group: one },
  { kind: "group", group: two },
  { kind: "stream", group: two, stream: { name: "stream-b" } },
];

describe("resource tree keyboard navigation", () => {
  it("moves by logical rows while skipping loading indicators", () => {
    expect(navigateResourceTree(rows, new Set(), 0, "ArrowDown")).toEqual({
      index: 2,
    });
    expect(navigateResourceTree(rows, new Set(), 2, "ArrowUp")).toEqual({
      index: 0,
    });
    expect(navigateResourceTree(rows, new Set(), 5, "ArrowDown")).toEqual({
      index: 5,
    });
    expect(navigateResourceTree(rows, new Set(), -1, "ArrowDown")).toEqual({
      index: 0,
    });
    expect(navigateResourceTree(rows, new Set(), 0, "End")).toEqual({
      index: 5,
    });
    expect(navigateResourceTree(rows, new Set(), 5, "Home")).toEqual({
      index: 0,
    });
    expect(navigateResourceTree(rows, new Set(), 0, "PageDown", 2)).toEqual({
      index: 3,
    });
    expect(navigateResourceTree(rows, new Set(), 5, "PageUp", 2)).toEqual({
      index: 3,
    });
  });

  it("expands groups before entering children and collapses or returns to parent", () => {
    expect(navigateResourceTree(rows, new Set(), 0, "ArrowRight")).toEqual({
      index: 0,
      action: "expand",
    });
    expect(
      navigateResourceTree(rows, new Set(["/one"]), 0, "ArrowRight"),
    ).toEqual({ index: 2 });
    expect(
      navigateResourceTree(rows, new Set(["/one"]), 0, "ArrowLeft"),
    ).toEqual({ index: 0, action: "collapse" });
    expect(
      navigateResourceTree(rows, new Set(["/one"]), 2, "ArrowLeft"),
    ).toEqual({ index: 0 });
    expect(
      navigateResourceTree(rows, new Set(["/one"]), 3, "ArrowLeft"),
    ).toEqual({ index: 0 });
    expect(navigateResourceTree(rows, new Set(), 0, "ArrowLeft")).toEqual({
      index: 0,
    });
  });

  it("opens sources and toggles group selections without treating streams as groups", () => {
    expect(navigateResourceTree(rows, new Set(), 0, "Enter")).toEqual({
      index: 0,
      action: "open",
    });
    expect(navigateResourceTree(rows, new Set(), 2, "Enter")).toEqual({
      index: 2,
      action: "open",
    });
    expect(navigateResourceTree(rows, new Set(), 3, "Enter")).toEqual({
      index: 3,
      action: "load",
    });
    expect(navigateResourceTree(rows, new Set(), 0, " ")).toEqual({
      index: 0,
      action: "select",
    });
    expect(navigateResourceTree(rows, new Set(), 2, " ")).toEqual({ index: 2 });
  });

  it("handles emptied trees and keeps native shortcut keys available", () => {
    expect(navigateResourceTree([], new Set(), -1, "ArrowDown")).toBeNull();
    expect(
      navigateResourceTree(
        [{ kind: "loading", group: one }],
        new Set(),
        0,
        "Enter",
      ),
    ).toBeNull();
    expect(navigateResourceTree(rows, new Set(), 0, "c")).toBeNull();
    expect(navigateResourceTree(rows, new Set(), 0, "Tab")).toBeNull();
  });
});
