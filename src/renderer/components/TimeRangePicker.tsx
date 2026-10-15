import { useEffect, useState } from "react";
import {
  Button,
  Group,
  Popover,
  Select,
  SimpleGrid,
  Stack,
  Tabs,
  Text,
  TextInput,
} from "@mantine/core";
import { IconChevronDown, IconClock, IconX } from "@tabler/icons-react";
import type { LogTab, Preferences } from "../../shared/contracts";
import { resolveTimeRange } from "../query-state";
import { absoluteRange, rangeInputValue, RELATIVE_RANGES } from "../time-range";
import "./time-range.css";

interface Props {
  tab: LogTab;
  timezone: Preferences["timezone"];
  onPatch(patch: Partial<LogTab>): void;
  onTimezoneChange(timezone: Preferences["timezone"]): void;
}

export function TimeRangePicker({
  tab,
  timezone,
  onPatch,
  onTimezoneChange,
}: Props) {
  const [opened, setOpened] = useState(false);
  const [mode, setMode] = useState<string | null>(
    tab.timePreset === "custom" ? "absolute" : "relative",
  );
  const [draft, setDraft] = useState({ start: "", end: "" });
  const [error, setError] = useState("");
  const resetDraft = () => {
    let start = tab.customStart,
      end = tab.customEnd;
    if (tab.timePreset !== "custom" || !start || !end) {
      const range = resolveTimeRange(
        tab.timePreset === "custom" || tab.timePreset === "clear"
          ? "1h"
          : tab.timePreset,
      );
      start = new Date(range.startTime).toISOString();
      end = new Date(range.endTime).toISOString();
    }
    setDraft({
      start: rangeInputValue(start, timezone),
      end: rangeInputValue(end, timezone),
    });
    setError("");
  };
  useEffect(() => {
    if (opened) resetDraft();
  }, [timezone]);
  const changeRange = (part: "start" | "end", value: string) => {
    const next = { ...draft, [part]: value };
    setDraft(next);
    try {
      onPatch(
        absoluteRange(
          next.start,
          next.end,
          timezone,
          tab.timePreset === "custom" ? tab : undefined,
        ),
      );
      setError("");
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Choose valid start and end times",
      );
    }
  };
  const label =
    tab.timePreset === "clear"
      ? "Clear"
      : tab.timePreset === "custom"
        ? "Absolute range"
        : (RELATIVE_RANGES.find(([value]) => value === tab.timePreset)?.[1] ??
          "Time range");
  const rangeTitle =
    tab.timePreset === "custom"
      ? `${rangeInputValue(tab.customStart, timezone).replace("T", " ")} — ${rangeInputValue(tab.customEnd, timezone).replace("T", " ")}`
      : tab.timePreset === "clear"
        ? "All available history through now"
        : label;
  return (
    <Group gap={5} wrap="nowrap" className="time-range-controls">
      <Popover
        opened={opened}
        onChange={setOpened}
        width={420}
        position="bottom-end"
        trapFocus
        shadow="md"
        withinPortal
      >
        <Popover.Target>
          <Button
            aria-label="Time range"
            title={rangeTitle}
            variant="default"
            size="xs"
            className="time-range-trigger"
            leftSection={<IconClock size={14} />}
            rightSection={<IconChevronDown size={12} />}
            onClick={() => {
              if (!opened) {
                resetDraft();
                setMode(tab.timePreset === "custom" ? "absolute" : "relative");
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
          <Tabs value={mode} onChange={setMode} keepMounted={false}>
            <Tabs.List grow>
              <Tabs.Tab value="relative">Relative</Tabs.Tab>
              <Tabs.Tab value="absolute">Absolute</Tabs.Tab>
            </Tabs.List>
            <Tabs.Panel value="relative" pt="sm">
              <SimpleGrid cols={3} spacing={6}>
                {RELATIVE_RANGES.map(([value, text]) => (
                  <Button
                    key={value}
                    size="compact-xs"
                    variant={tab.timePreset === value ? "light" : "subtle"}
                    aria-pressed={tab.timePreset === value}
                    onClick={() => {
                      onPatch({ timePreset: value });
                      setOpened(false);
                    }}
                  >
                    {text}
                  </Button>
                ))}
              </SimpleGrid>
            </Tabs.Panel>
            <Tabs.Panel value="absolute" pt="sm">
              <Stack gap="xs">
                <TextInput
                  label="Start date and time"
                  aria-label="Range start"
                  type="datetime-local"
                  step="0.001"
                  size="xs"
                  value={draft.start}
                  onChange={(event) =>
                    changeRange("start", event.currentTarget.value)
                  }
                  error={Boolean(error)}
                />
                <TextInput
                  label="End date and time"
                  aria-label="Range end"
                  type="datetime-local"
                  step="0.001"
                  size="xs"
                  value={draft.end}
                  onChange={(event) =>
                    changeRange("end", event.currentTarget.value)
                  }
                  error={Boolean(error)}
                />
                <Text size="xs" c="dimmed">
                  {timezone === "utc"
                    ? "UTC"
                    : Intl.DateTimeFormat().resolvedOptions().timeZone}{" "}
                  · Valid changes apply automatically
                </Text>
                {error && (
                  <Text size="xs" c="red" role="status">
                    {error}
                  </Text>
                )}
              </Stack>
            </Tabs.Panel>
          </Tabs>
          <Group
            justify="space-between"
            mt="sm"
            pt="xs"
            className="time-range-footer"
          >
            <Button
              size="compact-xs"
              variant="subtle"
              aria-label="Clear time filter"
              leftSection={<IconX size={12} />}
              onClick={() => {
                onPatch({
                  timePreset: "clear",
                  customStart: undefined,
                  customEnd: undefined,
                });
                setOpened(false);
              }}
            >
              Clear
            </Button>
            <Text size="xs" c="dimmed">
              Clear shows all available history
            </Text>
          </Group>
        </Popover.Dropdown>
      </Popover>
      <Select
        aria-label="Timezone"
        title={
          timezone === "utc"
            ? "Coordinated Universal Time"
            : Intl.DateTimeFormat().resolvedOptions().timeZone
        }
        size="xs"
        w={102}
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
