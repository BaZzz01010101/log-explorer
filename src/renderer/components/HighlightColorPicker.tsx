import { useState } from "react";
import { ActionIcon, ColorSwatch, Popover, SimpleGrid } from "@mantine/core";
import { IconCheck, IconHighlight } from "@tabler/icons-react";
import type { Preferences } from "../../shared/contracts";
import {
  HIGHLIGHT_TEXT_COLORS,
  type HighlightTextColor,
} from "../../shared/quick-highlight";
import { highlightTextPalette } from "../highlight-text-colors";

export function HighlightColorPicker({
  theme,
  value,
  onChange,
}: {
  theme: Preferences["theme"];
  value: HighlightTextColor;
  onChange(color: HighlightTextColor): void;
}) {
  const [opened, setOpened] = useState(false);
  return (
    <Popover
      opened={opened}
      onChange={setOpened}
      position="bottom-start"
      trapFocus
      returnFocus
      withArrow={false}
    >
      <Popover.Target>
        <ActionIcon
          size={22}
          variant="subtle"
          color="gray"
          aria-label="Highlight color"
          data-tooltip="Highlight color"
          data-color={value}
          onClick={() => setOpened((previous) => !previous)}
        >
          <IconHighlight
            size={14}
            color={highlightTextPalette(theme, value).accent}
          />
        </ActionIcon>
      </Popover.Target>
      <Popover.Dropdown p="xs" aria-label="Highlight colors">
        <SimpleGrid cols={5} spacing={6} verticalSpacing={6}>
          {HIGHLIGHT_TEXT_COLORS.map((color) => (
            <ColorSwatch
              key={color}
              component="button"
              type="button"
              size={22}
              radius="sm"
              color={highlightTextPalette(theme, color).accent}
              aria-label={color[0].toUpperCase() + color.slice(1)}
              aria-pressed={color === value}
              style={{ cursor: "pointer" }}
              onClick={() => {
                onChange(color);
                setOpened(false);
              }}
            >
              {color === value && <IconCheck size={14} color="black" />}
            </ColorSwatch>
          ))}
        </SimpleGrid>
      </Popover.Dropdown>
    </Popover>
  );
}
