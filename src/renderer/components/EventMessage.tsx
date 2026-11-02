import {
  memo,
  createContext,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
  type SetStateAction,
} from "react";
import {
  filterHighlightSpans,
  matchColors,
  type MatchOrigin,
} from "../filter-highlight-spans";
import {
  EventHighlightContext,
  QuickHighlightContext,
} from "../useEventHighlights";
import { textHighlightKey } from "../highlight-engine";
import {
  IconChevronDown,
  IconChevronRight,
  IconColumns3,
  IconFilter,
  IconDots,
  IconBraces,
  IconCopy,
  IconArrowsVertical,
  IconFold,
  IconTextWrap,
} from "@tabler/icons-react";
import type { LogEvent } from "../../shared/contracts";
import {
  inspectionRows,
  parseLogMessage,
  summarizeValue,
  type JsonValue,
  type LogLevel,
  type ParsedMessage,
} from "../../shared/log-data";
import { Menu } from "./AppMenu";
import { decodeFieldText, type FieldDecoding } from "../json-deserialization";

export interface EventRow {
  event: LogEvent;
  parsed: ParsedMessage;
  level: LogLevel;
}

export const JsonTreeExpansionContext = createContext<{
  expanded: ReadonlyMap<string, Set<string>>;
  onChange(eventId: string, update: SetStateAction<Set<string>>): void;
} | null>(null);
export interface JsonExpansionState {
  expanded: Set<string>;
  onChange(update: SetStateAction<Set<string>>): void;
}

export const HighlightText = memo(function HighlightText({
  text,
  needle,
  path = "@message",
}: {
  text: string;
  needle: string;
  path?: string;
}) {
  const profile = useContext(EventHighlightContext);
  const quick = useContext(QuickHighlightContext);
  const spans = profile?.text[textHighlightKey(path, text)] ?? [];
  const filters = filterHighlightSpans(profile?.filters, path, text);
  const fromWorker = profile?.manual?.[textHighlightKey(path, text)];
  const manual: { start: number; end: number }[] = fromWorker ?? [];
  if (!fromWorker && !quick.regex && needle && needle.length <= 200) {
    const lower = quick.caseSensitive ? text : text.toLowerCase(),
      query = quick.caseSensitive ? needle : needle.toLowerCase();
    let cursor = 0;
    for (let count = 0; count < 30; count++) {
      const start = lower.indexOf(query, cursor);
      if (start < 0) break;
      manual.push({ start, end: start + needle.length });
      cursor = start + needle.length;
    }
  }
  if (!spans.length && !filters.length && !manual.length) return <>{text}</>;
  const edges = [
    ...new Set([
      0,
      text.length,
      ...[...spans, ...filters, ...manual].flatMap(({ start, end }) => [
        Math.max(0, start),
        Math.min(text.length, end),
      ]),
    ]),
  ].sort((a, b) => a - b);
  const parts: React.ReactNode[] = [];
  for (let index = 0; index + 1 < edges.length; index++) {
    const start = edges[index],
      end = edges[index + 1];
    if (end <= start) continue;
    const covering = (span: { start: number; end: number }) =>
      span.start <= start && span.end >= end;
    const colors = spans.find(covering)?.colors;
    const origins = (["server", "local", "manual"] as const).filter((origin) =>
      origin === "manual"
        ? manual.some(covering)
        : filters.some((span) => span.origin === origin && covering(span)),
    );
    if (!colors && !origins.length) {
      parts.push(text.slice(start, end));
      continue;
    }
    const gradient = origins.length
      ? `linear-gradient(to bottom, ${origins.flatMap((origin, index) => [`${matchColors[origin]} ${(index * 100) / origins.length}%`, `${matchColors[origin]} ${((index + 1) * 100) / origins.length}%`]).join(", ")})`
      : undefined;
    parts.push(
      <mark
        key={start}
        className={colors ? "profile-highlight-text" : "filter-highlight-text"}
        data-highlight-origins={origins.length ? origins.join(" ") : undefined}
        style={{
          color: colors?.foreground ?? "inherit",
          backgroundColor: colors?.background ?? "transparent",
          backgroundImage: gradient,
        }}
      >
        {text.slice(start, end)}
      </mark>,
    );
  }
  return <>{parts}</>;
});

function JsonFieldMenu({
  path,
  value,
  onAddColumn,
  onAddFilter,
  onCopyValue,
  onDeserialize,
}: {
  path: string;
  value: JsonValue;
  onAddColumn?: (path: string) => void;
  onAddFilter?: (path: string, value: JsonValue) => void;
  onCopyValue?: (text: string) => void;
  onDeserialize?: (path: string, encoding?: FieldDecoding) => void;
}) {
  const [opened, setOpened] = useState(false);
  const canDeserialize = useMemo(
    () =>
      opened &&
      typeof value === "string" &&
      parseLogMessage(value).kind === "json",
    [opened, value],
  );
  const canDecode = useMemo(
    () => ({
      url: opened && decodeFieldText(value, "url") !== undefined,
      base64: opened && decodeFieldText(value, "base64") !== undefined,
    }),
    [opened, value],
  );
  const container = value !== null && typeof value === "object";
  return (
    <Menu
      opened={opened}
      onChange={setOpened}
      withinPortal
      position="bottom-start"
      transitionProps={{ duration: 0 }}
    >
      <Menu.Target>
        <button
          type="button"
          className="json-field-actions"
          aria-label={`Field actions for ${path || "root"}`}
          data-tooltip="Field actions"
        >
          <IconDots size={14} />
        </button>
      </Menu.Target>
      <Menu.Dropdown
        aria-label={`Field actions for ${path || "root"}`}
        onKeyDown={(event) => {
          event.stopPropagation();
          if (event.key === "Escape") {
            event.preventDefault();
            setOpened(false);
          }
        }}
      >
        {onCopyValue && (
          <>
            <Menu.Item
              aria-label={`Copy ${path || "root"} value`}
              leftSection={<IconCopy size={14} />}
              onClick={() =>
                onCopyValue(
                  typeof value === "string"
                    ? value
                    : JSON.stringify(value, null, 2),
                )
              }
            >
              Copy value
            </Menu.Item>
            <Menu.Item
              aria-label={`Copy ${path || "root"} path`}
              leftSection={<IconCopy size={14} />}
              onClick={() => onCopyValue(path)}
            >
              Copy path
            </Menu.Item>
          </>
        )}
        {onAddColumn && (
          <Menu.Item
            aria-label={`Add ${path || "root"} column`}
            leftSection={<IconColumns3 size={14} />}
            onClick={() => onAddColumn(path)}
          >
            Add as column
          </Menu.Item>
        )}
        {onAddFilter && (
          <Menu.Item
            aria-label={`Add ${path || "root"} to filter`}
            disabled={container}
            leftSection={<IconFilter size={14} />}
            onClick={() => onAddFilter(path, value)}
          >
            Add to filter
          </Menu.Item>
        )}
        {onDeserialize && (
          <Menu.Item
            aria-label={`Deserialize ${path || "root"}`}
            disabled={!canDeserialize}
            leftSection={<IconBraces size={14} />}
            onClick={() => onDeserialize(path)}
          >
            Deserialize
          </Menu.Item>
        )}
        {onDeserialize &&
          (["url", "base64"] as const).map((encoding) => (
            <Menu.Item
              key={encoding}
              aria-label={`${encoding === "url" ? "URL" : "Base64"} decode ${path || "root"}`}
              disabled={!canDecode[encoding]}
              leftSection={<IconBraces size={14} />}
              onClick={() => onDeserialize(path, encoding)}
            >
              {encoding === "url"
                ? "Decode URL encoding"
                : "Decode Base64 text"}
            </Menu.Item>
          ))}
      </Menu.Dropdown>
    </Menu>
  );
}

function MessageFoldControl({
  expanded,
  onToggle,
}: {
  expanded: boolean;
  onToggle(): void;
}) {
  const label = expanded
    ? "Fold structured object"
    : "Unfold structured object";
  return (
    <button
      type="button"
      className="message-action"
      aria-label={label}
      aria-pressed={expanded}
      data-tooltip={label}
      onClick={onToggle}
    >
      {expanded ? <IconFold size={16} /> : <IconArrowsVertical size={16} />}
    </button>
  );
}

function MessageWrapControl({
  enabled,
  onToggle,
}: {
  enabled: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      className="message-action"
      aria-label="Toggle inspector line wrap"
      aria-pressed={enabled}
      data-tooltip={
        enabled ? "Disable inspector line wrapping" : "Wrap inspector lines"
      }
      onClick={onToggle}
    >
      <IconTextWrap size={16} />
    </button>
  );
}

export function objectExpansionPaths(value: JsonValue, maxDepth = 24) {
  const paths = new Set([""]);
  for (let depth = 0; depth < maxDepth; depth++) {
    const before = paths.size;
    for (const row of inspectionRows(value, paths, { maxNodes: 800, maxDepth })
      .rows) {
      if (row.childCount > 0 && !row.depthLimited) paths.add(row.path);
    }
    if (paths.size === before) break;
  }
  return paths;
}

export function JsonTree({
  value,
  highlight,
  compact = false,
  onAddColumn,
  onAddFilter,
  onCopyValue,
  controls = false,
  lineWrap,
  renderActions,
  onDeserialize,
  deserializedPaths,
  decodedLabels,
  autoExpandMatches = false,
  expansionKey,
  expandRequest,
  expansionState,
  onExpansionApplied,
  defaultExpanded,
  onToggleAll,
}: {
  value: JsonValue;
  highlight: string;
  compact?: boolean;
  onAddColumn?: (path: string) => void;
  onAddFilter?: (path: string, value: JsonValue) => void;
  onCopyValue?: (text: string) => void;
  controls?: boolean;
  lineWrap?: { enabled: boolean; onToggle: () => void };
  renderActions?: (actions: ReactNode) => ReactNode;
  onDeserialize?: (path: string, encoding?: FieldDecoding) => void;
  deserializedPaths?: ReadonlySet<string>;
  decodedLabels?: ReadonlyMap<string, string>;
  autoExpandMatches?: boolean;
  expansionKey?: string;
  expandRequest?: number;
  expansionState?: JsonExpansionState;
  onExpansionApplied?(): void;
  defaultExpanded?: boolean;
  onToggleAll?(expanded: boolean): void;
}) {
  const match = useContext(EventHighlightContext);
  const matchPaths = match?.paths ?? {};
  const pathKey = JSON.stringify(Object.keys(matchPaths).sort());
  const processedMatch = useRef<{ paths: string; enabled: boolean } | null>(
    null,
  );
  const [privateExpanded, setPrivateExpanded] = useState(() =>
    defaultExpanded ? objectExpansionPaths(value) : new Set([""]),
  );
  const sharedExpansion = useContext(JsonTreeExpansionContext);
  const expanded =
    (expansionKey === undefined
      ? undefined
      : sharedExpansion?.expanded.get(expansionKey)) ??
    expansionState?.expanded ??
    privateExpanded;
  const setExpanded =
    sharedExpansion && expansionKey !== undefined
      ? (update: SetStateAction<Set<string>>) =>
          sharedExpansion.onChange(expansionKey, update)
      : (expansionState?.onChange ?? setPrivateExpanded);
  const appliedExpansion = useRef<number | undefined>(undefined);
  const expandMatches = autoExpandMatches && defaultExpanded !== false;
  useLayoutEffect(() => {
    if (defaultExpanded !== undefined)
      setExpanded(
        defaultExpanded ? objectExpansionPaths(value) : new Set([""]),
      );
  }, [defaultExpanded, value]);
  useLayoutEffect(() => {
    if (
      expandRequest === undefined ||
      appliedExpansion.current === expandRequest
    )
      return;
    appliedExpansion.current = expandRequest;
    setExpanded(objectExpansionPaths(value));
    onExpansionApplied?.();
  }, [expandRequest]);
  useEffect(() => {
    if (
      processedMatch.current?.paths === pathKey &&
      processedMatch.current.enabled === expandMatches
    )
      return;
    processedMatch.current = { paths: pathKey, enabled: expandMatches };
    if (!expandMatches) return;
    const ancestors = new Set<string>();
    for (const path of Object.keys(matchPaths)) {
      if (!path.startsWith("/")) continue;
      ancestors.add("");
      for (
        let slash = path.indexOf("/", 1);
        slash >= 0 && ancestors.size < 800;
        slash = path.indexOf("/", slash + 1)
      )
        ancestors.add(path.slice(0, slash));
      if (ancestors.size >= 800) break;
    }
    if (!ancestors.size) return;
    setExpanded((previous) =>
      [...ancestors].every((path) => previous.has(path))
        ? previous
        : new Set([...previous, ...ancestors]),
    );
  }, [expandMatches, pathKey]);
  const model = useMemo(
    () => inspectionRows(value, expanded, { maxNodes: compact ? 120 : 800 }),
    [value, expanded, compact],
  );
  const toggle = (
    path: string,
    recursive = false,
    subtree?: JsonValue,
    depth = 0,
  ) =>
    setExpanded((previous) => {
      if (recursive && subtree !== undefined) {
        const paths = [...objectExpansionPaths(subtree, 24 - depth)].map(
          (relative) => path + relative,
        );
        const open = paths.some((key) => !previous.has(key));
        const next = new Set(
          [...previous].filter(
            (key) => path !== "" && key !== path && !key.startsWith(path + "/"),
          ),
        );
        if (open) paths.forEach((key) => next.add(key));
        return next;
      }
      const next = new Set(previous);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  const allExpanded =
    defaultExpanded ??
    (!onToggleAll &&
      model.rows.some((row) => row.childCount > 0) &&
      model.rows.every(
        (row) => row.childCount === 0 || row.depthLimited || row.expanded,
      ));
  const toggleAll = () => {
    const next = !allExpanded;
    setExpanded(next ? objectExpansionPaths(value) : new Set([""]));
    onToggleAll?.(next);
  };
  const actions = (controls || lineWrap) && (
    <div className="structured-actions">
      {lineWrap && <MessageWrapControl {...lineWrap} />}
      {controls && (
        <MessageFoldControl expanded={allExpanded} onToggle={toggleAll} />
      )}
    </div>
  );
  return (
    <div className={`json-tree ${compact ? "json-tree-compact" : ""}`}>
      {renderActions ? renderActions(actions) : actions}
      {model.rows.map((row) => {
        const container = row.value !== null && typeof row.value === "object";
        const array = Array.isArray(row.value);
        const type = row.value === null ? "null" : typeof row.value;
        const hiddenMatches =
          container && !row.expanded
            ? ([
                ...new Set(
                  Object.entries(matchPaths)
                    .filter(
                      ([path]) =>
                        row.path === "" ||
                        path === row.path ||
                        path.startsWith(row.path + "/"),
                    )
                    .flatMap(([, origins]) => origins),
                ),
              ] as MatchOrigin[])
            : [];
        const valueText = container
          ? `${array ? "[" : "{"}${row.childCount} ${array ? "items" : "keys"}${array ? "]" : "}"}`
          : typeof row.value === "string"
            ? JSON.stringify(summarizeValue(row.value, compact ? 500 : 4000))
            : String(row.value);
        return (
          <div
            className="json-line"
            data-json-path={row.path}
            data-deserialized={
              Array.from(deserializedPaths ?? []).some(
                (path) =>
                  path === "" ||
                  row.path === path ||
                  row.path.startsWith(path + "/"),
              ) || undefined
            }
            key={row.path}
            style={{ paddingLeft: row.depth * 17 }}
          >
            {row.childCount > 0 && !row.depthLimited ? (
              <button
                className="json-toggle"
                aria-label={`${row.expanded ? "Collapse" : "Expand"} ${row.path || "root"}`}
                onClick={(event) =>
                  toggle(
                    row.path,
                    event?.ctrlKey || event?.metaKey,
                    row.value,
                    row.depth,
                  )
                }
              >
                {row.expanded ? (
                  <IconChevronDown size={13} />
                ) : (
                  <IconChevronRight size={13} />
                )}
              </button>
            ) : (
              <span className="json-toggle json-toggle-spacer" />
            )}
            {(onCopyValue || onAddColumn || onAddFilter || onDeserialize) && (
              <JsonFieldMenu
                path={row.path}
                value={row.value}
                onCopyValue={onCopyValue}
                onAddColumn={onAddColumn}
                onAddFilter={onAddFilter}
                onDeserialize={
                  onDeserialize
                    ? (path, encoding) => {
                        if (encoding) onDeserialize(path, encoding);
                        else onDeserialize(path);
                        setExpanded((previous) => new Set([...previous, path]));
                      }
                    : undefined
                }
              />
            )}
            <span className="json-key">
              <HighlightText
                text={row.label === "$" ? "$" : JSON.stringify(row.label)}
                needle={highlight}
                path={`@key${row.path}`}
              />
            </span>
            {hiddenMatches.length > 0 && (
              <span
                className="json-match-indicator"
                role="img"
                aria-label={`Contains ${hiddenMatches.join(" and ")} match`}
                data-tooltip={`Highlighted match in folded content: ${hiddenMatches.join(", ")}`}
              >
                {hiddenMatches.map((origin) => (
                  <i key={origin} data-match-origin={origin} />
                ))}
              </span>
            )}
            {deserializedPaths?.has(row.path) && (
              <span
                className="json-deserialized-label"
                data-tooltip="Temporary change in this view; original message is preserved"
              >
                {decodedLabels?.get(row.path) ?? "deserialized"}
              </span>
            )}
            <span className="json-punctuation">: </span>
            <span
              className={`json-value json-${container ? "container" : type}`}
            >
              <HighlightText
                text={valueText}
                needle={highlight}
                path={row.path}
              />
            </span>
            {row.depthLimited && (
              <span className="inspection-note"> depth limit</span>
            )}
          </div>
        );
      })}
      {model.truncated && (
        <div className="inspection-note">
          Inspection limited to {compact ? 120 : 800} visible nodes and 24
          levels. Collapse branches to explore others. Raw copy and export
          retain the complete event.
        </div>
      )}
    </div>
  );
}

export function MessageContent({
  row,
  highlight,
  compact = false,
  onAddColumn,
  onAddFilter,
  onCopyValue,
  controls = false,
  lineWrap,
  renderActions,
  onDeserialize,
  deserializedPaths,
  decodedLabels,
  autoExpandMatches = false,
  expandRequest,
  expansionState,
  onExpansionApplied,
  defaultExpanded,
  onToggleAll,
}: {
  row: EventRow;
  highlight: string;
  compact?: boolean;
  onAddColumn?: (path: string) => void;
  onAddFilter?: (path: string, value: JsonValue) => void;
  onCopyValue?: (text: string) => void;
  controls?: boolean;
  lineWrap?: { enabled: boolean; onToggle: () => void };
  renderActions?: (actions: ReactNode) => ReactNode;
  onDeserialize?: (path: string, encoding?: FieldDecoding) => void;
  deserializedPaths?: ReadonlySet<string>;
  decodedLabels?: ReadonlyMap<string, string>;
  autoExpandMatches?: boolean;
  expandRequest?: number;
  expansionState?: JsonExpansionState;
  onExpansionApplied?(): void;
  defaultExpanded?: boolean;
  onToggleAll?(expanded: boolean): void;
}) {
  if (row.parsed.kind === "json")
    return (
      <JsonTree
        expansionKey={row.event.id}
        value={row.parsed.value!}
        highlight={highlight}
        compact={compact}
        onCopyValue={onCopyValue}
        onAddColumn={onAddColumn}
        onAddFilter={onAddFilter}
        controls={controls}
        lineWrap={lineWrap}
        renderActions={renderActions}
        onDeserialize={onDeserialize}
        deserializedPaths={deserializedPaths}
        decodedLabels={decodedLabels}
        autoExpandMatches={autoExpandMatches}
        expandRequest={expandRequest}
        expansionState={expansionState}
        onExpansionApplied={onExpansionApplied}
        defaultExpanded={defaultExpanded}
        onToggleAll={onToggleAll}
      />
    );
  const displayLimit = compact ? 6000 : 200_000;
  const actions = (lineWrap || (controls && onToggleAll)) && (
    <div className="structured-actions">
      {lineWrap && <MessageWrapControl {...lineWrap} />}
      {controls && onToggleAll && (
        <MessageFoldControl
          expanded={defaultExpanded ?? false}
          onToggle={() => onToggleAll(!(defaultExpanded ?? false))}
        />
      )}
    </div>
  );
  return (
    <div className="raw-content">
      {renderActions ? renderActions(actions) : actions}
      {row.parsed.reason && (
        <div className="inspection-note">{row.parsed.reason}</div>
      )}
      <pre>
        <HighlightText
          text={row.event.message.slice(0, displayLimit)}
          needle={highlight}
        />
      </pre>
      {row.event.message.length > displayLimit && (
        <div className="inspection-note">
          Preview shows the first {displayLimit.toLocaleString()} characters.
          Copy raw or export for the complete message.
        </div>
      )}
    </div>
  );
}
