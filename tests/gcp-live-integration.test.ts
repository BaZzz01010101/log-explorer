import { afterEach, describe, expect, it, vi } from "vitest";
const streamMock = vi.hoisted(() => vi.fn());
vi.mock("../src/main/gcp-live", () => ({ streamGcpProject: streamMock }));
import { createGcpAdapter } from "../src/main/gcp-adapter";
import { gcloudAuth } from "../src/main/gcloud-auth";

const gcp = { kind: "function" as const, project: "demo", region: "europe-west2", functionName: "one", generation: "v1" as const };
const connection = { id: "gcp", name: "Google", profile: "work", region: "europe-west2", mode: "gcp" as const, gcpIdentity: { configuration: "work", account: "person@example.com" } };
const request = { requestId: "live", connection, sources: [{ logGroup: "one", gcp }, { logGroup: "two", gcp: { ...gcp, functionName: "two" } }], startTime: 1, endTime: 2, kind: "events" as const, filterPattern: "", query: "", limit: 2000 };
afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers(); streamMock.mockReset(); });

describe("Google live integration", () => {
  it("uses one stream per project and stops cleanly without periodic polling", async () => {
    const token = vi.spyOn(gcloudAuth, "token").mockResolvedValue("token");
    const fetch = vi.spyOn(globalThis, "fetch").mockImplementation(async () => new Response(JSON.stringify({ entries: [] }), { status: 200 }));
    streamMock.mockImplementation((_connection, _sources, _filter, signal: AbortSignal) => new Promise<void>((resolve) => signal.addEventListener("abort", () => resolve(), { once: true })));
    const controller = new AbortController();
    const run = createGcpAdapter(connection).live(request, controller.signal, () => {});
    await vi.waitFor(() => expect(fetch).toHaveBeenCalledTimes(2));
    expect(streamMock).toHaveBeenCalledTimes(1);
    expect(token).toHaveBeenCalledTimes(2);
    controller.abort();
    await expect(run).resolves.toBeUndefined();
  });
  it("reconnects after a stream failure and backfills the gap", async () => {
    vi.useFakeTimers();
    vi.spyOn(gcloudAuth, "token").mockResolvedValue("token");
    const fetch = vi.spyOn(globalThis, "fetch").mockImplementation(async () => new Response(JSON.stringify({ entries: [] }), { status: 200 }));
    streamMock.mockRejectedValueOnce(new Error("connection reset")).mockImplementation((_connection, _sources, _filter, signal: AbortSignal) => new Promise<void>((resolve) => signal.addEventListener("abort", () => resolve(), { once: true })));
    const controller = new AbortController();
    const run = createGcpAdapter(connection).live(request, controller.signal, () => {});
    await vi.advanceTimersByTimeAsync(3000);
    expect(streamMock).toHaveBeenCalledTimes(2);
    expect(fetch).toHaveBeenCalledTimes(4);
    controller.abort();
    await expect(run).resolves.toBeUndefined();
  });
  it("does not reread an entire long-lived session after reconnecting", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-11-11T10:00:00Z"));
    vi.spyOn(gcloudAuth, "token").mockResolvedValue("token");
    const fetch = vi.spyOn(globalThis, "fetch").mockImplementation(async () => new Response(JSON.stringify({ entries: [] }), { status: 200 }));
    streamMock.mockImplementationOnce(() => new Promise<void>((_resolve, reject) => setTimeout(() => reject(new Error("connection reset")), 3600000)))
      .mockImplementation((_connection, _sources, _filter, signal: AbortSignal) => new Promise<void>((resolve) => signal.addEventListener("abort", () => resolve(), { once: true })));
    const controller = new AbortController();
    const run = createGcpAdapter(connection).live(request, controller.signal, () => {});
    await vi.advanceTimersByTimeAsync(3603000);
    expect(fetch).toHaveBeenCalledTimes(4);
    const body = JSON.parse(String(fetch.mock.calls[2][1]?.body));
    const start = Date.parse(body.filter.match(/timestamp >= \"([^\"]+)/)[1]);
    expect(Date.now() - start).toBeLessThan(40000);
    controller.abort();
    await run;
  });
});
