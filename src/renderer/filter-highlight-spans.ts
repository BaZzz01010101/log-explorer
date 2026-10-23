import type { FilterEvidence, FilterOrigin } from "../shared/filter-evidence";

export type MatchOrigin = FilterOrigin | "manual" | "profile";
export interface PackedFilterEvidence {
  supported: boolean;
  matched: boolean;
  targets: { path: string; text: string; ranges: [number, number][] }[];
  paths: string[];
}
export function packFilterEvidence(
  evidence: FilterEvidence,
): PackedFilterEvidence {
  const groups = new Map<
    string,
    Map<string, PackedFilterEvidence["targets"][number]>
  >();
  const targets: PackedFilterEvidence["targets"] = [];
  let characters = 0;
  for (const match of evidence.matches) {
    let byText = groups.get(match.path);
    if (!byText) {
      byText = new Map();
      groups.set(match.path, byText);
    }
    let target = byText.get(match.text);
    if (!target) {
      if (targets.length >= 512 || characters + match.text.length > 524288)
        continue;
      characters += match.text.length;
      target = { path: match.path, text: match.text, ranges: [] };
      targets.push(target);
      byText.set(match.text, target);
    }
    target.ranges.push([match.start, match.end]);
  }
  return {
    supported: evidence.supported,
    matched: evidence.matched,
    targets,
    paths: evidence.paths.filter((path) => path.length <= 2048).slice(0, 2048),
  };
}
export interface FilterSpan {
  start: number;
  end: number;
  origin: FilterOrigin;
}
export function filterHighlightSpans(
  filters: Partial<Record<FilterOrigin, PackedFilterEvidence>> | undefined,
  path: string,
  text: string,
): FilterSpan[] {
  const spans: FilterSpan[] = [];
  for (const origin of ["server", "local"] as const) {
    const evidence = filters?.[origin];
    if (!evidence?.supported || !evidence.matched) continue;
    for (const target of evidence.targets)
      for (const [a, b] of target.ranges) {
        const match = { ...target, start: a, end: b };
        if (match.path !== path) continue;
        let start = match.start,
          end = match.end;
        if (text !== match.text) {
          if (text === JSON.stringify(match.text)) {
            start = JSON.stringify(match.text.slice(0, start)).length - 1;
            end = JSON.stringify(match.text.slice(0, end)).length - 1;
          } else if (match.text.startsWith(text)) {
            end = Math.min(end, text.length);
          } else if (text.startsWith('"')) {
            try {
              const decoded: unknown = JSON.parse(text);
              if (
                typeof decoded !== "string" ||
                !match.text.startsWith(decoded.replace(/…$/, ""))
              )
                continue;
              const limit = decoded.endsWith("…")
                ? decoded.length - 1
                : decoded.length;
              if (start >= limit) continue;
              start = JSON.stringify(match.text.slice(0, start)).length - 1;
              end =
                JSON.stringify(match.text.slice(0, Math.min(end, limit)))
                  .length - 1;
            } catch {
              continue;
            }
          } else if (
            path.startsWith("/") &&
            start === 0 &&
            end === match.text.length
          ) {
            // Formatted columns (bytes, dates, etc.) represent the same field.
            start = 0;
            end = text.length;
          } else {
            // A compact plain-text row collapses whitespace from its raw prefix.
            let normalized = "",
              sourceOffsets: number[] = [];
            for (
              let index = 0;
              index < Math.min(match.text.length, 6000);
              index++
            ) {
              const whitespace = /\s/.test(match.text[index]);
              if (whitespace && normalized.endsWith(" ")) continue;
              normalized += whitespace ? " " : match.text[index];
              sourceOffsets.push(index);
            }
            if (!normalized.startsWith(text)) continue;
            const a = sourceOffsets.findIndex((index) => index >= start);
            const b = sourceOffsets.findIndex((index) => index >= end);
            start = a < 0 ? text.length : a;
            end = b < 0 ? text.length : b;
          }
        }
        start = Math.max(0, start);
        end = Math.min(text.length, end);
        if (end > start) spans.push({ start, end, origin });
        if (spans.length >= 512) return spans;
      }
  }
  return spans;
}

export const matchColors: Record<Exclude<MatchOrigin, "profile">, string> = {
  server: "var(--filter-match-server, var(--mantine-color-blue-4))",
  local: "var(--filter-match-local, var(--mantine-color-green-4))",
  manual: "var(--filter-match-manual, var(--mantine-color-yellow-5))",
};
