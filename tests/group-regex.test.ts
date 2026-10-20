import { afterEach, expect, it, vi } from "vitest";
import { matchGroupNames } from "../src/renderer/group-regex";

class FakeWorker {
  static instances: FakeWorker[] = [];
  onmessage?: (event: { data: unknown }) => void;
  onerror?: () => void;
  postMessage = vi.fn();
  terminate = vi.fn();
  constructor() {
    FakeWorker.instances.push(this);
  }
  send(data: unknown) {
    this.onmessage?.({ data });
  }
}
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  FakeWorker.instances = [];
});

it("runs patterns in a worker, resolves matching names and terminates it", async () => {
  vi.stubGlobal("Worker", FakeWorker);
  const result = matchGroupNames("orders$", ["/orders", "/archive"]);
  const worker = FakeWorker.instances[0];
  worker.send({ ready: true });
  expect(worker.postMessage).toHaveBeenCalledWith({
    pattern: "orders$",
    names: ["/orders", "/archive"],
  });
  worker.send({ matches: [0] });
  await expect(result).resolves.toEqual(["/orders"]);
  expect(worker.terminate).toHaveBeenCalledOnce();
});

it("terminates stalled regex execution and rejects late worker responses", async () => {
  vi.useFakeTimers();
  vi.stubGlobal("Worker", FakeWorker);
  const result = matchGroupNames("(a+)+$", ["a".repeat(500) + "!"]);
  const rejection = expect(result).rejects.toThrow(/500 ms/);
  const worker = FakeWorker.instances[0];
  worker.send({ ready: true });
  await vi.advanceTimersByTimeAsync(501);
  await rejection;
  expect(worker.terminate).toHaveBeenCalledOnce();
  worker.send({ matches: [0] });
});

it("cancels obsolete work and exposes syntax errors without evaluation on the UI thread", async () => {
  vi.stubGlobal("Worker", FakeWorker);
  const controller = new AbortController();
  const result = matchGroupNames("[", [], controller.signal);
  controller.abort();
  await expect(result).rejects.toThrow(/cancelled/i);
  expect(FakeWorker.instances[0].terminate).toHaveBeenCalledOnce();
  const invalid = matchGroupNames("[", []);
  FakeWorker.instances[1].send({ error: "Invalid regular expression" });
  await expect(invalid).rejects.toThrow(/Invalid regular expression/);
});
