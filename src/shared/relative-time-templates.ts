import type { Preferences, RelativeTimeTemplate } from "./contracts";

export type RelativeTimeTemplates = NonNullable<
  Preferences["relativeTimeTemplates"]
>;

const units = { m: "minute", h: "hour", d: "day", w: "week" };

export function relativeTimeLabel(
  duration: number,
  unit: RelativeTimeTemplate["unit"],
): string {
  return `Last ${duration} ${units[unit]}${duration === 1 ? "" : "s"}`;
}

export const RELATIVE_TIME_UNITS = [
  ["m", "Minutes"],
  ["h", "Hours"],
  ["d", "Days"],
  ["w", "Weeks"],
] as const;
export const DEFAULT_RELATIVE_TIME_TEMPLATES: RelativeTimeTemplates = {
  quick: [
    [1, "m"],
    [5, "m"],
    [30, "m"],
    [1, "h"],
    [12, "h"],
    [1, "d"],
  ].map(([duration, unit]) => ({
    id: `quick-${duration}${unit}`,
    label: `${duration}${unit}`,
    duration: duration as number,
    unit: unit as RelativeTimeTemplate["unit"],
  })),
  dropdown: (
    [
      ["m", [5, 10, 15, 30, 45]],
      ["h", [1, 2, 3, 6, 8, 12]],
      ["d", [1, 2, 3, 4, 5, 6]],
      ["w", [1, 2, 3, 4]],
    ] as const
  ).flatMap(([unit, durations]) =>
    durations.map((duration) => ({
      id: `dropdown-${duration}${unit}`,
      label: relativeTimeLabel(duration, unit),
      duration,
      unit,
    })),
  ),
};

export function normalizeRelativeTimeTemplates(
  value: unknown,
): RelativeTimeTemplates {
  const source =
    value && typeof value === "object"
      ? (value as Record<string, unknown>)
      : {};
  const normalize = (
    key: keyof RelativeTimeTemplates,
  ): RelativeTimeTemplate[] => {
    const entries = Array.isArray(source[key]) ? source[key] : [];
    const seen = new Set<string>();
    const valid = entries.filter((entry): entry is RelativeTimeTemplate => {
      if (
        !entry ||
        typeof entry !== "object" ||
        typeof entry.id !== "string" ||
        !entry.id.trim() ||
        entry.id.length > 80 ||
        seen.has(entry.id) ||
        typeof entry.label !== "string" ||
        entry.label.length > 80 ||
        !Number.isInteger(entry.duration) ||
        entry.duration < 1 ||
        entry.duration > 9999 ||
        typeof entry.unit !== "string" ||
        !Object.hasOwn(units, entry.unit)
      )
        return false;
      seen.add(entry.id);
      return true;
    });
    return RELATIVE_TIME_UNITS.flatMap(([unit]) => {
      const defaults = DEFAULT_RELATIVE_TIME_TEMPLATES[key].filter(
        (entry) => entry.unit === unit,
      );
      const durations = [
        ...new Set(
          valid
            .filter((entry) => entry.unit === unit)
            .map((entry) => entry.duration),
        ),
      ]
        .sort((a, b) => a - b)
        .slice(0, defaults.length);
      for (const entry of defaults) {
        if (durations.length === defaults.length) break;
        if (!durations.includes(entry.duration)) durations.push(entry.duration);
      }
      durations.sort((a, b) => a - b);
      return defaults.map((entry, index) => ({
        ...entry,
        duration: durations[index],
        label:
          key === "quick"
            ? `${durations[index]}${unit}`
            : relativeTimeLabel(durations[index], unit),
      }));
    });
  };
  return { quick: normalize("quick"), dropdown: normalize("dropdown") };
}

export function updateRelativeTimeSlot(
  value: RelativeTimeTemplates,
  section: keyof RelativeTimeTemplates,
  unit: RelativeTimeTemplate["unit"],
  index: number,
  duration: number,
): RelativeTimeTemplates {
  const normalized = normalizeRelativeTimeTemplates(value);
  const row = normalized[section].filter((entry) => entry.unit === unit);
  if (!row[index] || !Number.isFinite(duration)) return normalized;
  // Reserve enough space on either side for strictly increasing integer slots.
  row[index].duration = Math.max(
    index + 1,
    Math.min(9999 - (row.length - index - 1), Math.round(duration)),
  );
  for (let next = index + 1; next < row.length; next++) {
    row[next].duration = Math.max(
      row[next].duration,
      row[next - 1].duration + 1,
    );
  }
  for (let previous = index - 1; previous >= 0; previous--) {
    row[previous].duration = Math.min(
      row[previous].duration,
      row[previous + 1].duration - 1,
    );
  }
  for (const entry of row) {
    entry.label =
      section === "quick"
        ? `${entry.duration}${unit}`
        : relativeTimeLabel(entry.duration, unit);
  }
  return normalized;
}
