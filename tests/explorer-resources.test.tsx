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
}: {
  visible?: string[];
  search?: string;
  connections?: Connection[];
}) {
  result = useExplorerResources(connections, visible, search);
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
afterEach(async () => {
  await act(async () => renderer?.unmount());
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  groups.mockReset();
  streams.mockReset();
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
