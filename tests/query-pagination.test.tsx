import { act, create, type ReactTestRenderer } from "react-test-renderer";
import type { ReactNode } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { QueryPane } from "../src/renderer/components/QueryPane";
import { LogViewer } from "../src/renderer/components/LogViewer";
import { createWorkspace } from "../src/renderer/workspace";
import { resolveTimeRange } from "../src/renderer/query-state";
import type { TabRuntime } from "../src/renderer/useLogJobs";

vi.mock("../src/renderer/components/LogViewer", () => ({
  LogViewer: () => null,
}));
vi.mock("../src/renderer/components/TimeRangePicker", () => ({
  TimeRangePicker: () => null,
}));
vi.mock("@mantine/core", async () => {
  const { createElement } = await import("react");
  const component = ({ children, ...props }: Record<string, unknown>) =>
    createElement("div", props, children as ReactNode);
  return {
    ActionIcon: component,
    Alert: component,
    Badge: component,
    Button: component,
    Group: component,
    Loader: component,
    Modal: component,
    Select: component,
    SegmentedControl: component,
    Text: component,
    Textarea: component,
    TextInput: component,
    Tooltip: component,
    Menu: Object.assign(component, {
      Target: component,
      Dropdown: component,
      Label: component,
      Divider: component,
      Item: component,
    }),
  };
});
let renderer: ReactTestRenderer | undefined;
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const original = console.error.bind(console);
  vi.spyOn(console, "error").mockImplementation((...args) => {
    if (String(args[0]).startsWith("react-test-renderer is deprecated")) return;
    original(...args);
  });
});
afterEach(async () => {
  await act(async () => renderer?.unmount());
  renderer = undefined;
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
function setup() {
  const workspace = createWorkspace(),
    tab = workspace.tabs[0];
  const onRun = vi.fn();
  const runtime: TabRuntime = {
    events: [],
    live: false,
    state: "complete",
    evicted: 0,
    cursor: "next",
    request: {
      requestId: "initial-run",
      connection: workspace.connections[0],
      sources: tab.sources,
      ...resolveTimeRange(tab.timePreset),
      kind: tab.kind,
      filterPattern: tab.filterPattern,
      query: tab.query,
      limit: 1000,
    },
  };
  const props = {
    workspace,
    tab,
    runtime,
    onRun,
    onPatch() {},
    onTimezoneChange() {},
    onCancel() {},
    onSaveQuery() {},
    onSavePreset() {},
    onContext() {},
  };
  return { props, runtime, onRun };
}

it("provides automatic event pagination while retaining the original query generation across page requests", async () => {
  const { props, runtime, onRun } = setup();
  await act(async () => {
    renderer = create(<QueryPane {...props} />);
  });
  const pagination = renderer!.root.findByType(LogViewer).props.pagination;
  expect(pagination?.pageKey).toBe(JSON.stringify(["next", "initial-run"]));
  pagination.onLoad();
  expect(onRun).toHaveBeenCalledExactlyOnceWith(false, true);
  await act(async () => {
    renderer!.update(
      <QueryPane
        {...props}
        runtime={{
          ...runtime,
          request: {
            ...runtime.request!,
            requestId: "second-page",
            cursor: "next",
          },
          cursor: "third",
        }}
      />,
    );
  });
  const next = renderer!.root.findByType(LogViewer).props.pagination;
  expect(next.scope).toBe(pagination.scope);
  expect(next.pageKey).toBe(JSON.stringify(["third", "second-page"]));
  await act(async () => {
    renderer!.update(
      <QueryPane
        {...props}
        runtime={{
          ...runtime,
          state: "queued",
          cursor: undefined,
          request: {
            ...runtime.request!,
            requestId: "third-page",
            cursor: "third",
          },
        }}
      />,
    );
  });
  expect(renderer!.root.findByType(LogViewer).props.pagination?.scope).toBe(
    pagination.scope,
  );
  expect(
    renderer!.root.findByType(LogViewer).props.pagination?.pageKey,
  ).toBeUndefined();
  await act(async () => {
    renderer!.update(
      <QueryPane
        {...props}
        runtime={{
          ...runtime,
          request: { ...runtime.request!, requestId: "new-manual-run" },
        }}
      />,
    );
  });
  expect(renderer!.root.findByType(LogViewer).props.pagination.scope).not.toBe(
    pagination.scope,
  );
});

it.each([
  "running",
  "error",
  "cancelled",
  "live",
  "stale",
  "buffer full",
  "truncated",
])("does not automatically page a %s result", async (state) => {
  const { props, runtime } = setup();
  const next = { ...runtime };
  if (state === "running") next.state = "running";
  if (state === "error") {
    next.state = "error";
    next.error = "failed";
  }
  if (state === "cancelled") next.state = "cancelled";
  if (state === "live") next.live = true;
  if (state === "stale")
    next.request = { ...runtime.request!, filterPattern: "old filter" };
  if (state === "buffer full")
    next.events = Array.from(
      { length: props.workspace.preferences.maxEvents },
      (_, index) => ({
        id: String(index),
        timestamp: index,
        message: "event",
        logGroup: "/group",
        logStream: "stream",
      }),
    );
  if (state === "truncated") next.truncated = true;
  await act(async () => {
    renderer = create(<QueryPane {...props} runtime={next} />);
  });
  expect(
    renderer!.root.findByType(LogViewer).props.pagination?.pageKey,
  ).toBeUndefined();
});

it("gives three successive pages distinct keys when the adapter reuses one opaque cursor", async () => {
  const { props, runtime } = setup();
  await act(async () => {
    renderer = create(<QueryPane {...props} />);
  });
  const scope = renderer!.root.findByType(LogViewer).props.pagination.scope;
  const keys = new Set<string>();
  for (let page = 1; page <= 3; page++) {
    const request = {
      ...runtime.request!,
      requestId: `page-${page}`,
      cursor: "opaque-session",
    };
    await act(async () => {
      renderer!.update(
        <QueryPane
          {...props}
          runtime={{ ...runtime, state: "queued", cursor: undefined, request }}
        />,
      );
    });
    expect(renderer!.root.findByType(LogViewer).props.pagination.scope).toBe(
      scope,
    );
    expect(
      renderer!.root.findByType(LogViewer).props.pagination.pageKey,
    ).toBeUndefined();
    await act(async () => {
      renderer!.update(
        <QueryPane
          {...props}
          runtime={{ ...runtime, cursor: "opaque-session", request }}
        />,
      );
    });
    const pagination = renderer!.root.findByType(LogViewer).props.pagination;
    expect(pagination.scope).toBe(scope);
    expect(pagination.pageKey).toBe(
      JSON.stringify(["opaque-session", `page-${page}`]),
    );
    keys.add(pagination.pageKey);
  }
  expect(keys.size).toBe(3);
});
