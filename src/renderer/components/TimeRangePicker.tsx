import { useEffect, useState } from "react";
import { Button, Group, Popover, Select, Tabs, Text } from "@mantine/core";
import {
  IconChevronDown,
  IconClock,
  IconSettings,
  IconX,
} from "@tabler/icons-react";
import type { LogTab, Preferences } from "../../shared/contracts";
import {
  absoluteRangeFromFields,
  rangeInputFields,
  parseRelativePreset,
  relativePreset,
  shiftCalendarMonth,
  shiftCalendarDay,
  type DateTimeFields,
  type RelativeUnit,
} from "../time-range";
import { RangeCalendar } from "./RangeCalendar";
import { SegmentedDateTimeInput } from "./SegmentedDateTimeInput";
import {
  normalizeRelativeTimeTemplates,
  RELATIVE_TIME_UNITS,
  relativeTimeLabel,
} from "../../shared/relative-time-templates";
import "./time-range.css";

interface Props {
  tab: LogTab;
  timezone: Preferences["timezone"];
  onPatch(patch: Partial<LogTab>): void;
  onTimezoneChange(timezone: Preferences["timezone"]): void;
  relativeTimeTemplates?: Preferences["relativeTimeTemplates"];
  onOpenTimeRangeSettings?(): void;
}

export function TimeRangePicker({
  tab,
  timezone,
  onPatch,
  onTimezoneChange,
  relativeTimeTemplates,
  onOpenTimeRangeSettings,
}: Props) {
  const [opened, setOpened] = useState(false);
  const [mode, setMode] = useState<string | null>(
    tab.timePreset === "custom" ? "absolute" : "relative",
  );
  const [draft, setDraft] = useState<{
    start: DateTimeFields;
    end: DateTimeFields;
  }>({
    start: { date: "", time: "00:00:00" },
    end: { date: "", time: "23:59:59" },
  });
  const [original, setOriginal] =
    useState<Pick<LogTab, "customStart" | "customEnd">>();
  const [editedTime, setEditedTime] = useState({ start: false, end: false });
  const [inclusiveEnd, setInclusiveEnd] = useState(true);
  const [anchor, setAnchor] = useState<string | null>(null);
  const [month, setMonth] = useState("2026-01-01");
  const [duration, setDuration] = useState("5");
  const [unit, setUnit] = useState<RelativeUnit>("m");
  const unitNames = { m: "minutes", h: "hours", d: "days", w: "weeks" };
  const relativeLabel = (value: number, selectedUnit: RelativeUnit) =>
    "Last " +
    value +
    " " +
    (value === 1
      ? unitNames[selectedUnit].slice(0, -1)
      : unitNames[selectedUnit]);
  const calendarDay = (date: string) => {
    const value = date.replaceAll("/", "-");
    try {
      return shiftCalendarDay(value, 0);
    } catch {
      return "";
    }
  };
  const initialMonth = (start: string, end: string) => {
    const first = start.slice(0, 7) + "-01";
    const last = end.slice(0, 7) + "-01";
    const candidate = first === last ? shiftCalendarMonth(last, -1) : first;
    return candidate < "1970-01-01"
      ? "1970-01-01"
      : candidate > "9999-11-01"
        ? "9999-11-01"
        : candidate;
  };
  const resetDraft = () => {
    const today = rangeInputFields(new Date().toISOString(), timezone).date;
    const start =
      tab.timePreset === "custom"
        ? rangeInputFields(tab.customStart, timezone)
        : { date: today, time: "00:00:00" };
    const end =
      tab.timePreset === "custom"
        ? rangeInputFields(tab.customEnd, timezone)
        : { date: today, time: "23:59:59" };
    setDraft({ start, end });
    setOriginal(
      tab.timePreset === "custom"
        ? { customStart: tab.customStart, customEnd: tab.customEnd }
        : undefined,
    );
    setInclusiveEnd(tab.timePreset !== "custom");
    setEditedTime({ start: false, end: false });
    setAnchor(null);
    setMonth(
      initialMonth(
        calendarDay(start.date) || today.replaceAll("/", "-"),
        calendarDay(end.date) || today.replaceAll("/", "-"),
      ),
    );
    const relative = parseRelativePreset(tab.timePreset);
    setDuration(String(relative?.duration ?? 5));
    setUnit(relative?.unit ?? "m");
  };
  useEffect(() => {
    if (opened) resetDraft();
  }, [timezone]);
  let candidate: Partial<LogTab> | undefined;
  let error = "";
  try {
    if (mode === "absolute") {
      candidate = absoluteRangeFromFields(draft.start, draft.end, timezone, {
        previous: {
          ...(editedTime.start ? {} : { customStart: original?.customStart }),
          ...(editedTime.end ? {} : { customEnd: original?.customEnd }),
        },
        inclusiveEnd,
      });
    } else {
      if (!/^[1-9]\d{0,3}$/.test(duration))
        throw new Error("Choose a duration from 1 to 9999");
      candidate = { timePreset: relativePreset(Number(duration), unit) };
    }
  } catch (cause) {
    error =
      cause instanceof Error ? cause.message : "Choose a valid time range";
  }
  const commit = () => {
    if (!candidate || (mode === "absolute" && anchor)) return;
    onPatch(candidate);
    setOpened(false);
  };
  const clear = () => {
    onPatch({
      timePreset: "clear",
      customStart: undefined,
      customEnd: undefined,
    });
    setOpened(false);
  };
  const selectDay = (day: string) => {
    const [start, end] = anchor ? [anchor, day].sort() : [day, day];
    setDraft({
      start: { date: start.replaceAll("-", "/"), time: "00:00:00" },
      end: { date: end.replaceAll("-", "/"), time: "23:59:59" },
    });
    setOriginal(undefined);
    setInclusiveEnd(true);
    setEditedTime({ start: false, end: false });
    setAnchor(anchor ? null : day);
  };
  const changeField = (
    bound: "start" | "end",
    field: "date" | "time",
    value: string,
  ) => {
    setDraft((previous) => ({
      ...previous,
      [bound]: { ...previous[bound], [field]: value },
    }));
    setAnchor(null);
    if (field === "time") {
      setEditedTime((previous) => ({ ...previous, [bound]: true }));
      if (bound === "end") setInclusiveEnd(false);
    } else {
      const day = calendarDay(value);
      if (day >= "1970-01-01") setMonth(initialMonth(day, day));
    }
  };
  const appliedRelative = parseRelativePreset(tab.timePreset);
  const templates = normalizeRelativeTimeTemplates(relativeTimeTemplates);
  const quick = templates.quick;
  const customSelected =
    tab.timePreset === "custom" ||
    Boolean(
      appliedRelative &&
      !quick.some(
        (entry) =>
          relativePreset(entry.duration, entry.unit) === tab.timePreset,
      ),
    );
  const appliedStart = rangeInputFields(tab.customStart, timezone);
  const appliedEnd = rangeInputFields(tab.customEnd, timezone);
  const absoluteLabel =
    appliedStart.date +
    " " +
    appliedStart.time +
    " — " +
    appliedEnd.date +
    " " +
    appliedEnd.time;
  const label =
    tab.timePreset === "custom"
      ? absoluteLabel
      : appliedRelative && customSelected
        ? relativeLabel(appliedRelative.duration, appliedRelative.unit)
        : "Custom";
  return (
    <Group gap={5} wrap="nowrap" className="time-range-controls">
      <div
        className="time-range-quick-bar"
        role="group"
        aria-label="Quick time ranges"
      >
        <Button
          type="button"
          className="time-range-clear"
          variant={tab.timePreset === "clear" ? "light" : "subtle"}
          size="compact-xs"
          aria-label="Clear time filter"
          aria-pressed={tab.timePreset === "clear"}
          onClick={clear}
        >
          Clear
        </Button>
        {tab.timePreset !== "custom" && (
          <div className="time-range-shortcuts">
            {quick.map((entry) => {
              const value = relativePreset(entry.duration, entry.unit);
              const text = entry.label.trim() || value;
              const accessibleLabel =
                text === value
                  ? relativeTimeLabel(entry.duration, entry.unit).toLowerCase()
                  : text;
              return (
                <Button
                  type="button"
                  key={entry.id}
                  variant={tab.timePreset === value ? "light" : "subtle"}
                  size="compact-xs"
                  aria-label={"Set " + accessibleLabel}
                  aria-pressed={tab.timePreset === value}
                  onClick={() => {
                    onPatch({ timePreset: value });
                    setOpened(false);
                  }}
                >
                  {text}
                </Button>
              );
            })}
          </div>
        )}
        <Popover
          opened={opened}
          onChange={setOpened}
          width={608}
          position="bottom-end"
          trapFocus
          shadow="md"
          withinPortal
        >
          <Popover.Target>
            <Button
              type="button"
              aria-label="Time range"
              aria-pressed={customSelected}
              variant={customSelected ? "light" : "default"}
              size="xs"
              className="time-range-trigger"
              leftSection={<IconClock size={14} />}
              rightSection={<IconChevronDown size={12} />}
              onClick={() => {
                if (!opened) {
                  resetDraft();
                  setMode(
                    tab.timePreset === "custom" ? "absolute" : "relative",
                  );
                }
                setOpened(!opened);
              }}
            >
              {label}
            </Button>
          </Popover.Target>
          <Popover.Dropdown
            className="time-range-popover"
            aria-label="Choose time range"
          >
            <form
              onSubmit={(event) => {
                event.preventDefault();
                commit();
              }}
            >
              <Tabs
                value={mode}
                onChange={(value) => {
                  setMode(value);
                  setAnchor(null);
                }}
                keepMounted={false}
              >
                <Tabs.List className="time-range-mode-list">
                  <Tabs.Tab value="absolute">Absolute</Tabs.Tab>
                  <Tabs.Tab value="relative">Relative</Tabs.Tab>
                  <button
                    type="button"
                    className="time-range-settings"
                    aria-label="Time range settings"
                    data-tooltip="Time range settings"
                    onClick={() => {
                      setOpened(false);
                      if (onOpenTimeRangeSettings) onOpenTimeRangeSettings();
                      else
                        window.dispatchEvent(
                          new Event("explorer:open-time-range-settings"),
                        );
                    }}
                  >
                    <IconSettings size={16} />
                  </button>
                </Tabs.List>
                <Tabs.Panel value="absolute" pt="sm">
                  <RangeCalendar
                    month={month}
                    timezone={timezone}
                    start={calendarDay(draft.start.date)}
                    end={calendarDay(draft.end.date)}
                    anchor={anchor}
                    onMonthChange={setMonth}
                    onSelect={selectDay}
                  />
                  <div className="absolute-range-fields">
                    <SegmentedDateTimeInput
                      label="Start date"
                      kind="date"
                      value={draft.start.date}
                      onChange={(value) => changeField("start", "date", value)}
                      error={Boolean(error)}
                    />
                    <SegmentedDateTimeInput
                      label="Start time"
                      kind="time"
                      value={draft.start.time}
                      onChange={(value) => changeField("start", "time", value)}
                      error={Boolean(error)}
                    />
                    <SegmentedDateTimeInput
                      label="End date"
                      kind="date"
                      value={draft.end.date}
                      onChange={(value) => changeField("end", "date", value)}
                      error={Boolean(error)}
                    />
                    <SegmentedDateTimeInput
                      label="End time"
                      kind="time"
                      value={draft.end.time}
                      onChange={(value) => changeField("end", "time", value)}
                      error={Boolean(error)}
                    />
                  </div>
                  <Text size="xs" c="dimmed" mt={6}>
                    Dates: YYYY/MM/DD · Times: HH:mm:ss, 24-hour format ·{" "}
                    {timezone === "utc"
                      ? "UTC"
                      : Intl.DateTimeFormat().resolvedOptions().timeZone}
                  </Text>
                </Tabs.Panel>
                <Tabs.Panel value="relative" pt="sm">
                  <div
                    className="relative-range-presets"
                    role="group"
                    aria-label="Relative time templates"
                  >
                    {RELATIVE_TIME_UNITS.map(([rowUnit, name]) => (
                      <div className="relative-range-row" key={rowUnit}>
                        <Text size="sm" c="dimmed">
                          {name}
                        </Text>
                        {templates.dropdown
                          .filter((entry) => entry.unit === rowUnit)
                          .map((entry) => {
                            const selected =
                              unit === entry.unit &&
                              duration === String(entry.duration);
                            const templateLabel = relativeTimeLabel(
                              entry.duration,
                              entry.unit,
                            );
                            return (
                              <Button
                                type="button"
                                key={entry.id}
                                size="xs"
                                variant={selected ? "light" : "default"}
                                aria-label={templateLabel}
                                aria-pressed={selected}
                                onClick={() => {
                                  setDuration(String(entry.duration));
                                  setUnit(entry.unit);
                                }}
                              >
                                {entry.duration}
                              </Button>
                            );
                          })}
                      </div>
                    ))}
                  </div>
                  <div className="relative-duration-fields">
                    <SegmentedDateTimeInput
                      label="Duration"
                      kind="duration"
                      value={duration}
                      onChange={setDuration}
                      error={Boolean(error)}
                    />
                    <Select
                      label="Unit of time"
                      aria-label="Unit of time"
                      value={unit}
                      allowDeselect={false}
                      comboboxProps={{ withinPortal: false }}
                      onChange={(value) =>
                        value && setUnit(value as RelativeUnit)
                      }
                      data={[
                        { value: "m", label: "Minutes" },
                        { value: "h", label: "Hours" },
                        { value: "d", label: "Days" },
                        { value: "w", label: "Weeks" },
                      ]}
                    />
                  </div>
                  <Text size="xs" c="dimmed" mt={5}>
                    Duration: 1–9999. Use the wheel or arrow keys to adjust the
                    active field.
                  </Text>
                </Tabs.Panel>
              </Tabs>
              {error && (
                <Text size="xs" c="red" mt={7} role="status">
                  {error}
                </Text>
              )}
              <Group
                justify="space-between"
                className="time-range-footer"
                gap="xs"
              >
                <Button
                  type="button"
                  size="xs"
                  variant="subtle"
                  aria-label="Clear custom time filter"
                  leftSection={<IconX size={12} />}
                  onClick={clear}
                >
                  Clear
                </Button>
                <Group gap={7}>
                  <Button
                    type="button"
                    size="xs"
                    variant="subtle"
                    onClick={() => setOpened(false)}
                  >
                    Cancel
                  </Button>
                  <Button
                    type="submit"
                    size="xs"
                    disabled={
                      !candidate || (mode === "absolute" && Boolean(anchor))
                    }
                  >
                    Apply
                  </Button>
                </Group>
              </Group>
            </form>
          </Popover.Dropdown>
        </Popover>
      </div>
      <Select
        aria-label="Timezone"
        data-tooltip={
          timezone === "utc"
            ? "Coordinated Universal Time"
            : Intl.DateTimeFormat().resolvedOptions().timeZone
        }
        size="xs"
        w={108}
        className="time-range-timezone"
        value={timezone}
        allowDeselect={false}
        onChange={(value) =>
          value && onTimezoneChange(value as Preferences["timezone"])
        }
        data={[
          { value: "local", label: "Local time" },
          { value: "utc", label: "UTC" },
        ]}
      />
    </Group>
  );
}
