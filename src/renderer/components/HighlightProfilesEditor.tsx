import { useState } from "react";
import {
  ActionIcon,
  Button,
  ColorInput,
  Group,
  Paper,
  Select,
  Stack,
  Switch,
  Text,
  Textarea,
  TextInput,
} from "@mantine/core";
import {
  IconArrowDown,
  IconArrowUp,
  IconPlus,
  IconTrash,
} from "@tabler/icons-react";
import {
  regexError,
  type HighlightColors,
  type HighlightProfile,
  type HighlightRule,
} from "../../shared/highlights";
import type { Preferences } from "../../shared/contracts";
import {
  useEventHighlights,
  EventHighlightContext,
} from "../useEventHighlights";
import { MessageContent } from "./EventMessage";
import { parseLogMessage } from "../../shared/log-data";

const newRule = (): HighlightRule => ({
  id: crypto.randomUUID(),
  enabled: true,
  scope: "text",
  path: "",
  pattern: "",
  ignoreCase: false,
  target: "row",
  colors: { background: "#713f12", foreground: "#ffffff" },
  separateThemeColors: false,
});
function Colors({
  value,
  onChange,
  label,
}: {
  value: HighlightColors;
  onChange(value: HighlightColors): void;
  label: string;
}) {
  const [draft, setDraft] = useState<
    Partial<Record<keyof HighlightColors, string>>
  >({});
  return (
    <Group grow align="start">
      {(["foreground", "background"] as const).map((key) => (
        <ColorInput
          key={key}
          label={`${label} ${key}`}
          size="xs"
          format="hex"
          fixOnBlur={false}
          value={draft[key] ?? value[key] ?? ""}
          placeholder="Inherit"
          onChange={(color) => {
            setDraft((previous) => ({ ...previous, [key]: color }));
            if (!color || /^#[0-9a-f]{6}$/i.test(color))
              onChange({ ...value, [key]: color || undefined });
          }}
          onBlur={() =>
            setDraft((previous) => ({ ...previous, [key]: undefined }))
          }
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
function Preview({
  profile,
  preferences,
}: {
  profile: HighlightProfile;
  preferences: Preferences;
}) {
  const [message, setMessage] = useState("ERROR payment failed");
  const [group, setGroup] = useState("/aws/lambda/orders-api");
  const result = useEventHighlights(
    [
      {
        id: "preview",
        timestamp: 0,
        logGroup: group,
        logStream: "preview",
        message,
      },
    ],
    { ...preferences, highlightProfiles: [profile] },
    [],
  );
  const match = result.results.get("preview");
  return (
    <Stack gap="xs">
      <Text fw={600} size="sm">
        Try this profile
      </Text>
      <TextInput
        size="xs"
        label="Preview log group"
        value={group}
        onChange={(event) => setGroup(event.currentTarget.value)}
      />
      <Textarea
        size="xs"
        label="Preview event"
        value={message}
        maxLength={20000}
        onChange={(event) => setMessage(event.currentTarget.value)}
      />
      <EventHighlightContext.Provider value={match}>
        <div
          aria-label="Highlight preview"
          style={{
            margin: 0,
            padding: 12,
            borderRadius: 4,
            whiteSpace: "pre-wrap",
            color: match?.row.foreground,
            backgroundColor: match?.row.background,
          }}
        >
          <MessageContent
            row={{
              event: {
                id: "preview",
                timestamp: 0,
                logGroup: group,
                logStream: "preview",
                message,
              },
              parsed: parseLogMessage(message),
              level: "unknown",
            }}
            highlight=""
            compact
          />
        </div>
      </EventHighlightContext.Provider>
      {result.error && (
        <Text size="xs" c="orange">
          {result.error}
        </Text>
      )}
    </Stack>
  );
}
export function HighlightProfilesEditor({
  preferences,
  onChange,
}: {
  preferences: Preferences;
  onChange(profiles: HighlightProfile[]): void;
}) {
  const profiles = preferences.highlightProfiles ?? [];
  const [selected, setSelected] = useState(profiles[0]?.id);
  const profile =
    profiles.find((profile) => profile.id === selected) ?? profiles[0];
  const patch = (change: Partial<HighlightProfile>) =>
    profile &&
    onChange(
      profiles.map((item) =>
        item.id === profile.id ? { ...item, ...change } : item,
      ),
    );
  const patchRule = (id: string, change: Partial<HighlightRule>) =>
    profile &&
    patch({
      rules: profile.rules.map((rule) =>
        rule.id === id ? { ...rule, ...change } : rule,
      ),
    });
  const reorder = (id: string, direction: number) => {
    if (!profile) return;
    const rules = [...profile.rules],
      index = rules.findIndex((rule) => rule.id === id),
      target = index + direction;
    if (target < 0 || target >= rules.length) return;
    rules.splice(target, 0, rules.splice(index, 1)[0]);
    patch({ rules });
  };
  return (
    <Stack gap="md">
      <Text size="sm" c="dimmed">
        Profiles match each event's log group. An empty group pattern applies to
        all events. Rules run in order; the first matching colors and text spans
        take priority.
      </Text>
      <Group align="end">
        <Select
          style={{ flex: 1 }}
          label="Highlight profile"
          placeholder="No profiles"
          value={profile?.id ?? null}
          data={profiles.map((item) => ({
            value: item.id,
            label:
              (item.name || "Untitled profile") +
              (item.enabled ? "" : " (disabled)"),
          }))}
          onChange={(value) => value && setSelected(value)}
        />
        <Button
          size="xs"
          disabled={profiles.length >= 20}
          leftSection={<IconPlus size={14} />}
          onClick={() => {
            const created: HighlightProfile = {
              id: crypto.randomUUID(),
              name: "New profile",
              enabled: true,
              groupPattern: "",
              groupIgnoreCase: false,
              rules: [newRule()],
            };
            onChange([...profiles, created]);
            setSelected(created.id);
          }}
        >
          Add profile
        </Button>
      </Group>
      {profile && (
        <>
          <Group align="end">
            <TextInput
              style={{ flex: 1 }}
              label="Profile name"
              maxLength={120}
              value={profile.name}
              onChange={(event) => patch({ name: event.currentTarget.value })}
            />
            <Switch
              label="Profile enabled"
              checked={profile.enabled}
              onChange={(event) =>
                patch({ enabled: event.currentTarget.checked })
              }
            />
            <ActionIcon
              variant="subtle"
              aria-label="Move profile up"
              disabled={profiles.indexOf(profile) === 0}
              onClick={() => {
                const next = [...profiles],
                  index = next.indexOf(profile);
                next.splice(index - 1, 0, next.splice(index, 1)[0]);
                onChange(next);
              }}
            >
              <IconArrowUp size={14} />
            </ActionIcon>
            <ActionIcon
              variant="subtle"
              aria-label="Move profile down"
              disabled={profiles.indexOf(profile) === profiles.length - 1}
              onClick={() => {
                const next = [...profiles],
                  index = next.indexOf(profile);
                next.splice(index + 1, 0, next.splice(index, 1)[0]);
                onChange(next);
              }}
            >
              <IconArrowDown size={14} />
            </ActionIcon>
            <ActionIcon
              color="red"
              variant="subtle"
              aria-label="Delete profile"
              onClick={() =>
                onChange(profiles.filter((item) => item.id !== profile.id))
              }
            >
              <IconTrash size={16} />
            </ActionIcon>
          </Group>
          <TextInput
            label="Log group regex"
            placeholder="All log groups"
            description="For example: ^/aws/lambda/.*-prod$"
            maxLength={500}
            value={profile.groupPattern}
            error={regexError(profile.groupPattern)}
            onChange={(event) =>
              patch({ groupPattern: event.currentTarget.value })
            }
          />
          <Switch
            size="xs"
            label="Ignore case in log group pattern"
            checked={profile.groupIgnoreCase}
            onChange={(event) =>
              patch({ groupIgnoreCase: event.currentTarget.checked })
            }
          />
          {profile.rules.map((rule, index) => (
            <Paper withBorder p="sm" key={rule.id} data-highlight-rule={index}>
              <Stack gap="xs">
                <Group justify="space-between">
                  <Switch
                    label={`Rule ${index + 1} enabled`}
                    checked={rule.enabled}
                    onChange={(event) =>
                      patchRule(rule.id, {
                        enabled: event.currentTarget.checked,
                      })
                    }
                  />
                  <Group gap={3}>
                    <ActionIcon
                      variant="subtle"
                      aria-label={`Move rule ${index + 1} up`}
                      disabled={index === 0}
                      onClick={() => reorder(rule.id, -1)}
                    >
                      <IconArrowUp size={14} />
                    </ActionIcon>
                    <ActionIcon
                      variant="subtle"
                      aria-label={`Move rule ${index + 1} down`}
                      disabled={index === profile.rules.length - 1}
                      onClick={() => reorder(rule.id, 1)}
                    >
                      <IconArrowDown size={14} />
                    </ActionIcon>
                    <ActionIcon
                      color="red"
                      variant="subtle"
                      aria-label={`Delete rule ${index + 1}`}
                      onClick={() =>
                        patch({
                          rules: profile.rules.filter(
                            (item) => item.id !== rule.id,
                          ),
                        })
                      }
                    >
                      <IconTrash size={14} />
                    </ActionIcon>
                  </Group>
                </Group>
                <Group grow>
                  <Select
                    size="xs"
                    label="Search in"
                    value={rule.scope}
                    data={[
                      { value: "text", label: "Entire message" },
                      { value: "structured", label: "Structured property" },
                    ]}
                    onChange={(value) =>
                      patchRule(rule.id, {
                        scope: value as HighlightRule["scope"],
                      })
                    }
                  />
                  <Select
                    size="xs"
                    label="Highlight"
                    value={rule.target}
                    data={[
                      { value: "row", label: "Entire event row" },
                      { value: "text", label: "Matching text" },
                    ]}
                    onChange={(value) =>
                      patchRule(rule.id, {
                        target: value as HighlightRule["target"],
                      })
                    }
                  />
                </Group>
                {rule.scope === "structured" && (
                  <TextInput
                    size="xs"
                    label="JSON Pointer path"
                    placeholder="/request/status"
                    description="Empty means the root object. Escape / as ~1 and ~ as ~0."
                    value={rule.path}
                    maxLength={512}
                    error={
                      rule.path && !rule.path.startsWith("/")
                        ? "Start a JSON Pointer with /"
                        : undefined
                    }
                    onChange={(event) =>
                      patchRule(rule.id, { path: event.currentTarget.value })
                    }
                  />
                )}
                <TextInput
                  size="xs"
                  label="Match regex"
                  placeholder="ERROR|failed|timeout"
                  value={rule.pattern}
                  maxLength={500}
                  error={regexError(rule.pattern)}
                  onChange={(event) =>
                    patchRule(rule.id, { pattern: event.currentTarget.value })
                  }
                />
                <Switch
                  size="xs"
                  label="Ignore case"
                  checked={rule.ignoreCase}
                  onChange={(event) =>
                    patchRule(rule.id, {
                      ignoreCase: event.currentTarget.checked,
                    })
                  }
                />
                <Switch
                  size="xs"
                  label="Separate light and dark colors"
                  checked={rule.separateThemeColors}
                  onChange={(event) =>
                    patchRule(rule.id, {
                      separateThemeColors: event.currentTarget.checked,
                      lightColors: rule.lightColors ?? {
                        foreground: "#111827",
                        background: "#fef08a",
                      },
                      darkColors: rule.darkColors ?? rule.colors,
                    })
                  }
                />
                {rule.separateThemeColors ? (
                  <>
                    <Colors
                      label="Light"
                      value={rule.lightColors ?? rule.colors}
                      onChange={(lightColors) =>
                        patchRule(rule.id, { lightColors })
                      }
                    />
                    <Colors
                      label="Dark"
                      value={rule.darkColors ?? rule.colors}
                      onChange={(darkColors) =>
                        patchRule(rule.id, { darkColors })
                      }
                    />
                  </>
                ) : (
                  <Colors
                    label="Shared"
                    value={rule.colors}
                    onChange={(colors) => patchRule(rule.id, { colors })}
                  />
                )}
              </Stack>
            </Paper>
          ))}
          <Button
            variant="light"
            size="xs"
            disabled={profile.rules.length >= 20}
            onClick={() => patch({ rules: [...profile.rules, newRule()] })}
          >
            Add rule
          </Button>
          <Preview profile={profile} preferences={preferences} />
        </>
      )}
      <Text size="xs" c="dimmed">
        Up to 20 profiles and 20 rules per profile. Matching uses the first
        200,000 message characters and bounded structured fields. Slow patterns
        are stopped without blocking the viewer.
      </Text>
    </Stack>
  );
}
