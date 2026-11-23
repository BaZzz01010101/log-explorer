import { useEffect, useRef } from "react";
import { ActionIcon, Button, Group, Text, TextInput } from "@mantine/core";
import { IconPlus, IconTrash } from "@tabler/icons-react";
import type { Preferences } from "../../shared/contracts";
import {
  MESSAGE_RULE_LIMIT,
  SOURCE_NAME_FORMAT_LIMIT,
  SOURCE_NAME_PLACEHOLDERS,
  formatSourceName,
  messagePathPointer,
  messageRuleSourceError,
  type MessageRule,
} from "../../shared/display-rules";
import { FilterMatchButtons } from "./FilterMatchButtons";
import { SettingLabel } from "./SettingLabel";

const PROVIDER_NAMES = { aws: "AWS", gcp: "Google Cloud" } as const;

const EXAMPLE_VALUES = {
  aws: {
    NAME: "lambda/orders-api",
    FULL_NAME: "/aws/lambda/orders-api",
    STREAM: "8f2c1a",
    FULL_STREAM: "2026/11/19/[$LATEST]8f2c1a9b",
    REGION: "eu-west-1",
    PROFILE: "prod",
  },
  gcp: {
    NAME: "checkout",
    FULL_NAME: "europe-west1/dev/payments/checkout",
    CLUSTER: "dev",
    NAMESPACE: "payments",
    REGION: "europe-west1",
    PROJECT: "acme-prod",
  },
} as const;

const EXAMPLES: ["aws" | "gcp", string][] = [
  ["aws", "{NAME} · {REGION}"],
  ["aws", "{FULL_NAME} : {PROFILE}/{REGION}"],
  ["gcp", "{NAME} · {CLUSTER} · {NAMESPACE} / {REGION}"],
  ["gcp", "{FULL_NAME} : {CLUSTER}"],
];

const SOURCE_NAMES_HELP = (
  <div className="display-settings-help">
    <div>
      Choose how sources are named in the view's source badges and in the Source
      column. Each provider has its own format; an empty format keeps the
      automatic name. Hovering a badge always shows the full source details.
    </div>
    <div>
      Write any text and put placeholders in braces. A placeholder without a
      value is left out together with the separator before it.
    </div>
    <div className="display-settings-help-title">Examples</div>
    <ul>
      {EXAMPLES.map(([provider, format]) => (
        <li key={format}>
          <code>{format}</code>
          <br />→ {formatSourceName(format, EXAMPLE_VALUES[provider])}
        </li>
      ))}
    </ul>
    <div>
      The placeholders each provider supports are listed in the help of its
      field.
    </div>
  </div>
);

function PlaceholderHelp({ provider }: { provider: "aws" | "gcp" }) {
  return (
    <div className="display-settings-help">
      <ul className="display-settings-placeholders">
        {SOURCE_NAME_PLACEHOLDERS[provider].map(([name, description]) => (
          <li key={name}>
            <code>{`{${name}}`}</code> {description}
          </li>
        ))}
      </ul>
    </div>
  );
}

const MESSAGE_HELP = (
  <div className="display-settings-help">
    <div>
      The Message column shows the first non-empty value found by these rules,
      from top to bottom. When none matches, it falls back to the msg or message
      field, then to the raw message.
    </div>
    <div className="display-settings-help-title">Source</div>
    <div>
      Filters the log group, container or function name like the local filter:
      text found anywhere in the name (<code>*</code> matches any text), or a
      regular expression with the regex button. Case is ignored unless Aa is on.
      Empty matches every source.
    </div>
    <div className="display-settings-help-title">Path</div>
    <ul>
      <li>
        <code>$.message.summary</code>
      </li>
      <li>
        <code>$.events[0].text</code>
      </li>
      <li>
        <code>$['field with spaces']</code>
      </li>
    </ul>
    <div>Tip: in the inspector, use a field's ⋯ menu → Set as message.</div>
  </div>
);

function FormatInput({
  provider,
  value,
  onChange,
}: {
  provider: "aws" | "gcp";
  value: string;
  onChange(value: string): void;
}) {
  const label = `${PROVIDER_NAMES[provider]} source name`;
  const preview = value.trim()
    ? formatSourceName(value, EXAMPLE_VALUES[provider])
    : "";
  return (
    <TextInput
      aria-label={label}
      label={
        <SettingLabel
          label={label}
          help={<PlaceholderHelp provider={provider} />}
        />
      }
      placeholder="Automatic"
      maxLength={SOURCE_NAME_FORMAT_LIMIT}
      spellCheck={false}
      classNames={{ input: "code-input" }}
      value={value}
      description={preview ? `Example: ${preview}` : undefined}
      onChange={(event) => onChange(event.currentTarget.value)}
    />
  );
}

export function DisplaySettingsEditor({
  value,
  onChange,
  focusRule,
  focusKey,
}: {
  value: Preferences;
  onChange(patch: Partial<Preferences>): void;
  /** A rule to scroll to and focus, e.g. after Set as message. */
  focusRule?: string | null;
  /** Changes on every request, so the same rule can be focused again. */
  focusKey?: number;
}) {
  const formats = value.sourceNameFormats ?? {};
  const rules = value.messageRules ?? [];
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!focusRule) return;
    const frame = requestAnimationFrame(() => {
      const input = root.current?.querySelector<HTMLInputElement>(
        `[data-message-rule="${CSS.escape(focusRule)}"] input[data-field="path"]`,
      );
      input?.scrollIntoView({ block: "nearest" });
      input?.focus();
      input?.select();
    });
    return () => cancelAnimationFrame(frame);
  }, [focusRule, focusKey, rules.some((rule) => rule.id === focusRule)]);
  const setRule = (id: string, patch: Partial<MessageRule>) =>
    onChange({
      messageRules: rules.map((rule) =>
        rule.id === id ? { ...rule, ...patch } : rule,
      ),
    });
  return (
    <div ref={root} className="settings-form-content settings-preferences-form">
      <section
        className="settings-preference-section"
        aria-label="Source name formats"
      >
        <h3 className="settings-preference-heading">
          <SettingLabel label="Source names" help={SOURCE_NAMES_HELP} />
        </h3>
        <div className="settings-preference-options">
          {(["aws", "gcp"] as const).map((provider) => (
            <div className="settings-preference-option" key={provider}>
              <FormatInput
                provider={provider}
                value={formats[provider] ?? ""}
                onChange={(format) =>
                  onChange({
                    sourceNameFormats: { ...formats, [provider]: format },
                  })
                }
              />
            </div>
          ))}
        </div>
      </section>
      <section
        className="settings-preference-section"
        aria-label="Message column rules"
      >
        <h3 className="settings-preference-heading">
          <SettingLabel label="Message column" help={MESSAGE_HELP} />
        </h3>
        <div className="display-message-rules">
          {rules.length === 0 && (
            <Text size="sm" c="dimmed">
              No rules: the Message column uses msg, then message.
            </Text>
          )}
          {rules.map((rule, index) => {
            const invalidPath =
              rule.path.trim() !== "" && !messagePathPointer(rule.path);
            const sourceError = messageRuleSourceError(rule);
            const scope = `rule ${index + 1} source`;
            return (
              <div
                key={rule.id}
                className="display-message-rule"
                data-message-rule={rule.id}
              >
                <TextInput
                  aria-label={`Rule ${index + 1} source`}
                  placeholder="All sources"
                  maxLength={512}
                  spellCheck={false}
                  classNames={{
                    input: rule.regex ? "code-input" : undefined,
                  }}
                  value={rule.source}
                  error={sourceError}
                  rightSection={
                    <Group gap={2} wrap="nowrap">
                      <FilterMatchButtons
                        scope={scope}
                        caseSensitive={rule.caseSensitive === true}
                        regex={rule.regex === true}
                        onCaseChange={() =>
                          setRule(rule.id, {
                            caseSensitive: !rule.caseSensitive,
                          })
                        }
                        onRegexChange={() =>
                          setRule(rule.id, { regex: !rule.regex })
                        }
                      />
                    </Group>
                  }
                  rightSectionWidth={54}
                  rightSectionPointerEvents="all"
                  onChange={(event) =>
                    setRule(rule.id, { source: event.currentTarget.value })
                  }
                />
                <TextInput
                  aria-label={`Rule ${index + 1} path`}
                  data-field="path"
                  placeholder="$.message.summary"
                  maxLength={512}
                  spellCheck={false}
                  classNames={{ input: "code-input" }}
                  value={rule.path}
                  error={invalidPath ? "Use a path like $.message" : undefined}
                  onChange={(event) =>
                    setRule(rule.id, { path: event.currentTarget.value })
                  }
                />
                <ActionIcon
                  variant="subtle"
                  color="red"
                  aria-label={`Delete rule ${index + 1}`}
                  data-tooltip="Delete rule"
                  onClick={() =>
                    onChange({
                      messageRules: rules.filter((item) => item !== rule),
                    })
                  }
                >
                  <IconTrash size={14} />
                </ActionIcon>
              </div>
            );
          })}
          <div>
            <Button
              size="xs"
              variant="light"
              leftSection={<IconPlus size={14} />}
              disabled={rules.length >= MESSAGE_RULE_LIMIT}
              onClick={() =>
                onChange({
                  messageRules: [
                    ...rules,
                    {
                      id: `message-${crypto.randomUUID()}`,
                      source: "",
                      path: "",
                    },
                  ],
                })
              }
            >
              Add rule
            </Button>
          </div>
        </div>
      </section>
    </div>
  );
}
