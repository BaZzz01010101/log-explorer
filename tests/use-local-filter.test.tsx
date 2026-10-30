import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { useLocalFilter } from "../src/renderer/useLocalFilter";
import {
  parseLogMessage,
  type LocalFilterOptions,
} from "../src/shared/log-data";
import type { LogEvent } from "../src/shared/contracts";

const workers: FakeWorker[] = [];
class FakeWorker {
  onmessage?: (event: { data: any }) => void;
  onerror?: () => void;
  terminate = vi.fn();
  postMessage = vi.fn();
  constructor() {
    workers.push(this);
  }
  send(data: any) {
    this.onmessage?.({ data });
  }
}
const event = (id: string, message = "ERROR Request failed"): LogEvent => ({
  id,
  timestamp: 0,
  message,
  logGroup: "/excluded",
  logStream: "2026/10/30/[$LATEST]Stream-Id",
});
const row = (item: LogEvent) => ({
  event: item,
  parsed: parseLogMessage(item.message),
  retained: item.id,
});
const one = row(event("one")),
  two = row(event("two", "INFO ordinary"));
let result: ReturnType<typeof useLocalFilter<typeof one>>;
let renderer: ReactTestRenderer;
function Probe({
  rows = [one, two],
  query = "request.*failed",
  level = "all",
  options = { regex: true },
}: {
  rows?: (typeof one)[];
  query?: string;
  level?: string | readonly string[];
  options?: LocalFilterOptions;
}) {
  result = useLocalFilter(rows, query, level, options);
  return null;
}
beforeEach(() => {
  vi.useFakeTimers();
  workers.length = 0;
  vi.stubGlobal("Worker", FakeWorker);
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const original = console.error.bind(console);
  vi.spyOn(console, "error").mockImplementation((...args) => {
    if (!String(args[0]).includes("react-test-renderer is deprecated"))
      original(...args);
  });
});
afterEach(async () => {
  await act(async () => renderer?.unmount());
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
async function finish(worker: FakeWorker, index: number, matched: string[]) {
  const job = worker.postMessage.mock.calls[index][0];
  await act(async () =>
    worker.send({
      jobId: job.jobId,
      batch: job.events.map((item: LogEvent) => ({
        id: item.id,
        matched: matched.includes(item.id),
      })),
      done: true,
    }),
  );
}

it("validates an invalid regex in the worker even before any events are loaded", async () => {
  await act(async () => {
    renderer = create(<Probe rows={[]} query="[" />);
  });
  const worker = workers[0];
  expect(worker.postMessage).toHaveBeenCalledOnce();
  const job = worker.postMessage.mock.calls[0][0];
  expect(job.events).toEqual([]);
  expect(result.pending).toBe(true);
  await act(async () =>
    worker.send({
      jobId: job.jobId,
      error: "Invalid local filter regex",
      done: true,
    }),
  );
  expect(result.error).toContain("Invalid");
  expect(result.pending).toBe(false);
  expect(worker.terminate).toHaveBeenCalledOnce();
});

it("validates an empty result set once and reuses the worker when Live events arrive", async () => {
  await act(async () => {
    renderer = create(<Probe rows={[]} />);
  });
  const worker = workers[0];
  expect(worker.postMessage).toHaveBeenCalledOnce();
  expect(result.pending).toBe(true);
  await finish(worker, 0, []);
  expect(result.rows).toEqual([]);
  expect(result.pending).toBe(false);
  expect(worker.postMessage).toHaveBeenCalledOnce();
  await act(async () => {
    vi.advanceTimersByTime(2500);
  });
  expect(worker.terminate).not.toHaveBeenCalled();
  await act(async () => renderer.update(<Probe rows={[one]} />));
  expect(workers).toHaveLength(1);
  expect(worker.postMessage.mock.calls[1][0].events).toEqual([one.event]);
  await finish(worker, 1, ["one"]);
  expect(result.rows).toEqual([one]);
  expect(result.pending).toBe(false);
});

it("keeps the startup deadline for regex validation without loaded events", async () => {
  await act(async () => {
    renderer = create(<Probe rows={[]} />);
  });
  await act(async () => {
    vi.advanceTimersByTime(2001);
  });
  expect(workers[0].terminate).toHaveBeenCalledOnce();
  expect(result.pending).toBe(false);
  expect(result.error).toMatch(/time limit/i);
});

it("retains the filtered array through unrelated rerenders with unchanged rows and options", async () => {
  const rows = [one, two];
  await act(async () => {
    renderer = create(<Probe rows={rows} />);
  });
  await finish(workers[0], 0, ["one"]);
  const previous = result.rows;
  await act(async () =>
    renderer.update(<Probe rows={rows} options={{ regex: true }} />),
  );
  expect(result.rows).toBe(previous);
  expect(workers[0].postMessage).toHaveBeenCalledOnce();
});

it("filters plain text synchronously with scope, case and property syntax without creating a worker", async () => {
  await act(async () => {
    renderer = create(<Probe query="stream-id failed" options={{}} />);
  });
  expect(result).toMatchObject({ rows: [one], pending: false });
  expect(workers).toHaveLength(0);
  await act(async () =>
    renderer.update(
      <Probe query="stream-id" options={{ caseSensitive: true }} />,
    ),
  );
  expect(result.rows).toEqual([]);
  await act(async () =>
    renderer.update(<Probe query="excluded" options={{}} />),
  );
  expect(result.rows).toEqual([]);
});

it("starts regex filtering pending with no speculative rows and preserves wrapper identity and input ordering", async () => {
  await act(async () => {
    renderer = create(
      <Probe
        level={["error", "warn"]}
        options={{ regex: true, caseSensitive: true }}
      />,
    );
  });
  expect(result.rows).toEqual([]);
  expect(result.pending).toBe(true);
  const worker = workers[0],
    job = worker.postMessage.mock.calls[0][0];
  expect(job).toMatchObject({
    query: "request.*failed",
    level: ["error", "warn"],
    options: { regex: true, caseSensitive: true },
  });
  await finish(worker, 0, ["one"]);
  expect(result.rows).toEqual([one]);
  expect(result.rows[0]).toBe(one);
  expect(result.pending).toBe(false);
});

it("retains matching and nonmatching Live results while scanning only arriving or changed rows", async () => {
  const initial = [one, two];
  await act(async () => {
    renderer = create(<Probe rows={initial} />);
  });
  const worker = workers[0];
  await finish(worker, 0, ["one"]);
  const three = row(event("three"));
  await act(async () => renderer.update(<Probe rows={[...initial, three]} />));
  expect(workers).toHaveLength(1);
  expect(result.rows).toEqual([one]);
  expect(result.pending).toBe(true);
  expect(
    worker.postMessage.mock.calls[1][0].events.map((item: LogEvent) => item.id),
  ).toEqual(["three"]);
  await finish(worker, 1, ["three"]);
  expect(result.rows).toEqual([one, three]);
  expect(result.pending).toBe(false);
  await act(async () =>
    renderer.update(
      <Probe rows={[row({ ...one.event, timestamp: 99 }), two, three]} />,
    ),
  );
  expect(worker.postMessage).toHaveBeenCalledTimes(2);
});

it("terminates changed configurations and ignores late results from their worker", async () => {
  await act(async () => {
    renderer = create(<Probe />);
  });
  const old = workers[0];
  await act(async () =>
    renderer.update(<Probe options={{ regex: true, caseSensitive: true }} />),
  );
  expect(old.terminate).toHaveBeenCalledOnce();
  await finish(old, 0, ["one"]);
  expect(result.rows).toEqual([]);
  expect(result.pending).toBe(true);
  await finish(workers[1], 0, ["two"]);
  expect(result.rows).toEqual([two]);
});

it("does not publish stale in-flight matches after a row changes or closes", async () => {
  await act(async () => {
    renderer = create(<Probe rows={[one, two]} />);
  });
  const worker = workers[0],
    changed = row(event("one", "new message"));
  await act(async () => renderer.update(<Probe rows={[changed]} />));
  await finish(worker, 0, ["one", "two"]);
  expect(result.rows).toEqual([]);
  expect(result.pending).toBe(true);
  expect(worker.postMessage.mock.calls[1][0].events).toHaveLength(1);
  await finish(worker, 1, []);
  expect(result.pending).toBe(false);
});

it("terminates a stalled regex, ignores late progress and permits retry after editing", async () => {
  await act(async () => {
    renderer = create(<Probe />);
  });
  const worker = workers[0],
    job = worker.postMessage.mock.calls[0][0];
  await act(async () => worker.send({ jobId: job.jobId, ready: true }));
  await act(async () => {
    vi.advanceTimersByTime(501);
  });
  expect(worker.terminate).toHaveBeenCalledOnce();
  expect(result.pending).toBe(false);
  expect(result.error).toMatch(/time limit/i);
  await finish(worker, 0, ["one"]);
  expect(result.rows).toEqual([]);
  await act(async () => renderer.update(<Probe query="ordinary" />));
  expect(workers).toHaveLength(2);
  expect(result.error).toBeUndefined();
  expect(result.pending).toBe(true);
});

it("shows worker syntax errors and cancels regex work when returning to plain mode", async () => {
  await act(async () => {
    renderer = create(<Probe query="[" />);
  });
  const worker = workers[0],
    job = worker.postMessage.mock.calls[0][0];
  await act(async () =>
    worker.send({
      jobId: job.jobId,
      error: "Invalid local filter regex",
      done: true,
    }),
  );
  expect(result.error).toContain("Invalid");
  expect(result.pending).toBe(false);
  await act(async () => renderer.update(<Probe query="failed" options={{}} />));
  expect(worker.terminate).toHaveBeenCalledOnce();
  expect(result.rows).toEqual([one]);
  expect(result.pending).toBe(false);
  expect(result.error).toBeUndefined();
});

it("bounds worker batches by event count and source-text size", async () => {
  const rows = Array.from({ length: 150 }, (_, index) =>
    row(event(String(index), "a".repeat(50000))),
  );
  await act(async () => {
    renderer = create(<Probe rows={rows} query="a" />);
  });
  const input: LogEvent[] = workers[0].postMessage.mock.calls[0][0].events;
  expect(input.length).toBeGreaterThan(0);
  expect(input.length).toBeLessThanOrEqual(100);
  expect(
    input.reduce((size, item) => size + item.message.length, 0),
  ).toBeLessThanOrEqual(1000000);
});

it("rejects oversized source messages before copying them to the regex worker", async () => {
  await act(async () => {
    renderer = create(
      <Probe rows={[row(event("large", "x".repeat(524289)))]} query="x$" />,
    );
  });
  expect(workers[0].postMessage).not.toHaveBeenCalled();
  expect(workers[0].terminate).toHaveBeenCalledOnce();
  expect(result.pending).toBe(false);
  expect(result.error).toMatch(/message.*limit/i);
});
