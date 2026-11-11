import { describe, expect, it, vi } from "vitest";
import { createGcpAdapter } from "../src/main/gcp-adapter";
import { gcloudAuth } from "../src/main/gcloud-auth";

const source = { logGroup: "/gcp/functions/orders", gcp: { kind: "function" as const, project: "demo-123", region: "europe-west2", functionName: "orders", generation: "v1" as const } };
const connection = { id: "gcp", mode: "gcp" as const, profile: "work", name: "Google", region: "europe-west2", gcpIdentity: { configuration: "work", account: "user@example.com" } };
const request = { requestId: "test", connection, sources: [source], startTime: 1000, endTime: 5000, kind: "events" as const, filterPattern: "", query: "", limit: 100 };

describe("GCP event adapter", () => {
  it("refreshes an expired cached token once after HTTP 401", async () => {
    const token = vi.spyOn(gcloudAuth, "token").mockResolvedValueOnce("old").mockResolvedValueOnce("new");
    const invalidate = vi.spyOn(gcloudAuth, "invalidateToken").mockImplementation(() => {});
    const fetch = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(new Response("", { status: 401 })).mockResolvedValueOnce(new Response(JSON.stringify({entries: []}), { status: 200 }));
    try {
      await createGcpAdapter(connection).events(request, new AbortController().signal);
      expect(fetch).toHaveBeenCalledTimes(2);
      expect(invalidate).toHaveBeenCalledWith(connection.gcpIdentity, "old");
    } finally { token.mockRestore(); invalidate.mockRestore(); fetch.mockRestore(); }
  });
  it("backs off and retries a temporary quota response", async () => {
    vi.useFakeTimers();
    const token = vi.spyOn(gcloudAuth, "token").mockResolvedValue("token");
    const fetch = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(new Response("", { status: 429 })).mockResolvedValueOnce(new Response(JSON.stringify({entries: []}), { status: 200 }));
    try {
      const promise = createGcpAdapter(connection).events(request, new AbortController().signal);
      await vi.advanceTimersByTimeAsync(5000);
      expect((await promise).events).toEqual([]);
      expect(fetch).toHaveBeenCalledTimes(2);
    } finally { token.mockRestore(); fetch.mockRestore(); vi.useRealTimers(); }
  });
  it("returns normalized events and follows the Google page token", async () => {
    const post = vi.fn().mockResolvedValueOnce({ entries: [{ timestamp: "1970-01-01T00:00:02.000Z", insertId: "1", logName: "projects/demo-123/logs/x", textPayload: "hello" }], nextPageToken: "page-two" }).mockResolvedValueOnce({ entries: [] });
    const adapter = createGcpAdapter(connection, post);
    const first = await adapter.events(request, new AbortController().signal);
    expect(first.events?.[0].message).toBe("hello");
    expect(first.cursor).toBeTruthy();
    await adapter.events({ ...request, cursor: first.cursor }, new AbortController().signal);
    expect(post.mock.calls[1][0]).toMatchObject({ pageToken: "page-two" });
  });
  it("keeps a cursor when Google returns an empty page", async () => {
    let page = 0;
    const adapter = createGcpAdapter(connection, vi.fn().mockImplementation(async () => ({ entries: [], nextPageToken: `later-${++page}` })));
    const result = await adapter.events(request, new AbortController().signal);
    expect(result.cursor).toBeTruthy();
    expect(result.events).toEqual([]);
    expect(page).toBeLessThanOrEqual(8);
  });
  it("continues through sparse empty Google pages without returning prematurely", async () => {
    const post = vi.fn().mockResolvedValueOnce({ entries: [], nextPageToken: "a" }).mockResolvedValueOnce({ entries: [], nextPageToken: "b" }).mockResolvedValueOnce({ entries: [{ timestamp: "1970-01-01T00:00:02Z", textPayload: "found" }] });
    const result = await createGcpAdapter(connection, post).events(request, new AbortController().signal);
    expect(result.events?.map((event) => event.message)).toEqual(["found"]);
    expect(post).toHaveBeenCalledTimes(3);
  });
  it("rejects a cursor used for a different source", async () => {
    const adapter = createGcpAdapter(connection, vi.fn().mockResolvedValue({ entries: [{ timestamp: "1970-01-01T00:00:02Z", textPayload: "one" }], nextPageToken: "later" }));
    const signal = new AbortController().signal;
    const first = await adapter.events(request, signal);
    await expect(adapter.events({ ...request, cursor: first.cursor, sources: [{ ...source, logGroup: "another" }] }, signal)).rejects.toThrow(/continuation/i);
  });
  it("checks every selected Google source during live monitoring", async () => {
    const controller = new AbortController();
    const post = vi.fn().mockResolvedValue({ entries: [] });
    const adapter = createGcpAdapter(connection, post);
    const other = { ...source, logGroup: "/gcp/functions/payments", gcp: { ...source.gcp, functionName: "payments" } };
    const run = adapter.live({ ...request, sources: [source, other] }, controller.signal, () => {});
    await vi.waitFor(() => expect(post).toHaveBeenCalledTimes(2));
    expect(post.mock.calls.map(([body]) => body.filter).join("\n")).toContain('function_name="payments"');
    controller.abort();
    await run.catch(() => {});
  });
  it("does not repeatedly emit the same event from overlapping polls", async () => {
    vi.useFakeTimers();
    try {
      const controller = new AbortController();
      const post = vi.fn().mockResolvedValue({ entries: [{ timestamp: new Date().toISOString(), insertId: "same", textPayload: "message" }] });
      const emit = vi.fn();
      const run = createGcpAdapter(connection, post).live(request, controller.signal, emit).catch(() => {});
      await vi.advanceTimersByTimeAsync(6500);
      expect(post).toHaveBeenCalledTimes(3);
      expect(emit.mock.calls.flatMap(([update]) => update.events ?? [])).toHaveLength(1);
      controller.abort();
      await run;
    } finally { vi.useRealTimers(); }
  });
});
