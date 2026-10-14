import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { StrictMode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useLogJobs } from "../src/renderer/useLogJobs";
import { createWorkspace } from "../src/renderer/workspace";
import type {
  LogEvent,
  QueryRequest,
  QueryUpdate,
  Workspace,
} from "../src/shared/contracts";

function deferred() {
  let resolve!: () => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<void>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}

const logEvent: LogEvent = {
  id: "fresh-event",
  timestamp: 1000,
  message: "fresh event",
  logGroup: "/fixture/group",
  logStream: "fixture-stream",
};
type Jobs = ReturnType<typeof useLogJobs>;
let jobs: Jobs;
let renderer: ReactTestRenderer | undefined;
let workspace: Workspace;
let requests: QueryRequest[];
let cancellations: string[];
let liveRequests: QueryRequest[];
let listeners: Set<(update: QueryUpdate) => void>;
let queryHandler: (request: QueryRequest) => Promise<void>;
let cancelHandler: (requestId: string) => Promise<void>;
let liveHandler: (request: QueryRequest) => Promise<void>;
let cleanupErrors: string[];

function Harness({ value }: { value: Workspace }) {
  jobs = useLogJobs(value, true, (message) => cleanupErrors.push(message));
  return null;
}
async function mount() {
  await act(async () => {
    renderer = create(<Harness value={workspace} />);
  });
}
async function replaceWorkspace(value: Workspace) {
  workspace = value;
  await act(async () => {
    renderer!.update(<Harness value={workspace} />);
  });
}
async function emit(update: QueryUpdate) {
  await act(async () => {
    for (const listener of listeners) listener(update);
  });
}

beforeEach(() => {
  workspace = createWorkspace();
  workspace.preferences.refreshSeconds = 0;
  requests = [];
  cancellations = [];
  liveRequests = [];
  listeners = new Set();
  cleanupErrors = [];
  queryHandler = async () => {};
  cancelHandler = async () => {};
  liveHandler = async () => {};
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("window", {
    explorer: {
      onUpdate: (listener: (update: QueryUpdate) => void) => {
        listeners.add(listener);
        return () => listeners.delete(listener);
      },
      query: (request: QueryRequest) => {
        requests.push(request);
        return queryHandler(request);
      },
      live: (request: QueryRequest) => {
        liveRequests.push(request);
        return liveHandler(request);
      },
      cancel: (id: string) => {
        cancellations.push(id);
        return cancelHandler(id);
      },
    },
  });
  // React 19 deliberately warns about this test renderer. Keep other errors visible.
  const original = console.error.bind(console);
  vi.spyOn(console, "error").mockImplementation((...arguments_) => {
    if (
      typeof arguments_[0] === "string" &&
      arguments_[0].startsWith("react-test-renderer is deprecated")
    )
      return;
    original(...arguments_);
  });
});
afterEach(async () => {
  if (renderer) {
    await act(async () => renderer!.unmount());
    renderer = undefined;
  }
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("query operation ownership", () => {
  it.each([
    { kind: "insights" as const, expected: [3, 2, 1] },
    { kind: "events" as const, expected: [1, 2, 3] },
  ])(
    "preserves the appropriate ordering for $kind replacement snapshots",
    async ({ kind, expected }) => {
      workspace.tabs[0]!.kind = kind;
      await mount();
      const request = requests[0]!;
      await emit({
        requestId: request.requestId,
        state: "complete",
        replace: true,
        events: [3, 2, 1].map((timestamp) => ({
          ...logEvent,
          id: String(timestamp),
          timestamp,
        })),
      });
      expect(
        jobs.runtimes[workspace.tabs[0]!.id]!.events.map(
          (item) => item.timestamp,
        ),
      ).toEqual(expected);
    },
  );
  it("does not dispatch an older run after a newer run overtakes its pending cancellation", async () => {
    await mount();
    const cancellation = deferred();
    cancelHandler = () => cancellation.promise;
    let older!: Promise<void>;
    await act(async () => {
      older = jobs.run(workspace.tabs[0]!);
    });
    await act(async () => {
      await jobs.run(workspace.tabs[0]!);
    });
    const newest = requests[1]!;
    await act(async () => {
      cancellation.resolve();
      await older;
    });
    expect(requests).toHaveLength(2);
    expect(jobs.runtimes[workspace.tabs[0]!.id]!.request!.requestId).toBe(
      newest.requestId,
    );
    await emit({
      requestId: newest.requestId,
      state: "running",
      events: [logEvent],
    });
    expect(jobs.runtimes[workspace.tabs[0]!.id]!.events).toEqual([logEvent]);
  });

  it("ignores an old IPC rejection without deleting or poisoning the newer request", async () => {
    const oldAcknowledgement = deferred();
    queryHandler = (request) =>
      requests.indexOf(request) === 0
        ? oldAcknowledgement.promise
        : Promise.resolve();
    await mount();
    await act(async () => {
      await jobs.run(workspace.tabs[0]!);
    });
    const newest = requests[1]!;
    await emit({ requestId: newest.requestId, state: "running" });
    await act(async () => {
      oldAcknowledgement.reject(new Error("old dispatch failed"));
    });
    await emit({
      requestId: newest.requestId,
      state: "running",
      events: [logEvent],
    });
    expect(jobs.runtimes[workspace.tabs[0]!.id]).toMatchObject({
      state: "running",
      error: undefined,
      events: [logEvent],
    });
  });

  it("does not let a pending cancel delete a newer run when cancellation finishes", async () => {
    await mount();
    const cancellation = deferred();
    let calls = 0;
    cancelHandler = () =>
      ++calls === 1 ? cancellation.promise : Promise.resolve();
    let stopping!: Promise<void>;
    await act(async () => {
      stopping = jobs.cancel(workspace.tabs[0]!.id);
    });
    await act(async () => {
      await jobs.run(workspace.tabs[0]!);
    });
    const newest = requests[1]!;
    await act(async () => {
      cancellation.resolve();
      await stopping;
    });
    await emit({
      requestId: newest.requestId,
      state: "running",
      events: [logEvent],
    });
    expect(jobs.runtimes[workspace.tabs[0]!.id]).toMatchObject({
      state: "running",
      events: [logEvent],
      request: { requestId: newest.requestId },
    });
  });

  it("retains service cancellation details rather than overwriting the cancellation update", async () => {
    await mount();
    cancelHandler = async (id) => {
      for (const listener of listeners)
        listener({
          requestId: id,
          state: "cancelled",
          error: "Stopped after partial results",
        });
    };
    await act(async () => {
      await jobs.cancel(workspace.tabs[0]!.id);
    });
    expect(jobs.runtimes[workspace.tabs[0]!.id]).toMatchObject({
      state: "cancelled",
      error: "Stopped after partial results",
      live: false,
    });
  });
  it("keeps a failed cancellation addressable for a retry rather than orphaning its job", async () => {
    const active = new Set<string>();
    queryHandler = async (request) => {
      active.add(request.requestId);
    };
    let attempt = 0;
    cancelHandler = async (id) => {
      if (++attempt === 1) throw new Error("Temporary IPC failure");
      active.delete(id);
    };
    await mount();
    await act(async () => {
      await jobs.cancel(workspace.tabs[0]!.id);
    });
    expect(jobs.runtimes[workspace.tabs[0]!.id]!.error).toBe(
      "Temporary IPC failure",
    );
    await act(async () => {
      await jobs.cancel(workspace.tabs[0]!.id);
    });
    expect(active.size).toBe(0);
  });
});

describe("pending request lifecycle", () => {
  it.each(["unmount", "close"] as const)(
    "does not resume a cancellation-delayed run after %s",
    async (action) => {
      await mount();
      const cancellation = deferred();
      cancelHandler = () => cancellation.promise;
      let pending!: Promise<void>;
      await act(async () => {
        pending = jobs.run(workspace.tabs[0]!);
      });
      if (action === "unmount") {
        await act(async () => renderer!.unmount());
        renderer = undefined;
      } else await replaceWorkspace({ ...workspace, tabs: [] });
      await act(async () => {
        cancellation.resolve();
        await pending;
      });
      expect(requests).toHaveLength(1);
      if (action === "close") expect(jobs.runtimes).toEqual({});
    },
  );

  it("cancels a job again if its dispatch is acknowledged after the hook unmounts", async () => {
    const acknowledgement = deferred();
    const active = new Set<string>();
    queryHandler = (request) =>
      acknowledgement.promise.then(() => {
        active.add(request.requestId);
      });
    cancelHandler = async (id) => {
      active.delete(id);
    };
    await mount();
    await act(async () => renderer!.unmount());
    renderer = undefined;
    await act(async () => {
      acknowledgement.resolve();
    });
    expect(active.size).toBe(0);
    expect(listeners.size).toBe(0);
  });
  it("keeps only the current job during Strict Mode cleanup and resubscription", async () => {
    const active = new Set<string>();
    queryHandler = async (request) => {
      active.add(request.requestId);
    };
    cancelHandler = async (id) => {
      active.delete(id);
    };
    await act(async () => {
      renderer = create(
        <StrictMode>
          <Harness value={workspace} />
        </StrictMode>,
      );
    });
    const newest = requests.at(-1)!;
    expect([...active]).toEqual([newest.requestId]);
    await emit({
      requestId: newest.requestId,
      state: "running",
      events: [logEvent],
    });
    expect(jobs.runtimes[workspace.tabs[0]!.id]!.events).toEqual([logEvent]);
    await act(async () => renderer!.unmount());
    renderer = undefined;
    expect(active.size).toBe(0);
  });
});

describe("source and connection ownership", () => {
  it.each([
    "profile",
    "region",
    "mode",
    "sources",
    "streams",
    "connectionId",
  ] as const)(
    "clears and stops a live job when %s changes, and never reuses its cursor",
    async (field) => {
      await mount();
      await act(async () => {
        await jobs.run(workspace.tabs[0]!, true);
      });
      const live = liveRequests[0]!;
      await emit({
        requestId: live.requestId,
        state: "running",
        events: [logEvent],
        cursor: "old-cursor",
      });
      const tab = workspace.tabs[0]!;
      const connection = workspace.connections[0]!;
      const next: Workspace = {
        ...workspace,
        connections: workspace.connections.map((item) => ({ ...item })),
        tabs: workspace.tabs.map((item) => ({ ...item })),
      };
      if (field === "sources")
        next.tabs[0] = {
          ...tab,
          sources: [
            { logGroup: "/fixture/changed", logStreams: ["changed-stream"] },
          ],
        };
      else if (field === "streams")
        next.tabs[0] = {
          ...tab,
          sources: tab.sources.map((source) => ({
            ...source,
            logStreams: ["another-stream"],
          })),
        };
      else if (field === "connectionId") {
        next.connections.push({ ...connection, id: "other-fixture" });
        next.tabs[0] = { ...tab, connectionId: "other-fixture" };
      } else if (field === "mode")
        next.connections[0] = { ...connection, mode: "aws" };
      else
        next.connections[0] = {
          ...connection,
          [field]: field === "region" ? "eu-west-2" : "other-fixture-profile",
        };
      await replaceWorkspace(next);
      expect(jobs.runtimes[tab.id]).toMatchObject({
        state: "idle",
        live: false,
        events: [],
      });
      expect(jobs.runtimes[tab.id]!.cursor).toBeUndefined();
      expect(cancellations).toContain(live.requestId);
      expect(requests).toHaveLength(1);
      expect(liveRequests).toHaveLength(1);
      await emit({
        requestId: live.requestId,
        state: "running",
        events: [{ ...logEvent, id: "stale-event" }],
      });
      expect(jobs.runtimes[tab.id]!.events).toEqual([]);
      await act(async () => {
        await jobs.run(next.tabs[0]!, false, true);
      });
      const fresh = requests[1]!;
      expect(fresh.cursor).toBeUndefined();
      expect(fresh.sources).toEqual(next.tabs[0]!.sources);
      expect(fresh.connection).toEqual(
        next.connections.find((item) => item.id === next.tabs[0]!.connectionId),
      );
    },
  );

  it("invalidates a cancellation-delayed operation when sources change before dispatch", async () => {
    await mount();
    const cancellation = deferred();
    cancelHandler = () => cancellation.promise;
    let pending!: Promise<void>;
    await act(async () => {
      pending = jobs.run(workspace.tabs[0]!);
    });
    await replaceWorkspace({
      ...workspace,
      tabs: [
        {
          ...workspace.tabs[0]!,
          sources: [{ logGroup: "/fixture/new-source" }],
        },
      ],
    });
    await act(async () => {
      cancellation.resolve();
      await pending;
    });
    expect(requests).toHaveLength(1);
    expect(jobs.runtimes[workspace.tabs[0]!.id]).toMatchObject({
      state: "idle",
      events: [],
    });
  });
  it("keeps changed sources idle through refresh ticks until explicitly queried", async () => {
    vi.useFakeTimers();
    workspace.preferences.refreshSeconds = 1;
    await mount();
    await replaceWorkspace({
      ...workspace,
      tabs: [
        {
          ...workspace.tabs[0]!,
          sources: [{ logGroup: "/fixture/new-source" }],
        },
      ],
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000);
    });
    expect(requests).toHaveLength(1);
    expect(jobs.runtimes[workspace.tabs[0]!.id]!.state).toBe("idle");
  });
});

describe("runtime event buffer preferences", () => {
  it.each(["events", "insights"] as const)(
    "immediately trims loaded %s rows when the buffer limit is lowered without querying again",
    async (kind) => {
      workspace = {
        ...workspace,
        preferences: { ...workspace.preferences, maxEvents: 1000 },
        tabs: workspace.tabs.map((tab) => ({ ...tab, kind })),
      };
      await mount();
      const tabId = workspace.tabs[0]!.id;
      const incoming = Array.from({ length: 300 }, (_, index) => ({
        ...logEvent,
        id: `event-${index}`,
        timestamp: 1000 + ((index * 17) % 300),
      }));
      await emit({
        requestId: requests[0]!.requestId,
        state: "complete",
        events: incoming,
        cursor: "continuation",
        stats: { recordsScanned: 350 },
      });
      const ordered = jobs.runtimes[tabId]!.events;
      for (const [maxEvents, kept] of [
        [200, 200],
        [100, 100],
        [500, 100],
      ]) {
        await replaceWorkspace({
          ...workspace,
          preferences: { ...workspace.preferences, maxEvents },
        });
        expect(jobs.runtimes[tabId]!.events).toHaveLength(kept);
        expect(jobs.runtimes[tabId]).toMatchObject({
          state: "complete",
          live: false,
          events: ordered.slice(-kept),
          evicted: 300 - kept,
          cursor: "continuation",
          stats: { recordsScanned: 350 },
        });
      }
      expect(requests).toHaveLength(1);
      expect(liveRequests).toHaveLength(0);
      expect(cancellations).toHaveLength(0);
    },
  );
});

describe("retired request cleanup failures", () => {
  it.each(["source change", "tab close"] as const)(
    "reports cancellation failure after a %s without restoring retired results",
    async (action) => {
      await mount();
      const tab = workspace.tabs[0]!;
      const retired = requests[0]!;
      await emit({
        requestId: retired.requestId,
        state: "running",
        events: [logEvent],
      });
      cancelHandler = async () => {
        throw new Error(
          "Could not stop Insights query; the server query may still be running",
        );
      };
      await replaceWorkspace({
        ...workspace,
        tabs:
          action === "tab close"
            ? []
            : [{ ...tab, sources: [{ logGroup: "/fixture/new-source" }] }],
        panes: workspace.panes.map((pane) => ({
          ...pane,
          tabId: action === "tab close" ? null : pane.tabId,
        })),
      });
      expect(cleanupErrors).toEqual([
        "Could not stop Insights query; the server query may still be running",
      ]);
      await emit({
        requestId: retired.requestId,
        state: "complete",
        events: [logEvent],
      });
      if (action === "tab close") expect(jobs.runtimes[tab.id]).toBeUndefined();
      else
        expect(jobs.runtimes[tab.id]).toMatchObject({
          state: "idle",
          events: [],
        });
      expect(requests).toHaveLength(1);
    },
  );
});
