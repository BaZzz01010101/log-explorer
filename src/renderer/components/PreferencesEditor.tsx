import { useState, type ReactNode } from "react";
import {
  NumberInput,
  Select,
  Switch,
  type NumberInputProps,
} from "@mantine/core";
import type { Preferences } from "../../shared/contracts";
import {
  DEFAULT_RECENT_SEARCHES_LIMIT,
  MAX_RECENT_SEARCHES_LIMIT,
} from "../../shared/query-history";
import {
  LIVE_SLEEP_BACKGROUND_MINUTES,
  LIVE_SLEEP_IDLE_MINUTES,
  MAX_LIVE_SLEEP_MINUTES,
} from "../../shared/live-catch-up";
import { SettingLabel } from "./SettingLabel";

function PreferenceSection({
  title,
  label,
  children,
}: {
  title: string;
  label: string;
  children: ReactNode;
}) {
  return (
    <section className="settings-preference-section" aria-label={label}>
      <h3 className="settings-preference-heading">{title}</h3>
      <div className="settings-preference-options">{children}</div>
    </section>
  );
}

function PreferenceOption({ children }: { children: ReactNode }) {
  return <div className="settings-preference-option">{children}</div>;
}

function NumericPreference({
  value,
  onCommit,
  live = false,
  label,
  help,
  ...props
}: Omit<
  NumberInputProps,
  "value" | "onChange" | "onBlur" | "onKeyDown" | "label" | "description"
> & {
  label: string;
  help?: string;
  value: number;
  live?: boolean;
  onCommit(value: number): void;
}) {
  // Avoid evicting loaded events while a numeric value is only partly entered.
  const [draft, setDraft] = useState<string | number | undefined>();
  const commit = () => {
    if (typeof draft === "number" && Number.isFinite(draft)) onCommit(draft);
    setDraft(undefined);
  };
  return (
    <NumberInput
      {...props}
      label={help ? <SettingLabel label={label} help={help} /> : label}
      aria-label={label}
      value={draft ?? value}
      clampBehavior="none"
      allowDecimal={false}
      allowNegative={false}
      onChange={(next) => {
        setDraft(next);
        if (
          live &&
          typeof next === "number" &&
          Number.isFinite(next) &&
          next >= (props.min ?? -Infinity) &&
          next <= (props.max ?? Infinity)
        )
          onCommit(next);
      }}
      onBlur={commit}
      onKeyDown={(event) => {
        if (event.key === "Enter") {
          event.preventDefault();
          event.currentTarget.blur();
        }
      }}
    />
  );
}

export function PreferencesEditor({
  value,
  onChange,
}: {
  value: Preferences;
  onChange(patch: Partial<Preferences>): void;
}) {
  return (
    <div className="settings-form-content settings-preferences-form">
      <PreferenceSection title="Appearance" label="Appearance preferences">
        <PreferenceOption>
          <Select
            label="Theme"
            allowDeselect={false}
            value={value.theme}
            data={[
              { value: "light", label: "Light" },
              { value: "dark", label: "Dark" },
            ]}
            onChange={(theme) => {
              if (theme === "dark" || theme === "light") onChange({ theme });
            }}
          />
        </PreferenceOption>
        <PreferenceOption>
          <Select
            label="Density"
            allowDeselect={false}
            value={value.density}
            data={[
              { value: "compact", label: "Compact" },
              { value: "comfortable", label: "Comfortable" },
            ]}
            onChange={(density) => {
              if (density === "compact" || density === "comfortable")
                onChange({ density });
            }}
          />
        </PreferenceOption>
      </PreferenceSection>
      <PreferenceSection
        title="Tabs and history"
        label="Tab and history preferences"
      >
        <PreferenceOption>
          <Select
            label="Tab layout"
            allowDeselect={false}
            value={value.tabBarLayout}
            data={[
              { value: "scroll", label: "Scroll" },
              { value: "wrap", label: "Multiple rows" },
            ]}
            onChange={(tabBarLayout) => {
              if (tabBarLayout === "scroll" || tabBarLayout === "wrap")
                onChange({ tabBarLayout });
            }}
          />
        </PreferenceOption>
        <PreferenceOption>
          <Switch
            label="Put pinned tabs on a separate row"
            checked={value.pinnedTabsSeparateRow === true}
            onChange={(event) =>
              onChange({ pinnedTabsSeparateRow: event.currentTarget.checked })
            }
          />
        </PreferenceOption>
        <PreferenceOption>
          <NumericPreference
            label="Closed tab history (days)"
            min={1}
            max={365}
            value={value.closedTabHistoryDays ?? 7}
            onCommit={(closedTabHistoryDays) =>
              onChange({ closedTabHistoryDays })
            }
          />
        </PreferenceOption>
        <PreferenceOption>
          <NumericPreference
            label="Search history limit"
            min={1}
            max={MAX_RECENT_SEARCHES_LIMIT}
            value={value.recentSearchesLimit ?? DEFAULT_RECENT_SEARCHES_LIMIT}
            onCommit={(recentSearchesLimit) =>
              onChange({ recentSearchesLimit })
            }
          />
        </PreferenceOption>
      </PreferenceSection>
      <PreferenceSection title="Log display" label="Log display preferences">
        <PreferenceOption>
          <NumericPreference
            label="Log font size"
            live
            min={10}
            max={20}
            value={value.fontSize}
            onCommit={(fontSize) => onChange({ fontSize })}
          />
        </PreferenceOption>
        <PreferenceOption>
          <Select
            label="Timestamp display"
            allowDeselect={false}
            value={value.timezone}
            data={[
              { value: "local", label: "Local time" },
              { value: "utc", label: "UTC" },
            ]}
            onChange={(timezone) => {
              if (timezone === "local" || timezone === "utc")
                onChange({ timezone });
            }}
          />
        </PreferenceOption>
        <PreferenceOption>
          <Switch
            aria-label="Automatically expand inspector paths to highlighted matches"
            label={
              <SettingLabel
                label="Automatically expand inspector paths to highlighted matches"
                help="Opens folded JSON branches that contain matches from the filters or Highlight text field."
              />
            }
            checked={value.autoExpandFilterMatches !== false}
            onChange={(event) =>
              onChange({ autoExpandFilterMatches: event.currentTarget.checked })
            }
          />
        </PreferenceOption>
      </PreferenceSection>
      <PreferenceSection title="Live" label="Live preferences">
        <PreferenceOption>
          <NumericPreference
            label="Sleep in background after (minutes)"
            help="Stops receiving after this time without input while another application is in front. Returning loads the missed events. 0 keeps Live on."
            min={0}
            max={MAX_LIVE_SLEEP_MINUTES}
            value={
              value.liveSleepBackgroundMinutes ?? LIVE_SLEEP_BACKGROUND_MINUTES
            }
            onCommit={(liveSleepBackgroundMinutes) =>
              onChange({ liveSleepBackgroundMinutes })
            }
          />
        </PreferenceOption>
        <PreferenceOption>
          <NumericPreference
            label="Sleep when idle after (minutes)"
            help="Stops receiving after this time without mouse or keyboard input while this application is in front. Any input loads the missed events. 0 keeps Live on."
            min={0}
            max={MAX_LIVE_SLEEP_MINUTES}
            value={value.liveSleepIdleMinutes ?? LIVE_SLEEP_IDLE_MINUTES}
            onCommit={(liveSleepIdleMinutes) =>
              onChange({ liveSleepIdleMinutes })
            }
          />
        </PreferenceOption>
      </PreferenceSection>
      <PreferenceSection title="Data limits" label="Data limits">
        <PreferenceOption>
          <NumericPreference
            label="Maximum events per view"
            help="Limits the events kept in each view. During Live, the oldest events are removed when this limit is reached."
            min={100}
            max={100000}
            step={1000}
            value={value.maxEvents}
            onCommit={(maxEvents) => onChange({ maxEvents })}
          />
        </PreferenceOption>
      </PreferenceSection>
    </div>
  );
}
