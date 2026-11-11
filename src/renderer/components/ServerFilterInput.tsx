import { useId, useRef, useState } from "react";
import { TextInput } from "@mantine/core";
import { IconX } from "@tabler/icons-react";
import { clearEditControl } from "../scoped-edit-history";
import { Menu } from "./AppMenu";
import {
  compileServerFilter,
  filterCompletions,
  filterTokens,
  serverFilterMode,
  type ServerFilterMode,
} from "../../shared/server-filter";
import "./server-filter.css";
import { compileGcpServerFilter, gcpServerFilterMode } from "../../shared/gcp-server-filter";

const labels = { plain: "Plain Text", pattern: "AWS Patterns", auto: "Auto" };

export function ServerFilterInput({
  value,
  mode = "pattern",
  historyKey,
  onChange,
  onModeChange,
  onRun,
  onClear,
  provider = "aws",
}: {
  value: string;
  mode?: ServerFilterMode;
  historyKey?: string;
  onChange(value: string): void;
  onModeChange(mode: ServerFilterMode): void;
  onRun(): void;
  onClear(): void;
  provider?: "aws" | "gcp";
}) {
  const input = useRef<HTMLInputElement>(null),
    paint = useRef<HTMLPreElement>(null);
  const suggestionId = useId();
  const [caret, setCaret] = useState(0),
    [focused, setFocused] = useState(false),
    [selected, setSelected] = useState(0),
    [dismissed, setDismissed] = useState(false);
  const effective = provider === "gcp" ? gcpServerFilterMode(value, mode) : serverFilterMode(value, mode);
  const providerLabels = provider === "gcp" ? { ...labels, pattern: "Cloud Logging query" } : labels;
  const suggestions =
    provider === "aws" && focused && !dismissed && effective === "pattern"
      ? filterCompletions(value, caret)
      : [];
  const choice = Math.min(selected, Math.max(0, suggestions.length - 1));
  const accept = (index: number) => {
    const item = suggestions[index];
    if (!item) return;
    const replacement = item.value + " ";
    onChange(value.slice(0, item.start) + replacement + value.slice(item.end));
    setDismissed(true);
    requestAnimationFrame(() => {
      const next = item.start + replacement.length;
      input.current?.focus();
      input.current?.setSelectionRange(next, next);
      setCaret(next);
    });
  };
  return (
    <div
      className={`server-filter-control ${provider === "aws" && effective === "pattern" ? "server-filter-pattern" : ""}`}
    >
      <div className="server-filter-text">
        {provider === "aws" && effective === "pattern" && (
          <pre ref={paint} className="server-filter-paint" aria-hidden="true">
            {filterTokens(value).map((token, index) => (
              <span key={index} className={`aws-token-${token.kind}`}>
                {token.text}
              </span>
            ))}
          </pre>
        )}
        <TextInput
          ref={input}
          aria-label={provider === "gcp" ? "Google Cloud log filter" : "CloudWatch filter pattern"}
          data-edit-history-key={historyKey}
          role="combobox"
          aria-haspopup="listbox"
          aria-autocomplete="list"
          aria-activedescendant={
            suggestions.length ? `${suggestionId}-${choice}` : undefined
          }
          aria-expanded={suggestions.length > 0}
          aria-controls={suggestions.length ? suggestionId : undefined}
          classNames={{ input: "code-input server-filter-input" }}
          value={value}
          onChange={(event) => {
            onChange(event.currentTarget.value);
            setCaret(event.currentTarget.selectionStart ?? 0);
            setSelected(0);
            setDismissed(false);
          }}
          onSelect={(event) =>
            setCaret(event.currentTarget.selectionStart ?? 0)
          }
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          onScroll={(event) => {
            if (paint.current)
              paint.current.scrollLeft = event.currentTarget.scrollLeft;
          }}
          onKeyDown={(event) => {
            if (event.nativeEvent.isComposing) return;
            if (event.key === "Enter") {
              event.preventDefault();
              event.stopPropagation();
              setDismissed(true);
              onRun();
            } else if (
              suggestions.length &&
              (event.key === "ArrowDown" || event.key === "ArrowUp")
            ) {
              event.preventDefault();
              setSelected(
                (choice +
                  (event.key === "ArrowDown" ? 1 : -1) +
                  suggestions.length) %
                  suggestions.length,
              );
            } else if (
              suggestions.length &&
              event.key === "Tab" &&
              !event.ctrlKey &&
              !event.metaKey &&
              !event.altKey &&
              !event.shiftKey
            ) {
              event.preventDefault();
              accept(choice);
            } else if (event.key === "Escape") {
              event.stopPropagation();
              setDismissed(true);
            }
          }}
          placeholder={
            provider === "gcp" ? (effective === "pattern" ? 'severity>=ERROR or jsonPayload.field="value"' : "Find text in Google Cloud logs…") : effective === "pattern"
              ? '{ $.level = "ERROR" } or %error|failed%'
              : "Find text in AWS logs…"
          }
          size="xs"
          leftSection={
            <Menu>
              <Menu.Target>
                <button
                  type="button"
                  className="server-filter-mode"
                  aria-label={`${provider === "gcp" ? "GCP" : "AWS"} filter mode: ${providerLabels[mode]}`}
                  data-tooltip={`${providerLabels[mode]}${mode === "auto" ? ` → ${providerLabels[effective]}` : ""}. Enter runs the query.\nQuery: ${(provider === "gcp" ? compileGcpServerFilter(value, mode) : compileServerFilter(value, mode)) || "(all events)"}`}
                >
                  {provider === "gcp" ? "GCP" : "AWS"} ·{" "}
                  {mode === "auto"
                    ? `A:${effective === "plain" ? "TXT" : "PAT"}`
                    : effective === "plain"
                      ? "Text"
                      : "Patt"}{" "}
                  ▾
                </button>
              </Menu.Target>
              <Menu.Dropdown>
                <Menu.Label>{provider === "gcp" ? "GCP" : "AWS"} filter mode</Menu.Label>
                {(Object.keys(labels) as ServerFilterMode[]).map((item) => (
                  <Menu.Item
                    key={item}
                    onClick={() => onModeChange(item)}
                    leftSection={item === mode ? "✓" : undefined}
                  >
                    {providerLabels[item]}
                  </Menu.Item>
                ))}
              </Menu.Dropdown>
            </Menu>
          }
          leftSectionWidth={112}
          leftSectionPointerEvents="auto"
          rightSection={
            value ? (
              <button
                type="button"
                className="server-filter-clear"
                aria-label="Clear server filter"
                data-tooltip="Clear server filter and run query"
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => {
                  clearEditControl(input.current);
                  setDismissed(true);
                  setCaret(0);
                  setSelected(0);
                  onClear();
                  input.current?.focus();
                }}
              >
                <IconX size={14} />
              </button>
            ) : undefined
          }
          rightSectionWidth={28}
          rightSectionPointerEvents="auto"
        />
      </div>
      {suggestions.length > 0 && (
        <div
          role="listbox"
          aria-label="AWS pattern suggestions"
          className="server-filter-suggestions"
          id={suggestionId}
        >
          {suggestions.map((item, index) => (
            <button
              key={item.value}
              type="button"
              role="option"
              id={`${suggestionId}-${index}`}
              aria-selected={index === choice}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => accept(index)}
            >
              <code>{item.value}</code>
              <span>{item.description}</span>
              <small>Tab</small>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
