import { useId, useRef, useState } from "react";
import { TextInput } from "@mantine/core";
import {
  IconX,
  IconLetterT,
  IconRegex,
  IconSparkles,
  IconCheck,
} from "@tabler/icons-react";
import { clearEditControl } from "../scoped-edit-history";
import { Menu } from "./AppMenu";
import {
  filterCompletions,
  filterTokens,
  resolveFilterSyntax,
  availableFilterModes,
  type FilterProvider,
  type ServerFilterMode,
} from "../../shared/server-filter";
import "./server-filter.css";

const labels = {
  plain: "Text",
  pattern: "Pattern",
  "aws-pattern": "AWS Pattern",
  "gcp-pattern": "GCP Pattern",
  unified: "Unified",
  auto: "Auto",
};
const modeIcons = {
  plain: IconLetterT,
  pattern: IconRegex,
  "aws-pattern": IconRegex,
  "gcp-pattern": IconRegex,
  unified: IconRegex,
  auto: IconSparkles,
};

export function ServerFilterInput({
  value,
  mode = "pattern",
  historyKey,
  onChange,
  onModeChange,
  onRun,
  onReturnToList,
  onClear,
  provider = "aws",
}: {
  value: string;
  mode?: ServerFilterMode;
  historyKey?: string;
  onChange(value: string): void;
  onModeChange(mode: ServerFilterMode): void;
  onRun(): void;
  onReturnToList?(): void;
  onClear(): void;
  provider?: FilterProvider;
}) {
  const input = useRef<HTMLInputElement>(null),
    paint = useRef<HTMLPreElement>(null);
  const suggestionId = useId();
  const [caret, setCaret] = useState(0),
    [focused, setFocused] = useState(false),
    [selected, setSelected] = useState(0),
    [dismissed, setDismissed] = useState(false);
  const syntax = resolveFilterSyntax(
    value,
    mode,
    provider === "gcp" ? "gcp" : "aws",
  );
  const effective = syntax === "plain" ? "plain" : "pattern";
  const providerLabels = labels;
  const suggestions =
    syntax === "aws" && focused && !dismissed
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
      className={`server-filter-control ${syntax === "aws" ? "server-filter-pattern" : ""}`}
    >
      <div className="server-filter-text">
        {syntax === "aws" && (
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
          aria-label={
            provider === "gcp"
              ? "Google Cloud log filter"
              : "CloudWatch filter pattern"
          }
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
              if (!event.ctrlKey && !event.metaKey && !event.altKey && !event.shiftKey) onReturnToList?.();
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
              event.preventDefault();
              event.stopPropagation();
              setDismissed(true);
              onReturnToList?.();
            }
          }}
          placeholder={
            syntax === "unified"
              ? "$.count > 10 AND $.seller IS NULL"
              : provider === "gcp"
                ? effective === "pattern"
                  ? 'severity>=ERROR or jsonPayload.field="value"'
                  : "Find text in logs…"
                : effective === "pattern"
                  ? '{ $.level = "ERROR" } or %error|failed%'
                  : "Find text in logs…"
          }
          size="xs"
          leftSection={
            <Menu>
              <Menu.Target>
                <button
                  type="button"
                  className="server-filter-mode"
                  aria-label={`Filter mode: ${providerLabels[mode]}`}
                  data-tooltip={`${providerLabels[mode]}${mode === "auto" ? ` → ${syntax === "plain" ? "Text" : syntax === "aws" ? "AWS Pattern" : syntax === "gcp" ? "GCP Pattern" : "Unified"}` : ""}. Enter runs the query.${syntax === "unified" ? "\nExample: $.count > 10 AND $.seller IS NULL" : ""}`}
                >
                  {mode === "auto"
                    ? `A:${syntax === "plain" ? "TXT" : syntax === "aws" ? "AWS-PAT" : syntax === "gcp" ? "GCP-PAT" : "UNI"}`
                    : syntax === "plain"
                      ? "TXT"
                      : syntax === "aws"
                        ? "AWS-PAT"
                        : syntax === "gcp"
                          ? "GCP-PAT"
                          : "UNI"}{" "}
                  ▾
                </button>
              </Menu.Target>
              <Menu.Dropdown>
                <Menu.Label>Filter mode</Menu.Label>
                {availableFilterModes(provider).map((item) => (
                  <Menu.Item
                    key={item}
                    onClick={() => onModeChange(item)}
                    leftSection={(() => {
                      const Icon = modeIcons[item];
                      return <Icon size={14} />;
                    })()}
                    rightSection={
                      item === mode ||
                      (mode === "pattern" &&
                        item ===
                          (provider === "gcp"
                            ? "gcp-pattern"
                            : "aws-pattern")) ? (
                        <IconCheck size={14} />
                      ) : undefined
                    }
                  >
                    {providerLabels[item]}
                  </Menu.Item>
                ))}
              </Menu.Dropdown>
            </Menu>
          }
          leftSectionWidth={84}
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
