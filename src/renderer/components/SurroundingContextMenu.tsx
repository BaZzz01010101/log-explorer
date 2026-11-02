import { IconHistory } from "@tabler/icons-react";
import type { LogEvent } from "../../shared/contracts";
import {
  CONTEXT_DURATIONS,
  contextRangeLabel,
  type ContextDirection,
  type ContextRange,
} from "../../shared/context-range";
import { Menu } from "./AppMenu";

const directions: { direction: ContextDirection; label: string }[] = [
  { direction: "past", label: "Back" },
  { direction: "future", label: "Forward" },
  { direction: "both", label: "Both directions" },
];

export function SurroundingContextMenu({
  event,
  onContext,
  onSelect,
}: {
  event: LogEvent;
  onContext: (event: LogEvent, range: ContextRange) => void;
  onSelect?: () => void;
}) {
  const disabled = !event.logGroup || !event.logStream;
  return (
    <Menu.Sub>
      <Menu.Sub.Target>
        <Menu.Sub.Item
          disabled={disabled}
          leftSection={<IconHistory size={14} />}
          data-tooltip={
            disabled
              ? "This result has no source stream. Run an event query to inspect surrounding context."
              : undefined
          }
        >
          Surrounding context
        </Menu.Sub.Item>
      </Menu.Sub.Target>
      <Menu.Sub.Dropdown>
        {directions.map(({ direction, label }) => (
          <Menu.Sub key={direction}>
            <Menu.Sub.Target>
              <Menu.Sub.Item>{label}</Menu.Sub.Item>
            </Menu.Sub.Target>
            <Menu.Sub.Dropdown>
              {CONTEXT_DURATIONS.map(({ label: duration, durationMs }) => (
                <Menu.Item
                  key={durationMs}
                  data-tooltip={`Open a new tab: ${contextRangeLabel({ direction, durationMs })}. Server and local filters are cleared.`}
                  onClick={() => {
                    if (disabled) return;
                    onContext(event, { direction, durationMs });
                    onSelect?.();
                  }}
                >
                  {duration}
                </Menu.Item>
              ))}
            </Menu.Sub.Dropdown>
          </Menu.Sub>
        ))}
      </Menu.Sub.Dropdown>
    </Menu.Sub>
  );
}
