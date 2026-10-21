import { useState } from "react";
import {
  ActionIcon,
  Button,
  Collapse,
  ColorInput,
  Group,
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
  IconChevronDown,
  IconGripVertical,
  IconPlus,
  IconTrash,
} from "@tabler/icons-react";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import "./highlight-profiles.css";
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

function RuleRow({
  rule,
  index,
  selected,
  onSelect,
  onToggle,
}: {
  rule: HighlightRule;
  index: number;
  selected: boolean;
  onSelect(): void;
  onToggle(enabled: boolean): void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: rule.id });
  const colors = rule.separateThemeColors
    ? ([
        ["Light", rule.lightColors ?? rule.colors],
        ["Dark", rule.darkColors ?? rule.colors],
      ] as const)
    : ([["Shared", rule.colors]] as const);
  return (
    <tr
      ref={setNodeRef}
      data-rule-id={rule.id}
      data-highlight-rule={index}
      data-dragging={isDragging}
      aria-selected={selected}
      tabIndex={0}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        position: "relative",
        zIndex: isDragging ? 2 : undefined,
      }}
      onClick={onSelect}
      onKeyDown={(event) => {
        if (
          event.target === event.currentTarget &&
          (event.key === "Enter" || event.key === " ")
        ) {
          event.preventDefault();
          onSelect();
        }
      }}
    >
      <td>
        <button
          ref={setActivatorNodeRef}
          {...attributes}
          {...listeners}
          className="highlight-rule-handle"
          data-mantine-stop-propagation={isDragging ? "true" : undefined}
          aria-label={`Reorder rule ${index + 1}`}
        >
          <IconGripVertical size={15} />
        </button>
      </td>
      <td>{index + 1}</td>
      <td onClick={(event) => event.stopPropagation()}>
        <input
          type="checkbox"
          className="highlight-rule-enabled"
          aria-label={`Rule ${index + 1} enabled`}
          checked={rule.enabled}
          onChange={(event) => onToggle(event.currentTarget.checked)}
        />
      </td>
      <td
        data-tooltip={
          rule.scope === "structured"
            ? `Structured property: ${rule.path || "(root)"}`
            : "Entire message"
        }
      >
        <span className="highlight-rule-ellipsis">
          {rule.scope === "structured" ? rule.path || "Root object" : "Message"}
        </span>
      </td>
      <td>{rule.target === "row" ? "Entire row" : "Match text"}</td>
      <td
        data-tooltip={rule.pattern + (rule.ignoreCase ? " (ignore case)" : "")}
      >
        <code className="highlight-rule-ellipsis">{rule.pattern || "—"}</code>
      </td>
      <td>
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
      </td>
    </tr>
  );
}
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
      <div className="highlight-preview-inputs">
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
      </div>
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
  const [selectedRules, setSelectedRules] = useState<Record<string, string>>(
    {},
  );
  const [previewOpened, setPreviewOpened] = useState(false);
  const profile = profiles.find((item) => item.id === selected) ?? profiles[0];
  const rule =
    profile?.rules.find((item) => item.id === selectedRules[profile.id]) ??
    profile?.rules[0];
  const index = rule && profile ? profile.rules.indexOf(rule) : -1;
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );
  const selectRule = (id: string) =>
    profile &&
    setSelectedRules((previous) => ({ ...previous, [profile.id]: id }));
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
      rules: profile.rules.map((item) =>
        item.id === id ? { ...item, ...change } : item,
      ),
    });
  const reorder = (id: string, target: number) => {
    if (!profile || target < 0 || target >= profile.rules.length) return;
    const source = profile.rules.findIndex((item) => item.id === id);
    if (source < 0 || source === target) return;
    patch({ rules: arrayMove(profile.rules, source, target) });
  };
  const moveProfile = (direction: number) => {
    if (!profile) return;
    const source = profiles.indexOf(profile),
      target = source + direction;
    if (target >= 0 && target < profiles.length)
      onChange(arrayMove(profiles, source, target));
  };
  return (
    <div className="highlight-editor" data-preview-open={previewOpened}>
      <section
        className="highlight-profile-config"
        aria-label="Profile configuration"
      >
        <div className="highlight-profile-top">
          <Select
            size="xs"
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
            variant="default"
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
          {profile && (
            <>
              <TextInput
                size="xs"
                label="Profile name"
                maxLength={120}
                value={profile.name}
                onChange={(event) => patch({ name: event.currentTarget.value })}
              />
              <Switch
                size="xs"
                label="Profile enabled"
                checked={profile.enabled}
                onChange={(event) =>
                  patch({ enabled: event.currentTarget.checked })
                }
              />
              <Group
                gap={2}
                wrap="nowrap"
                className="highlight-profile-actions"
              >
                <ActionIcon
                  size="sm"
                  variant="subtle"
                  aria-label="Move profile up"
                  disabled={profiles.indexOf(profile) === 0}
                  onClick={() => moveProfile(-1)}
                >
                  <IconArrowUp size={14} />
                </ActionIcon>
                <ActionIcon
                  size="sm"
                  variant="subtle"
                  aria-label="Move profile down"
                  disabled={profiles.indexOf(profile) === profiles.length - 1}
                  onClick={() => moveProfile(1)}
                >
                  <IconArrowDown size={14} />
                </ActionIcon>
                <ActionIcon
                  size="sm"
                  color="red"
                  variant="subtle"
                  aria-label="Delete profile"
                  onClick={() =>
                    onChange(profiles.filter((item) => item.id !== profile.id))
                  }
                >
                  <IconTrash size={15} />
                </ActionIcon>
              </Group>
            </>
          )}
        </div>
        {profile && (
          <div className="highlight-profile-pattern">
            <TextInput
              size="xs"
              label="Log group regex"
              placeholder="All log groups · e.g. ^/aws/lambda/.*-prod$"
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
          </div>
        )}
      </section>
      {profile ? (
        <>
          <div className="highlight-master-detail">
            <section className="highlight-rule-list" aria-label="Rules">
              <header className="highlight-panel-heading">
                <Text size="sm" fw={600}>
                  Rules ({profile.rules.length})
                </Text>
                <div className="toolbar-spacer" />
                <ActionIcon
                  size="sm"
                  variant="subtle"
                  aria-label={`Move rule ${index + 1} up`}
                  disabled={index <= 0}
                  onClick={() => rule && reorder(rule.id, index - 1)}
                >
                  <IconArrowUp size={14} />
                </ActionIcon>
                <ActionIcon
                  size="sm"
                  variant="subtle"
                  aria-label={`Move rule ${index + 1} down`}
                  disabled={index < 0 || index >= profile.rules.length - 1}
                  onClick={() => rule && reorder(rule.id, index + 1)}
                >
                  <IconArrowDown size={14} />
                </ActionIcon>
                <Button
                  size="xs"
                  leftSection={<IconPlus size={14} />}
                  disabled={profile.rules.length >= 20}
                  onClick={() => {
                    const created = newRule();
                    patch({ rules: [...profile.rules, created] });
                    selectRule(created.id);
                  }}
                >
                  Add rule
                </Button>
              </header>
              <div className="highlight-rules-scroll">
                <DndContext
                  sensors={sensors}
                  collisionDetection={closestCenter}
                  onDragStart={({ active }) => selectRule(String(active.id))}
                  onDragEnd={({ active, over }) => {
                    if (over)
                      reorder(
                        String(active.id),
                        profile.rules.findIndex((item) => item.id === over.id),
                      );
                  }}
                >
                  <table
                    className="highlight-rules-table"
                    aria-label="Highlight rules"
                  >
                    <colgroup>
                      <col style={{ width: 28 }} />
                      <col style={{ width: 30 }} />
                      <col style={{ width: 60 }} />
                      <col style={{ width: 94 }} />
                      <col style={{ width: 80 }} />
                      <col />
                      <col style={{ width: 70 }} />
                    </colgroup>
                    <thead>
                      <tr>
                        <th />
                        <th data-tooltip="Priority">#</th>
                        <th>Enabled</th>
                        <th>Search in</th>
                        <th>Highlight</th>
                        <th>Regex</th>
                        <th>Colors</th>
                      </tr>
                    </thead>
                    <SortableContext
                      items={profile.rules.map((item) => item.id)}
                      strategy={verticalListSortingStrategy}
                    >
                      <tbody>
                        {profile.rules.map((item, position) => (
                          <RuleRow
                            key={item.id}
                            rule={item}
                            index={position}
                            selected={item.id === rule?.id}
                            onSelect={() => selectRule(item.id)}
                            onToggle={(enabled) =>
                              patchRule(item.id, { enabled })
                            }
                          />
                        ))}
                      </tbody>
                    </SortableContext>
                  </table>
                </DndContext>
                {!profile.rules.length && (
                  <Text size="sm" c="dimmed" p="md">
                    No rules in this profile.
                  </Text>
                )}
              </div>
              <footer className="highlight-rule-footer">
                Drag to change priority · Space and arrow keys also reorder
              </footer>
            </section>
            <section
              className="highlight-rule-detail"
              role="region"
              aria-label="Edit rule"
            >
              <header className="highlight-panel-heading">
                <Text size="sm" fw={600}>
                  {rule ? `Edit rule · ${index + 1}` : "Edit rule"}
                </Text>
                <div className="toolbar-spacer" />
                <ActionIcon
                  size="sm"
                  color="red"
                  variant="subtle"
                  aria-label="Delete selected rule"
                  disabled={!rule}
                  onClick={() => {
                    if (!rule) return;
                    const remaining = profile.rules.filter(
                      (item) => item.id !== rule.id,
                    );
                    patch({ rules: remaining });
                    if (remaining.length)
                      selectRule(
                        remaining[Math.min(index, remaining.length - 1)].id,
                      );
                  }}
                >
                  <IconTrash size={15} />
                </ActionIcon>
              </header>
              {rule ? (
                <div
                  className="highlight-detail-fields"
                  key={profile.id + ":" + rule.id}
                >
                  <div className="highlight-detail-priority">
                    <Switch
                      size="xs"
                      label="Rule enabled"
                      checked={rule.enabled}
                      onChange={(event) =>
                        patchRule(rule.id, {
                          enabled: event.currentTarget.checked,
                        })
                      }
                    />
                    <TextInput
                      size="xs"
                      type="number"
                      label="Priority"
                      min={1}
                      max={profile.rules.length}
                      step={1}
                      value={index + 1}
                      onChange={(event) => {
                        const value = Number(event.currentTarget.value);
                        if (Number.isInteger(value))
                          reorder(rule.id, value - 1);
                      }}
                    />
                  </div>
                  <div className="highlight-detail-columns">
                    <Select
                      size="xs"
                      label="Search in"
                      value={rule.scope}
                      data={[
                        { value: "text", label: "Entire message" },
                        { value: "structured", label: "Structured property" },
                      ]}
                      onChange={(value) =>
                        value &&
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
                        value &&
                        patchRule(rule.id, {
                          target: value as HighlightRule["target"],
                        })
                      }
                    />
                  </div>
                  {rule.scope === "structured" && (
                    <TextInput
                      size="xs"
                      label="JSON Pointer path"
                      placeholder="/request/status"
                      description="Empty = root. Escape / as ~1 and ~ as ~0."
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
                  <Text size="xs" c="dimmed">
                    Earlier rules take priority for overlapping colors and text.
                  </Text>
                </div>
              ) : (
                <Text size="sm" c="dimmed" p="md">
                  Add a rule to start highlighting.
                </Text>
              )}
            </section>
          </div>
          <section className="highlight-preview-section">
            <button
              className="highlight-preview-toggle"
              aria-expanded={previewOpened}
              onClick={() => setPreviewOpened((value) => !value)}
            >
              Test and preview{" "}
              <IconChevronDown
                size={16}
                style={{
                  transform: previewOpened ? "rotate(180deg)" : undefined,
                }}
              />
            </button>
            <Collapse expanded={previewOpened} transitionDuration={0}>
              <div className="highlight-preview-body">
                <Preview profile={profile} preferences={preferences} />
              </div>
            </Collapse>
          </section>
        </>
      ) : (
        <Text size="sm" c="dimmed" p="sm">
          Add a profile to configure highlight rules.
        </Text>
      )}
      <Text size="xs" c="dimmed">
        Up to 20 profiles and 20 rules each. Empty group pattern matches all
        groups. Matching is bounded; slow regex patterns are stopped without
        blocking the viewer.
      </Text>
    </div>
  );
}
