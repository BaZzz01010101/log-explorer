import {
  useCallback,
  useId,
  useMemo,
  useRef,
  useState,
  type RefCallback,
} from "react";
import { MantineProvider, type MantineColorSchemeManager } from "@mantine/core";
import type { Preferences, ViewConfig } from "../../shared/contracts";
import type { HighlightProfile } from "../../shared/highlights";
import type { SettingsPreviewSnapshot } from "../settings-preview";
import { useEventSelectionState } from "../useEventSelection";
import { useMessageExpansionState } from "../useMessageExpansion";
import { LogViewer, type LogViewerInteractionState } from "./LogViewer";
import { JsonTreeExpansionContext } from "./EventMessage";
import "./highlight-events-preview.css";

interface Props {
  snapshot: SettingsPreviewSnapshot | null;
  preferences: Preferences;
  profile: HighlightProfile;
}

// A preview never reads or subscribes to the application's stored scheme.
const previewColorSchemeManager: MantineColorSchemeManager = {
  get: (defaultValue) => defaultValue,
  set: () => {},
  clear: () => {},
  subscribe: () => {},
  unsubscribe: () => {},
};

function previewView(view: ViewConfig): ViewConfig {
  return { ...structuredClone(view), mode: "hybrid" };
}

function ThemePreview({
  snapshot,
  preferences,
  profile,
  theme,
  view,
  onViewChange,
  interactionState,
  onScrollElement,
  onScrollPositionChange,
}: Omit<Props, "snapshot"> & {
  snapshot: SettingsPreviewSnapshot;
  theme: Preferences["theme"];
  view: ViewConfig;
  onViewChange(view: ViewConfig): void;
  interactionState: LogViewerInteractionState;
  onScrollElement: RefCallback<HTMLDivElement>;
  onScrollPositionChange(element: HTMLDivElement): void;
}) {
  const scope = useId();
  const root = useRef<HTMLDivElement>(null);
  const getRootElement = useCallback(() => root.current ?? undefined, []);
  const previewPreferences = useMemo(
    () => ({ ...preferences, theme, highlightProfiles: [profile] }),
    [preferences, theme, profile],
  );
  const label = theme === "light" ? "Light preview" : "Dark preview";
  return (
    <div
      ref={root}
      className="highlight-events-theme"
      data-highlight-events-theme={scope}
      data-theme={theme}
      data-mantine-color-scheme={theme}
      style={{ colorScheme: theme }}
      role="region"
      aria-label={label}
      onContextMenuCapture={(event) => {
        event.preventDefault();
        event.stopPropagation();
      }}
      onKeyDownCapture={(event) => {
        if (
          event.key === "ContextMenu" ||
          (event.shiftKey && event.key === "F10")
        ) {
          event.preventDefault();
          event.stopPropagation();
        }
      }}
    >
      <MantineProvider
        forceColorScheme={theme}
        defaultColorScheme={theme}
        colorSchemeManager={previewColorSchemeManager}
        cssVariablesSelector={`[data-highlight-events-theme="${scope}"]`}
        getRootElement={getRootElement}
        deduplicateCssVariables={false}
        withGlobalClasses={false}
      >
        <header className="highlight-events-theme-heading">
          <strong>{theme === "light" ? "Light" : "Dark"}</strong>
          <span>Hybrid</span>
        </header>
        <div className="highlight-events-table">
          <LogViewer
            events={snapshot.events}
            sourceContext={snapshot.sourceContext}
            view={view}
            onViewChange={onViewChange}
            preferences={previewPreferences}
            interactionState={interactionState}
            onScrollElement={onScrollElement}
            onScrollPositionChange={onScrollPositionChange}
          />
        </div>
      </MantineProvider>
    </div>
  );
}

export function HighlightEventsPreview({
  snapshot,
  preferences,
  profile,
}: Props) {
  const [capture, setCapture] = useState({ snapshot, version: 0 });
  // A new captured snapshot resets preview interactions, including when the
  // captured tab is unchanged. Editing the profile retains the same session.
  if (capture.snapshot !== snapshot)
    setCapture({ snapshot, version: capture.version + 1 });
  if (!snapshot || snapshot.events.length === 0)
    return (
      <div className="highlight-events-preview-empty" role="status">
        <strong>
          {snapshot
            ? "No loaded events in this tab."
            : "No active log tab to preview."}
        </strong>
        <span>
          Load events in the tab, then reopen Settings to preview highlights.
        </span>
      </div>
    );
  return (
    <CapturedPreview
      key={capture.version}
      snapshot={snapshot}
      preferences={preferences}
      profile={profile}
    />
  );
}

function CapturedPreview({
  snapshot,
  preferences,
  profile,
}: Omit<Props, "snapshot"> & { snapshot: SettingsPreviewSnapshot }) {
  const [view, setView] = useState(() => previewView(snapshot.view));
  const selection = useEventSelectionState(false);
  const expansion = useMessageExpansionState();
  const [structured, setStructured] = useState(
    () => new Map<string, Set<string>>(),
  );
  const [detailHeights, setDetailHeights] = useState(
    () => new Map<string, number>(),
  );
  const [recursive, setRecursive] = useState(() => new Set<string>());
  const interactionState: LogViewerInteractionState = {
    selection,
    expansion,
    details: {
      heights: detailHeights,
      recursive,
      onRecursiveExpand: (id) =>
        setRecursive((previous) =>
          previous.has(id) ? previous : new Set([...previous, id]),
        ),
      onHeightChange: (id, height) =>
        setDetailHeights((previous) => {
          if (previous.get(id) === height) return previous;
          const next = new Map(previous);
          if (height === undefined) next.delete(id);
          else next.set(id, height);
          return next;
        }),
    },
  };
  const structuredExpansion: NonNullable<
    React.ContextType<typeof JsonTreeExpansionContext>
  > = {
    expanded: structured,
    onChange: (id, update) =>
      setStructured((previous) => {
        const expanded = previous.get(id) ?? new Set([""]);
        const next = typeof update === "function" ? update(expanded) : update;
        if (next === expanded) return previous;
        return new Map(previous).set(id, next);
      }),
  };
  const scrollElements = useRef<
    Record<"light" | "dark", HTMLDivElement | null>
  >({ light: null, dark: null });
  const scrollPosition = useRef({ top: 0, left: 0 });
  const syncScroll = useCallback((element: HTMLDivElement) => {
    scrollPosition.current = {
      top: element.scrollTop,
      left: element.scrollLeft,
    };
    for (const other of Object.values(scrollElements.current)) {
      if (!other || other === element) continue;
      if (other.scrollTop !== element.scrollTop)
        other.scrollTop = element.scrollTop;
      if (other.scrollLeft !== element.scrollLeft)
        other.scrollLeft = element.scrollLeft;
    }
  }, []);
  const scrollRefs = useMemo(() => {
    const attach =
      (theme: "light" | "dark"): RefCallback<HTMLDivElement> =>
      (element) => {
        scrollElements.current[theme] = element;
        if (element) {
          element.scrollTop = scrollPosition.current.top;
          element.scrollLeft = scrollPosition.current.left;
        }
      };
    return { light: attach("light"), dark: attach("dark") };
  }, []);
  return (
    <section
      className="highlight-events-preview"
      aria-label="Highlight preview"
      onScrollCapture={(event) => {
        const source = event.target as HTMLElement;
        if (
          !source.classList?.contains("expanded-event-content") ||
          !source.dataset.eventId
        )
          return;
        for (const viewer of Object.values(scrollElements.current)) {
          viewer
            ?.querySelectorAll<HTMLElement>(".expanded-event-content")
            .forEach((target) => {
              if (
                target === source ||
                target.dataset.eventId !== source.dataset.eventId
              )
                return;
              if (target.scrollTop !== source.scrollTop)
                target.scrollTop = source.scrollTop;
              if (target.scrollLeft !== source.scrollLeft)
                target.scrollLeft = source.scrollLeft;
            });
        }
      }}
    >
      <JsonTreeExpansionContext.Provider value={structuredExpansion}>
        <div className="highlight-events-preview-grid">
          {(["light", "dark"] as const).map((theme) => (
            <ThemePreview
              key={theme}
              snapshot={snapshot}
              preferences={preferences}
              profile={profile}
              theme={theme}
              view={view}
              onViewChange={(next) => setView(previewView(next))}
              interactionState={interactionState}
              onScrollElement={scrollRefs[theme]}
              onScrollPositionChange={syncScroll}
            />
          ))}
        </div>
      </JsonTreeExpansionContext.Provider>
    </section>
  );
}
