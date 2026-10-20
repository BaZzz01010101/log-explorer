import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, expect, it, vi } from "vitest";
import { SourceBadges } from "../src/renderer/components/SourceBadges";
import { SOURCE_DROP_EVENT } from "../src/renderer/components/ResourceDragLabel";
import { createWorkspace } from "../src/renderer/workspace";
import {
  RESOURCE_DRAG_START,
  RESOURCE_DRAG_END,
  announceResourceDragStart,
  announceResourceDragEnd,
} from "../src/renderer/resource-drag";

let renderer: ReactTestRenderer;
afterEach(async () => {
  await act(async () => {
    if (typeof window !== "undefined") announceResourceDragEnd(false);
    renderer?.unmount();
  });
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

it("reveals a single-source control mounted after a resource drag has already started", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("window", new EventTarget());
  vi.spyOn(console, "error").mockImplementation(() => {});
  const workspace = createWorkspace();
  announceResourceDragStart();
  await act(async () => {
    renderer = create(
      <SourceBadges
        sources={workspace.tabs[0].sources}
        connectionId="offline"
        connections={workspace.connections}
        onChange={() => {}}
      />,
    );
  });
  expect(
    renderer.root.findByProps({ className: "source-control" }).props.hidden,
  ).toBe(false);
  await act(async () => announceResourceDragEnd(false));
  expect(
    renderer.root.findByProps({ className: "source-control" }).props.hidden,
  ).toBe(true);
});

it("adds regional streams through the strip, removes one badge and ignores duplicate drops", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const windowTarget = new EventTarget();
  vi.stubGlobal("window", windowTarget);
  const original = console.error.bind(console);
  vi.spyOn(console, "error").mockImplementation((...args) => {
    if (!String(args[0]).includes("react-test-renderer is deprecated"))
      original(...args);
  });
  const west = createWorkspace().connections[0],
    east = { ...west, id: "east", region: "us-east-1" };
  const target = new EventTarget(),
    change = vi.fn();
  let sources = [
    { logGroup: "/aws/lambda/orders-api", logStreams: ["abcdef123"] },
  ];
  const render = () => (
    <SourceBadges
      sources={sources}
      connectionId={west.id}
      connections={[west, east]}
      onChange={change}
    />
  );
  await act(async () => {
    renderer = create(render(), {
      createNodeMock: (element) =>
        (element.props as { className?: string }).className?.startsWith(
          "source-badges",
        )
          ? target
          : null,
    });
  });
  expect(
    renderer.root.findByProps({ className: "source-control" }).props.hidden,
  ).toBe(true);
  await act(async () => {
    windowTarget.dispatchEvent(new Event(RESOURCE_DRAG_START));
  });
  expect(
    renderer.root.findByProps({ className: "source-control" }).props.hidden,
  ).toBe(false);
  await act(async () => {
    windowTarget.dispatchEvent(new Event(RESOURCE_DRAG_END));
  });
  expect(
    renderer.root.findByProps({ className: "source-control" }).props.hidden,
  ).toBe(true);
  const drop = async (connectionId: string, stream: string) =>
    act(async () => {
      target.dispatchEvent(
        new CustomEvent(SOURCE_DROP_EVENT, {
          detail: {
            connectionId,
            sources: [
              { logGroup: "/aws/lambda/orders-api", logStreams: [stream] },
            ],
          },
        }),
      );
    });
  await drop("east", "ghijkl456");
  expect(change.mock.calls[0][0]).toEqual([
    ...sources,
    {
      connectionId: "east",
      logGroup: "/aws/lambda/orders-api",
      logStreams: ["ghijkl456"],
    },
  ]);
  sources = change.mock.calls[0][0];
  await act(async () => renderer.update(render()));
  expect(
    renderer.root.findByProps({ className: "source-control" }).props.hidden,
  ).toBe(false);
  expect(
    renderer.root
      .findByProps({ className: "source-strip-label" })
      .children.join(""),
  ).toBe("2 Sources");
  change.mockClear();
  await drop("east", "ghijkl456");
  expect(change).not.toHaveBeenCalled();
  const remove = renderer.root
    .findAllByType("button")
    .find((button) => button.props["aria-label"].includes("ghijkl456"))!;
  await act(async () => remove.props.onClick());
  expect(change.mock.calls[0][0]).toEqual([sources[0]]);
  change.mockClear();
  await drop("missing", "ignored");
  expect(change).not.toHaveBeenCalled();
  expect(
    renderer.root.findByProps({ role: "alert" }).children.join(""),
  ).toContain("no longer available");
});
