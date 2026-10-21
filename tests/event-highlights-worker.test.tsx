import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { useEventHighlights } from "../src/renderer/useEventHighlights";
import { createWorkspace } from "../src/renderer/workspace";
import type { HighlightProfile } from "../src/shared/highlights";

const workers: FakeWorker[] = [];
class FakeWorker {
  onmessage?: (event: { data: unknown }) => void;
  onerror?: () => void;
  terminate = vi.fn();
  postMessage = vi.fn();
  constructor() {
    workers.push(this);
  }
  send(data: unknown) {
    this.onmessage?.({ data });
  }
}
const profile: HighlightProfile = {
  id: "p",
  name: "p",
  groupPattern: "",
  groupIgnoreCase: false,
  enabled: true,
  rules: [
    {
      id: "r",
      enabled: true,
      pattern: "a+",
      path: "",
      scope: "text",
      target: "row",
      colors: { background: "#ff0000" },
      ignoreCase: false,
      separateThemeColors: false,
    },
  ],
};
const event = {
  id: "one",
  message: "aaa",
  timestamp: 0,
  logGroup: "g",
  logStream: "s",
};
let result: ReturnType<typeof useEventHighlights>;
let renderer: ReactTestRenderer;
function Probe({
  enabled = true,
  overview = false,
  count = 1,
  offset = 0,
  priority,
  message = event.message,
  theme = "dark",
}: {
  enabled?: boolean;
  overview?: boolean;
  count?: number;
  offset?: number;
  priority?: string[];
  message?: string;
  theme?: "light" | "dark";
}) {
  result = useEventHighlights(
    Array.from({ length: count }, (_, index) => ({
      ...event,
      id: index + offset ? String(index + offset) : event.id,
      message,
    })),
    {
      ...createWorkspace().preferences,
      highlightProfiles: [{ ...profile, enabled }],
      theme,
    },
    [],
    overview
      ? { overview: true, needle: "aaa" }
      : priority
        ? { priority }
        : undefined,
  );
  return null;
}
beforeEach(() => {
  vi.useFakeTimers();
  workers.length = 0;
  vi.stubGlobal("Worker", FakeWorker);
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const error = console.error.bind(console);
  vi.spyOn(console, "error").mockImplementation((...args) => {
    if (!String(args[0]).includes("react-test-renderer is deprecated"))
      error(...args);
  });
});

const emptyResult = () => ({ row: {}, text: {} });
async function finishBatch(
  worker: FakeWorker,
  index: number,
  result = emptyResult(),
) {
  const sent = worker.postMessage.mock.calls[index][0].events;
  await act(async () =>
    worker.send({
      batch: sent.map(({ id }: { id: string }) => ({ id, result })),
      done: true,
    }),
  );
}

it("bounds full-result prefetch and reloads evicted rows on demand without recreating the worker", async () => {
  await act(async () => {
    renderer = create(<Probe count={10050} priority={["one"]} />);
  });
  const worker = workers[0];
  for (let index = 0; index < 100; index++) await finishBatch(worker, index);
  expect(result.results.size).toBe(10000);
  expect(worker.postMessage).toHaveBeenCalledTimes(100);
  await act(async () =>
    renderer.update(<Probe count={10050} priority={["10049"]} />),
  );
  expect(
    worker.postMessage.mock.calls[100][0].events.map(
      (item: { id: string }) => item.id,
    ),
  ).toEqual(["10049"]);
  await finishBatch(worker, 100);
  expect(result.results.has("10049")).toBe(true);
  expect(result.results.size).toBeLessThanOrEqual(10000);
  expect(workers).toHaveLength(1);
});

it("stops large text-result prefetch before its cache grows with the full event buffer", async () => {
  await act(async () => {
    renderer = create(<Probe count={1000} priority={["one"]} />);
  });
  const worker = workers[0];
  const largeResult = {
    row: {},
    text: {
      ["message:" + "x".repeat(30000)]: [{ start: 0, end: 1, colors: {} }],
    },
  };
  let completed = 0;
  while (completed < worker.postMessage.mock.calls.length && completed < 10) {
    await finishBatch(worker, completed++, largeResult);
  }
  expect(completed).toBeLessThan(10);
  expect(result.results.size).toBeLessThan(1000);
  await act(async () =>
    renderer.update(<Probe count={1000} priority={["999"]} />),
  );
  expect(worker.postMessage.mock.calls[completed][0].events[0].id).toBe("999");
  await finishBatch(worker, completed, largeResult);
  expect(result.results.has("999")).toBe(true);
  expect(workers).toHaveLength(1);
});

it("invalidates changed content immediately and ignores the previous in-flight result", async () => {
  await act(async () => {
    renderer = create(<Probe />);
  });
  const worker = workers[0];
  await act(async () => renderer.update(<Probe message="changed" />));
  expect(result.results.has("one")).toBe(false);
  await finishBatch(worker, 0, { row: { background: "#ff0000" }, text: {} });
  expect(result.results.has("one")).toBe(false);
  expect(worker.postMessage.mock.calls[1][0].events[0].message).toBe("changed");
  await finishBatch(worker, 1);
  expect(result.results.has("one")).toBe(true);
});

it("invalidates cached content with the same event id and releases removed results", async () => {
  await act(async () => {
    renderer = create(<Probe count={2} />);
  });
  const worker = workers[0];
  await finishBatch(worker, 0, { row: { background: "#ff0000" }, text: {} });
  await act(async () => renderer.update(<Probe message="changed" />));
  expect(result.results.size).toBe(0);
  await finishBatch(worker, 1);
  expect([...result.results.keys()]).toEqual(["one"]);
});

it("clears colors on theme changes and rejects late results from the previous configuration", async () => {
  await act(async () => {
    renderer = create(<Probe />);
  });
  const old = workers[0];
  await finishBatch(old, 0, { row: { background: "#ff0000" }, text: {} });
  await act(async () => renderer.update(<Probe theme="light" />));
  expect(old.terminate).toHaveBeenCalledOnce();
  expect(result.results.size).toBe(0);
  await act(async () =>
    old.send({
      id: "one",
      result: { row: { background: "#ff0000" }, text: {} },
    }),
  );
  expect(result.results.size).toBe(0);
  await finishBatch(workers[1], 0);
  expect(result.results.has("one")).toBe(true);
});

it("viewport changes do not reset the regex timeout or restart a failed session", async () => {
  await act(async () => {
    renderer = create(<Probe count={2} priority={["one"]} />);
  });
  const worker = workers[0];
  await act(async () => worker.send({ ready: true }));
  await act(async () => {
    vi.advanceTimersByTime(250);
  });
  await act(async () => renderer.update(<Probe count={2} priority={["1"]} />));
  await act(async () => {
    vi.advanceTimersByTime(251);
  });
  expect(worker.terminate).toHaveBeenCalledOnce();
  expect(result.error).toContain("regex exceeded");
  await act(async () => renderer.update(<Probe count={3} priority={["2"]} />));
  expect(workers).toHaveLength(1);
  expect(result.error).toContain("regex exceeded");
});

it("overview append preserves existing marks and scans only the new events", async () => {
  await act(async () => {
    renderer = create(<Probe overview />);
  });
  const worker = workers[0];
  await act(async () =>
    worker.send({
      batch: [{ id: "one", result: { row: {}, text: {}, overview: ["red"] } }],
      done: true,
    }),
  );
  await act(async () => renderer.update(<Probe overview count={2} />));
  expect(result.results.get("one")?.overview).toEqual(["red"]);
  expect(
    worker.postMessage.mock.calls[1][0].events.map(
      (item: { id: string }) => item.id,
    ),
  ).toEqual(["1"]);
  expect(workers).toHaveLength(1);
});

it("keeps one worker and retains completed results across fast viewport changes", async () => {
  await act(async () => {
    renderer = create(<Probe count={2} priority={["one"]} />);
  });
  const worker = workers[0];
  await act(async () =>
    worker.send({
      batch: ["one", "1"].map((id) => ({
        id,
        result: { row: { background: "#ff0000" }, text: {} },
      })),
    }),
  );
  await act(async () => worker.send({ done: true }));
  await act(async () => renderer.update(<Probe count={2} priority={["1"]} />));
  expect(workers).toHaveLength(1);
  expect(worker.terminate).not.toHaveBeenCalled();
  expect(result.results.get("one")?.row.background).toBe("#ff0000");
  await act(async () =>
    renderer.update(<Probe count={2} priority={["one"]} />),
  );
  expect(workers).toHaveLength(1);
  expect(result.results.get("one")?.row.background).toBe("#ff0000");
});

it("prepares loaded rows in bounded batches and prioritizes the latest viewport without cancelling in-flight work", async () => {
  await act(async () => {
    renderer = create(<Probe count={250} priority={["200"]} />);
  });
  const worker = workers[0];
  const first = worker.postMessage.mock.calls[0][0].events;
  expect(first).toHaveLength(100);
  expect(first[0].id).toBe("200");
  await act(async () =>
    renderer.update(<Probe count={250} priority={["249"]} />),
  );
  expect(workers).toHaveLength(1);
  expect(worker.postMessage).toHaveBeenCalledOnce();
  await act(async () =>
    worker.send({
      batch: first.map(({ id }: { id: string }) => ({
        id,
        result: { row: {}, text: {} },
      })),
      done: true,
    }),
  );
  expect(worker.postMessage.mock.calls[1][0].events[0].id).toBe("249");
  expect(result.results.has("200")).toBe(true);
});

it("appends only uncached events instead of clearing and recomputing the loaded results", async () => {
  await act(async () => {
    renderer = create(<Probe />);
  });
  const worker = workers[0];
  await act(async () =>
    worker.send({
      batch: [{ id: "one", result: { row: {}, text: {} } }],
      done: true,
    }),
  );
  await act(async () => renderer.update(<Probe count={2} />));
  expect(workers).toHaveLength(1);
  expect(
    worker.postMessage.mock.calls[1][0].events.map(
      (item: { id: string }) => item.id,
    ),
  ).toEqual(["1"]);
  expect(result.results.has("one")).toBe(true);
});
it("batches overview work, retains offscreen results and discards stale worker responses", async () => {
  await act(async () => {
    renderer = create(<Probe overview count={250} />);
  });
  const worker = workers[0];
  expect(worker.postMessage.mock.calls[0][0].events).toHaveLength(100);
  await act(async () =>
    worker.send({
      batch: [{ id: "one", result: { row: {}, text: {}, overview: ["red"] } }],
    }),
  );
  expect(result.results.get("one")?.overview).toEqual(["red"]);
  await act(async () => renderer.update(<Probe overview count={250} />));
  expect(workers).toHaveLength(1);
  await act(async () => worker.send({ done: true }));
  expect(worker.terminate).not.toHaveBeenCalled();
  expect(worker.postMessage.mock.calls[1][0].events).toHaveLength(100);
  await act(async () => worker.send({ done: true }));
  expect(worker.postMessage.mock.calls[2][0].events).toHaveLength(50);
  await act(async () => renderer.update(<Probe enabled={false} />));
  expect(worker.terminate).toHaveBeenCalledOnce();
  await act(async () =>
    worker.send({ batch: [{ id: "one", result: { overview: ["blue"] } }] }),
  );
  expect(result.results.size).toBe(0);
});
afterEach(async () => {
  await act(async () => renderer?.unmount());
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
it("terminates stalled regex work and ignores late responses without blocking the viewer", async () => {
  await act(async () => {
    renderer = create(<Probe />);
  });
  const worker = workers[0];
  await act(async () => worker.send({ ready: true }));
  await act(async () => {
    vi.advanceTimersByTime(501);
  });
  expect(worker.terminate).toHaveBeenCalledOnce();
  expect(result.error).toContain("regex exceeded");
  await act(async () =>
    worker.send({
      id: "one",
      result: { row: { background: "#ff0000" }, text: {} },
    }),
  );
  expect(result.results.has("one")).toBe(false);
});
it("renders completed results, does not restart for equivalent props, and cancels on disabling", async () => {
  await act(async () => {
    renderer = create(<Probe />);
  });
  const worker = workers[0];
  await act(async () =>
    worker.send({
      id: "one",
      result: { row: { background: "#ff0000" }, text: {} },
    }),
  );
  expect(result.results.get("one")?.row.background).toBe("#ff0000");
  await act(async () => renderer.update(<Probe />));
  expect(workers).toHaveLength(1);
  await act(async () => renderer.update(<Probe enabled={false} />));
  expect(worker.terminate).toHaveBeenCalledOnce();
  expect(result.results.size).toBe(0);
  await act(async () => {
    vi.advanceTimersByTime(3000);
  });
  expect(result.error).toBeUndefined();
});
