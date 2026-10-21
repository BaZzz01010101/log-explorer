import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { useExplorerResources } from "../src/renderer/useExplorerResources";
import type { Connection } from "../src/shared/contracts";
const east: Connection = {
  id: "east",
  name: "East",
  profile: "p",
  region: "us-east-1",
  mode: "offline",
};
const west = { ...east, id: "west", region: "eu-west-1" };
let renderer: ReactTestRenderer,
  result: ReturnType<typeof useExplorerResources>;
const groups = vi.fn(),
  streams = vi.fn();
function Probe({
  visible = ["east"],
  search = "",
  connections = [east, west],
  refreshKey = 0,
  regex = false,
  caseSensitive = true,
}: {
  visible?: string[];
  search?: string;
  connections?: Connection[];
  refreshKey?: number;
  regex?: boolean;
  caseSensitive?: boolean;
}) {
  result = useExplorerResources(
    connections,
    visible,
    search,
    refreshKey,
    regex,
    caseSensitive,
  );
  return null;
}
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("window", {
    explorer: { listGroups: groups, listStreams: streams },
  });
  groups.mockResolvedValue({ items: [] });
  streams.mockResolvedValue({ items: [] });
  const error = console.error.bind(console);
  vi.spyOn(console, "error").mockImplementation((...args) => {
    if (!String(args[0]).includes("react-test-renderer is deprecated"))
      error(...args);
  });
});

it("finds case-insensitive literal matches across unfiltered pages and invalidates them when case changes", async () => {
  groups.mockImplementation(async (_connection, search, cursor) => {
    if (search) return { items: [{ name: "/orders.literal" }] };
    return cursor
      ? { items: [{ name: "/Orders.Literal" }, { name: "/orders.literal" }] }
      : { items: [{ name: "/ordersXliteral" }], cursor: "next" };
  });
  await act(async () => {
    renderer = create(<Probe search="orders.literal" caseSensitive={false} />);
  });
  expect(groups.mock.calls).toEqual([
    [east, "", undefined],
    [east, "", "next"],
  ]);
  expect(result.cache.east.groups.items.map((item) => item.name)).toEqual([
    "/Orders.Literal",
    "/orders.literal",
  ]);
  await act(async () =>
    renderer.update(<Probe search="orders.literal" caseSensitive />),
  );
  expect(result.cache.east.groups.items).toEqual([{ name: "/orders.literal" }]);
});

it("scans unfiltered pages for regex matches beyond the first page without scrolling", async () => {
  class RegexWorker {
    onmessage?: (event: { data: unknown }) => void;
    onerror?: () => void;
    constructor() {
      queueMicrotask(() => this.onmessage?.({ data: { ready: true } }));
    }
    postMessage({ pattern, names }: { pattern: string; names: string[] }) {
      try {
        const regex = new RegExp(pattern);
        queueMicrotask(() =>
          this.onmessage?.({
            data: {
              matches: names.flatMap((name, index) =>
                regex.test(name) ? [index] : [],
              ),
            },
          }),
        );
      } catch {
        queueMicrotask(() =>
          this.onmessage?.({ data: { error: "Invalid regular expression" } }),
        );
      }
    }
    terminate() {}
  }
  vi.stubGlobal("Worker", RegexWorker);
  groups.mockImplementation(async (_connection, _search, cursor) =>
    cursor
      ? { items: [{ name: "/orders-api" }] }
      : { items: [{ name: "/unrelated" }], cursor: "next" },
  );
  await act(async () => {
    renderer = create(<Probe search="orders-(api|worker)$" regex />);
  });
  expect(groups.mock.calls).toEqual([
    [east, "", undefined],
    [east, "", "next"],
  ]);
  expect(result.cache.east.groups.items).toEqual([{ name: "/orders-api" }]);
  expect(result.cache.east.groups.loading).toBe(false);
  expect(result.cache.east.groups.cursor).toBeUndefined();
  await act(async () => renderer.update(<Probe search="[" regex />));
  expect(result.cache.east.groups.error).toContain(
    "Invalid regular expression",
  );
  expect(groups).toHaveBeenCalledTimes(2);
});

it("restarts an interrupted regex scan when its region becomes visible again", async () => {
  class RegexWorker {
    onmessage?: (event: { data: unknown }) => void;
    constructor() {
      queueMicrotask(() => this.onmessage?.({ data: { ready: true } }));
    }
    postMessage({ names }: { names: string[] }) {
      queueMicrotask(() =>
        this.onmessage?.({ data: { matches: names.map((_, index) => index) } }),
      );
    }
    terminate() {}
  }
  vi.stubGlobal("Worker", RegexWorker);
  let finishOld: (value: unknown) => void = () => {};
  groups
    .mockResolvedValueOnce({ items: [{ name: "/first" }], cursor: "next" })
    .mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finishOld = resolve;
        }),
    )
    .mockResolvedValue({ items: [{ name: "/fresh" }] });
  await act(async () => {
    renderer = create(<Probe search=".*" regex />);
  });
  expect(result.cache.east.groups.loading).toBe(true);
  await act(async () =>
    renderer.update(<Probe search=".*" regex visible={[]} />),
  );
  await act(async () => renderer.update(<Probe search=".*" regex />));
  expect(groups).toHaveBeenCalledTimes(3);
  expect(result.cache.east.groups.items).toEqual([{ name: "/fresh" }]);
  expect(result.cache.east.groups.loading).toBe(false);
  await act(async () => finishOld({ items: [{ name: "/stale" }] }));
  expect(result.cache.east.groups.items).toEqual([{ name: "/fresh" }]);
});

it("retries failed resources after access is enabled and ignores the disabled generation", async () => {
  groups.mockRejectedValueOnce(new Error("AWS access is disabled"));
  await act(async () => {
    renderer = create(<Probe />);
  });
  expect(result.cache.east.groups.error).toContain("disabled");
  groups.mockResolvedValueOnce({ items: [{ name: "/fresh" }] });
  await act(async () => renderer.update(<Probe refreshKey={1} />));
  expect(result.cache.east.groups.items).toEqual([{ name: "/fresh" }]);
  expect(result.cache.east.groups.error).toBeUndefined();
});
afterEach(async () => {
  await act(async () => renderer?.unmount());
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  groups.mockReset();
  streams.mockReset();
});
it("sorts stream pages by newest event after merging, leaving streams without events last", async () => {
  await act(async () => {
    renderer = create(<Probe />);
  });
  streams.mockResolvedValueOnce({
    items: [{ name: "old", lastEventTime: 1 }, { name: "none" }],
    cursor: "next",
  });
  await act(async () => result.loadStreams("east", "/same"));
  streams.mockResolvedValueOnce({
    items: [
      { name: "new", lastEventTime: 3 },
      { name: "middle", lastEventTime: 2 },
    ],
  });
  await act(async () => result.loadStreams("east", "/same", true));
  expect(
    result.cache.east.streams["/same"].items.map((stream) => stream.name),
  ).toEqual(["new", "middle", "old", "none"]);
});
it("fetches only expanded regions, caches them independently and suppresses repeated opaque cursors", async () => {
  groups.mockImplementation(
    async (connection: Connection, _search: string, cursor?: string) => ({
      items: [{ name: connection.id }],
      cursor: connection.id === "east" ? "same-token" : undefined,
    }),
  );
  await act(async () => {
    renderer = create(<Probe />);
  });
  expect(groups).toHaveBeenCalledTimes(1);
  expect(result.cache.west).toBeUndefined();
  await act(async () => renderer.update(<Probe visible={["east", "west"]} />));
  expect(groups).toHaveBeenCalledTimes(2);
  await act(async () => result.loadGroups("east", true));
  expect(result.cache.east.groups.cursor).toBeUndefined();
  expect(result.cache.west.groups.items[0].name).toBe("west");
  await act(async () => result.loadGroups("east", true));
  expect(groups).toHaveBeenCalledTimes(3);
});
it("rejects stale search responses and keeps equal group names isolated by region", async () => {
  let old: (value: unknown) => void = () => {};
  groups
    .mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          old = resolve;
        }),
    )
    .mockResolvedValue({ items: [{ name: "/same" }] });
  await act(async () => {
    renderer = create(<Probe />);
  });
  await act(async () =>
    renderer.update(<Probe visible={["east", "west"]} search="new" />),
  );
  await act(async () => old({ items: [{ name: "/old" }] }));
  expect(result.cache.east.groups.items.map((group) => group.name)).toEqual([
    "/same",
  ]);
  expect(result.cache.west.groups.items.map((group) => group.name)).toEqual([
    "/same",
  ]);
  streams.mockImplementation(async (connection: Connection) => ({
    items: [{ name: connection.id + "-stream" }],
  }));
  await act(async () => {
    await Promise.all([
      result.loadStreams("east", "/same"),
      result.loadStreams("west", "/same"),
    ]);
  });
  expect(result.cache.east.streams["/same"].items[0].name).toBe("east-stream");
  expect(result.cache.west.streams["/same"].items[0].name).toBe("west-stream");
});
it("re-enables a region during an old pending request without accepting its stale error", async () => {
  let failOld: (reason: Error) => void = () => {};
  groups
    .mockImplementationOnce(
      () =>
        new Promise((_resolve, reject) => {
          failOld = reject;
        }),
    )
    .mockResolvedValue({ items: [{ name: "/fresh" }] });
  await act(async () => {
    renderer = create(<Probe connections={[east]} />);
  });
  await act(async () => renderer.update(<Probe connections={[]} />));
  await act(async () => renderer.update(<Probe connections={[east]} />));
  expect(groups).toHaveBeenCalledTimes(2);
  await act(async () => failOld(new Error("stale error")));
  expect(result.cache.east.groups.items).toEqual([{ name: "/fresh" }]);
  expect(result.cache.east.groups.error).toBeUndefined();
});

it("invalidates a pending stream request when refreshing its region", async () => {
  groups.mockResolvedValue({ items: [{ name: "/same" }] });
  let finishOld: (value: unknown) => void = () => {};
  streams
    .mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finishOld = resolve;
        }),
    )
    .mockResolvedValue({ items: [{ name: "fresh" }] });
  await act(async () => {
    renderer = create(<Probe />);
  });
  let oldRequest: Promise<void>;
  await act(async () => {
    oldRequest = result.loadStreams("east", "/same");
  });
  await act(async () => result.loadGroups("east"));
  await act(async () => result.loadStreams("east", "/same"));
  expect(streams).toHaveBeenCalledTimes(2);
  await act(async () => {
    finishOld({ items: [{ name: "stale" }] });
    await oldRequest;
  });
  expect(result.cache.east.streams["/same"].items).toEqual([{ name: "fresh" }]);
});
