import { useState } from "react";
import { Button, Checkbox, Group, Popover, Stack } from "@mantine/core";
import { IconChevronDown } from "@tabler/icons-react";
import { LOG_LEVELS } from "../../shared/log-data";

interface LevelFilterProps {
  level: string;
  levels?: readonly string[];
  onChange: (levels: string[]) => void;
}

export function LevelFilter({ level, levels, onChange }: LevelFilterProps) {
  const [opened, setOpened] = useState(false);
  const selected =
    levels ?? (level && level !== "all" ? [level] : [...LOG_LEVELS]);
  const all = LOG_LEVELS.every((value) => selected.includes(value));
  const label = all
    ? "All levels"
    : selected.length
      ? selected.map((value) => value.toUpperCase()).join(", ")
      : "No levels";
  const toggle = (value: string) =>
    onChange(
      selected.includes(value)
        ? selected.filter((entry) => entry !== value)
        : [...selected, value],
    );
  return (
    <Popover
      opened={opened}
      onChange={setOpened}
      width={190}
      position="bottom-start"
      returnFocus
      withArrow={false}
    >
      <Popover.Target>
        <Button
          className="level-filter"
          aria-label="Local level filter"
          size="xs"
          variant="default"
          rightSection={<IconChevronDown size={12} />}
          data-tooltip={label}
          onClick={() => setOpened((value) => !value)}
          styles={{
            label: {
              minWidth: 0,
            },
          }}
        >
          <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>
            {label}
          </span>
        </Button>
      </Popover.Target>
      <Popover.Dropdown p="xs" aria-label="Log levels">
        <Stack gap={2}>
          <Group gap="xs" wrap="nowrap">
            <Checkbox
              aria-label="Include all levels"
              checked={all}
              indeterminate={!all && selected.length > 0}
              onChange={() => onChange(all ? [] : [...LOG_LEVELS])}
              size="xs"
            />
            <Button
              size="compact-xs"
              variant="subtle"
              color="gray"
              onClick={() => {
                onChange([...LOG_LEVELS]);
                setOpened(false);
              }}
            >
              All levels
            </Button>
          </Group>
          {LOG_LEVELS.map((value) => (
            <Group key={value} gap="xs" wrap="nowrap">
              <Checkbox
                aria-label={`Include ${value.toUpperCase()}`}
                checked={selected.includes(value)}
                onChange={() => toggle(value)}
                size="xs"
              />
              <Button
                size="compact-xs"
                variant="subtle"
                color="gray"
                aria-label={`Select only ${value.toUpperCase()}`}
                data-tooltip="Click to select only this level; Ctrl or Cmd click to toggle"
                onClick={(event) => {
                  if (event.ctrlKey || event.metaKey) toggle(value);
                  else {
                    onChange([value]);
                    setOpened(false);
                  }
                }}
              >
                {value.toUpperCase()}
              </Button>
            </Group>
          ))}
        </Stack>
      </Popover.Dropdown>
    </Popover>
  );
}
