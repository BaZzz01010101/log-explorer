import { memo, useContext, useMemo, useState } from "react";
import { EventHighlightContext } from "../useEventHighlights";
import { textHighlightKey } from "../highlight-engine";
import {
  IconChevronDown,
  IconChevronRight,
  IconColumns3,
  IconFilter,
  IconDots,
  IconBraces,
  IconCopy,
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
  const spans = profile?.text[textHighlightKey(path, text)];
  if (spans?.length) {
    const parts: React.ReactNode[] = [];
    let cursor = 0;
    for (const span of spans) {
      parts.push(
        text.slice(cursor, span.start),
        <mark
          className="profile-highlight-text"
          key={span.start}
          style={{
            color: span.colors.foreground ?? "inherit",
            backgroundColor: span.colors.background ?? "transparent",
          }}
        >
          {text.slice(span.start, span.end)}
        </mark>,
      );
      cursor = span.end;
    }
    parts.push(text.slice(cursor));
    return <>{parts}</>;
  }
  if (!needle || needle.length > 200) return <>{text}</>;
  const parts: React.ReactNode[] = [];
  const lower = text.toLowerCase();
  let cursor = 0;
  for (let count = 0; count < 30; count++) {
    const index = lower.indexOf(needle.toLowerCase(), cursor);
    if (index === -1) break;
    parts.push(
      text.slice(cursor, index),
      <mark key={index}>{text.slice(index, index + needle.length)}</mark>,
    );
    cursor = index + needle.length;
  }
  parts.push(text.slice(cursor));
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

export function JsonTree({
  value,
  highlight,
  compact = false,
  onAddColumn,
  onAddFilter,
  onCopyValue,
  controls = false,
  onDeserialize,
  deserializedPaths,
  decodedLabels,
}: {
  value: JsonValue;
  highlight: string;
  compact?: boolean;
  onAddColumn?: (path: string) => void;
  onAddFilter?: (path: string, value: JsonValue) => void;
  onCopyValue?: (text: string) => void;
  controls?: boolean;
  onDeserialize?: (path: string, encoding?: FieldDecoding) => void;
  deserializedPaths?: ReadonlySet<string>;
  decodedLabels?: ReadonlyMap<string, string>;
}) {
  const [expanded, setExpanded] = useState(() => new Set([""]));
  const model = useMemo(
    () => inspectionRows(value, expanded, { maxNodes: compact ? 120 : 800 }),
    [value, expanded, compact],
  );
  const toggle = (path: string) =>
    setExpanded((previous) => {
      const next = new Set(previous);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  const unfoldAll = () => {
    const paths = new Set([""]);
    for (let depth = 0; depth < 24; depth++) {
      const before = paths.size;
      for (const row of inspectionRows(value, paths, { maxNodes: 800 }).rows) {
        if (row.childCount > 0 && !row.depthLimited) paths.add(row.path);
      }
      if (paths.size === before) break;
    }
    setExpanded(paths);
  };
  return (
    <div className={`json-tree ${compact ? "json-tree-compact" : ""}`}>
      {controls && (
        <div className="structured-actions">
          <button
            type="button"
            aria-label="Fold structured object"
            onClick={() => setExpanded(new Set())}
          >
            Fold all
          </button>
          <button
            type="button"
            aria-label="Unfold structured object"
            onClick={unfoldAll}
          >
            Unfold all
          </button>
        </div>
      )}
      {model.rows.map((row) => {
        const container = row.value !== null && typeof row.value === "object";
        const array = Array.isArray(row.value);
        const type = row.value === null ? "null" : typeof row.value;
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
                onClick={() => toggle(row.path)}
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
            <span className="json-key" data-tooltip={row.path || "Root"}>
              <HighlightText
                text={row.label === "$" ? "$" : JSON.stringify(row.label)}
                needle={highlight}
              />
            </span>
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
  onDeserialize,
  deserializedPaths,
  decodedLabels,
}: {
  row: EventRow;
  highlight: string;
  compact?: boolean;
  onAddColumn?: (path: string) => void;
  onAddFilter?: (path: string, value: JsonValue) => void;
  onCopyValue?: (text: string) => void;
  controls?: boolean;
  onDeserialize?: (path: string, encoding?: FieldDecoding) => void;
  deserializedPaths?: ReadonlySet<string>;
  decodedLabels?: ReadonlyMap<string, string>;
}) {
  if (row.parsed.kind === "json")
    return (
      <JsonTree
        value={row.parsed.value!}
        highlight={highlight}
        compact={compact}
        onCopyValue={onCopyValue}
        onAddColumn={onAddColumn}
        onAddFilter={onAddFilter}
        controls={controls}
        onDeserialize={onDeserialize}
        deserializedPaths={deserializedPaths}
        decodedLabels={decodedLabels}
      />
    );
  const displayLimit = compact ? 6000 : 200_000;
  return (
    <div className="raw-content">
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
