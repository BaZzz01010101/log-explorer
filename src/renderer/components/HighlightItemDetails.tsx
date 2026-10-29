import {
  ActionIcon,
  ColorInput,
  Group,
  Select,
  Switch,
  TextInput,
} from "@mantine/core";
import { useEyeDropper } from "@mantine/hooks";
import { useState } from "react";
import type {
  HighlightColors,
  HighlightProfile,
  HighlightRule,
} from "../../shared/highlights";
import { regexError } from "../../shared/highlights";

export type ProfileDraft = Pick<
  HighlightProfile,
  "name" | "groupPattern" | "groupIgnoreCase"
>;
export type RuleDraft = Omit<HighlightRule, "id" | "enabled">;

function pointerError(path: string) {
  if (path && !path.startsWith("/")) return "Start a JSON Pointer with /.";
  if (/~(?![01])/.test(path))
    return "Escape ~ as ~0 and / as ~1 in JSON Pointer keys.";
}
export function profileDraftError(draft: ProfileDraft) {
  return regexError(draft.groupPattern);
}

export function ruleDraftError(draft: RuleDraft): string | undefined {
  if (regexError(draft.pattern)) return "Enter a valid match regex.";
  if (draft.scope === "structured" && pointerError(draft.path))
    return pointerError(draft.path);
  const palettes = draft.separateThemeColors
    ? [draft.lightColors ?? draft.colors, draft.darkColors ?? draft.colors]
    : [draft.colors];
  if (
    palettes.some((colors) =>
      Object.values(colors).some(
        (color) => color && !/^#[0-9a-f]{6}$/i.test(color),
      ),
    )
  )
    return "Enter a six-digit hex color or leave it empty.";
}

function Colors({
  value,
  onChange,
  label,
  readOnly,
}: {
  value: HighlightColors;
  onChange(value: HighlightColors): void;
  label: string;
  readOnly: boolean;
}) {
  const { supported: eyeDropperSupported } = useEyeDropper();
  const [openColor, setOpenColor] = useState<string>();
  return (
    <Group grow align="start" className="highlight-color-inputs">
      {(["foreground", "background"] as const).map((key) => (
        <ColorInput
          key={key}
          label={`${label} ${key}`}
          size="xs"
          format="hex"
          fixOnBlur={false}
          readOnly={readOnly}
          popoverProps={{
            opened: !readOnly && openColor === key,
            onDismiss: () => setOpenColor(undefined),
          }}
          onFocus={() => !readOnly && setOpenColor(key)}
          onClick={() => !readOnly && setOpenColor(key)}
          onBlur={() => setOpenColor(undefined)}
          onKeyDown={(event) => {
            if (event.key === "Escape" && openColor === key) {
              event.preventDefault();
              event.stopPropagation();
              setOpenColor(undefined);
            }
          }}
          // Mantine hides its eye dropper when readOnly; reserve the same icon.
          rightSection={
            readOnly && eyeDropperSupported ? (
              <ActionIcon
                variant="subtle"
                color="gray"
                size={22}
                tabIndex={-1}
                aria-hidden="true"
              >
                <svg
                  width={14}
                  height={14}
                  viewBox="0 0 24 24"
                  strokeWidth={1.5}
                  stroke="currentColor"
                  fill="none"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M12 12m-9 0a9 9 0 1 0 18 0a9 9 0 1 0 -18 0" />
                  <path d="M12 3v4M12 21v-3M3 12h4M21 12h-3M12 12v.01" />
                </svg>
              </ActionIcon>
            ) : undefined
          }
          value={value[key] ?? ""}
          placeholder="Inherit"
          error={
            value[key] && !/^#[0-9a-f]{6}$/i.test(value[key]!)
              ? "Use a six-digit hex color"
              : undefined
          }
          onChange={(color) => {
            if (!readOnly) onChange({ ...value, [key]: color || undefined });
          }}
          swatches={[
            "#ffffff",
            "#111827",
            "#fef08a",
            "#713f12",
            "#fecaca",
            "#7f1d1d",
            "#bbf7d0",
            "#14532d",
            "#bfdbfe",
            "#1e3a8a",
          ]}
        />
      ))}
    </Group>
  );
}

export function ProfileFields({
  draft,
  readOnly = false,
  onChange,
}: {
  draft: ProfileDraft;
  readOnly?: boolean;
  onChange(change: Partial<ProfileDraft>): void;
}) {
  const change = (value: Partial<ProfileDraft>) => {
    if (!readOnly) onChange(value);
  };
  return (
    <div className="highlight-detail-fields">
      <TextInput
        size="xs"
        label="Profile name"
        data-highlight-primary
        readOnly={readOnly}
        maxLength={120}
        value={draft.name}
        onChange={(event) => change({ name: event.currentTarget.value })}
      />
      <TextInput
        size="xs"
        label="Log group regex"
        spellCheck={false}
        autoCorrect="off"
        autoCapitalize="off"
        readOnly={readOnly}
        maxLength={500}
        value={draft.groupPattern}
        placeholder="All log groups"
        error={regexError(draft.groupPattern)}
        onChange={(event) =>
          change({ groupPattern: event.currentTarget.value })
        }
      />
      <Switch
        size="xs"
        label="Ignore case in log group pattern"
        readOnly={readOnly}
        aria-readonly={readOnly}
        onClick={(event) => {
          if (readOnly) event.preventDefault();
        }}
        checked={draft.groupIgnoreCase}
        onChange={(event) =>
          change({ groupIgnoreCase: event.currentTarget.checked })
        }
      />
    </div>
  );
}

export function RuleFields({
  draft,
  readOnly = false,
  onChange,
}: {
  draft: RuleDraft;
  readOnly?: boolean;
  onChange(change: Partial<RuleDraft>): void;
}) {
  const change = (value: Partial<RuleDraft>) => {
    if (!readOnly) onChange(value);
  };
  return (
    <div className="highlight-detail-fields">
      <div className="highlight-detail-columns">
        <Select
          size="xs"
          label="Search in"
          readOnly={readOnly}
          dropdownOpened={readOnly ? false : undefined}
          onKeyDown={(event) => {
            if (
              event.key === "Escape" &&
              event.currentTarget.getAttribute("aria-expanded") === "true"
            )
              event.stopPropagation();
          }}
          value={draft.scope}
          data={[
            { value: "text", label: "Entire message" },
            { value: "structured", label: "Structured property" },
          ]}
          onChange={(scope) =>
            scope && change({ scope: scope as HighlightRule["scope"] })
          }
        />
        <Select
          size="xs"
          label="Highlight"
          readOnly={readOnly}
          dropdownOpened={readOnly ? false : undefined}
          onKeyDown={(event) => {
            if (
              event.key === "Escape" &&
              event.currentTarget.getAttribute("aria-expanded") === "true"
            )
              event.stopPropagation();
          }}
          value={draft.target}
          data={[
            { value: "row", label: "Entire event row" },
            { value: "text", label: "Matching text" },
          ]}
          onChange={(target) =>
            target && change({ target: target as HighlightRule["target"] })
          }
        />
      </div>
      {draft.scope === "structured" && (
        <TextInput
          size="xs"
          label="JSON Pointer path"
          spellCheck={false}
          autoCorrect="off"
          autoCapitalize="off"
          readOnly={readOnly}
          placeholder="/request/status"
          description="Empty = root. Escape / as ~1 and ~ as ~0."
          maxLength={512}
          value={draft.path}
          error={pointerError(draft.path)}
          onChange={(event) => change({ path: event.currentTarget.value })}
        />
      )}
      <TextInput
        size="xs"
        label="Match regex"
        spellCheck={false}
        autoCorrect="off"
        autoCapitalize="off"
        data-highlight-primary
        readOnly={readOnly}
        maxLength={500}
        placeholder="ERROR|failed|timeout"
        value={draft.pattern}
        error={regexError(draft.pattern)}
        onChange={(event) => change({ pattern: event.currentTarget.value })}
      />
      <Switch
        size="xs"
        label="Ignore case"
        readOnly={readOnly}
        aria-readonly={readOnly}
        onClick={(event) => {
          if (readOnly) event.preventDefault();
        }}
        checked={draft.ignoreCase}
        onChange={(event) =>
          change({ ignoreCase: event.currentTarget.checked })
        }
      />
      <Switch
        size="xs"
        label="Separate light and dark colors"
        readOnly={readOnly}
        aria-readonly={readOnly}
        onClick={(event) => {
          if (readOnly) event.preventDefault();
        }}
        checked={draft.separateThemeColors}
        onChange={(event) =>
          change({
            separateThemeColors: event.currentTarget.checked,
            lightColors: draft.lightColors ?? {
              foreground: "#111827",
              background: "#fef08a",
            },
            darkColors: draft.darkColors ?? draft.colors,
          })
        }
      />
      {draft.separateThemeColors ? (
        <>
          <Colors
            label="Light"
            readOnly={readOnly}
            value={draft.lightColors ?? draft.colors}
            onChange={(lightColors) => change({ lightColors })}
          />
          <Colors
            label="Dark"
            readOnly={readOnly}
            value={draft.darkColors ?? draft.colors}
            onChange={(darkColors) => change({ darkColors })}
          />
        </>
      ) : (
        <Colors
          label="Shared"
          readOnly={readOnly}
          value={draft.colors}
          onChange={(colors) => change({ colors })}
        />
      )}
    </div>
  );
}

export function ColorSwatches({ rule }: { rule: HighlightRule }) {
  const colors = rule.separateThemeColors
    ? ([
        ["Light", rule.lightColors ?? rule.colors],
        ["Dark", rule.darkColors ?? rule.colors],
      ] as const)
    : ([["Shared", rule.colors]] as const);
  return (
    <div className="highlight-rule-colors">
      {colors.map(([label, value]) => (
        <span
          key={label}
          className="highlight-rule-color-pair"
          role="img"
          aria-label={`${label} foreground ${value.foreground || "inherited"}, background ${value.background || "inherited"}`}
          data-tooltip={`${label}: ${value.foreground || "inherit"} / ${value.background || "inherit"}`}
        >
          {rule.separateThemeColors && <small>{label[0]}</small>}
          <i style={{ backgroundColor: value.foreground }} />
          <i style={{ backgroundColor: value.background }} />
        </span>
      ))}
    </div>
  );
}
