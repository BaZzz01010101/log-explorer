import { useCallback, useId, useMemo, useRef, useState } from "react";
import { MantineProvider, type MantineColorSchemeManager } from "@mantine/core";
import type { Preferences, ViewConfig } from "../../shared/contracts";
import type { HighlightProfile } from "../../shared/highlights";
import type { SettingsPreviewSnapshot } from "../settings-preview";
import { LogViewer } from "./LogViewer";
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
}: Omit<Props, "snapshot"> & {
  snapshot: SettingsPreviewSnapshot;
  theme: Preferences["theme"];
}) {
  const scope = useId();
  const root = useRef<HTMLDivElement>(null);
  const getRootElement = useCallback(() => root.current ?? undefined, []);
  const [privateView, setPrivateView] = useState(() => ({
    snapshot,
    view: previewView(snapshot.view),
  }));
  // A newly captured snapshot starts a fresh preview, even for the same tab.
  // Profile edits retain the independent sorting, filters and columns.
  if (privateView.snapshot !== snapshot)
    setPrivateView({ snapshot, view: previewView(snapshot.view) });
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
            view={privateView.view}
            onViewChange={(view) =>
              setPrivateView({ snapshot, view: previewView(view) })
            }
            preferences={previewPreferences}
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
    <section
      className="highlight-events-preview"
      aria-label="Highlight preview"
    >
      <p className="highlight-events-preview-caption">
        <span data-tooltip={snapshot.label}>{snapshot.label}</span>
        <span>{snapshot.events.length.toLocaleString()} loaded events</span>
      </p>
      <div className="highlight-events-preview-grid">
        {(["light", "dark"] as const).map((theme) => (
          <ThemePreview
            key={theme}
            snapshot={snapshot}
            preferences={preferences}
            profile={profile}
            theme={theme}
          />
        ))}
      </div>
    </section>
  );
}
