import type { LogTab } from "../shared/contracts";

export function historyRetentionDays(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.max(1, Math.min(365, Math.round(value)))
    : 7;
}

export function recentClosedTabs(
  tabs: readonly LogTab[],
  days = 7,
  now = Date.now(),
): LogTab[] {
  const cutoff = now - historyRetentionDays(days) * 86400000;
  return tabs.filter(
    (tab) =>
      typeof tab.closedAt !== "number" ||
      !Number.isFinite(tab.closedAt) ||
      tab.closedAt >= cutoff,
  );
}

export function closedTabHistory(
  closedTabs: readonly LogTab[],
  now = new Date(),
): { key: string; label: string; tabs: LogTab[] }[] {
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  const sections: { key: string; label: string; tabs: LogTab[] }[] = [];
  for (const tab of closedTabs) {
    const date =
      typeof tab.closedAt === "number" ? new Date(tab.closedAt) : null;
    const validDate = date && Number.isFinite(date.getTime()) ? date : null;
    const day = validDate
      ? new Date(
          validDate.getFullYear(),
          validDate.getMonth(),
          validDate.getDate(),
        ).getTime()
      : null;
    const label =
      day === today.getTime()
        ? "Today"
        : day === yesterday.getTime()
          ? "Yesterday"
          : validDate
            ? validDate.toLocaleDateString(undefined, {
                month: "short",
                day: "numeric",
                ...(validDate.getFullYear() !== now.getFullYear()
                  ? { year: "numeric" }
                  : {}),
              })
            : "Earlier";
    const key = day === null ? "earlier" : String(day);
    const previous = sections.at(-1);
    if (previous?.key === key) previous.tabs.push(tab);
    else sections.push({ key, label, tabs: [tab] });
  }
  return sections;
}
