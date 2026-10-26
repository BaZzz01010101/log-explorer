import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { createElement, type ReactNode } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { workspaceSchema } from "../src/main/security";
import {
  WorkspaceDragSurface,
  WorkspaceTabs,
} from "../src/renderer/components/WorkspaceTabs";
import {
  createTab,
  createWorkspace,
  restoreWorkspace,
  workspaceReducer,
} from "../src/renderer/workspace";

vi.mock("@mantine/core", () => {
  const component = ({ children, ...props }: Record<string, unknown>) =>
    createElement("div", props, children as ReactNode);
  return {
    ActionIcon: component,
    Button: component,
    Group: component,
    Menu: Object.assign(component, {
      Sub: Object.assign(component, {
        Target: component,
        Item: component,
        Dropdown: component,
      }),
      Target: component,
      Dropdown: component,
      Label: component,
      Item: component,
      Divider: component,
    }),
    Modal: component,
    Select: component,
    Stack: component,
    Text: component,
    TextInput: component,
    Tooltip: component,
  };
});
vi.mock("react-dom", () => ({
  createPortal: (children: ReactNode) => children,
}));
vi.mock("@dnd-kit/core", () => ({
  DndContext: ({ children, ...props }: Record<string, unknown>) =>
    createElement(
      "div",
      { ...props, "data-dnd-context": true },
      children as ReactNode,
    ),
  DragOverlay: ({ children }: { children: ReactNode }) => children,
  KeyboardSensor: class {},
  PointerSensor: class {},
  closestCenter: vi.fn(),
  pointerWithin: vi.fn(),
  useSensor: vi.fn(),
  useSensors: vi.fn(),
  useDroppable: () => ({ setNodeRef: vi.fn() }),
  useDraggable: () => ({ setNodeRef: vi.fn(), attributes: {} }),
}));
vi.mock("@dnd-kit/sortable", () => ({
  SortableContext: ({ children, ...props }: Record<string, unknown>) =>
    createElement(
      "div",
      { ...props, "data-sortable-context": true },
      children as ReactNode,
    ),
  horizontalListSortingStrategy: "horizontal",
  rectSortingStrategy: "rectangles",
  sortableKeyboardCoordinates: vi.fn(),
  useSortable: () => ({
    setNodeRef: vi.fn(),
    attributes: {},
    listeners: { onPointerDown: vi.fn() },
    transform: { x: 60, y: 40, scaleX: 1, scaleY: 1 },
    isDragging: true,
  }),
}));

let renderer: ReactTestRenderer | undefined;
const dispatch = vi.fn();
const rectangle = (left: number, top: number, width = 140, height = 40) => ({
  left,
  top,
  width,
  height,
  right: left + width,
  bottom: top + height,
});

beforeEach(() => {
  dispatch.mockClear();
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("document", { body: {}, querySelectorAll: () => [] });
  vi.stubGlobal("requestAnimationFrame", vi.fn());
  vi.stubGlobal("cancelAnimationFrame", vi.fn());
  const original = console.error.bind(console);
  vi.spyOn(console, "error").mockImplementation((...args) => {
    if (!String(args[0]).startsWith("react-test-renderer is deprecated"))
      original(...args);
  });
});

it("does not render an empty separate pinned row", async () => {
  const workspace = createWorkspace();
  workspace.preferences.pinnedTabsSeparateRow = true;
  await act(async () => {
    renderer = create(
      <WorkspaceTabs workspace={workspace} dispatch={dispatch} />,
    );
  });
  expect(
    renderer!.root.findAllByProps({ "data-tab-strip": "pinned" }),
  ).toHaveLength(0);
  expect(
    renderer!.root.findAllByProps({ "data-tab-strip": "regular" }),
  ).toHaveLength(1);
});

it("lists only closed views newest first and restores the selected history entry", async () => {
  const workspace = createWorkspace();
  const older = createTab("offline", [{ logGroup: "closed-older" }]);
  const newer = createTab("offline", [{ logGroup: "closed-newer" }]);
  workspace.closedTabs = [newer, older];
  await act(async () => {
    renderer = create(
      <WorkspaceTabs workspace={workspace} dispatch={dispatch} />,
    );
  });
  const history = renderer!.root.findAll(
    (node) =>
      typeof node.type === "string" &&
      node.props["data-closed-tab-id"] !== undefined,
  );
  expect(history.map((node) => node.props["data-closed-tab-id"])).toEqual([
    newer.id,
    older.id,
  ]);
  const dropdown = renderer!.root
    .findAllByProps({ className: "closed-tab-history" })
    .find((node) => typeof node.type === "string")!;
  expect(
    dropdown.findAll((node) => node.children.includes(workspace.tabs[0].title)),
  ).toHaveLength(0);
  await act(async () => history[1].props.onClick());
  expect(dispatch).toHaveBeenCalledWith({
    type: "tab/reopen",
    tabId: older.id,
  });
});

it("keeps mixed source counts separate from renamed tab labels", async () => {
  const workspace = createWorkspace();
  workspace.tabs[0].sources = [{ logGroup: "one" }, { logGroup: "two" }];
  workspace.tabs[0].customTitle = "My investigation";
  await act(async () => {
    renderer = create(
      <WorkspaceTabs workspace={workspace} dispatch={dispatch} />,
    );
  });
  const label = renderer!.root.findByProps({ role: "tab" });
  expect(label.findByProps({ className: "tab-source-count" }).children).toEqual(
    ["2"],
  );
  expect(label.findAllByType("span")[0].children).toEqual(["My investigation"]);
});

it("shows query and Live activity in each tab's reserved status slot", async () => {
  const workspace = createWorkspace();
  const tabId = workspace.tabs[0].id;
  await act(async () => {
    renderer = create(
      <WorkspaceTabs
        workspace={workspace}
        dispatch={dispatch}
        runtimes={{ [tabId]: { state: "running", live: false } }}
      />,
    );
  });
  expect(
    renderer!.root.findByProps({ "data-tab-activity": "query" }).props[
      "aria-label"
    ],
  ).toBe("Query running");
  await act(async () => {
    renderer!.update(
      <WorkspaceTabs
        workspace={workspace}
        dispatch={dispatch}
        runtimes={{ [tabId]: { state: "running", live: true } }}
      />,
    );
  });
  expect(
    renderer!.root.findByProps({ "data-tab-activity": "live" }).props[
      "aria-label"
    ],
  ).toBe("Live active");
  await act(async () => {
    renderer!.update(
      <WorkspaceTabs
        workspace={workspace}
        dispatch={dispatch}
        runtimes={{ [tabId]: { state: "complete", live: false } }}
      />,
    );
  });
  expect(
    renderer!.root.findByProps({ className: "tab-activity-slot" }).children,
  ).toHaveLength(0);
});

it("aggregates split member activity and retains its Live marker while paused", async () => {
  let workspace = createWorkspace();
  const first = workspace.tabs[0];
  const second = createTab("offline", [{ logGroup: "another" }]);
  workspace = workspaceReducer(workspace, { type: "tab/open", tab: second });
  workspace = workspaceReducer(workspace, {
    type: "pane/show-tabs",
    tabIds: [first.id, second.id],
  });
  await act(async () => {
    renderer = create(
      <WorkspaceTabs
        workspace={workspace}
        dispatch={dispatch}
        runtimes={{ [second.id]: { state: "running", live: true } }}
      />,
    );
  });
  expect(renderer!.root.findAllByProps({ role: "tab" })).toHaveLength(1);
  expect(
    renderer!.root.findByProps({ "data-tab-activity": "live" }).props[
      "aria-label"
    ],
  ).toBe("Live active");
  await act(async () => {
    renderer!.update(
      <WorkspaceTabs
        workspace={workspace}
        dispatch={dispatch}
        runtimes={{
          [second.id]: { state: "idle", live: true, livePaused: true },
        }}
      />,
    );
  });
  expect(
    renderer!.root.findByProps({ "data-tab-activity": "live" }).props[
      "aria-label"
    ],
  ).toBe("Live paused");
});

it("does not add a SQL label to Insights tabs", async () => {
  const workspace = createWorkspace();
  workspace.tabs[0].kind = "insights";
  await act(async () => {
    renderer = create(
      <WorkspaceTabs workspace={workspace} dispatch={dispatch} />,
    );
  });
  expect(renderer!.root.findAllByProps({ className: "tab-kind" })).toHaveLength(
    0,
  );
});
afterEach(async () => {
  await act(async () => renderer?.unmount());
  renderer = undefined;
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

it("defaults old workspaces to scrolling and restores only valid tab layouts", () => {
  const state = createWorkspace();
  expect(state.preferences.tabBarLayout).toBe("scroll");
  for (const value of [undefined, "invalid", null]) {
    expect(
      restoreWorkspace({
        ...state,
        preferences: { ...state.preferences, tabBarLayout: value },
      }).preferences.tabBarLayout,
    ).toBe("scroll");
  }
  const wrapped = workspaceReducer(state, {
    type: "preferences/update",
    patch: { tabBarLayout: "wrap" },
  });
  expect(restoreWorkspace(wrapped).preferences.tabBarLayout).toBe("wrap");
  expect(workspaceSchema.parse(wrapped).preferences.tabBarLayout).toBe("wrap");
});

it.each(["scroll", "wrap"] as const)(
  "suppresses middle-button autoscroll and closes once from the tab surface in %s mode",
  async (tabBarLayout) => {
    const workspace = createWorkspace();
    workspace.preferences.tabBarLayout = tabBarLayout;
    await act(async () => {
      renderer = create(
        <WorkspaceTabs workspace={workspace} dispatch={dispatch} />,
      );
    });
    const tab = renderer!.root.findByProps({
      "data-tab-id": workspace.tabs[0].id,
    });
    const event = {
      button: 1,
      target: { closest: () => null },
      preventDefault: vi.fn(),
      stopPropagation: vi.fn(),
    };
    await act(async () => tab.props.onPointerDown(event));
    expect(event.preventDefault).toHaveBeenCalledOnce();
    expect(dispatch).not.toHaveBeenCalled();
    await act(async () => tab.props.onAuxClick(event));
    expect(dispatch.mock.calls).toEqual([
      [{ type: "tab/close", tabId: workspace.tabs[0].id }],
    ]);
    expect(
      renderer!.root.findByProps({ role: "tab" }).props.onAuxClick,
    ).toBeUndefined();
  },
);

it("uses both axes while sorting wrapped rows and retains horizontal sorting for scrolling", async () => {
  const workspace = createWorkspace();
  workspace.preferences.tabBarLayout = "wrap";
  await act(async () => {
    renderer = create(
      <WorkspaceTabs workspace={workspace} dispatch={dispatch} />,
    );
  });
  expect(
    renderer!.root.findByProps({ "data-sortable-context": true }).props
      .strategy,
  ).toBe("rectangles");
  expect(
    renderer!.root.findByProps({ role: "tablist" }).props.className,
  ).toContain("is-wrapped");
  expect(
    renderer!.root.findByProps({ "data-tab-id": workspace.tabs[0].id }).props
      .style.transform,
  ).toContain("60px, 40px");
  await act(async () => {
    renderer!.update(
      <WorkspaceTabs
        workspace={{
          ...workspace,
          preferences: { ...workspace.preferences, tabBarLayout: "scroll" },
        }}
        dispatch={dispatch}
      />,
    );
  });
  expect(
    renderer!.root.findByProps({ "data-sortable-context": true }).props
      .strategy,
  ).toBe("horizontal");
  expect(
    renderer!.root.findByProps({ "data-tab-id": workspace.tabs[0].id }).props
      .style.transform,
  ).toContain("60px, 0px");
});

it("detaches a panel at the pointer row, including the end of a nonfinal row", async () => {
  let workspace = createWorkspace();
  for (let index = 0; index < 4; index++)
    workspace = workspaceReducer(workspace, {
      type: "tab/open",
      tab: createTab("offline", [{ logGroup: `group-${index}` }]),
    });
  workspace = workspaceReducer(workspace, {
    type: "pane/show-tabs",
    tabIds: workspace.tabs.slice(0, 2).map((tab) => tab.id),
  });
  const pane = workspace.panes[0];
  const boxes = [
    {
      dataset: { tabId: "first" },
      getBoundingClientRect: () => rectangle(0, 0),
    },
    {
      dataset: { tabId: "second" },
      getBoundingClientRect: () => rectangle(140, 0),
    },
    {
      dataset: { tabId: "third" },
      getBoundingClientRect: () => rectangle(0, 40),
    },
    {
      dataset: { tabId: "fourth" },
      getBoundingClientRect: () => rectangle(140, 40),
    },
  ];
  vi.stubGlobal("document", {
    body: {},
    querySelector: () => ({
      getBoundingClientRect: () => rectangle(0, 0, 340, 80),
    }),
    querySelectorAll: () => boxes,
  });
  await act(async () => {
    renderer = create(
      <WorkspaceDragSurface workspace={workspace} dispatch={dispatch}>
        <span />
      </WorkspaceDragSurface>,
    );
  });
  const context = () =>
    renderer!.root.findByProps({ "data-dnd-context": true });
  const active = {
    id: "header",
    data: { current: { kind: "pane-header", paneId: pane.id } },
  };
  await act(async () => context().props.onDragStart({ active }));
  await act(async () =>
    context().props.onDragMove({
      activatorEvent: { clientX: 100, clientY: 60 },
      delta: { x: 0, y: 0 },
    }),
  );
  let insertion = renderer!.root.findAll(
    (node) => node.props["data-tab-insertion-before"] !== undefined,
  )[0];
  expect(insertion.props["data-tab-insertion-before"]).toBe("fourth");
  expect(insertion.props.style.top).toBe(40);
  expect(insertion.props.style.height).toBe(40);
  await act(async () =>
    context().props.onDragMove({
      activatorEvent: { clientX: 320, clientY: 20 },
      delta: { x: 0, y: 0 },
    }),
  );
  insertion = renderer!.root.findAll(
    (node) => node.props["data-tab-insertion-before"] !== undefined,
  )[0];
  expect(insertion.props["data-tab-insertion-before"]).toBe("third");
  expect(insertion.props.style.top).toBe(0);
  await act(async () =>
    context().props.onDragEnd({
      active,
      over: { id: "strip", data: { current: { kind: "tab-strip" } } },
    }),
  );
  expect(dispatch).toHaveBeenCalledWith({
    type: "pane/detach",
    tabId: pane.tabId,
    beforeTabId: "third",
  });
});
