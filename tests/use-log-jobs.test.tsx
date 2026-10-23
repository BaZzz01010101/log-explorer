import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { StrictMode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useLogJobs } from "../src/renderer/useLogJobs";
import {
  createWorkspace,
  createTab,
  workspaceReducer,
} from "../src/renderer/workspace";
import { workspaceEntries } from "../src/renderer/workspace-entries";
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

function Harness({
  value,
  awsEnabled = false,
}: {
  value: Workspace;
  awsEnabled?: boolean;
}) {
  jobs = useLogJobs(
    value,
    true,
    (message) => cleanupErrors.push(message),
    awsEnabled,
  );
  return null;
}

it("retries AWS views once when access is enabled while leaving fixture views alone", async () => {
  workspace.connections.push({ ...workspace.connections[0], id: "fixtures" });
  workspace.tabs.push({
    ...structuredClone(workspace.tabs[0]),
    id: "fixture-tab",
    connectionId: "fixtures",
  });
  workspace.connections[0].mode = "aws";
  queryHandler = async (request) => {
    if (request.connection.id === workspace.connections[0].id)
      throw new Error("AWS access is disabled");
  };
  await mount();
  expect(requests).toHaveLength(2);
  queryHandler = async () => {};
  await act(async () =>
    renderer!.update(<Harness value={workspace} awsEnabled />),
  );
  expect(requests).toHaveLength(3);
  expect(
    requests.filter((request) => request.connection.id === "fixtures"),
  ).toHaveLength(1);
  await act(async () =>
    renderer!.update(<Harness value={{ ...workspace }} awsEnabled />),
  );
  expect(requests).toHaveLength(3);
});
async function mount() {
  await act(async () => {
    renderer = create(<Harness value={workspace} />);
  });
}

it("compiles plain text quotes and backslashes for history and Live without changing the draft", async () => {
  const tab = workspace.tabs[0]!;
  Object.assign(tab, {
    filterMode: "plain",
    filterPattern: '"mediaId" \\ path',
  });
  await mount();
  expect(requests.at(-1)?.filterPattern).toBe(
    JSON.stringify(tab.filterPattern),
  );
  await act(async () => jobs.run(tab, true));
  expect(liveRequests.at(-1)?.filterPattern).toBe(
    JSON.stringify(tab.filterPattern),
  );
  expect(tab.filterPattern).toBe('"mediaId" \\ path');
});

it("keeps AWS patterns raw and auto-detects ordinary text versus JSON filters", async () => {
  const tab = workspace.tabs[0]!;
  Object.assign(tab, { filterMode: "auto", filterPattern: "request failed" });
  await mount();
  expect(requests.at(-1)?.filterPattern).toBe('"request failed"');
  Object.assign(tab, { filterPattern: '{ $.level = "ERROR" }' });
  await act(async () => jobs.run(tab));
  expect(requests.at(-1)?.filterPattern).toBe(tab.filterPattern);
});
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

function twoTabs() {
  const first = workspace.tabs[0];
  const second = createTab(first.connectionId, [
    { logGroup: "/aws/lambda/payments-worker" },
  ]);
  workspace = workspaceReducer(workspace, { type: "tab/open", tab: second });
  workspace = workspaceReducer(workspace, {
    type: "tab/select",
    tabId: first.id,
  });
  return { first, second };
}
it("sleeps inactive Live sessions, rejects late packets and resumes preserved events and counts", async () => {
  const { first, second } = twoTabs();
  await mount();
  await act(async () => jobs.run(first, true));
  const old = liveRequests[0];
  await emit({
    requestId: old.requestId,
    state: "running",
    liveState: "streaming",
    events: [logEvent],
  });
  await replaceWorkspace(
    workspaceReducer(workspace, { type: "tab/select", tabId: second.id }),
  );
  expect(cancellations).toContain(old.requestId);
  expect(jobs.runtimes[first.id]).toMatchObject({
    livePaused: true,
    events: [logEvent],
    liveReceived: 1,
  });
  await emit({
    requestId: old.requestId,
    state: "running",
    events: [{ ...logEvent, id: "late" }],
  });
  expect(jobs.runtimes[first.id].events).toEqual([logEvent]);
  await replaceWorkspace(
    workspaceReducer(workspace, { type: "tab/select", tabId: first.id }),
  );
  expect(liveRequests).toHaveLength(2);
  expect(jobs.runtimes[first.id]).toMatchObject({
    live: true,
    liveReceived: 1,
    events: [logEvent],
  });
  expect(liveRequests[1].requestId).not.toBe(old.requestId);
  await act(async () => jobs.cancel(first.id));
  await replaceWorkspace(
    workspaceReducer(workspace, { type: "tab/select", tabId: second.id }),
  );
  await replaceWorkspace(
    workspaceReducer(workspace, { type: "tab/select", tabId: first.id }),
  );
  expect(liveRequests).toHaveLength(2);
});
it("keeps all visible split panes live even when another pane has focus", async () => {
  const { first, second } = twoTabs();
  workspace = workspaceReducer(workspace, {
    type: "pane/show-tabs",
    tabIds: [first.id, second.id],
  });
  const split = workspaceEntries(workspace).find(
    (entry) => entry.kind === "split",
  )!;
  await mount();
  await act(async () => {
    await jobs.run(first, true);
    await jobs.run(second, true);
  });
  expect(liveRequests).toHaveLength(2);
  const before = cancellations.length;
  await replaceWorkspace(
    workspaceReducer(workspace, {
      type: "pane/activate",
      paneId: workspace.panes[0].id,
    }),
  );
  expect(cancellations).toHaveLength(before);
  const third = createTab(first.connectionId, [{ logGroup: "/ecs/checkout" }]);
  await replaceWorkspace(
    workspaceReducer(workspace, { type: "tab/open", tab: third }),
  );
  expect(cancellations).toEqual(
    expect.arrayContaining(liveRequests.map((item) => item.requestId)),
  );
  await replaceWorkspace(
    workspaceReducer(workspace, { type: "tab/select", tabId: split.id }),
  );
  expect(liveRequests).toHaveLength(4);
});
it("defers hidden Live starts and historical refresh ticks until the tab is visible", async () => {
  vi.useFakeTimers();
  const { first, second } = twoTabs();
  workspace.preferences.refreshSeconds = 1;
  await mount();
  for (const request of requests)
    await emit({ requestId: request.requestId, state: "complete" });
  await act(async () => jobs.run(second, true));
  expect(liveRequests).toHaveLength(0);
  await act(async () => {
    await vi.advanceTimersByTimeAsync(2000);
  });
  expect(
    requests
      .slice(2)
      .every(
        (request) => request.sources[0].logGroup === first.sources[0].logGroup,
      ),
  ).toBe(true);
  await replaceWorkspace(
    workspaceReducer(workspace, { type: "tab/select", tabId: second.id }),
  );
  expect(liveRequests).toHaveLength(1);
});
it("does not let a delayed sleeping cancellation overwrite a resumed session", async () => {
  const { first, second } = twoTabs();
  await mount();
  await act(async () => jobs.run(first, true));
  const old = liveRequests[0];
  const pending = deferred();
  let calls = 0;
  cancelHandler = (id) =>
    id === old.requestId && ++calls === 1 ? pending.promise : Promise.resolve();
  await replaceWorkspace(
    workspaceReducer(workspace, { type: "tab/select", tabId: second.id }),
  );
  await replaceWorkspace(
    workspaceReducer(workspace, { type: "tab/select", tabId: first.id }),
  );
  await act(async () => pending.resolve());
  expect(liveRequests).toHaveLength(2);
  await emit({
    requestId: liveRequests[1].requestId,
    state: "running",
    liveState: "streaming",
    events: [logEvent],
  });
  expect(jobs.runtimes[first.id]).toMatchObject({
    live: true,
    state: "running",
    events: [logEvent],
  });
});

it("keeps a failed sleeping cancellation addressable and reports it before retrying on return", async () => {
  const { first, second } = twoTabs();
  await mount();
  await act(async () => jobs.run(first, true));
  const id = liveRequests[0].requestId;
  let attempts = 0;
  cancelHandler = async (requestId) => {
    if (requestId === id && ++attempts === 1)
      throw new Error("Sleep cancellation failed");
  };
  await replaceWorkspace(
    workspaceReducer(workspace, { type: "tab/select", tabId: second.id }),
  );
  expect(cleanupErrors).toEqual(["Sleep cancellation failed"]);
  expect(jobs.runtimes[first.id]).toMatchObject({
    state: "error",
    livePaused: true,
  });
  await replaceWorkspace(
    workspaceReducer(workspace, { type: "tab/select", tabId: first.id }),
  );
  expect(attempts).toBe(2);
  expect(liveRequests).toHaveLength(2);
});
it("changing sources while a Live tab sleeps clears its resume intent", async () => {
  const { first, second } = twoTabs();
  await mount();
  await act(async () => jobs.run(first, true));
  await replaceWorkspace(
    workspaceReducer(workspace, { type: "tab/select", tabId: second.id }),
  );
  await replaceWorkspace({
    ...workspace,
    tabs: workspace.tabs.map((tab) =>
      tab.id === first.id
        ? { ...tab, sources: [{ logGroup: "/ecs/checkout" }] }
        : tab,
    ),
  });
  await replaceWorkspace(
    workspaceReducer(workspace, { type: "tab/select", tabId: first.id }),
  );
  expect(liveRequests).toHaveLength(1);
  expect(jobs.runtimes[first.id].live).toBe(false);
  expect(requests.at(-1)?.sources[0].logGroup).toBe("/ecs/checkout");
});

it("switching tabs during an explicit Stop never turns that stop into a resumable sleep", async () => {
  const { first, second } = twoTabs();
  await mount();
  await act(async () => jobs.run(first, true));
  const pending = deferred();
  cancelHandler = () => pending.promise;
  let stopping!: Promise<void>;
  await act(async () => {
    stopping = jobs.cancel(first.id);
  });
  await replaceWorkspace(
    workspaceReducer(workspace, { type: "tab/select", tabId: second.id }),
  );
  await replaceWorkspace(
    workspaceReducer(workspace, { type: "tab/select", tabId: first.id }),
  );
  await act(async () => {
    pending.resolve();
    await stopping;
  });
  expect(liveRequests).toHaveLength(1);
  expect(jobs.runtimes[first.id]).toMatchObject({
    live: false,
    liveState: "stopped",
  });
});

it("Live retains matching history and counts appended events independently of loaded history", async () => {
  await mount();
  const tab = workspace.tabs[0]!;
  await emit({
    requestId: requests[0]!.requestId,
    state: "complete",
    events: [logEvent],
    cursor: "history-cursor",
  });
  await act(async () => jobs.run(tab, true));
  expect(jobs.runtimes[tab.id]!.events).toEqual([logEvent]);
  expect(jobs.runtimes[tab.id]).toMatchObject({
    live: true,
    liveState: "connecting",
    liveReceived: 0,
  });
  expect(liveRequests[0]!.cursor).toBeUndefined();
  await emit({
    requestId: liveRequests[0]!.requestId,
    state: "running",
    liveState: "streaming",
    events: [],
  });
  const retained = jobs.runtimes[tab.id]!.events;
  await emit({
    requestId: liveRequests[0]!.requestId,
    state: "running",
    liveState: "streaming",
    events: [],
  });
  expect(jobs.runtimes[tab.id]!.events).toBe(retained);
  const next = { ...logEvent, id: "live-event", timestamp: 2000 };
  await emit({
    requestId: liveRequests[0]!.requestId,
    state: "running",
    liveState: "streaming",
    events: [next],
  });
  await emit({
    requestId: liveRequests[0]!.requestId,
    state: "running",
    liveState: "streaming",
    events: [next],
  });
  expect(jobs.runtimes[tab.id]!.events).toEqual([logEvent, next]);
  expect(jobs.runtimes[tab.id]).toMatchObject({
    liveState: "streaming",
    liveReceived: 1,
  });
});

it("Live keeps the newest events within the buffer and counts all received events", async () => {
  workspace.preferences.maxEvents = 2;
  await mount();
  const tab = workspace.tabs[0]!;
  await emit({
    requestId: requests[0]!.requestId,
    state: "complete",
    events: [logEvent],
  });
  await act(async () => jobs.run(tab, true));
  const batch = [2, 3, 4].map((timestamp) => ({
    ...logEvent,
    id: `live-${timestamp}`,
    timestamp: timestamp * 1000,
  }));
  await emit({
    requestId: liveRequests[0]!.requestId,
    state: "running",
    liveState: "streaming",
    events: batch,
  });
  expect(jobs.runtimes[tab.id]).toMatchObject({
    events: batch.slice(1),
    liveReceived: 3,
    evicted: 2,
  });
});

it("Live clears history that belongs to a different filter and reports a stopped session on stream completion", async () => {
  await mount();
  const tab = workspace.tabs[0]!;
  await emit({
    requestId: requests[0]!.requestId,
    state: "complete",
    events: [logEvent],
  });
  await replaceWorkspace({
    ...workspace,
    tabs: [{ ...tab, filterPattern: "changed" }],
  });
  await act(async () => jobs.run(workspace.tabs[0]!, true));
  expect(jobs.runtimes[tab.id]!.events).toEqual([]);
  await emit({ requestId: liveRequests[0]!.requestId, state: "complete" });
  expect(jobs.runtimes[tab.id]).toMatchObject({
    state: "complete",
    live: false,
    liveState: "stopped",
  });
});

it("does not let automatic history refresh supersede Live startup after an empty result", async () => {
  vi.useFakeTimers();
  workspace.preferences.refreshSeconds = 1;
  workspace.tabs[0]!.timePreset = "5m";
  await mount();
  const tab = workspace.tabs[0]!;
  await emit({
    requestId: requests[0]!.requestId,
    state: "complete",
    events: [],
  });
  const pending = deferred();
  cancelHandler = async () => pending.promise;
  let starting!: Promise<void>;
  await act(async () => {
    starting = jobs.run(tab, true);
  });
  await act(async () => {
    await vi.advanceTimersByTimeAsync(1000);
  });
  await act(async () => {
    pending.resolve();
    await starting;
  });
  expect(requests).toHaveLength(1);
  expect(liveRequests).toHaveLength(1);
  await emit({
    requestId: liveRequests[0]!.requestId,
    state: "running",
    liveState: "streaming",
    events: [logEvent],
  });
  expect(jobs.runtimes[tab.id]).toMatchObject({
    live: true,
    liveReceived: 1,
    events: [logEvent],
  });
});

it("ignores an obsolete history pagination callback after Live starts from an empty page", async () => {
  await mount();
  const tab = workspace.tabs[0]!;
  await emit({
    requestId: requests[0]!.requestId,
    state: "complete",
    events: [],
    cursor: "empty-page-next",
  });
  await act(async () => jobs.run(tab, true));
  await act(async () => jobs.run(tab, false, true));
  expect(requests).toHaveLength(1);
  expect(cancellations).not.toContain(liveRequests[0]!.requestId);
  await emit({
    requestId: liveRequests[0]!.requestId,
    state: "running",
    liveState: "streaming",
    events: [logEvent],
  });
  expect(jobs.runtimes[tab.id]).toMatchObject({
    live: true,
    events: [logEvent],
  });
});

it("ignores history pagination while Live is still cancelling an empty historical request", async () => {
  await mount();
  const tab = workspace.tabs[0]!;
  await emit({
    requestId: requests[0]!.requestId,
    state: "complete",
    events: [],
    cursor: "empty-page-next",
  });
  const pending = deferred();
  cancelHandler = async () => pending.promise;
  let starting!: Promise<void>;
  await act(async () => {
    starting = jobs.run(tab, true);
    await jobs.run(tab, false, true);
  });
  await act(async () => {
    pending.resolve();
    await starting;
  });
  expect(requests).toHaveLength(1);
  expect(liveRequests).toHaveLength(1);
  expect(jobs.runtimes[tab.id].live).toBe(true);
});

it("continues a current empty historical page once and preserves its query time bounds", async () => {
  await mount();
  const tab = workspace.tabs[0]!;
  const original = requests[0]!;
  await emit({
    requestId: original.requestId,
    state: "complete",
    events: [],
    cursor: "empty-page-next",
  });
  await act(async () => {
    await jobs.run(tab, false, true);
    await jobs.run(tab, false, true);
  });
  expect(requests).toHaveLength(2);
  expect(requests[1]).toMatchObject({
    cursor: "empty-page-next",
    startTime: original.startTime,
    endTime: original.endTime,
  });
  await emit({
    requestId: requests[1]!.requestId,
    state: "complete",
    events: [logEvent],
  });
  expect(jobs.runtimes[tab.id].events).toEqual([logEvent]);
});

it("Stop Live retains events and stays stopped even when historical automatic refresh is enabled", async () => {
  vi.useFakeTimers();
  workspace.preferences.refreshSeconds = 1;
  await mount();
  const tab = workspace.tabs[0]!;
  await act(async () => jobs.run(tab, true));
  await emit({
    requestId: liveRequests[0]!.requestId,
    state: "running",
    liveState: "streaming",
    events: [logEvent],
  });
  await act(async () => {
    await vi.advanceTimersByTimeAsync(3000);
  });
  expect(requests).toHaveLength(1);
  await act(async () => jobs.cancel(tab.id));
  expect(jobs.runtimes[tab.id]).toMatchObject({
    state: "cancelled",
    live: false,
    liveState: "stopped",
    events: [logEvent],
  });
  await act(async () => {
    await vi.advanceTimersByTimeAsync(3000);
  });
  expect(requests).toHaveLength(1);
});

it("a failed Live session stays stopped and an explicit Live retry rejects late packets from the failed session", async () => {
  vi.useFakeTimers();
  workspace.preferences.refreshSeconds = 1;
  await mount();
  const tab = workspace.tabs[0]!;
  await act(async () => jobs.run(tab, true));
  const first = liveRequests[0]!;
  await emit({
    requestId: first.requestId,
    state: "error",
    error: "Connection lost",
  });
  expect(jobs.runtimes[tab.id]).toMatchObject({
    live: false,
    liveState: "stopped",
    error: "Connection lost",
  });
  await act(async () => {
    await vi.advanceTimersByTimeAsync(3000);
  });
  expect(requests).toHaveLength(1);
  await act(async () => jobs.run(tab, true));
  await emit({
    requestId: first.requestId,
    state: "running",
    liveState: "streaming",
    events: [logEvent],
  });
  expect(jobs.runtimes[tab.id]!.events).toEqual([]);
  await emit({
    requestId: liveRequests[1]!.requestId,
    state: "running",
    liveState: "streaming",
    events: [logEvent],
  });
  expect(jobs.runtimes[tab.id]).toMatchObject({
    live: true,
    liveState: "streaming",
    liveReceived: 1,
  });
});

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
  it("snapshots secondary connections and reruns when their region changes", async () => {
    const east = {
      ...workspace.connections[0],
      id: "east",
      region: "us-east-1",
    };
    workspace.connections.push(east);
    workspace.tabs[0].sources.push({ connectionId: "east", logGroup: "/same" });
    await mount();
    expect(requests[0].connections).toEqual([east]);
    await replaceWorkspace({
      ...workspace,
      connections: workspace.connections.map((connection) =>
        connection.id === "east"
          ? { ...connection, region: "us-west-2" }
          : connection,
      ),
    });
    expect(requests).toHaveLength(2);
    expect(requests[1].connections?.[0].region).toBe("us-west-2");
    await emit({
      requestId: requests[0].requestId,
      state: "complete",
      events: [logEvent],
    });
    expect(jobs.runtimes[workspace.tabs[0].id].events).toEqual([]);
  });
  it.each([
    "profile",
    "region",
    "mode",
    "sources",
    "streams",
    "connectionId",
  ] as const)(
    "stops a live job and automatically queries when %s changes without reusing its cursor",
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
        state: "queued",
        live: false,
        events: [],
      });
      expect(jobs.runtimes[tab.id]!.cursor).toBeUndefined();
      expect(cancellations).toContain(live.requestId);
      expect(requests).toHaveLength(2);
      expect(liveRequests).toHaveLength(1);
      await emit({
        requestId: live.requestId,
        state: "running",
        events: [{ ...logEvent, id: "stale-event" }],
      });
      expect(jobs.runtimes[tab.id]!.events).toEqual([]);
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
    expect(requests).toHaveLength(2);
    expect(requests[1].sources).toEqual([{ logGroup: "/fixture/new-source" }]);
    expect(jobs.runtimes[workspace.tabs[0]!.id]).toMatchObject({
      state: "queued",
      events: [],
    });
  });
  it("queries changed sources once and does not duplicate that active request on refresh ticks", async () => {
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
    expect(requests).toHaveLength(2);
    expect(jobs.runtimes[workspace.tabs[0]!.id]!.state).toBe("queued");
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
          state: "queued",
          events: [],
        });
      expect(requests).toHaveLength(action === "source change" ? 2 : 1);
    },
  );
});

describe("automatic query mode updates", () => {
  it("runs the selected mode once with its fields, while text edits remain manual", async () => {
    workspace.tabs[0]!.filterPattern = "events-only";
    workspace.tabs[0]!.query = "fields @message | limit 7";
    await mount();
    const first = requests[0]!;
    await replaceWorkspace({
      ...workspace,
      tabs: [{ ...workspace.tabs[0]!, kind: "insights" }],
    });
    expect(requests).toHaveLength(2);
    expect(cancellations).toContain(first.requestId);
    expect(requests[1]).toMatchObject({
      kind: "insights",
      query: "fields @message | limit 7",
      filterPattern: "",
    });
    await emit({
      requestId: first.requestId,
      state: "complete",
      events: [logEvent],
    });
    expect(jobs.runtimes[workspace.tabs[0]!.id]!.events).toEqual([]);
    await replaceWorkspace({
      ...workspace,
      tabs: [{ ...workspace.tabs[0]!, query: "fields @message | limit 2" }],
    });
    expect(requests).toHaveLength(2);
    await act(async () => {
      await jobs.run(workspace.tabs[0]!);
    });
    expect(requests[2]!.query).toBe("fields @message | limit 2");
    await replaceWorkspace({
      ...workspace,
      tabs: [{ ...workspace.tabs[0]!, kind: "events" }],
    });
    expect(requests).toHaveLength(4);
    expect(requests[3]).toMatchObject({
      kind: "events",
      filterPattern: '"events-only"',
      query: "",
    });
    await replaceWorkspace({ ...workspace, tabs: [...workspace.tabs] });
    expect(requests).toHaveLength(4);
  });

  it("coalesces simultaneous mode, source and time changes into one request", async () => {
    vi.useFakeTimers();
    await mount();
    await replaceWorkspace({
      ...workspace,
      tabs: [
        {
          ...workspace.tabs[0]!,
          kind: "insights",
          sources: [{ logGroup: "/new" }],
          timePreset: "30m",
        },
      ],
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(500);
    });
    expect(requests).toHaveLength(2);
    expect(requests[1]).toMatchObject({
      kind: "insights",
      sources: [{ logGroup: "/new" }],
    });
    expect(requests[1]!.endTime - requests[1]!.startTime).toBe(30 * 60000);
  });

  it("retires live updates and a delayed mode acknowledgement when a newer mode takes ownership", async () => {
    await mount();
    await act(async () => {
      await jobs.run(workspace.tabs[0]!, true);
    });
    const live = liveRequests[0]!;
    const pending = deferred();
    const acknowledgement = deferred();
    queryHandler = (request) =>
      request.kind === "insights" ? acknowledgement.promise : Promise.resolve();
    cancelHandler = (id) =>
      id === live.requestId ? pending.promise : Promise.resolve();
    await replaceWorkspace({
      ...workspace,
      tabs: [{ ...workspace.tabs[0]!, kind: "insights" }],
    });
    await emit({
      requestId: live.requestId,
      state: "running",
      events: [logEvent],
    });
    expect(jobs.runtimes[workspace.tabs[0]!.id]!.events).toEqual([]);
    await replaceWorkspace({
      ...workspace,
      tabs: [
        { ...workspace.tabs[0]!, kind: "events", filterPattern: "latest" },
      ],
    });
    await act(async () => {
      pending.resolve();
      acknowledgement.reject(new Error("Retired mode failed"));
    });
    expect(requests).toHaveLength(3);
    expect(requests[2]).toMatchObject({
      kind: "events",
      filterPattern: '"latest"',
    });
    expect(cancellations).toContain(live.requestId);
    expect(jobs.runtimes[workspace.tabs[0]!.id]!.live).toBe(false);
    expect(jobs.runtimes[workspace.tabs[0]!.id]!.error).toBeUndefined();
    expect(jobs.runtimes[workspace.tabs[0]!.id]!.request!.requestId).toBe(
      requests[2]!.requestId,
    );
  });
});

describe("automatic date range updates", () => {
  it("lets the newest date preset overtake a cancellation-delayed date request", async () => {
    await mount();
    const pending = deferred();
    cancelHandler = () => pending.promise;
    await replaceWorkspace({
      ...workspace,
      tabs: [{ ...workspace.tabs[0]!, timePreset: "30m" }],
    });
    await replaceWorkspace({
      ...workspace,
      tabs: [{ ...workspace.tabs[0]!, timePreset: "12h" }],
    });
    expect(requests).toHaveLength(2);
    await act(async () => {
      pending.resolve();
    });
    expect(requests).toHaveLength(2);
    expect(requests[1]!.endTime - requests[1]!.startTime).toBe(12 * 3600000);
    await emit({
      requestId: requests[0]!.requestId,
      state: "complete",
      events: [logEvent],
    });
    expect(jobs.runtimes[workspace.tabs[0]!.id]!.events).toEqual([]);
  });
  it("keeps a pending valid custom edit through an unrelated local-view update", async () => {
    vi.useFakeTimers();
    await mount();
    await replaceWorkspace({
      ...workspace,
      tabs: [
        {
          ...workspace.tabs[0]!,
          timePreset: "custom",
          customStart: "2026-10-14T10:00",
          customEnd: "2026-10-14T11:00",
        },
      ],
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(250);
    });
    await replaceWorkspace({
      ...workspace,
      tabs: [
        {
          ...workspace.tabs[0]!,
          view: {
            ...workspace.tabs[0]!.view,
            localSearch: "uncharged-local-filter",
          },
        },
      ],
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(150);
    });
    expect(requests).toHaveLength(2);
  });
  it("runs once for a changed preset and does not run for unrelated edits or pane changes", async () => {
    await mount();
    const first = requests[0]!;
    await replaceWorkspace({
      ...workspace,
      tabs: [{ ...workspace.tabs[0]!, timePreset: "30m" }],
    });
    expect(requests).toHaveLength(2);
    expect(cancellations).toContain(first.requestId);
    expect(requests[1]!.endTime - requests[1]!.startTime).toBe(30 * 60000);
    await replaceWorkspace({
      ...workspace,
      tabs: [
        {
          ...workspace.tabs[0]!,
          filterPattern: "error",
          view: { ...workspace.tabs[0]!.view, localSearch: "local" },
        },
      ],
      panes: [...workspace.panes],
    });
    expect(requests).toHaveLength(2);
  });
  it("debounces valid custom edits, ignores invalid drafts, and uses the latest range", async () => {
    vi.useFakeTimers();
    await mount();
    const tab = workspace.tabs[0]!;
    await replaceWorkspace({
      ...workspace,
      tabs: [{ ...tab, timePreset: "custom", customStart: "", customEnd: "" }],
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
    });
    expect(requests).toHaveLength(1);
    await replaceWorkspace({
      ...workspace,
      tabs: [
        {
          ...workspace.tabs[0]!,
          customStart: "2026-10-14T10:00",
          customEnd: "2026-10-14T11:00",
        },
      ],
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(200);
    });
    await replaceWorkspace({
      ...workspace,
      tabs: [{ ...workspace.tabs[0]!, customEnd: "2026-10-14T12:00" }],
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(399);
    });
    expect(requests).toHaveLength(1);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
    });
    expect(requests).toHaveLength(2);
    expect(requests[1]!.endTime - requests[1]!.startTime).toBe(2 * 3600000);
  });
  it("cancels pending custom refresh when a manual run, tab close, or source change supersedes it", async () => {
    vi.useFakeTimers();
    await mount();
    await replaceWorkspace({
      ...workspace,
      tabs: [
        {
          ...workspace.tabs[0]!,
          timePreset: "custom",
          customStart: "2026-10-14T10:00",
          customEnd: "2026-10-14T11:00",
        },
      ],
    });
    await act(async () => {
      await jobs.run(workspace.tabs[0]!);
      await vi.advanceTimersByTimeAsync(500);
    });
    expect(requests).toHaveLength(2);
    await replaceWorkspace({
      ...workspace,
      tabs: [{ ...workspace.tabs[0]!, customEnd: "2026-10-14T12:00" }],
    });
    await replaceWorkspace({
      ...workspace,
      tabs: [{ ...workspace.tabs[0]!, sources: [{ logGroup: "/different" }] }],
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(500);
    });
    expect(requests).toHaveLength(3);
    expect(requests[2].sources).toEqual([{ logGroup: "/different" }]);
    await replaceWorkspace({
      ...workspace,
      tabs: [{ ...workspace.tabs[0]!, customEnd: "2026-10-14T13:00" }],
    });
    await replaceWorkspace({
      ...workspace,
      tabs: [],
      panes: workspace.panes.map((pane) => ({ ...pane, tabId: null })),
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(500);
    });
    expect(requests).toHaveLength(3);
  });
});
