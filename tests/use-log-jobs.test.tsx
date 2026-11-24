import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { StrictMode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useLogJobs } from "../src/renderer/useLogJobs";
import {
  createWorkspace,
  createTab,
  workspaceReducer,
} from "../src/shared/workspace";
import { workspaceEntries } from "../src/shared/workspace-entries";
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
  liveAsleep = false,
}: {
  value: Workspace;
  awsEnabled?: boolean;
  liveAsleep?: boolean;
}) {
  jobs = useLogJobs(
    value,
    true,
    (message) => cleanupErrors.push(message),
    awsEnabled,
    liveAsleep,
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
  // Only displayed views auto-run, so show the fixture view in its own pane.
  workspace.panes.push({
    ...workspace.panes[0]!,
    id: "fixture-pane",
    tabId: "fixture-tab",
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

it("defers hidden views until they are shown", async () => {
  workspace.tabs.push({ ...structuredClone(workspace.tabs[0]), id: "hidden" });
  await mount();
  expect(requests.map((request) => request.requestId)).toHaveLength(1);
  const shown = {
    ...workspace,
    panes: [...workspace.panes, { ...workspace.panes[0]!, id: "p2", tabId: "hidden" }],
  };
  await act(async () => renderer!.update(<Harness value={shown} />));
  expect(requests).toHaveLength(2);
});

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
it("uses native Unified queries on mixed sources and rejects provider-specific patterns", async () => {
  const tab = workspace.tabs[0]!;
  workspace.connections.push({ id: "google", name: "Google", mode: "gcp", profile: "work", region: "europe-west2", gcpIdentity: { configuration: "work", account: "test@example.com" } });
  tab.sources.push({ connectionId: "google", logGroup: "/gcp/functions/orders", gcp: { kind: "function", project: "test-project", region: "europe-west2", generation: "v1", functionName: "orders" } });
  Object.assign(tab, { filterMode: "auto", filterPattern: '$.level = "ERROR"' });
  await mount();
  expect(requests[0]).toMatchObject({ filterPattern: '{ ($.level = "ERROR") }', direction: "older" });
  expect(requests[0].gcpLocalFilter).toBeUndefined();
  expect(requests[0].gcpFilterPattern).toContain('jsonPayload.level = "ERROR"');
  expect(requests[0].gcpFilterPattern).toContain("NOT protoPayload");
  Object.assign(tab, { filterPattern: '{ $.level = %ERR% }' });
  await act(async () => jobs.run(tab));
  expect(requests).toHaveLength(1);
  expect(jobs.runtimes[tab.id].error).toMatch(/AWS Pattern.*not available/i);
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
it("defers hidden Live starts and ignores obsolete historical refresh configuration", async () => {
  vi.useFakeTimers();
  const { first, second } = twoTabs();
  Object.assign(workspace.preferences, { refreshSeconds: 1 });
  await mount();
  for (const request of requests)
    await emit({ requestId: request.requestId, state: "complete" });
  const queried = requests.length;
  await act(async () => jobs.run(second, true));
  expect(liveRequests).toHaveLength(0);
  await act(async () => {
    await vi.advanceTimersByTimeAsync(30000);
  });
  expect(requests).toHaveLength(queried);
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

it("keeps events flushed by Stop and drops a source failure afterwards", async () => {
  await mount();
  await act(async () => jobs.run(workspace.tabs[0]!, true));
  const requestId = liveRequests[0]!.requestId;
  const id = workspace.tabs[0]!.id;
  const liveFailures = [
    { connectionId: "gcp", name: "Google", error: "failed" },
  ];
  await emit({
    requestId,
    state: "running",
    liveState: "streaming",
    liveFailures,
  });
  await emit({ requestId, state: "running", liveState: "streaming" });
  expect(jobs.runtimes[id]!.liveFailures).toEqual(liveFailures);
  cancelHandler = async (cancelled) => {
    for (const listener of listeners) {
      listener({
        requestId: cancelled,
        state: "running",
        liveState: "streaming",
        events: [logEvent],
      });
      listener({ requestId: cancelled, state: "cancelled" });
    }
  };
  await act(async () => jobs.cancel(id));
  expect(jobs.runtimes[id]).toMatchObject({
    state: "cancelled",
    live: false,
    liveState: "stopped",
  });
  expect(jobs.runtimes[id]!.events.map((item) => item.id)).toEqual([
    "fresh-event",
  ]);
  expect(jobs.runtimes[id]!.liveFailures).toBeUndefined();
});

it("Live retains matching history and counts appended events independently of loaded history", async () => {
  await mount();
  const tab = workspace.tabs[0]!;
  expect(tab.timePreset).toBe("clear");
  expect(requests[0]!.direction).toBe("older");
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
  expect(liveRequests[0]!.direction).toBeUndefined();
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
it("continues paging older Recent events after Live is stopped", async () => {
  await mount();
  const tab = workspace.tabs[0]!;
  await emit({ requestId: requests[0]!.requestId, state: "complete", events: [logEvent], cursor: "older-page" });
  await act(async () => jobs.run(tab, true));
  await emit({ requestId: liveRequests[0]!.requestId, state: "running", liveState: "streaming" });
  await act(async () => jobs.cancel(tab.id));
  expect(jobs.runtimes[tab.id]).toMatchObject({ state: "complete", cursor: "older-page", live: false });
  await act(async () => jobs.run(tab, false, true));
  expect(requests.at(-1)).toMatchObject({ cursor: "older-page", direction: "older" });
});
it("reloads Recent after Live evicts old rows instead of skipping a history gap", async () => {
  workspace.preferences.maxEvents = 2;
  await mount();
  const tab = workspace.tabs[0]!;
  await emit({ requestId: requests[0]!.requestId, state: "complete", events: [logEvent, { ...logEvent, id: "newer", timestamp: 2000 }], cursor: "older-page" });
  await act(async () => jobs.run(tab, true));
  await emit({ requestId: liveRequests[0]!.requestId, state: "running", liveState: "streaming", events: [{ ...logEvent, id: "live", timestamp: 3000 }] });
  expect(jobs.runtimes[tab.id].evicted).toBeGreaterThan(0);
  await act(async () => jobs.cancel(tab.id));
  expect(requests).toHaveLength(2);
  expect(requests[1]).toMatchObject({ direction: "older" });
  expect(requests[1].cursor).toBeUndefined();
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

it("keeps Live startup after an empty result independent of obsolete refresh configuration", async () => {
  vi.useFakeTimers();
  Object.assign(workspace.preferences, { refreshSeconds: 1 });
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

it("Stop Live retains events and stays stopped with obsolete refresh configuration present", async () => {
  vi.useFakeTimers();
  Object.assign(workspace.preferences, { refreshSeconds: 1 });
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
  Object.assign(workspace.preferences, { refreshSeconds: 1 });
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
  it.each([{ kind: "events" as const, expected: [1, 2, 3] }])(
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
  it("queries changed sources once and does not repeat that active request over time", async () => {
    vi.useFakeTimers();
    Object.assign(workspace.preferences, { refreshSeconds: 1 });
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
  it.each(["events"] as const)(
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

const HOUR = 3600000;
const streaming = (requestId: string, events: LogEvent[] = []): QueryUpdate => ({
  requestId,
  state: "running",
  liveState: "streaming",
  events,
});
const sleep = (value: boolean) =>
  act(async () =>
    renderer!.update(<Harness value={workspace} liveAsleep={value} />),
  );

const later = (time: number) =>
  act(async () => {
    await vi.advanceTimersByTimeAsync(time);
  });

describe("Live sleep and missed events", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(100 * HOUR);
  });
  afterEach(() => vi.useRealTimers());

  it("sleeps a visible Live view and resumes it with the events missed meanwhile", async () => {
    const tab = workspace.tabs[0];
    await mount();
    await act(async () => jobs.run(tab, true));
    const old = liveRequests[0];
    expect(old.catchUp).toBeUndefined();
    await emit(streaming(old.requestId, [logEvent]));
    await later(HOUR);
    const slept = Date.now();
    await sleep(true);
    expect(cancellations).toContain(old.requestId);
    expect(jobs.runtimes[tab.id]).toMatchObject({
      live: true,
      livePaused: true,
      events: [logEvent],
    });
    // Events held back by a merged stream, and its end.
    await emit(streaming(old.requestId, [{ ...logEvent, id: "late" }]));
    await emit({ requestId: old.requestId, state: "cancelled" });
    expect(jobs.runtimes[tab.id]).toMatchObject({
      live: true,
      events: [logEvent],
    });
    await later(8 * HOUR);
    await sleep(false);
    expect(liveRequests).toHaveLength(2);
    expect(liveRequests[1].catchUp).toEqual({
      from: slept - 120_000,
      limit: workspace.preferences.maxEvents,
    });
    expect(jobs.runtimes[tab.id]).toMatchObject({
      live: true,
      livePaused: false,
      catchUp: { state: "loading" },
      events: [logEvent],
    });
    // Sleeping again before the events were loaded keeps the whole period.
    const second = liveRequests[1].requestId;
    await emit(streaming(second));
    await sleep(true);
    await later(HOUR);
    await sleep(false);
    expect(liveRequests[2].catchUp!.from).toBe(slept - 120_000);
    const third = liveRequests[2].requestId;
    await emit(streaming(third));
    await emit({
      requestId: third,
      state: "running",
      replace: false,
      catchUp: { state: "complete" },
    });
    expect(jobs.runtimes[tab.id].missedSince).toBeUndefined();
    const again = Date.now();
    await sleep(true);
    await sleep(false);
    expect(liveRequests[3].catchUp!.from).toBe(again - 120_000);
  });

  it("never loads events from before Live started or after Stop Live", async () => {
    const tab = workspace.tabs[0];
    await mount();
    await act(async () => jobs.run(tab, true));
    await sleep(true);
    await sleep(false);
    expect(liveRequests[1].catchUp).toBeUndefined();
    await emit(streaming(liveRequests[1].requestId));
    const connected = Date.now();
    await later(5000);
    await sleep(true);
    await sleep(false);
    expect(liveRequests[2].catchUp!.from).toBe(connected);
    await act(async () => jobs.cancel(tab.id));
    await sleep(true);
    await sleep(false);
    expect(liveRequests).toHaveLength(3);
    await act(async () => jobs.run(tab, true));
    expect(liveRequests[3].catchUp).toBeUndefined();
  });

  it("stays stopped when Live is stopped while asleep", async () => {
    const tab = workspace.tabs[0];
    await mount();
    await act(async () => jobs.run(tab, true));
    await emit(streaming(liveRequests[0].requestId, [logEvent]));
    await sleep(true);
    await act(async () => jobs.cancel(tab.id));
    await sleep(false);
    expect(liveRequests).toHaveLength(1);
    expect(jobs.runtimes[tab.id]).toMatchObject({
      live: false,
      state: "cancelled",
      events: [logEvent],
    });
  });

  it("loads missed events when an inactive tab is shown again", async () => {
    const { first, second } = twoTabs();
    await mount();
    await act(async () => jobs.run(first, true));
    await emit(streaming(liveRequests[0].requestId));
    await later(HOUR);
    const hidden = Date.now();
    await replaceWorkspace(
      workspaceReducer(workspace, { type: "tab/select", tabId: second.id }),
    );
    await later(HOUR);
    await replaceWorkspace(
      workspaceReducer(workspace, { type: "tab/select", tabId: first.id }),
    );
    expect(liveRequests[1].catchUp!.from).toBe(hidden - 120_000);
  });

  it("continues the streaming filter and keeps rows when the filter was edited", async () => {
    const tab = workspace.tabs[0];
    await mount();
    await act(async () => jobs.run(tab, true));
    await emit(streaming(liveRequests[0].requestId, [logEvent]));
    await replaceWorkspace({
      ...workspace,
      tabs: workspace.tabs.map((item) =>
        item.id === tab.id ? { ...item, filterPattern: "edited" } : item,
      ),
    });
    await sleep(true);
    await sleep(false);
    expect(liveRequests[1].filterPattern).toBe(liveRequests[0].filterPattern);
    expect(jobs.runtimes[tab.id].events).toEqual([logEvent]);
  });

  it("loads missed events on Retry after a failure and after a suspended computer resumes", async () => {
    const tab = workspace.tabs[0];
    await mount();
    await act(async () => jobs.run(tab, true));
    await emit(streaming(liveRequests[0].requestId, [logEvent]));
    await later(HOUR);
    const failed = Date.now();
    await emit({
      requestId: liveRequests[0].requestId,
      state: "error",
      error: "Connection lost",
    });
    await later(HOUR);
    await act(async () => jobs.run(tab, true));
    expect(liveRequests[1].catchUp!.from).toBe(failed - 120_000);
    const id = liveRequests[1].requestId;
    await emit(streaming(id));
    await emit({
      requestId: id,
      state: "running",
      catchUp: { state: "complete" },
    });
    await later(HOUR);
    const suspended = Date.now();
    vi.setSystemTime(suspended + 3 * HOUR);
    await later(10_000);
    expect(liveRequests).toHaveLength(3);
    expect(liveRequests[2].catchUp!.from).toBe(suspended - 120_000);
    expect(cancellations).toContain(id);
  });

  it("adds only missing events, keeping genuine repeats", async () => {
    const tab = workspace.tabs[0];
    await mount();
    await act(async () => jobs.run(tab, true));
    await emit(streaming(liveRequests[0].requestId, [logEvent]));
    await sleep(true);
    await sleep(false);
    const history = (name: string, message = logEvent.message) => ({
      ...logEvent,
      id: name,
      message,
    });
    const update = {
      requestId: liveRequests[1].requestId,
      state: "running" as const,
      replace: false,
      events: [history("h1"), history("h2", "missed"), history("h3")],
      occurrences: [1, 1, 2],
    };
    const ids = () => jobs.runtimes[tab.id].events.map((item) => item.id);
    await emit(update);
    expect(ids()).toEqual(["fresh-event", "h2", "h3"]);
    await emit({
      ...update,
      events: [history("live", "missed"), history("new", "new")],
      occurrences: [1, 1],
    });
    expect(ids()).toEqual(["fresh-event", "h2", "h3", "new"]);
  });
});
