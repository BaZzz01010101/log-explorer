import type { ColumnConfig, LogEvent, Preferences } from "../shared/contracts";
import {
  evaluateFilterEvidence,
  type FilterOrigin,
} from "../shared/filter-evidence";
import {
  packFilterEvidence,
  type MatchOrigin,
  type PackedFilterEvidence,
} from "./filter-highlight-spans";
import type {
  HighlightColors,
  HighlightProfile,
  HighlightRule,
} from "../shared/highlights";
import {
  eventColumnValue,
  flattenJson,
  formatColumnValue,
  getPointer,
  messagePreview,
  parseLogMessage,
  summarizeValue,
} from "../shared/log-data";

export interface HighlightSpan {
  start: number;
  end: number;
  colors: HighlightColors;
}
export interface EventHighlights {
  row: HighlightColors;
  overview?: string[];
  text: Record<string, HighlightSpan[]>;
  filters?: Partial<Record<FilterOrigin, PackedFilterEvidence>>;
  paths?: Record<string, MatchOrigin[]>;
  matchKey?: string;
}
export const textHighlightKey = (path: string, text: string) =>
  JSON.stringify([path, text]);
const compile = (pattern: string, ignoreCase: boolean) => {
  try {
    return pattern && pattern.length <= 500
      ? new RegExp(pattern, ignoreCase ? "giu" : "gu")
      : undefined;
  } catch {
    return;
  }
};
const matches = (regex: RegExp, text: string) => {
  regex.lastIndex = 0;
  return regex.test(text);
};
const ruleColors = (rule: HighlightRule, theme: Preferences["theme"]) =>
  rule.separateThemeColors
    ? ((theme === "dark" ? rule.darkColors : rule.lightColors) ?? rule.colors)
    : rule.colors;

// Called only in the worker in production. Tests call it directly with bounded,
// ordinary patterns; arbitrary user regexes never execute on the renderer thread.
export function highlightEvent(
  event: LogEvent,
  profiles: HighlightProfile[],
  theme: Preferences["theme"],
  columns: ColumnConfig[],
  timezone: Preferences["timezone"],
  overviewOnly = false,
  needle = "",
  filters?: { server: string; local: string },
  messageComplete = true,
): EventHighlights {
  const result: EventHighlights = { row: {}, text: Object.create(null) };
  if (overviewOnly) result.overview = [];
  const raw = event.message.slice(0, 200_000);
  const quickNeedle =
    needle.length > 0 && needle.length <= 200 ? needle.toLowerCase() : "";
  let quickMatch = Boolean(
    quickNeedle && raw.toLowerCase().includes(quickNeedle),
  );
  const parsed = parseLogMessage(raw);
  const pathMatches: Record<string, MatchOrigin[]> = Object.create(null);
  const matchPath = (path: string, origin: MatchOrigin) => {
    if (path.startsWith("@key")) path = path.slice(4);
    if (path !== "" && !path.startsWith("/")) return;
    const origins = (pathMatches[path] ??= []);
    if (!origins.includes(origin)) origins.push(origin);
  };
  if (!overviewOnly && (filters?.server || filters?.local)) {
    result.filters = {};
    for (const origin of ["server", "local"] as const) {
      if (!filters[origin].trim()) continue;
      // A bounded preview cannot prove a whole-query match (anchors and
      // negative predicates can change meaning beyond its boundary).
      const evidence =
        messageComplete && event.message.length <= 200_000
          ? evaluateFilterEvidence(event, parsed, filters[origin], origin)
          : { supported: false, matched: false, matches: [], paths: [] };
      const packed = packFilterEvidence(evidence);
      result.filters[origin] = packed;
      if (evidence.supported && evidence.matched) {
        if (packed) for (const path of packed.paths) matchPath(path, origin);
      }
    }
  }
  const fields = new Map<string, { path: string; text: string }>();
  let budget = 100_000;
  const add = (path: string, text: string, required = false) => {
    if (!text || (!required && (budget -= text.length) < 0)) return;
    fields.set(textHighlightKey(path, text), { path, text });
  };
  if (!overviewOnly || (quickNeedle && !quickMatch)) {
    add("@message", raw, true);
    add("@message", raw.slice(0, 600).replace(/\s+/g, " "), true);
    add("@message", raw.slice(0, 6000), true);
    if (parsed.kind === "json") {
      for (const [path, value] of Object.entries(
        flattenJson(parsed.value!, { maxFields: 256, maxNodes: 800 }).fields,
      )) {
        const key = path
          .split("/")
          .at(-1)!
          .replace(/~1/g, "/")
          .replace(/~0/g, "~");
        add(`@key${path}`, JSON.stringify(key));
        for (const limit of [500, 4000])
          add(
            path,
            typeof value === "string"
              ? JSON.stringify(summarizeValue(value, limit))
              : String(value),
          );
      }
    }
    for (const column of columns.filter((column) => !column.hidden)) {
      let path = column.path;
      let text = formatColumnValue(
        eventColumnValue(event, parsed, path),
        column.format,
        timezone,
      );
      if (
        path === "@message" &&
        (!column.format || column.format === "auto") &&
        parsed.kind === "json"
      ) {
        const preview = messagePreview(parsed);
        if (preview) {
          path = preview.path;
          text = summarizeValue(preview.value, 1500);
        }
      }
      add(path, text);
    }
  }
  if (quickNeedle) {
    for (const { path, text } of fields.values())
      if (text.toLowerCase().includes(quickNeedle)) matchPath(path, "manual");
  }
  if (overviewOnly && quickNeedle && !quickMatch)
    quickMatch = [...fields.values()].some(({ text }) =>
      text.toLowerCase().includes(quickNeedle),
    );
  let spanCount = 0;
  for (const profile of profiles) {
    if (!profile.enabled) continue;
    if (profile.groupPattern) {
      const group = compile(profile.groupPattern, profile.groupIgnoreCase);
      if (!group || !matches(group, event.logGroup ?? "")) continue;
    }
    for (const rule of profile.rules) {
      if (!rule.enabled) continue;
      const regex = compile(rule.pattern, rule.ignoreCase);
      if (!regex) continue;
      let search = raw;
      if (rule.scope === "structured") {
        if (
          parsed.kind !== "json" ||
          (rule.path !== "" && !rule.path.startsWith("/"))
        )
          continue;
        const value = getPointer(parsed.value, rule.path);
        if (value === undefined) continue;
        search =
          typeof value === "string"
            ? value
            : JSON.stringify(value).slice(0, 200_000);
      }
      if (!matches(regex, search)) continue;
      const colors = ruleColors(rule, theme);
      if (overviewOnly && rule.target === "text") {
        regex.lastIndex = 0;
        let visible = false;
        for (let count = 0; count < 100; count++) {
          const match = regex.exec(search);
          if (!match) break;
          if (match[0].length) {
            visible = true;
            break;
          }
          regex.lastIndex +=
            (search.codePointAt(regex.lastIndex) ?? 0) > 0xffff ? 2 : 1;
        }
        if (!visible) continue;
        const color = colors.background || colors.foreground;
        if (color && !result.overview!.includes(color))
          result.overview!.push(color);
        continue;
      }
      if (rule.target === "row") {
        result.row.foreground ??= colors.foreground;
        result.row.background ??= colors.background;
        continue;
      }
      for (const [key, field] of fields) {
        if (
          rule.scope === "structured" &&
          field.path !== rule.path &&
          !(rule.path === "" || field.path.startsWith(rule.path + "/"))
        )
          continue;
        let matchText = field.text;
        let encodedString: string | undefined;
        if (rule.scope === "structured" && field.text.startsWith('"')) {
          try {
            const decoded = JSON.parse(field.text);
            if (typeof decoded === "string") {
              encodedString = decoded;
              matchText = decoded;
            }
          } catch {
            /* A bounded summary may not be a complete JSON string. */
          }
        }
        regex.lastIndex = 0;
        let count = 0;
        while (count++ < 100 && spanCount < 512) {
          const match = regex.exec(matchText);
          if (!match) break;
          if (!match[0].length) {
            regex.lastIndex +=
              (matchText.codePointAt(regex.lastIndex) ?? 0) > 0xffff ? 2 : 1;
            continue;
          }
          const rawStart = match.index,
            rawEnd = rawStart + match[0].length;
          const start =
            encodedString === undefined
              ? rawStart
              : JSON.stringify(encodedString.slice(0, rawStart)).length - 1;
          const end =
            encodedString === undefined
              ? rawEnd
              : JSON.stringify(encodedString.slice(0, rawEnd)).length - 1;
          const spans = result.text[key] ?? [];
          if (spans.some((span) => start < span.end && end > span.start))
            continue;
          spans.push({ start, end, colors });
          matchPath(field.path, "profile");
          result.text[key] = spans;
          spanCount++;
        }
      }
    }
  }
  if (overviewOnly) {
    const rowColor = result.row.background || result.row.foreground;
    if (rowColor && !result.overview!.includes(rowColor))
      result.overview!.unshift(rowColor);
    if (quickMatch) result.overview!.push("var(--mantine-color-yellow-5)");
    result.overview = [...new Set(result.overview)].slice(0, 4);
  }
  for (const spans of Object.values(result.text))
    spans.sort((a, b) => a.start - b.start);
  if (!overviewOnly && Object.keys(pathMatches).length) {
    result.paths = pathMatches;
    result.matchKey = JSON.stringify([
      filters?.server,
      filters?.local,
      needle,
      profiles,
    ]);
  }
  return result;
}
