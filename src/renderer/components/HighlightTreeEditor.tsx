import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type Dispatch,
  type SetStateAction,
  type ReactNode,
} from "react";
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  pointerWithin,
  useSensor,
  useSensors,
  type CollisionDetection,
} from "@dnd-kit/core";
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  ActionIcon,
  Button,
  Group,
  Modal,
  Stack,
  Switch,
  Text,
} from "@mantine/core";
import {
  IconArrowDown,
  IconArrowUp,
  IconChevronDown,
  IconChevronRight,
  IconFolder,
  IconPencil,
  IconPlus,
  IconHighlight,
  IconTrash,
} from "@tabler/icons-react";
import type { Preferences } from "../../shared/contracts";
import type { HighlightProfile, HighlightRule } from "../../shared/highlights";
import type { SettingsPreviewSnapshot } from "../settings-preview";
import { Menu } from "./AppMenu";
import {
  ProfileFields,
  RuleFields,
  profileDraftError,
  ruleDraftError,
  type ProfileDraft,
  type RuleDraft,
} from "./HighlightItemDetails";
import { HighlightEventsPreview } from "./HighlightEventsPreview";
import { HighlightPaneDivider } from "./HighlightPaneDivider";
import { highlightTableKeyboardCoordinates } from "../highlight-table-keyboard";
import "./highlight-profiles.css";
import "./highlight-tree.css";

type Target = { profileId: string; ruleId?: string };
export interface HighlightTreeEditorState {
  selected?: Target;
  expanded: string[];
  previewOpened: boolean;
  widthRatio: number;
  heightRatio: number;
  tablesRatio: number;
}
export const createHighlightTreeEditorState = (
  profileId?: string,
): HighlightTreeEditorState => ({
  selected: profileId ? { profileId } : undefined,
  expanded: profileId ? [profileId] : [],
  previewOpened: false,
  widthRatio: 0.33,
  heightRatio: 0.4,
  tablesRatio: 1 / 1.85,
});
const ruleName = (rule: HighlightRule) => rule.pattern || "New rule";
const profileName = (profile: HighlightProfile) =>
  profile.name || "Untitled profile";
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
const move = <T,>(items: T[], index: number, delta: number) => {
  const result = [...items];
  if (
    delta === 0 ||
    index < 0 ||
    index + delta < 0 ||
    index + delta >= items.length
  )
    return items;
  result.splice(index + delta, 0, result.splice(index, 1)[0]);
  return result;
};
const treeCollision: CollisionDetection = (args) =>
  args.pointerCoordinates ? pointerWithin(args) : closestCenter(args);
function SortableTreeItem({
  id,
  row,
  children,
}: {
  id: string;
  row(sortable: ReturnType<typeof useSortable>): ReactNode;
  children?: ReactNode;
}) {
  const sortable = useSortable({ id });
  return (
    <div
      role="none"
      ref={sortable.setNodeRef}
      className="highlight-tree-drag-item"
      data-dragging={sortable.isDragging}
      style={{
        transform: CSS.Transform.toString(sortable.transform),
        transition: sortable.transition,
        zIndex: sortable.isDragging ? 10 : undefined,
      }}
    >
      {row(sortable)}
      {children}
    </div>
  );
}

// Incomplete values stay visible with their field error. Valid changes apply
// immediately; invalid colors must never reach persisted profile validation.
function ImmediateFields({
  profile,
  rule,
  onProfile,
  onRule,
}: {
  profile: HighlightProfile;
  rule?: HighlightRule;
  onProfile(change: Partial<HighlightProfile>): void;
  onRule(change: Partial<HighlightRule>): void;
}) {
  let config: ProfileDraft | RuleDraft;
  if (rule) {
    const { id, enabled, ...fields } = rule;
    config = fields;
  } else {
    config = {
      name: profile.name,
      groupPattern: profile.groupPattern,
      groupIgnoreCase: profile.groupIgnoreCase,
    };
  }
  const baseKey = JSON.stringify(config);
  const [input, setInput] = useState<{
    baseKey: string;
    draft: ProfileDraft | RuleDraft;
  }>();
  // Schema normalization recreates refs when reordering. Only a change to the
  // applied editable fields should replace an unfinished local value.
  const value = input?.baseKey === baseKey ? input.draft : config;
  return rule ? (
    <RuleFields
      draft={value as RuleDraft}
      onChange={(change) => {
        const draft = { ...value, ...change } as RuleDraft;
        setInput({ baseKey, draft });
        if (!ruleDraftError(draft)) onRule(draft);
      }}
    />
  ) : (
    <ProfileFields
      draft={value as ProfileDraft}
      onChange={(change) => {
        const draft = { ...value, ...change } as ProfileDraft;
        setInput({ baseKey, draft });
        if (!profileDraftError(draft)) onProfile(draft);
      }}
    />
  );
}

export function HighlightTreeEditor({
  preferences,
  onChange,
  uiState,
  onUiStateChange,
  previewEnabled = true,
  previewSnapshot = null,
}: {
  preferences: Preferences;
  onChange(profiles: HighlightProfile[]): void;
  uiState?: HighlightTreeEditorState;
  onUiStateChange?: Dispatch<SetStateAction<HighlightTreeEditorState>>;
  previewEnabled?: boolean;
  previewSnapshot?: SettingsPreviewSnapshot | null;
}) {
  const profiles = preferences.highlightProfiles ?? [];
  const [localState, setLocalState] = useState(() =>
    createHighlightTreeEditorState(profiles[0]?.id),
  );
  const state = uiState ?? localState,
    setState = onUiStateChange ?? setLocalState;
  const [confirming, setConfirming] = useState<Target>();
  const [focusRequest, setFocusRequest] = useState(0);
  const [dragging, setDragging] = useState(false);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: highlightTableKeyboardCoordinates,
    }),
  );
  const editor = useRef<HTMLDivElement>(null),
    tree = useRef<HTMLDivElement>(null);
  const profile =
    profiles.find((item) => item.id === state.selected?.profileId) ??
    profiles[0];
  const rule =
    profile?.id === state.selected?.profileId
      ? profile.rules.find((item) => item.id === state.selected?.ruleId)
      : undefined;
  const targetProfile = profiles.find(
    (item) => item.id === confirming?.profileId,
  );
  const targetRule = targetProfile?.rules.find(
    (item) => item.id === confirming?.ruleId,
  );
  const [draftSize, setDraftSize] = useState<
    Partial<Record<"widthRatio" | "heightRatio" | "tablesRatio", number>>
  >({});
  const ratio = (key: keyof typeof draftSize) => draftSize[key] ?? state[key];
  const sizing = (key: keyof typeof draftSize, value: number | null) =>
    setDraftSize((previous) => ({ ...previous, [key]: value ?? undefined }));
  const commitSize = (key: keyof typeof draftSize, value: number) =>
    setState((previous) => ({ ...previous, [key]: value }));
  useEffect(() => {
    if (!focusRequest) return;
    const frame = requestAnimationFrame(() =>
      editor.current
        ?.querySelector<HTMLInputElement>("input[data-highlight-primary]")
        ?.focus(),
    );
    return () => cancelAnimationFrame(frame);
  }, [focusRequest]);
  const select = (target: Target, focus = false) => {
    setState((previous) => ({
      ...previous,
      selected: target,
      expanded:
        target.ruleId && !previous.expanded.includes(target.profileId)
          ? [...previous.expanded, target.profileId]
          : previous.expanded,
    }));
    if (focus) setFocusRequest((value) => value + 1);
  };
  const patchProfile = (id: string, change: Partial<HighlightProfile>) =>
    onChange(
      profiles.map((item) => (item.id === id ? { ...item, ...change } : item)),
    );
  const patchRule = (
    owner: HighlightProfile,
    id: string,
    change: Partial<HighlightRule>,
  ) =>
    patchProfile(owner.id, {
      rules: owner.rules.map((item) =>
        item.id === id ? { ...item, ...change } : item,
      ),
    });
  const addProfile = () => {
    if (profiles.length >= 20) return;
    const item: HighlightProfile = {
      id: crypto.randomUUID(),
      name: "New profile",
      enabled: true,
      groupPattern: "",
      groupIgnoreCase: false,
      rules: [newRule()],
    };
    onChange([...profiles, item]);
    setState((previous) => ({
      ...previous,
      selected: { profileId: item.id },
      expanded: [...previous.expanded, item.id],
    }));
    setFocusRequest((value) => value + 1);
  };
  const addRule = (owner: HighlightProfile) => {
    if (owner.rules.length >= 20) return;
    const item = newRule();
    patchProfile(owner.id, { rules: [...owner.rules, item] });
    select({ profileId: owner.id, ruleId: item.id }, true);
  };
  const remove = () => {
    if (!targetProfile) {
      setConfirming(undefined);
      return;
    }
    if (confirming?.ruleId) {
      const index = targetProfile.rules.findIndex(
        (item) => item.id === confirming.ruleId,
      );
      const remaining = targetProfile.rules.filter(
        (item) => item.id !== confirming.ruleId,
      );
      patchProfile(targetProfile.id, { rules: remaining });
      if (state.selected?.ruleId === confirming.ruleId)
        select({
          profileId: targetProfile.id,
          ruleId: remaining[Math.min(index, remaining.length - 1)]?.id,
        });
    } else {
      const index = profiles.indexOf(targetProfile),
        remaining = profiles.filter((item) => item.id !== targetProfile.id);
      onChange(remaining);
      setState((previous) => ({
        ...previous,
        expanded: previous.expanded.filter((id) => id !== targetProfile.id),
        selected:
          profile?.id === targetProfile.id
            ? remaining.length
              ? {
                  profileId:
                    remaining[Math.min(index, remaining.length - 1)].id,
                }
              : undefined
            : previous.selected,
      }));
    }
    setConfirming(undefined);
  };
  const row = (
    owner: HighlightProfile,
    child: HighlightRule | undefined,
    sortable: ReturnType<typeof useSortable>,
  ) => {
    const target = { profileId: owner.id, ruleId: child?.id },
      kind = child ? "rule" : "profile",
      label = child ? ruleName(child) : profileName(owner);
    const selected =
      profile?.id === owner.id && (rule?.id ?? undefined) === child?.id;
    const siblings = child ? owner.rules : profiles,
      index = child ? owner.rules.indexOf(child) : profiles.indexOf(owner);
    const reorder = (delta: number) =>
      child
        ? patchProfile(owner.id, { rules: move(owner.rules, index, delta) })
        : onChange(move(profiles, index, delta));
    return (
      <Menu
        key={child?.id ?? owner.id}
        withinPortal
        position="bottom-start"
        offset={4}
        transitionProps={{ duration: 0 }}
      >
        <Menu.ContextMenu>
          <div
            ref={sortable.setActivatorNodeRef}
            {...sortable.attributes}
            {...sortable.listeners}
            role="treeitem"
            aria-level={child ? 2 : 1}
            aria-selected={selected}
            aria-expanded={
              child ? undefined : state.expanded.includes(owner.id)
            }
            aria-label={`Select ${kind} ${label}`}
            tabIndex={selected ? 0 : -1}
            className="resource-row highlight-tree-row"
            data-mantine-stop-propagation={
              sortable.isDragging ? "true" : undefined
            }
            data-tree-profile={owner.id}
            data-tree-rule={child?.id}
            data-disabled={!owner.enabled || child?.enabled === false}
            data-tooltip={
              child
                ? child.pattern || "Empty match pattern"
                : owner.groupPattern || "All log groups"
            }
            onClick={() => select(target)}
            onContextMenu={() => select(target)}
            onDoubleClick={() =>
              child
                ? select(target, true)
                : setState((previous) => ({
                    ...previous,
                    expanded: previous.expanded.includes(owner.id)
                      ? previous.expanded.filter((id) => id !== owner.id)
                      : [...previous.expanded, owner.id],
                  }))
            }
            onKeyDown={(event) => {
              if (
                event.key === "ContextMenu" ||
                (event.shiftKey && event.key === "F10")
              ) {
                event.preventDefault();
                event.stopPropagation();
                const bounds = event.currentTarget.getBoundingClientRect();
                event.currentTarget.dispatchEvent(
                  new MouseEvent("contextmenu", {
                    bubbles: true,
                    cancelable: true,
                    clientX: bounds.left + 20,
                    clientY: bounds.top + bounds.height / 2,
                  }),
                );
              } else {
                sortable.listeners?.onKeyDown?.(event);
              }
            }}
          >
            {!child && (
              <button
                className="tree-toggle highlight-tree-expander"
                aria-label={`${state.expanded.includes(owner.id) ? "Collapse" : "Expand"} profile ${label}`}
                tabIndex={-1}
                onPointerDown={(event) => event.stopPropagation()}
                onClick={(event) => {
                  event.stopPropagation();
                  setState((previous) => ({
                    ...previous,
                    expanded: previous.expanded.includes(owner.id)
                      ? previous.expanded.filter((id) => id !== owner.id)
                      : [...previous.expanded, owner.id],
                  }));
                }}
              >
                {state.expanded.includes(owner.id) ? (
                  <IconChevronDown size={13} />
                ) : (
                  <IconChevronRight size={13} />
                )}
              </button>
            )}
            <span className="resource-label">
              {child ? <IconHighlight size={14} /> : <IconFolder size={14} />}
              <span className="highlight-tree-label">{label}</span>
            </span>
            {!child && (
              <span className="highlight-tree-count">{owner.rules.length}</span>
            )}
          </div>
        </Menu.ContextMenu>
        <Menu.Dropdown>
          <Menu.Item
            aria-label={`Edit ${kind} ${label}`}
            leftSection={<IconPencil size={14} />}
            onClick={() => select(target, true)}
          >
            Edit
          </Menu.Item>
          <Menu.Item
            aria-label={`Move ${kind} ${label} up`}
            disabled={index === 0}
            leftSection={<IconArrowUp size={14} />}
            onClick={() => reorder(-1)}
          >
            Move up
          </Menu.Item>
          <Menu.Item
            aria-label={`Move ${kind} ${label} down`}
            disabled={index === siblings.length - 1}
            leftSection={<IconArrowDown size={14} />}
            onClick={() => reorder(1)}
          >
            Move down
          </Menu.Item>
          <Menu.Divider />
          {!child && (
            <Menu.Item
              aria-label={`Add profile after ${owner.id}`}
              disabled={profiles.length >= 20}
              leftSection={<IconPlus size={14} />}
              onClick={addProfile}
            >
              Add profile
            </Menu.Item>
          )}
          <Menu.Item
            aria-label={`Add rule to ${owner.id}${child ? ` from ${child.id}` : ""}`}
            disabled={owner.rules.length >= 20}
            leftSection={<IconPlus size={14} />}
            onClick={() => addRule(owner)}
          >
            Add rule
          </Menu.Item>
          <Menu.Divider />
          <Menu.Item
            color="red"
            aria-label={`Delete ${kind} ${label}`}
            leftSection={<IconTrash size={14} />}
            onClick={() => setConfirming(target)}
          >
            Delete
          </Menu.Item>
        </Menu.Dropdown>
      </Menu>
    );
  };
  const navigate = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (dragging) {
      // PointerSensor cancels Escape without consuming it. Let its document
      // listener cancel while preventing the outer Settings window from closing.
      if (event.key === "Escape") event.preventDefault();
      return;
    }
    if (event.defaultPrevented) return;
    const items: Target[] = profiles.flatMap((owner) => [
      { profileId: owner.id },
      ...(state.expanded.includes(owner.id)
        ? owner.rules.map((child) => ({
            profileId: owner.id,
            ruleId: child.id,
          }))
        : []),
    ]);
    const index = items.findIndex(
      (item) => item.profileId === profile?.id && item.ruleId === rule?.id,
    );
    let next: Target | undefined;
    if (event.key === "ArrowDown")
      next = items[Math.min(items.length - 1, index + 1)];
    else if (event.key === "ArrowUp") next = items[Math.max(0, index - 1)];
    else if (event.key === "Home") next = items[0];
    else if (event.key === "End") next = items.at(-1);
    else if (event.key === "ArrowLeft" && profile) {
      if (rule) next = { profileId: profile.id };
      else
        setState((previous) => ({
          ...previous,
          expanded: previous.expanded.filter((id) => id !== profile.id),
        }));
    } else if (event.key === "ArrowRight" && profile && !rule) {
      if (state.expanded.includes(profile.id)) {
        if (profile.rules[0])
          next = { profileId: profile.id, ruleId: profile.rules[0].id };
      } else
        setState((previous) => ({
          ...previous,
          expanded: [...previous.expanded, profile.id],
        }));
    } else if ((event.key === "Enter" || event.key === "F2") && profile)
      select({ profileId: profile.id, ruleId: rule?.id }, true);
    else if (event.key === "Delete" && profile)
      setConfirming({ profileId: profile.id, ruleId: rule?.id });
    else return;
    event.preventDefault();
    event.stopPropagation();
    if (next) {
      select(next);
      requestAnimationFrame(() =>
        tree.current
          ?.querySelector<HTMLElement>('[aria-selected="true"]')
          ?.focus(),
      );
    }
  };
  return (
    <div
      className="highlight-editor highlight-tree-editor"
      data-preview-enabled={previewEnabled}
      data-preview-open={state.previewOpened}
      style={
        {
          "--highlight-profiles-width": `${ratio("widthRatio")}fr`,
          "--highlight-rules-width": `${1 - ratio("widthRatio")}fr`,
          "--highlight-profiles-height": `${ratio("heightRatio")}fr`,
          "--highlight-rules-height": `${1 - ratio("heightRatio")}fr`,
          "--highlight-tables-share": `${ratio("tablesRatio")}fr`,
          "--highlight-preview-share": `${1 - ratio("tablesRatio")}fr`,
        } as CSSProperties
      }
    >
      <div className="highlight-table-lists">
        <section className="highlight-profile-list highlight-tree-list">
          <header className="highlight-panel-heading">
            <Text size="sm" fw={600} className="highlight-list-title">
              Profiles and rules
            </Text>
            <ActionIcon
              ml="auto"
              size="sm"
              variant="subtle"
              aria-label="Add highlight profile"
              data-tooltip="Add profile"
              disabled={profiles.length >= 20}
              onClick={addProfile}
            >
              <IconPlus size={16} />
            </ActionIcon>
          </header>
          <div
            role="tree"
            aria-label="Highlight profiles and rules"
            ref={tree}
            className="highlight-tree-scroll"
            onKeyDown={navigate}
          >
            <DndContext
              id="highlight-tree-profiles"
              sensors={sensors}
              collisionDetection={treeCollision}
              onDragStart={() => setDragging(true)}
              onDragCancel={() => setDragging(false)}
              onDragEnd={({ active, over }) => {
                setDragging(false);
                if (!over) return;
                const from = profiles.findIndex(
                    (item) => item.id === active.id,
                  ),
                  to = profiles.findIndex((item) => item.id === over.id);
                const next = move(profiles, from, to - from);
                if (next !== profiles) onChange(next);
              }}
            >
              <SortableContext
                items={profiles.map((item) => item.id)}
                strategy={verticalListSortingStrategy}
              >
                {profiles.map((owner) => (
                  <SortableTreeItem
                    key={owner.id}
                    id={owner.id}
                    row={(sortable) => row(owner, undefined, sortable)}
                  >
                    {state.expanded.includes(owner.id) && (
                      <DndContext
                        id={`highlight-tree-rules:${owner.id}`}
                        sensors={sensors}
                        collisionDetection={treeCollision}
                        onDragStart={() => setDragging(true)}
                        onDragCancel={() => setDragging(false)}
                        onDragEnd={({ active, over }) => {
                          setDragging(false);
                          if (!over) return;
                          const from = owner.rules.findIndex(
                              (item) => item.id === active.id,
                            ),
                            to = owner.rules.findIndex(
                              (item) => item.id === over.id,
                            );
                          const next = move(owner.rules, from, to - from);
                          if (next !== owner.rules)
                            patchProfile(owner.id, { rules: next });
                        }}
                      >
                        <SortableContext
                          items={owner.rules.map((item) => item.id)}
                          strategy={verticalListSortingStrategy}
                        >
                          <div
                            role="group"
                            aria-label={`${profileName(owner)} rules`}
                          >
                            {owner.rules.map((child) => (
                              <SortableTreeItem
                                key={child.id}
                                id={child.id}
                                row={(sortable) => row(owner, child, sortable)}
                              />
                            ))}
                          </div>
                        </SortableContext>
                      </DndContext>
                    )}
                  </SortableTreeItem>
                ))}
              </SortableContext>
            </DndContext>
            {!profiles.length && (
              <div className="highlight-tree-empty">
                <Text size="sm" c="dimmed">
                  No highlight profiles.
                </Text>
                <Button variant="subtle" size="xs" onClick={addProfile}>
                  Add profile
                </Button>
              </div>
            )}
          </div>
        </section>
        <HighlightPaneDivider
          label="Resize highlight tree and editor"
          values={{ x: state.widthRatio, y: state.heightRatio }}
          onDraft={(axis, value) =>
            sizing(axis === "x" ? "widthRatio" : "heightRatio", value)
          }
          onCommit={(axis, value) =>
            commitSize(axis === "x" ? "widthRatio" : "heightRatio", value)
          }
        />
        <section className="highlight-rule-list highlight-tree-detail">
          <header className="highlight-panel-heading">
            <Text size="sm" fw={600} className="highlight-list-title">
              {profile ? (rule ? "Rule" : "Profile") : "Editor"}
            </Text>
            {profile && (
              <Switch
                ml="auto"
                size="xs"
                label="Enabled"
                checked={rule?.enabled ?? profile.enabled}
                onChange={(event) =>
                  rule
                    ? patchRule(profile, rule.id, {
                        enabled: event.currentTarget.checked,
                      })
                    : patchProfile(profile.id, {
                        enabled: event.currentTarget.checked,
                      })
                }
              />
            )}
          </header>
          <div ref={editor} className="highlight-tree-editor-scroll">
            {profile ? (
              <>
                <ImmediateFields
                  key={rule?.id ?? profile.id}
                  profile={profile}
                  rule={rule}
                  onProfile={(change) => patchProfile(profile.id, change)}
                  onRule={(change) =>
                    rule && patchRule(profile, rule.id, change)
                  }
                />
                {rule && !profile.enabled && (
                  <Text size="xs" c="dimmed" mt="sm">
                    This profile is disabled. Enable the profile to apply its
                    rules.
                  </Text>
                )}
              </>
            ) : (
              <Text size="sm" c="dimmed">
                Add a profile to configure highlights.
              </Text>
            )}
          </div>
        </section>
      </div>
      {previewEnabled && (
        <>
          {state.previewOpened && (
            <HighlightPaneDivider
              label="Resize highlight tree area and preview"
              defaultAxis="y"
              values={{ x: state.tablesRatio, y: state.tablesRatio }}
              onDraft={(_, value) => sizing("tablesRatio", value)}
              onCommit={(_, value) => commitSize("tablesRatio", value)}
            />
          )}
          <section className="highlight-preview-section">
            <button
              className="highlight-preview-toggle"
              aria-expanded={state.previewOpened}
              onClick={() =>
                setState((previous) => ({
                  ...previous,
                  previewOpened: !previous.previewOpened,
                }))
              }
            >
              Preview
              <IconChevronDown
                size={16}
                style={{
                  transform: state.previewOpened ? "rotate(180deg)" : undefined,
                }}
              />
            </button>
            {state.previewOpened && (
              <div className="highlight-preview-body">
                <HighlightEventsPreview
                  snapshot={previewSnapshot}
                  preferences={preferences}
                  profile={profile}
                />
              </div>
            )}
          </section>
        </>
      )}
      <Modal
        opened={Boolean(confirming && targetProfile)}
        onClose={() => setConfirming(undefined)}
        title={
          confirming?.ruleId
            ? "Delete highlight rule?"
            : "Delete highlight profile?"
        }
        aria-label="Confirm highlight deletion"
        size="sm"
        centered
        attributes={{
          content: {
            onKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
              if (event.key === "Escape") {
                event.preventDefault();
                event.stopPropagation();
                setConfirming(undefined);
              }
            },
          },
        }}
      >
        <Stack gap="sm">
          <Text size="sm">
            {confirming?.ruleId
              ? `Delete rule “${targetRule ? ruleName(targetRule) : ""}” from “${targetProfile ? profileName(targetProfile) : ""}”?`
              : `Delete profile “${targetProfile ? profileName(targetProfile) : ""}” and its ${targetProfile?.rules.length ?? 0} rules?`}
          </Text>
          <Text size="xs" c="dimmed">
            This removes its highlighting configuration from all views.
          </Text>
          <Group justify="flex-end">
            <Button
              variant="default"
              size="xs"
              aria-label="Cancel highlight deletion"
              onClick={() => setConfirming(undefined)}
            >
              Cancel
            </Button>
            <Button
              color="red"
              size="xs"
              aria-label="Delete highlight item"
              onClick={remove}
            >
              Delete
            </Button>
          </Group>
        </Stack>
      </Modal>
    </div>
  );
}
