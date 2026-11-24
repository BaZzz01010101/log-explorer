import { expect, it } from "vitest";
import type { ColumnConfig } from "../src/shared/contracts";
import {
  applyColumnAction,
  insertColumn,
  type ColumnAction,
} from "../src/renderer/column-actions";
import { workspaceSchema } from "../src/main/security";
import { createWorkspace, restoreWorkspace } from "../src/shared/workspace";

const columns: ColumnConfig[] = [
  { path: "a", width: 210, pinned: true },
  { path: "hidden", width: 115, hidden: true, format: "json" },
  { path: "b", width: 80 },
  { path: "c", width: 330, pinned: true, format: "bytes" },
  { path: "d", width: 420 },
];
const display = (config: ColumnConfig[]) =>
  [
    ...config.filter((column) => !column.hidden && column.pinned),
    ...config.filter((column) => !column.hidden && !column.pinned),
  ].map((column) => [column.path, !!column.pinned]);

it("pins one column next to the last pinned column without losing hidden slots or formats", () => {
  const result = applyColumnAction(columns, "d", "pin");
  expect(display(result)).toEqual([
    ["a", true],
    ["c", true],
    ["d", true],
    ["b", false],
  ]);
  expect(result[1]).toBe(columns[1]);
  expect(result.find((column) => column.path === "c")).toEqual({
    path: "c",
    width: 330,
    pinned: true,
    format: "bytes",
  });
  expect(columns[4].pinned).toBeUndefined();
});

it("pins the displayed prefix including the clicked column while keeping its order", () => {
  const result = applyColumnAction(columns, "b", "pin-left");
  expect(display(result)).toEqual([
    ["a", true],
    ["c", true],
    ["b", true],
    ["d", false],
  ]);
  expect(result[1]).toBe(columns[1]);
});

it("unpins one column into the front of the unpinned pool", () => {
  expect(display(applyColumnAction(columns, "a", "unpin"))).toEqual([
    ["c", true],
    ["a", false],
    ["b", false],
    ["d", false],
  ]);
});

it("unpins the displayed suffix including the clicked column without changing its order", () => {
  expect(display(applyColumnAction(columns, "c", "unpin-right"))).toEqual([
    ["a", true],
    ["c", false],
    ["b", false],
    ["d", false],
  ]);
});

it("moves a column one place within its pinning pool in displayed order", () => {
  expect(display(applyColumnAction(columns, "c", "move-left"))).toEqual([
    ["c", true],
    ["a", true],
    ["b", false],
    ["d", false],
  ]);
  expect(display(applyColumnAction(columns, "b", "move-right"))).toEqual([
    ["a", true],
    ["c", true],
    ["d", false],
    ["b", false],
  ]);
});

it("keeps unavailable, hidden, idempotent and pool-boundary actions stable", () => {
  expect(applyColumnAction(columns, "a", "move-left")).toBe(columns);
  expect(applyColumnAction(columns, "c", "move-right")).toBe(columns);
  expect(applyColumnAction(columns, "b", "move-left")).toBe(columns);
  expect(applyColumnAction(columns, "d", "move-right")).toBe(columns);
  expect(applyColumnAction(columns, "a", "pin")).toBe(columns);
  expect(applyColumnAction(columns, "d", "unpin")).toBe(columns);
  expect(applyColumnAction(columns, "c", "pin-left")).toBe(columns);
  expect(applyColumnAction(columns, "b", "unpin-right")).toBe(columns);
  expect(applyColumnAction(columns, "hidden", "move-left")).toBe(columns);
  expect(applyColumnAction(columns, "missing", "unpin")).toBe(columns);
});

it("allows the column editor to pin and unpin hidden columns without moving their slots", () => {
  const pinned = applyColumnAction(columns, "hidden", "pin");
  expect(pinned[1]).toEqual({
    path: "hidden",
    width: 115,
    hidden: true,
    format: "json",
    pinned: true,
  });
  expect(pinned.map((column) => column.path)).toEqual([
    "a",
    "hidden",
    "b",
    "c",
    "d",
  ]);
  const unpinned = applyColumnAction(pinned, "hidden", "unpin");
  expect(unpinned[1].pinned).toBe(false);
  expect(unpinned[1].hidden).toBe(true);
});

it("removes a custom column without changing the remaining configuration", () => {
  const result = applyColumnAction(columns, "c", "remove");
  expect(result).toEqual(columns.filter((column) => column.path !== "c"));
  expect(result[1]).toBe(columns[1]);
});

it.each(["@timestamp", "@level", "@message", "@source"])(
  "hides protected %s instead of removing it",
  (path) => {
    const config = [{ path, width: 240, pinned: true }, ...columns];
    const result = applyColumnAction(config, path, "remove");
    expect(result[0]).toEqual({ ...config[0], hidden: true });
    expect(result.slice(1)).toEqual(columns);
    expect(applyColumnAction(result, path, "remove")).toBe(result);
  },
);

it("keeps at least one visible column and ignores a stale menu target", () => {
  const config = [{ path: "/last", width: 180 }];
  expect(applyColumnAction(config, "/last", "remove")).toBe(config);
  expect(applyColumnAction(config, "/missing", "remove")).toBe(config);
});

/** Columns by path; a leading * marks a pinned one, a leading - a hidden one. */
const layout = (text: string): ColumnConfig[] =>
  text.split(" ").map((name) => ({
    path: name.replace(/^[*-]/, ""),
    width: 100,
    ...(name.startsWith("*") ? { pinned: true } : {}),
    ...(name.startsWith("-") ? { hidden: true } : {}),
  }));
const shown = (config: ColumnConfig[]) =>
  display(config)
    .map(([path, pinned]) => (pinned ? "*" : "") + path)
    .join(" ");
const act = (config: ColumnConfig[], ...steps: [string, ColumnAction][]) =>
  steps.reduce(
    (current, [path, action]) => applyColumnAction(current, path, action),
    config,
  );
/** The same columns in a new order, e.g. after moves, removals and additions. */
const arrange = (config: ColumnConfig[], text: string) =>
  layout(text).map(
    (entry) => config.find((column) => column.path === entry.path) ?? entry,
  );

it("returns an unpinned column between its former neighbors", () => {
  const pinned = act(layout("*t a b c d"), ["c", "pin"]);
  expect(shown(pinned)).toBe("*t *c a b d");
  const back = act(pinned, ["c", "unpin"]);
  expect(shown(back)).toBe("*t a b c d");
  expect(back.every((column) => !("home" in column))).toBe(true);
  expect(shown(act(pinned, ["a", "move-right"], ["c", "unpin"]))).toBe(
    "*t b c a d",
  );
});

it.each([
  ["a column was added between the neighbors", "*t *c a b x d", "*t a b c x d"],
  ["the right neighbor moved away", "*t *c d a b", "*t d a b c"],
  ["the right neighbor was removed", "*t *c a b", "*t a b c"],
  ["the left neighbor was removed", "*t *c a x d", "*t a x c d"],
  ["the left neighbor was hidden", "*t *c a -b x d", "*t a x c d"],
  ["both neighbors were removed", "*t *c a x", "*t c a x"],
])("unpins a column when %s", (_name, changed, expected) => {
  const pinned = act(layout("*t a b c d"), ["c", "pin"]);
  const config = arrange(pinned, changed).map((column) =>
    column.path === "b" && changed.includes("-b")
      ? { ...column, hidden: true }
      : column,
  );
  expect(shown(act(config, ["c", "unpin"]))).toBe(expected);
});

it("uses a neighbor that is pinned only at the pinning boundary", () => {
  // The left neighbor is the last pinned column: still directly beside it.
  expect(
    shown(
      act(layout("*t a b c"), ["a", "pin"], ["c", "move-left"], ["a", "unpin"]),
    ),
  ).toBe("*t a c b");
  // Another pinned column lies between, but it does not belong there.
  expect(
    shown(
      act(
        layout("*t a b c d"),
        ["a", "pin"],
        ["d", "pin"],
        ["b", "move-right"],
        ["a", "unpin"],
      ),
    ),
  ).toBe("*t *d a c b");
});

it.each([
  [
    ["b", "a"],
    ["b", "a"],
  ],
  [
    ["b", "a"],
    ["a", "b"],
  ],
  [
    ["a", "b"],
    ["a", "b"],
  ],
  [
    ["a", "b"],
    ["b", "a"],
  ],
  [
    ["c", "a"],
    ["a", "c"],
  ],
  [
    ["c", "b", "a"],
    ["b", "c", "a"],
  ],
  [
    ["c", "b", "a"],
    ["a", "c", "b"],
  ],
])("restores the order after pinning %j and unpinning %j", (pins, unpins) => {
  const config = act(
    layout("*t a b c d"),
    ...pins.map((path): [string, ColumnAction] => [path, "pin"]),
    ...unpins.map((path): [string, ColumnAction] => [path, "unpin"]),
  );
  expect(shown(config)).toBe("*t a b c d");
});

it("restores the order after pinning and unpinning in any order", () => {
  const orders = (list: string[]): string[][] =>
    list.length < 2
      ? [list]
      : list.flatMap((item) =>
          orders(list.filter((other) => other !== item)).map((rest) => [
            item,
            ...rest,
          ]),
        );
  const wrong: string[] = [];
  for (const pins of orders(["a", "b", "c", "d"]))
    for (const unpins of orders(["a", "b", "c", "d"])) {
      const config = act(
        layout("*t a b c d e"),
        ...pins.map((path): [string, ColumnAction] => [path, "pin"]),
        ...unpins.map((path): [string, ColumnAction] => [path, "unpin"]),
      );
      if (shown(config) !== "*t a b c d e")
        wrong.push(`${pins} / ${unpins}: ${shown(config)}`);
    }
  expect(wrong).toEqual([]);
});

it("restores columns pinned and unpinned together", () => {
  const pinned = act(layout("*t a b c d"), ["b", "pin-left"]);
  expect(shown(pinned)).toBe("*t *a *b c d");
  expect(shown(act(pinned, ["a", "unpin-right"]))).toBe("*t a b c d");
  const single = act(layout("*t a b c d"), ["d", "pin"], ["b", "pin"]);
  expect(shown(single)).toBe("*t *d *b a c");
  expect(shown(act(single, ["d", "unpin-right"]))).toBe("*t a b c d");
});

it("keeps hidden column slots while restoring", () => {
  const config = layout("*t -h a b c");
  expect(
    act(config, ["c", "pin"], ["c", "unpin"]).map((column) => column.path),
  ).toEqual(["t", "h", "a", "b", "c"]);
});

it.each([
  ["first", "*@timestamp x @level @message /a"],
  ["before-message", "*@timestamp @level x @message /a"],
  ["after-message", "*@timestamp @level @message x /a"],
  ["last", "*@timestamp @level @message /a x"],
] as const)("adds a column %s", (position, expected) => {
  const column = { path: "x", width: 180 };
  expect(
    shown(
      insertColumn(layout("*@timestamp @level @message /a"), column, position),
    ),
  ).toBe(expected);
});

it("adds a column when Message is pinned, hidden or missing", () => {
  const column = { path: "x", width: 180 };
  const add = (
    text: string,
    position: "before-message" | "after-message" | "first",
  ) => shown(insertColumn(layout(text), column, position));
  expect(add("*@timestamp *@message a b", "before-message")).toBe(
    "*@timestamp *@message x a b",
  );
  expect(add("*@timestamp *@message a b", "after-message")).toBe(
    "*@timestamp *@message x a b",
  );
  expect(add("*@timestamp a -@message b", "before-message")).toBe(
    "*@timestamp a x b",
  );
  expect(add("*@timestamp a b", "before-message")).toBe("*@timestamp a b x");
  expect(add("*@timestamp *a", "first")).toBe("*@timestamp *a x");
});

it("stores where pinned columns belong and the new column position", () => {
  const state = createWorkspace();
  state.preferences.newColumnPosition = "after-message";
  state.tabs[0]!.view.columns = act(layout("*@timestamp @level @message"), [
    "@message",
    "pin",
  ]);
  const saved = workspaceSchema.parse(state);
  const restored = restoreWorkspace(JSON.parse(JSON.stringify(saved)));
  expect(restored.preferences.newColumnPosition).toBe("after-message");
  const columns = restored.tabs[0]!.view.columns;
  expect(columns.find((column) => column.path === "@message")?.home).toEqual({
    left: "@level",
  });
  expect(shown(act(columns, ["@message", "unpin"]))).toBe(
    "*@timestamp @level @message",
  );
  expect(
    restoreWorkspace({
      ...JSON.parse(JSON.stringify(saved)),
      preferences: { ...saved.preferences, newColumnPosition: "nowhere" },
    }).preferences.newColumnPosition,
  ).toBe("before-message");
});
