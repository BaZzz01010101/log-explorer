import { NumberInput, Stack, Text } from "@mantine/core";
import { useEffect, useRef } from "react";
import { SettingLabel } from "./SettingLabel";
import {
  normalizeRelativeTimeTemplates,
  RELATIVE_TIME_UNITS,
  updateRelativeTimeSlot,
  type RelativeTimeTemplates,
} from "../../shared/relative-time-templates";

function RelativeTimeSlotInput({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange(value: number): void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const current = useRef({ value, onChange });
  current.current = { value, onChange };
  useEffect(() => {
    const element = input.current;
    if (!element) return;
    const wheel = (event: WheelEvent) => {
      if (event.deltaY === 0 || document.activeElement !== element) return;
      event.preventDefault();
      const { value, onChange } = current.current;
      onChange(
        Math.max(1, Math.min(9999, value + (event.deltaY < 0 ? 1 : -1))),
      );
    };
    element.addEventListener("wheel", wheel, { passive: false });
    return () => element.removeEventListener("wheel", wheel);
  }, []);
  return (
    <NumberInput
      ref={input}
      aria-label={label}
      value={value}
      min={1}
      max={9999}
      allowDecimal={false}
      allowNegative={false}
      rightSectionWidth={20}
      size="xs"
      onChange={(duration) => {
        if (typeof duration === "number" && Number.isInteger(duration))
          onChange(duration);
      }}
    />
  );
}

export function RelativeTimeTemplatesEditor({
  value,
  onChange,
}: {
  value: RelativeTimeTemplates;
  onChange(value: RelativeTimeTemplates): void;
}) {
  const templates = normalizeRelativeTimeTemplates(value);
  return (
    <Stack gap="md" className="time-template-editor">
      {(
        [
          ["quick", "Quick toolbar"],
          ["dropdown", "Relative dropdown"],
        ] as const
      ).map(([section, name]) => (
        <section key={section} aria-label={`${name} templates`}>
          <Text component="h3" size="sm" fw={600} mb="xs">
            <SettingLabel
              label={name}
              help="Durations stay in ascending order within each unit. Editing a slot adjusts its neighbors when needed."
            />
          </Text>
          {section === "quick" ? (
            <div className="time-template-quick-scroll">
              <div className="time-template-quick">
                {RELATIVE_TIME_UNITS.map(([unit, scale]) => {
                  const row = templates.quick.filter(
                    (entry) => entry.unit === unit,
                  );
                  if (!row.length) return null;
                  return (
                    <div
                      className="time-template-quick-group"
                      key={unit}
                      role="group"
                      aria-label={`Quick toolbar ${scale}`}
                      style={{ gridColumn: `span ${row.length}` }}
                    >
                      <div
                        className="time-template-quick-slots time-template-slots"
                        style={{
                          gridTemplateColumns: `repeat(${row.length}, minmax(0, 1fr))`,
                        }}
                      >
                        {row.map((entry, index) => (
                          <RelativeTimeSlotInput
                            key={entry.id}
                            label={`${name} ${scale} slot ${index + 1}`}
                            value={entry.duration}
                            onChange={(duration) =>
                              onChange(
                                updateRelativeTimeSlot(
                                  templates,
                                  section,
                                  unit,
                                  index,
                                  duration,
                                ),
                              )
                            }
                          />
                        ))}
                      </div>
                      <Text
                        className="time-template-quick-caption"
                        size="xs"
                        aria-hidden="true"
                      >
                        <span>{scale}</span>
                      </Text>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : (
            <div className="time-template-rows">
              {RELATIVE_TIME_UNITS.map(([unit, scale]) => {
                const row = templates[section].filter(
                  (entry) => entry.unit === unit,
                );
                if (!row.length) return null;
                return (
                  <div className="time-template-row" key={unit}>
                    <Text size="xs" c="dimmed">
                      {scale}
                    </Text>
                    <div className="time-template-slots">
                      {row.map((entry, index) => (
                        <RelativeTimeSlotInput
                          key={entry.id}
                          label={`${name} ${scale} slot ${index + 1}`}
                          value={entry.duration}
                          onChange={(duration) => {
                            onChange(
                              updateRelativeTimeSlot(
                                templates,
                                section,
                                unit,
                                index,
                                duration,
                              ),
                            );
                          }}
                        />
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      ))}
    </Stack>
  );
}
