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
}: {
  enabled?: boolean;
  overview?: boolean;
  count?: number;
}) {
  result = useEventHighlights(
    Array.from({ length: count }, (_, index) => ({
      ...event,
      id: index ? String(index) : event.id,
    })),
    {
      ...createWorkspace().preferences,
      highlightProfiles: [{ ...profile, enabled }],
    },
    [],
    overview ? { overview: true, needle: "aaa" } : undefined,
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
