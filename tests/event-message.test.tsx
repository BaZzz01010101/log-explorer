import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { useState } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import {
  JsonTree,
  MessageContent,
} from "../src/renderer/components/EventMessage";
import { Menu } from "../src/renderer/components/AppMenu";
vi.mock("@mantine/core", async () => {
  const { createElement } = await import("react");
  const component = ({ children, ...props }: any) =>
    createElement("div", props, children);
  const item = ({ children, ...props }: any) =>
    createElement("button", { ...props, role: "menuitem" }, children);
  return {
    Menu: Object.assign(component, {
      Sub: Object.assign(component, {
        Target: component,
        Item: item,
        Dropdown: component,
      }),
      Target: component,
      ContextMenu: component,
      Dropdown: component,
      Item: item,
      Label: component,
      Divider: component,
    }),
  };
});

let renderer: ReactTestRenderer;
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const original = console.error.bind(console);
  vi.spyOn(console, "error").mockImplementation((...args) => {
    if (!String(args[0]).startsWith("react-test-renderer is deprecated"))
      original(...args);
  });
});
afterEach(async () => {
  await act(async () => renderer?.unmount());
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
const button = (label: string) =>
  renderer.root
    .findAllByType("button")
    .find((node) => node.props["aria-label"] === label);
const openField = async (path: string) =>
  act(async () =>
    renderer.root
      .findByProps({ "data-json-path": path })
      .findByType(Menu)
      .props.onChange(true),
  );

it("Ctrl-click recursively opens a partly folded branch and folds it only when all descendants are open", async () => {
  await act(async () => {
    renderer = create(
      <JsonTree
        value={{
          branch: { nested: { list: [{ id: 1 }] } },
          sibling: { keep: { value: 2 } },
        }}
        highlight=""
      />,
    );
  });
  await act(async () => button("Expand /sibling")!.props.onClick());
  await act(async () => button("Expand /sibling/keep")!.props.onClick());
  await act(async () =>
    button("Expand /branch")!.props.onClick({ ctrlKey: true }),
  );
  expect(button("Collapse /branch/nested/list/0")).toBeDefined();
  await act(async () =>
    button("Collapse /branch/nested/list")!.props.onClick(),
  );
  await act(async () =>
    button("Collapse /branch")!.props.onClick({ ctrlKey: true }),
  );
  expect(button("Collapse /branch/nested/list/0")).toBeDefined();
  await act(async () =>
    button("Collapse /branch")!.props.onClick({ ctrlKey: true }),
  );
  expect(button("Expand /branch")).toBeDefined();
  expect(button("Collapse /sibling/keep")).toBeDefined();
  await act(async () => button("Expand /branch")!.props.onClick());
  expect(button("Expand /branch/nested")).toBeDefined();
});

it("copies full current scalar and object values from the field menu", async () => {
  const copy = vi.fn();
  const value = {
    decoded: "café +\n" + "x".repeat(5000),
    payload: { list: [7, false, null] },
  };
  await act(async () => {
    renderer = create(
      <JsonTree value={value} highlight="" onCopyValue={copy} />,
    );
  });
  await openField("/decoded");
  await act(async () => button("Copy /decoded value")!.props.onClick());
  expect(copy).toHaveBeenLastCalledWith(value.decoded);
  await openField("/payload");
  await act(async () => button("Copy /payload value")!.props.onClick());
  expect(copy).toHaveBeenLastCalledWith(JSON.stringify(value.payload, null, 2));
});

it("copies an escaped JSON path from the field menu without hover path tooltips", async () => {
  const copy = vi.fn();
  await act(async () => {
    renderer = create(
      <JsonTree value={{ "a/b~c": 1 }} highlight="" onCopyValue={copy} />,
    );
  });
  await openField("/a~1b~0c");
  await act(async () => button("Copy /a~1b~0c path")!.props.onClick());
  expect(copy).toHaveBeenLastCalledWith("/a~1b~0c");
  expect(
    renderer.root
      .findAll((node) => node.props.className === "json-key")
      .every((node) => !node.props["data-tooltip"]),
  ).toBe(true);
});

it("an explicit row expansion request opens nested JSON once and leaves later manual folding intact", async () => {
  const render = (request: number) => (
    <JsonTree
      value={{ nested: { list: [{ value: 1 }] } }}
      highlight=""
      expandRequest={request}
    />
  );
  await act(async () => {
    renderer = create(render(1));
  });
  expect(button("Collapse /nested/list/0")).toBeDefined();
  await act(async () => button("Collapse /nested")!.props.onClick());
  await act(async () => renderer.update(render(1)));
  expect(button("Expand /nested")).toBeDefined();
  await act(async () => renderer.update(render(2)));
  expect(button("Collapse /nested/list/0")).toBeDefined();
});

it("unfolds nested structured values and folds back to first-level fields", async () => {
  await act(async () => {
    renderer = create(
      <JsonTree value={{ request: { ids: [7, 8] } }} highlight="" controls />,
    );
  });
  expect(button("Unfold structured object")).toBeDefined();
  expect(button("Fold structured object")).toBeUndefined();
  expect(button("Unfold structured object")).toBeDefined();
  expect(button("Unfold structured object")!.props["aria-pressed"]).toBe(false);
  expect(button("Unfold structured object")!.props["data-tooltip"]).toBe(
    "Unfold structured object",
  );
  await act(async () => button("Unfold structured object")!.props.onClick());
  expect(button("Collapse /request/ids")).toBeDefined();
  expect(button("Unfold structured object")).toBeUndefined();
  expect(button("Fold structured object")!.props["aria-pressed"]).toBe(true);
  expect(
    renderer.root.findAll((node) => node.props.className === "json-key"),
  ).toHaveLength(5);
  await act(async () => button("Fold structured object")!.props.onClick());
  expect(button("Collapse root")).toBeDefined();
  expect(button("Expand /request")).toBeDefined();
  expect(
    renderer.root.findAll((node) => node.props.className === "json-key"),
  ).toHaveLength(2);
});

it("retains the inspector expansion preference across selected event changes", async () => {
  function Inspector({ eventId }: { eventId: string }) {
    const [expanded, setExpanded] = useState(false);
    return (
      <JsonTree
        key={eventId}
        value={{ nested: { leaf: { value: 1 } } }}
        highlight=""
        controls
        defaultExpanded={expanded}
        onToggleAll={setExpanded}
      />
    );
  }
  await act(async () => {
    renderer = create(<Inspector eventId="first" />);
  });
  expect(button("Expand /nested")).toBeDefined();
  await act(async () => button("Unfold structured object")!.props.onClick());
  expect(button("Collapse /nested/leaf")).toBeDefined();
  await act(async () => renderer.update(<Inspector eventId="second" />));
  expect(button("Collapse /nested/leaf")).toBeDefined();
  await act(async () => button("Fold structured object")!.props.onClick());
  await act(async () => renderer.update(<Inspector eventId="third" />));
  expect(button("Collapse root")).toBeDefined();
  expect(button("Expand /nested")).toBeDefined();
  expect(button("Collapse /nested/leaf")).toBeUndefined();
});

it("shows the saved folded state even when an object has only first-level values", async () => {
  await act(async () => {
    renderer = create(
      <JsonTree
        value={{ message: "flat" }}
        highlight=""
        controls
        defaultExpanded={false}
      />,
    );
  });
  expect(button("Unfold structured object")!.props["aria-pressed"]).toBe(false);
  expect(button("Collapse root")).toBeDefined();
});

it("keeps the tab folding control available for plain messages", async () => {
  const change = vi.fn();
  const row = {
    event: {
      id: "plain-control",
      timestamp: 1,
      message: "plain text",
      logGroup: "/test",
      logStream: "test",
    },
    parsed: { kind: "text" as const },
    level: "info" as const,
  };
  const render = (expanded: boolean) => (
    <MessageContent
      row={row}
      highlight=""
      controls
      defaultExpanded={expanded}
      onToggleAll={change}
    />
  );
  await act(async () => {
    renderer = create(render(false));
  });
  expect(button("Unfold structured object")).toBeDefined();
  await act(async () => button("Unfold structured object")!.props.onClick());
  expect(change).toHaveBeenLastCalledWith(true);
  await act(async () => renderer.update(render(true)));
  expect(button("Fold structured object")!.props["aria-pressed"]).toBe(true);
  await act(async () => button("Fold structured object")!.props.onClick());
  expect(change).toHaveBeenLastCalledWith(false);
});

it("uses the tab's folded default for flat JSON rather than inferring a different tab state", async () => {
  const change = vi.fn();
  await act(async () => {
    renderer = create(
      <JsonTree
        value={{ msg: "flat" }}
        highlight=""
        controls
        onToggleAll={change}
      />,
    );
  });
  expect(button("Unfold structured object")!.props["aria-pressed"]).toBe(false);
  await act(async () => button("Unfold structured object")!.props.onClick());
  expect(change).toHaveBeenCalledExactlyOnceWith(true);
});

it("renders inspector actions in a toolbar slot without resetting expanded branches", async () => {
  const row = {
    event: {
      id: "actions",
      timestamp: 1,
      message: "{}",
      logGroup: "/test",
      logStream: "test",
    },
    level: "info" as const,
    parsed: { kind: "json" as const, value: { request: { ids: [7, 8] } } },
  };
  const content = (ready: boolean) => (
    <MessageContent
      row={row}
      highlight=""
      controls
      lineWrap={{ enabled: true, onToggle: () => {} }}
      renderActions={(actions) =>
        ready ? (
          <section aria-label="Inspector message actions">{actions}</section>
        ) : null
      }
    />
  );
  await act(async () => {
    renderer = create(content(false));
  });
  expect(button("Toggle inspector line wrap")).toBeUndefined();
  await act(async () => button("Expand /request")!.props.onClick());
  await act(async () => renderer.update(content(true)));
  const toolbar = renderer.root.findByProps({
    "aria-label": "Inspector message actions",
  });
  expect(toolbar.findAllByType("button")).toHaveLength(2);
  expect(button("Collapse /request")).toBeDefined();
  expect(button("Unfold structured object")).toBeDefined();
  await act(async () => button("Unfold structured object")!.props.onClick());
  expect(button("Collapse /request/ids")).toBeDefined();
  expect(toolbar.findAllByType("button")).toHaveLength(2);
  await act(async () => button("Fold structured object")!.props.onClick());
  expect(button("Collapse root")).toBeDefined();
  expect(button("Expand /request")).toBeDefined();
});

it("places raw-message wrapping in the inspector toolbar slot without structured folding", async () => {
  await act(async () => {
    renderer = create(
      <MessageContent
        row={{
          event: {
            id: "raw-actions",
            timestamp: 1,
            message: "plain text",
            logGroup: "/test",
            logStream: "test",
          },
          level: "info",
          parsed: { kind: "text" },
        }}
        highlight=""
        lineWrap={{ enabled: false, onToggle: () => {} }}
        renderActions={(actions) => (
          <section aria-label="Inspector message actions">{actions}</section>
        )}
      />,
    );
  });
  const toolbar = renderer.root.findByProps({
    "aria-label": "Inspector message actions",
  });
  expect(toolbar.findAllByType("button")).toHaveLength(1);
  expect(button("Toggle inspector line wrap")!.props["aria-pressed"]).toBe(
    false,
  );
  expect(button("Unfold structured object")).toBeUndefined();
});

it.each(["json", "text"] as const)(
  "keeps inspector wrapping independent of folding for %s messages",
  async (kind) => {
    const onToggle = vi.fn();
    const row = {
      event: {
        id: "wrap",
        timestamp: 1,
        message: "line one\nline two",
        logGroup: "/test",
        logStream: "test",
      },
      level: "info" as const,
      parsed:
        kind === "json"
          ? { kind: "json" as const, value: { nested: { message: "value" } } }
          : { kind: "text" as const },
    };
    await act(async () => {
      renderer = create(
        <MessageContent
          row={row}
          highlight=""
          controls
          lineWrap={{ enabled: false, onToggle }}
        />,
      );
    });
    const wrap = button("Toggle inspector line wrap")!;
    expect(wrap.props["aria-pressed"]).toBe(false);
    expect(wrap.props["data-tooltip"]).toBe("Wrap inspector lines");
    await act(async () => wrap.props.onClick());
    expect(onToggle).toHaveBeenCalledExactlyOnceWith();
    if (kind === "json") {
      expect(button("Unfold structured object")).toBeDefined();
      expect(button("Expand /nested")).toBeDefined();
    }
  },
);

it("adds the exact property value to filtering without losing JSON Pointer escaping", async () => {
  const filtered = vi.fn();
  await act(async () => {
    renderer = create(
      <JsonTree
        value={{ "a/b": { "~id": "needle", count: 7 } }}
        highlight=""
        onAddFilter={filtered}
      />,
    );
  });
  await act(async () => button("Expand /a~1b")!.props.onClick());
  await openField("/a~1b/~0id");
  expect(button("Add /a~1b/~0id to filter")).toBeDefined();
  await act(async () => button("Add /a~1b/~0id to filter")!.props.onClick());
  expect(filtered).toHaveBeenCalledExactlyOnceWith("/a~1b/~0id", "needle");
  await openField("/a~1b/count");
  await act(async () => button("Add /a~1b/count to filter")!.props.onClick());
  expect(filtered).toHaveBeenLastCalledWith("/a~1b/count", 7);
});

it("keeps existing column actions available beside filtering", async () => {
  const column = vi.fn();
  const filtered = vi.fn();
  await act(async () => {
    renderer = create(
      <JsonTree
        value={{ level: "INFO" }}
        highlight=""
        onAddFilter={filtered}
        onAddColumn={column}
      />,
    );
  });
  expect(button("Field actions for /level")).toBeDefined();
  await openField("/level");
  await act(async () => button("Add /level column")!.props.onClick());
  expect(column).toHaveBeenCalledExactlyOnceWith("/level");
  expect(filtered).not.toHaveBeenCalled();
});

it("uses one menu before each property and only permits bounded valid JSON values to deserialize", async () => {
  const deserialize = vi.fn();
  await act(async () => {
    renderer = create(
      <JsonTree
        value={{ encoded: '{"value":1}', bad: "{bad", number: 42 }}
        highlight=""
        onDeserialize={deserialize}
      />,
    );
  });
  expect(button("Field actions for /encoded")).toBeDefined();
  await openField("/bad");
  expect(button("Deserialize /bad")!.props.disabled).toBe(true);
  await openField("/number");
  expect(button("Deserialize /number")!.props.disabled).toBe(true);
  await openField("/encoded");
  expect(button("Deserialize /encoded")!.props.disabled).toBe(false);
  await act(async () => button("Deserialize /encoded")!.props.onClick());
  expect(deserialize).toHaveBeenCalledExactlyOnceWith("/encoded");
});

it("only offers valid URL and Base64 text decoding and forwards the requested encoding", async () => {
  const transform = vi.fn();
  await act(async () => {
    renderer = create(
      <JsonTree
        value={{
          url: "%7B%22ok%22%3Atrue%7D",
          base64: "aGVsbG8=",
          binary: "/w==",
          bad: "%FF",
          number: 4,
        }}
        highlight=""
        onDeserialize={transform}
      />,
    );
  });
  for (const path of ["/binary", "/bad", "/number"]) {
    await openField(path);
    expect(button("URL decode " + path)!.props.disabled).toBe(true);
    expect(button("Base64 decode " + path)!.props.disabled).toBe(true);
  }
  await openField("/url");
  expect(button("URL decode /url")!.props.disabled).toBe(false);
  await act(async () => button("URL decode /url")!.props.onClick());
  expect(transform).toHaveBeenLastCalledWith("/url", "url");
  await openField("/base64");
  expect(button("Base64 decode /base64")!.props.disabled).toBe(false);
  await act(async () => button("Base64 decode /base64")!.props.onClick());
  expect(transform).toHaveBeenLastCalledWith("/base64", "base64");
});
