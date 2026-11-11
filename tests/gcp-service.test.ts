import { describe, expect, it, vi } from "vitest";
import { createLogService } from "../src/main/log-service";

describe("Google Cloud log service routing", () => {
  it("routes a GCP query through the Google adapter even when AWS is disabled", async () => {
    const emit = vi.fn();
    const events = vi.fn(async (request) => ({ requestId: request.requestId, state: "complete" as const, events: [] }));
    const adapter = { events, live: vi.fn(), listGroups: vi.fn(), listStreams: vi.fn(), destroy: vi.fn() };
    const connection = { id: "gcp", mode: "gcp" as const, name: "Google", profile: "work", region: "europe-west2", gcpIdentity: { configuration: "work", account: "user@example.com" } };
    const service = createLogService(emit, { allowAws: () => false, gcpAdapterFactory: () => adapter });
    await service.query({ requestId: "x", connection, sources: [{ logGroup: "/gcp/functions/orders", gcp: { kind: "function", project: "demo-123", region: "europe-west2", functionName: "orders", generation: "v1" } }], startTime: 1, endTime: 1000, kind: "events", filterPattern: "", query: "", limit: 10 });
    await vi.waitFor(() => expect(events).toHaveBeenCalled());
    await service.shutdown();
  });
  it("keeps event identities consistent between multisource history and live updates", async () => {
    const emit = vi.fn();
    const event = { id: "entry", timestamp: 500, message: "one", logGroup: "one", logStream: "stream" };
    const adapter = { events: vi.fn(async (request) => ({ requestId: request.requestId, state: "complete" as const, events: request.sources[0].logGroup === "one" ? [event] : [] })), live: vi.fn(async (request, _signal, publish) => { publish({ requestId: request.requestId, state: "running", events: [event] }); }), listGroups: vi.fn(), listStreams: vi.fn(), destroy: vi.fn() };
    const connection = { id: "gcp", mode: "gcp" as const, name: "Google", profile: "work", region: "europe-west2", gcpIdentity: { configuration: "work", account: "user@example.com" } };
    const gcp = { kind: "function" as const, project: "demo-123", region: "europe-west2", functionName: "one", generation: "v1" as const };
    const request = { requestId: "history", connection, sources: [{ logGroup: "one", gcp }, { logGroup: "two", gcp: { ...gcp, functionName: "two" } }], startTime: 1, endTime: 1000, kind: "events" as const, filterPattern: "", query: "", limit: 10 };
    const service = createLogService(emit, { allowAws: () => false, gcpAdapterFactory: () => adapter });
    await service.query(request);
    await vi.waitFor(() => expect(emit.mock.calls.some(([update]) => update.requestId === "history" && update.events?.length)).toBe(true));
    await service.live({ ...request, requestId: "live" });
    await vi.waitFor(() => expect(emit.mock.calls.some(([update]) => update.requestId === "live" && update.events?.length)).toBe(true));
    const findId = (id: string) => emit.mock.calls.find(([update]) => update.requestId === id && update.events?.length)?.[0].events[0].id;
    expect(findId("live")).toBe(findId("history"));
    await service.shutdown();
  });
});
