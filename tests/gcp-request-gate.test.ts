import { expect, it, vi } from "vitest";
import { createGcpRequestGate } from "../src/main/gcp-request-gate";

it("shares a bounded per-project quota and wakes queued requests as the window advances", async () => {
  vi.useFakeTimers();
  try {
    const gate = createGcpRequestGate(2, 1000);
    const signal = new AbortController().signal;
    await Promise.all([gate("one", signal), gate("one", signal), gate("two", signal)]);
    let granted = false;
    const next = gate("one", signal).then(() => { granted = true; });
    await vi.advanceTimersByTimeAsync(999);
    expect(granted).toBe(false);
    await vi.advanceTimersByTimeAsync(2);
    await next;
    expect(granted).toBe(true);
  } finally { vi.useRealTimers(); }
});

it("cancels a request waiting for a quota slot", async () => {
  const gate = createGcpRequestGate(1, 60000);
  await gate("one", new AbortController().signal);
  const controller = new AbortController();
  const queued = gate("one", controller.signal);
  controller.abort();
  await expect(queued).rejects.toMatchObject({ name: "AbortError" });
});
