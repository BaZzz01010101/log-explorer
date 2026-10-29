import { MantineProvider } from "@mantine/core";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { HighlightEventsPreview } from "../src/renderer/components/HighlightEventsPreview";
import { LogViewer } from "../src/renderer/components/LogViewer";
import type { SettingsPreviewSnapshot } from "../src/renderer/settings-preview";
import { createWorkspace } from "../src/renderer/workspace";
import type { HighlightProfile } from "../src/shared/highlights";
import { useEventSelection } from "../src/renderer/useEventSelection";
import { useMessageExpansion } from "../src/renderer/useMessageExpansion";
import type { LogViewerProps } from "../src/renderer/components/LogViewer";

// The preview owns view/theme isolation; LogViewer's DOM and virtualization
// are covered by its renderer and packaged-app tests.
vi.mock("../src/renderer/components/LogViewer", () => ({
  LogViewer: (props: LogViewerProps) => {
    const selection = useEventSelection(
      props.events.map((event) => event.id),
      false,
      props.interactionState?.selection,
    );
    const expansion = useMessageExpansion(
      "hybrid",
      props.interactionState?.expansion,
    );
    return (
      <output data-preview-selection={selection.selectedIds.join(",")}>
        {props.events.map((event) => (
          <button
            key={event.id}
            aria-label={`Select ${event.id}`}
            aria-expanded={expansion.isExpanded(event.id)}
            onClick={(mouse) =>
              selection.select(event.id, {
                additive: mouse.ctrlKey,
                range: mouse.shiftKey,
              })
            }
            onDoubleClick={() => expansion.toggle(event.id)}
          />
        ))}
      </output>
    );
  },
}));

const workspace = createWorkspace();
const preferences = workspace.preferences;
const profile: HighlightProfile = {
  id: "selected",
  name: "Selected profile",
  enabled: true,
  groupPattern: "",
  groupIgnoreCase: false,
  rules: [],
};
const snapshot = (): SettingsPreviewSnapshot => ({
  tabId: "captured-tab",
  label: "Captured tab",
  events: [
    {
      id: "loaded-event",
      timestamp: 0,
      message: "captured error",
      logGroup: "captured-group",
      logStream: "captured-stream",
    },
  ],
  view: {
    mode: "json",
    columns: [{ path: "@message", width: 420, pinned: true }],
    localSearch: "captured",
    highlightText: "error",
    level: "all",
    levels: ["error", "warn"],
    wrap: true,
    sort: { path: "@timestamp", desc: true },
  },
  sourceContext: {
    sources: [{ logGroup: "captured-group" }],
    connections: workspace.connections,
    connectionId: workspace.connections[0].id,
  },
});

let renderer: ReactTestRenderer | undefined;
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const error = console.error.bind(console);
  vi.spyOn(console, "error").mockImplementation((...args) => {
    if (!String(args[0]).includes("react-test-renderer is deprecated"))
      error(...args);
  });
});
afterEach(async () => {
  await act(async () => renderer?.unmount());
  renderer = undefined;
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
const viewers = () => renderer!.root.findAllByType(LogViewer);

it("uses captured events and filters in two locally scoped hybrid themes without changing global theme or storage", async () => {
  const captured = snapshot();
  const globalRoot = { setAttribute: vi.fn() };
  const localStorage = { getItem: vi.fn(), setItem: vi.fn() };
  vi.stubGlobal("window", { localStorage });
  vi.stubGlobal("document", { documentElement: globalRoot });
  const roots = new Map<string, { setAttribute: ReturnType<typeof vi.fn> }>();
  await act(async () => {
    renderer = create(
      <HighlightEventsPreview
        snapshot={captured}
        preferences={preferences}
        profile={profile}
      />,
      {
        createNodeMock(element) {
          const theme = (element.props as { "data-theme"?: string })[
            "data-theme"
          ];
          if (!theme) return null;
          const root = { setAttribute: vi.fn() };
          roots.set(theme, root);
          return root;
        },
      },
    );
  });
  expect(viewers()).toHaveLength(2);
  for (const [index, theme] of ["light", "dark"].entries()) {
    const viewer = viewers()[index];
    expect(viewer.props.events).toBe(captured.events);
    expect(viewer.props.sourceContext).toBe(captured.sourceContext);
    expect(viewer.props.view).toEqual({ ...captured.view, mode: "hybrid" });
    expect(viewer.props.view.columns).not.toBe(captured.view.columns);
    expect(viewer.props.preferences).toEqual({
      ...preferences,
      theme,
      highlightProfiles: [profile],
    });
    expect(viewer.props.pagination).toBeUndefined();
    expect(viewer.props.onContext).toBeUndefined();
    const provider = renderer!.root
      .findAllByType(MantineProvider)
      .find((node) => node.props.forceColorScheme === theme)!;
    expect(provider.props.cssVariablesSelector).not.toBe(":root");
    expect(provider.props.getRootElement()).toBe(roots.get(theme));
    expect(roots.get(theme)!.setAttribute).toHaveBeenCalledWith(
      "data-mantine-color-scheme",
      theme,
    );
  }
  expect(globalRoot.setAttribute).not.toHaveBeenCalled();
  expect(localStorage.getItem).not.toHaveBeenCalled();
  expect(localStorage.setItem).not.toHaveBeenCalled();
  expect(preferences.theme).toBe(workspace.preferences.theme);
});

it("shares preview view changes across themes and preserves them while the selected profile changes live", async () => {
  const captured = snapshot();
  const original = structuredClone(captured);
  await act(async () => {
    renderer = create(
      <HighlightEventsPreview
        snapshot={captured}
        preferences={preferences}
        profile={profile}
      />,
    );
  });
  await act(async () =>
    viewers()[0].props.onViewChange({
      ...viewers()[0].props.view,
      mode: "table",
      localSearch: "preview only",
      columns: [{ path: "@message", width: 610 }],
    }),
  );
  expect(viewers()[0].props.view).toMatchObject({
    mode: "hybrid",
    localSearch: "preview only",
    columns: [{ path: "@message", width: 610 }],
  });
  expect(viewers()[1].props.view.localSearch).toBe("preview only");
  expect(captured).toEqual(original);
  const updated = { ...profile, name: "Edited profile" };
  await act(async () =>
    renderer!.update(
      <HighlightEventsPreview
        snapshot={captured}
        preferences={{ ...preferences, fontSize: 14 }}
        profile={updated}
      />,
    ),
  );
  expect(viewers()[0].props.view.localSearch).toBe("preview only");
  expect(viewers()[1].props.view.localSearch).toBe("preview only");
  for (const viewer of viewers()) {
    expect(viewer.props.preferences.highlightProfiles).toEqual([updated]);
    expect(viewer.props.preferences.fontSize).toBe(14);
    expect(viewer.props.view.columns).toEqual([
      { path: "@message", width: 610 },
    ]);
  }
  const recaptured = {
    ...snapshot(),
    events: [{ ...captured.events[0], id: "newly-captured-event" }],
  };
  await act(async () =>
    renderer!.update(
      <HighlightEventsPreview
        snapshot={recaptured}
        preferences={preferences}
        profile={updated}
      />,
    ),
  );
  for (const viewer of viewers()) {
    expect(viewer.props.view.localSearch).toBe("captured");
    expect(viewer.props.events[0].id).toBe("newly-captured-event");
  }
});

it("shares anchored selection and message folds between themes while profile edits retain preview state", async () => {
  const captured = snapshot();
  captured.events = ["a", "b", "c", "d"].map((id) => ({
    ...captured.events[0],
    id,
  }));
  await act(async () => {
    renderer = create(
      <HighlightEventsPreview
        snapshot={captured}
        preferences={preferences}
        profile={profile}
      />,
    );
  });
  const select = (
    theme: number,
    id: string,
    options: { additive?: boolean; range?: boolean } = {},
  ) =>
    viewers()
      [theme].findByProps({ "aria-label": `Select ${id}` })
      .props.onClick({ ctrlKey: options.additive, shiftKey: options.range });
  const selected = () =>
    renderer!.root
      .findAllByType("output")
      .map((node) => node.props["data-preview-selection"]);
  await act(async () => select(0, "a"));
  expect(selected()).toEqual(["a", "a"]);
  await act(async () => select(1, "c", { additive: true }));
  expect(selected()).toEqual(["a,c", "a,c"]);
  await act(async () => select(0, "d", { range: true }));
  expect(selected()).toEqual(["c,d", "c,d"]);
  await act(async () =>
    viewers()[1]
      .findByProps({ "aria-label": "Select b" })
      .props.onDoubleClick(),
  );
  for (const viewer of viewers())
    expect(
      viewer.findByProps({ "aria-label": "Select b" }).props["aria-expanded"],
    ).toBe(true);
  await act(async () =>
    renderer!.update(
      <HighlightEventsPreview
        snapshot={captured}
        preferences={preferences}
        profile={{ ...profile, name: "Edited live" }}
      />,
    ),
  );
  expect(selected()).toEqual(["c,d", "c,d"]);
  for (const viewer of viewers())
    expect(
      viewer.findByProps({ "aria-label": "Select b" }).props["aria-expanded"],
    ).toBe(true);
  await act(async () =>
    renderer!.update(
      <HighlightEventsPreview
        snapshot={{ ...captured }}
        preferences={preferences}
        profile={profile}
      />,
    ),
  );
  expect(selected()).toEqual(["", ""]);
  for (const viewer of viewers())
    expect(
      viewer.findByProps({ "aria-label": "Select b" }).props["aria-expanded"],
    ).toBe(false);
});

it("synchronizes both scroll axes in either direction without replacing positions on profile edits", async () => {
  const captured = snapshot();
  await act(async () => {
    renderer = create(
      <HighlightEventsPreview
        snapshot={captured}
        preferences={preferences}
        profile={profile}
      />,
    );
  });
  const light = { scrollTop: 0, scrollLeft: 0 };
  const dark = { scrollTop: 0, scrollLeft: 0 };
  viewers()[0].props.onScrollElement(light);
  viewers()[1].props.onScrollElement(dark);
  Object.assign(light, { scrollTop: 475, scrollLeft: 210 });
  viewers()[0].props.onScrollPositionChange(light);
  expect(dark).toEqual({ scrollTop: 475, scrollLeft: 210 });
  Object.assign(dark, { scrollTop: 81, scrollLeft: 420 });
  viewers()[1].props.onScrollPositionChange(dark);
  expect(light).toEqual({ scrollTop: 81, scrollLeft: 420 });
  await act(async () =>
    renderer!.update(
      <HighlightEventsPreview
        snapshot={captured}
        preferences={preferences}
        profile={{ ...profile, enabled: false }}
      />,
    ),
  );
  expect(light).toEqual({ scrollTop: 81, scrollLeft: 420 });
  expect(dark).toEqual(light);
});

it("mirrors inner expanded-message scroll only to the same event in the other theme", async () => {
  await act(async () => {
    renderer = create(
      <HighlightEventsPreview
        snapshot={snapshot()}
        preferences={preferences}
        profile={profile}
      />,
    );
  });
  const content = (id: string) => ({
    dataset: { eventId: id },
    classList: {
      contains: (name: string) => name === "expanded-event-content",
    },
    scrollTop: 0,
    scrollLeft: 0,
  });
  const source = content("loaded-event"),
    target = content("loaded-event"),
    unrelated = content("other-event");
  const light = {
    scrollTop: 0,
    scrollLeft: 0,
    querySelectorAll: () => [source],
  };
  const dark = {
    scrollTop: 0,
    scrollLeft: 0,
    querySelectorAll: () => [target, unrelated],
  };
  viewers()[0].props.onScrollElement(light);
  viewers()[1].props.onScrollElement(dark);
  const preview = renderer!.root.findByProps({
    "aria-label": "Highlight preview",
  });
  expect(preview.props.onScrollCapture).toBeTypeOf("function");
  Object.assign(source, { scrollTop: 80, scrollLeft: 240 });
  preview.props.onScrollCapture({ target: source });
  expect(target.scrollTop).toBe(80);
  expect(target.scrollLeft).toBe(240);
  expect(unrelated.scrollTop).toBe(0);
  expect(unrelated.scrollLeft).toBe(0);
  expect(dark.scrollTop).toBe(0);
  expect(dark.scrollLeft).toBe(0);
  Object.assign(target, { scrollTop: 25, scrollLeft: 70 });
  preview.props.onScrollCapture({ target });
  expect(source.scrollTop).toBe(25);
  expect(source.scrollLeft).toBe(70);
});

it("explains missing captured data without inventing sample events", async () => {
  await act(async () => {
    renderer = create(
      <HighlightEventsPreview
        snapshot={null}
        preferences={preferences}
        profile={profile}
      />,
    );
  });
  expect(viewers()).toHaveLength(0);
  expect(JSON.stringify(renderer!.toJSON())).toContain("No active log tab");
  await act(async () =>
    renderer!.update(
      <HighlightEventsPreview
        snapshot={{ ...snapshot(), events: [] }}
        preferences={preferences}
        profile={profile}
      />,
    ),
  );
  expect(viewers()).toHaveLength(0);
  expect(JSON.stringify(renderer!.toJSON())).toContain("No loaded events");
});
