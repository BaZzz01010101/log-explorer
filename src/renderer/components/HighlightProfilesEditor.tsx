import {
  useState,
  type Dispatch,
  type SetStateAction,
  type CSSProperties,
} from "react";
import { ActionIcon, Switch, Text } from "@mantine/core";
import {
  IconArrowDown,
  IconArrowUp,
  IconChevronDown,
  IconPlus,
} from "@tabler/icons-react";
import {
  DndContext,
  closestCenter,
  pointerWithin,
  type CollisionDetection,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import {
  type HighlightProfile,
  type HighlightRule,
} from "../../shared/highlights";
import { ownValue } from "../../shared/records";
import { highlightTableKeyboardCoordinates } from "../highlight-table-keyboard";
import type { Preferences } from "../../shared/contracts";
import type { SettingsPreviewSnapshot } from "../settings-preview";
import { HighlightEventsPreview } from "./HighlightEventsPreview";
import {
  ColorSwatches,
  ProfileFields,
  RuleFields,
  ruleDraftError,
  profileDraftError,
  type ProfileDraft,
  type RuleDraft,
} from "./HighlightItemDetails";
import { HighlightSettingsRow as ItemRow } from "./HighlightSettingsRow";
import "./highlight-profiles.css";
import { HighlightPaneDivider } from "./HighlightPaneDivider";

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
// The pointer targets the summary under the handle, even if the dragged item
// includes a tall unfolded editor whose center still overlaps its old position.
const tableCollisionDetection: CollisionDetection = (args) => {
  const hits = args.pointerCoordinates ? pointerWithin(args) : [];
  return hits.length ? hits : closestCenter(args);
};
type DeleteTarget = {
  kind: "profile" | "rule";
  profileId: string;
  ruleId?: string;
};
export interface HighlightProfilesEditorState {
  listWidthRatio?: number;
  listHeightRatio?: number;
  tablesRatio?: number;
  selected?: string;
  selectedRules: Record<string, string>;
  expandedProfiles: string[];
  expandedRules: Record<string, string[]>;
  profileDrafts: Record<string, ProfileDraft>;
  ruleDrafts: Record<string, Record<string, RuleDraft>>;
  confirming?: DeleteTarget;
  createdProfiles: string[];
  createdRules: Record<string, string[]>;
  provisionalProfiles: HighlightProfile[];
  provisionalRules: Record<string, HighlightRule[]>;
  profileOrder: string[];
  ruleOrder: Record<string, string[]>;
  previewOpened: boolean;
}
export function createHighlightProfilesEditorState(
  selected?: string,
): HighlightProfilesEditorState {
  return {
    selected,
    selectedRules: {},
    expandedProfiles: [],
    expandedRules: {},
    profileDrafts: {},
    ruleDrafts: {},
    previewOpened: false,
    createdProfiles: [],
    createdRules: {},
    provisionalProfiles: [],
    provisionalRules: {},
    profileOrder: [],
    ruleOrder: {},
    listWidthRatio: 0.85 / 2.2,
    listHeightRatio: 0.5,
    tablesRatio: 1 / 1.85,
  };
}
function without<T>(values: Record<string, T>, id: string): Record<string, T> {
  const { [id]: removed, ...remaining } = values;
  return remaining;
}
function ordered<T extends { id: string }>(
  saved: T[],
  provisional: T[],
  order: string[] = [],
) {
  if (!provisional.length) return saved;
  // Persisted order is authoritative across both editors. Reserve local slots
  // for unfinished additions without freezing the order of saved siblings.
  const remaining = [...saved],
    savedIds = new Set(saved.map((item) => item.id));
  const local = new Map(provisional.map((item) => [item.id, item])),
    result: T[] = [];
  for (const id of order) {
    const pending = local.get(id);
    if (pending) {
      result.push(pending);
      local.delete(id);
    } else if (savedIds.has(id) && remaining.length)
      result.push(remaining.shift()!);
  }
  return [...result, ...remaining, ...local.values()];
}

export function HighlightProfilesEditor({
  preferences,
  onChange,
  uiState,
  onUiStateChange,
  previewEnabled = true,
  previewSnapshot = null,
}: {
  preferences: Preferences;
  onChange(profiles: HighlightProfile[]): void;
  uiState?: HighlightProfilesEditorState;
  onUiStateChange?: Dispatch<SetStateAction<HighlightProfilesEditorState>>;
  previewEnabled?: boolean;
  previewSnapshot?: SettingsPreviewSnapshot | null;
}) {
  const savedProfiles = preferences.highlightProfiles ?? [];
  const [localState, setLocalState] = useState(() =>
    createHighlightProfilesEditorState(savedProfiles[0]?.id),
  );
  const state = uiState ?? localState,
    setState = onUiStateChange ?? setLocalState;
  const profiles = ordered(
    savedProfiles,
    state.provisionalProfiles,
    state.profileOrder,
  ).map((item) => ({
    ...item,
    rules: ordered(
      item.rules,
      ownValue(state.provisionalRules, item.id) ?? [],
      ownValue(state.ruleOrder, item.id),
    ),
  }));
  type SizeKey = "listWidthRatio" | "listHeightRatio" | "tablesRatio";
  const [draftSizes, setDraftSizes] = useState<
    Partial<Record<SizeKey, number>>
  >({});
  const sizeDraft = (key: SizeKey, value: number | null) =>
    setDraftSizes((previous) => ({ ...previous, [key]: value ?? undefined }));
  const sizeCommit = (key: SizeKey, value: number) =>
    setState((previous) => ({ ...previous, [key]: value }));
  const widthRatio =
    draftSizes.listWidthRatio ?? state.listWidthRatio ?? 0.85 / 2.2;
  const heightRatio =
    draftSizes.listHeightRatio ?? state.listHeightRatio ?? 0.5;
  const tablesRatio = draftSizes.tablesRatio ?? state.tablesRatio ?? 1 / 1.85;
  const profile =
    profiles.find((item) => item.id === state.selected) ?? profiles[0];
  const selectedRule =
    profile?.rules.find(
      (item) => item.id === ownValue(state.selectedRules, profile.id),
    ) ?? profile?.rules[0];
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: highlightTableKeyboardCoordinates,
    }),
  );
  const selectProfile = (id: string) =>
    setState((previous) => ({ ...previous, selected: id }));
  const selectRule = (id: string) =>
    profile &&
    setState((previous) => ({
      ...previous,
      selectedRules: { ...previous.selectedRules, [profile.id]: id },
    }));
  type CreatedItems = Pick<
    HighlightProfilesEditorState,
    "createdProfiles" | "createdRules"
  >;
  const updateProfiles = (
    next: HighlightProfile[],
    created: Partial<CreatedItems> = {},
  ) => {
    const createdProfiles = (
      created.createdProfiles ?? state.createdProfiles
    ).filter((id) => next.some((item) => item.id === id));
    const createdRules = Object.fromEntries(
      next.map((item) => [
        item.id,
        (
          ownValue(created.createdRules ?? state.createdRules, item.id) ?? []
        ).filter((id) => item.rules.some((rule) => rule.id === id)),
      ]),
    );
    const committed = next
      .filter((item) => !createdProfiles.includes(item.id))
      .map((item) => {
        const rules = item.rules.filter(
          (rule) => !createdRules[item.id].includes(rule.id),
        );
        const previous = savedProfiles.find((value) => value.id === item.id);
        // Preserve saved references so a local-only operation never publishes.
        return previous &&
          previous.name === item.name &&
          previous.enabled === item.enabled &&
          previous.groupPattern === item.groupPattern &&
          previous.groupIgnoreCase === item.groupIgnoreCase &&
          previous.rules.length === rules.length &&
          previous.rules.every((rule, index) => rule === rules[index])
          ? previous
          : { ...item, rules };
      });
    setState((previous) => ({
      ...previous,
      createdProfiles,
      createdRules,
      provisionalProfiles: next.filter((item) =>
        createdProfiles.includes(item.id),
      ),
      provisionalRules: Object.fromEntries(
        next
          .filter((item) => !createdProfiles.includes(item.id))
          .map((item) => [
            item.id,
            item.rules.filter((rule) =>
              createdRules[item.id].includes(rule.id),
            ),
          ]),
      ),
      profileOrder: next.map((item) => item.id),
      ruleOrder: Object.fromEntries(
        next.map((item) => [item.id, item.rules.map((rule) => rule.id)]),
      ),
    }));
    if (
      committed.length !== savedProfiles.length ||
      committed.some((item, index) => item !== savedProfiles[index])
    )
      onChange(committed);
  };
  const patchProfile = (
    id: string,
    change: Partial<HighlightProfile>,
    created?: Partial<CreatedItems>,
  ) =>
    updateProfiles(
      profiles.map((item) => (item.id === id ? { ...item, ...change } : item)),
      created,
    );
  const patchRule = (
    profileId: string,
    ruleId: string,
    change: Partial<HighlightRule>,
    created?: Partial<CreatedItems>,
  ) =>
    updateProfiles(
      profiles.map((item) =>
        item.id === profileId
          ? {
              ...item,
              rules: item.rules.map((rule) =>
                rule.id === ruleId ? { ...rule, ...change } : rule,
              ),
            }
          : item,
      ),
      created,
    );
  const toggleProfile = (id: string, keepOthers = false) =>
    setState((previous) => ({
      ...previous,
      selected: id,
      expandedProfiles: previous.expandedProfiles.includes(id)
        ? previous.expandedProfiles.filter((value) => value !== id)
        : keepOthers
          ? [...previous.expandedProfiles, id]
          : [id],
    }));
  const toggleRule = (id: string, keepOthers = false) =>
    profile &&
    setState((previous) => {
      const values = ownValue(previous.expandedRules, profile.id) ?? [];
      return {
        ...previous,
        selectedRules: { ...previous.selectedRules, [profile.id]: id },
        expandedRules: {
          ...previous.expandedRules,
          [profile.id]: values.includes(id)
            ? values.filter((value) => value !== id)
            : keepOthers
              ? [...values, id]
              : [id],
        },
      };
    });
  const setProfileDraft = (id: string, draft: ProfileDraft | undefined) =>
    setState((previous) => ({
      ...previous,
      profileDrafts: draft
        ? { ...previous.profileDrafts, [id]: draft }
        : without(previous.profileDrafts, id),
    }));
  const setRuleDraft = (
    profileId: string,
    id: string,
    draft: RuleDraft | undefined,
  ) =>
    setState((previous) => {
      const drafts = ownValue(previous.ruleDrafts, profileId) ?? {};
      return {
        ...previous,
        ruleDrafts: {
          ...previous.ruleDrafts,
          [profileId]: draft ? { ...drafts, [id]: draft } : without(drafts, id),
        },
      };
    });
  const reorderProfiles = (id: string, target: number) => {
    const from = profiles.findIndex((item) => item.id === id);
    if (from >= 0 && target >= 0 && target < profiles.length && from !== target)
      updateProfiles(arrayMove(profiles, from, target));
  };
  const reorderRules = (id: string, target: number) => {
    if (!profile) return;
    const from = profile.rules.findIndex((item) => item.id === id);
    if (
      from >= 0 &&
      target >= 0 &&
      target < profile.rules.length &&
      from !== target
    )
      patchProfile(profile.id, {
        rules: arrayMove(profile.rules, from, target),
      });
  };
  const cancelDelete = () =>
    setState((previous) => ({ ...previous, confirming: undefined }));
  const removeProfile = (id: string) => {
    const index = profiles.findIndex((item) => item.id === id),
      remaining = profiles.filter((item) => item.id !== id);
    updateProfiles(remaining);
    setState((previous) => ({
      ...previous,
      confirming: undefined,
      selected:
        previous.selected === id || profile?.id === id
          ? remaining[Math.min(index, remaining.length - 1)]?.id
          : previous.selected,
      expandedProfiles: previous.expandedProfiles.filter(
        (value) => value !== id,
      ),
      expandedRules: without(previous.expandedRules, id),
      profileDrafts: without(previous.profileDrafts, id),
      ruleDrafts: without(previous.ruleDrafts, id),
      createdProfiles: previous.createdProfiles.filter((value) => value !== id),
      createdRules: without(previous.createdRules, id),
      selectedRules: without(previous.selectedRules, id),
    }));
  };
  const removeRule = (profileId: string, id: string) => {
    const owner = profiles.find((item) => item.id === profileId);
    if (!owner) return;
    const index = owner.rules.findIndex((item) => item.id === id),
      remaining = owner.rules.filter((item) => item.id !== id);
    patchProfile(profileId, { rules: remaining });
    setState((previous) => ({
      ...previous,
      confirming: undefined,
      selectedRules: {
        ...previous.selectedRules,
        [profileId]: remaining[Math.min(index, remaining.length - 1)]?.id ?? "",
      },
      expandedRules: {
        ...previous.expandedRules,
        [profileId]: (ownValue(previous.expandedRules, profileId) ?? []).filter(
          (value) => value !== id,
        ),
      },
      createdRules: {
        ...previous.createdRules,
        [profileId]: (ownValue(previous.createdRules, profileId) ?? []).filter(
          (value) => value !== id,
        ),
      },
      ruleDrafts: {
        ...previous.ruleDrafts,
        [profileId]: without(
          ownValue(previous.ruleDrafts, profileId) ?? {},
          id,
        ),
      },
    }));
  };
  const beginProfileEdit = (item: HighlightProfile, keepOthers = false) => {
    setState((previous) => ({
      ...previous,
      selected: item.id,
      confirming: undefined,
      expandedProfiles: previous.expandedProfiles.includes(item.id)
        ? previous.expandedProfiles
        : keepOthers
          ? [...previous.expandedProfiles, item.id]
          : [item.id],
      profileDrafts: {
        ...previous.profileDrafts,
        [item.id]: ownValue(previous.profileDrafts, item.id) ?? {
          name: item.name,
          groupPattern: item.groupPattern,
          groupIgnoreCase: item.groupIgnoreCase,
        },
      },
    }));
  };
  const beginRuleEdit = (item: HighlightRule, keepOthers = false) => {
    if (!profile) return;
    const { id, enabled, ...config } = item;
    setState((previous) => {
      const expanded = ownValue(previous.expandedRules, profile.id) ?? [];
      const drafts = ownValue(previous.ruleDrafts, profile.id) ?? {};
      return {
        ...previous,
        confirming: undefined,
        selectedRules: { ...previous.selectedRules, [profile.id]: item.id },
        expandedRules: {
          ...previous.expandedRules,
          [profile.id]: expanded.includes(item.id)
            ? expanded
            : keepOthers
              ? [...expanded, item.id]
              : [item.id],
        },
        ruleDrafts: {
          ...previous.ruleDrafts,
          [profile.id]: {
            ...drafts,
            [item.id]: ownValue(drafts, item.id) ?? structuredClone(config),
          },
        },
      };
    });
  };
  const cancelProfileEdit = (id: string) => {
    if (state.createdProfiles.includes(id)) removeProfile(id);
    else setProfileDraft(id, undefined);
  };
  const cancelRuleEdit = (profileId: string, id: string) => {
    if ((ownValue(state.createdRules, profileId) ?? []).includes(id))
      removeRule(profileId, id);
    else setRuleDraft(profileId, id, undefined);
  };
  const saveProfile = (item: HighlightProfile) => {
    const draft = ownValue(state.profileDrafts, item.id);
    if (!draft || profileDraftError(draft)) return;
    patchProfile(item.id, draft, {
      createdProfiles: state.createdProfiles.filter((id) => id !== item.id),
    });
    setState((previous) => ({
      ...previous,
      profileDrafts: without(previous.profileDrafts, item.id),
    }));
  };
  const saveRule = (profileId: string, item: HighlightRule) => {
    const drafts = ownValue(state.ruleDrafts, profileId) ?? {},
      draft = ownValue(drafts, item.id);
    if (!draft || ruleDraftError(draft)) return;
    patchRule(profileId, item.id, draft, {
      createdRules: {
        ...state.createdRules,
        [profileId]: (ownValue(state.createdRules, profileId) ?? []).filter(
          (id) => id !== item.id,
        ),
      },
    });
    setState((previous) => ({
      ...previous,
      ruleDrafts: {
        ...previous.ruleDrafts,
        [profileId]: without(
          ownValue(previous.ruleDrafts, profileId) ?? {},
          item.id,
        ),
      },
    }));
  };
  const addProfile = (keepOthers = false) => {
    if (profiles.length >= 20) return;
    const item: HighlightProfile = {
      id: crypto.randomUUID(),
      name: "New profile",
      enabled: true,
      groupPattern: "",
      groupIgnoreCase: false,
      rules: [newRule()],
    };
    updateProfiles([...profiles, item], {
      createdProfiles: [...state.createdProfiles, item.id],
    });
    setState((previous) => ({
      ...previous,
      selected: item.id,
      confirming: undefined,
      expandedProfiles: keepOthers
        ? [...previous.expandedProfiles, item.id]
        : [item.id],
      profileDrafts: {
        ...previous.profileDrafts,
        [item.id]: {
          name: item.name,
          groupPattern: "",
          groupIgnoreCase: false,
        },
      },
    }));
  };
  const addRule = (keepOthers = false) => {
    if (!profile || profile.rules.length >= 20) return;
    const item = newRule();
    const { id, enabled, ...config } = item;
    patchProfile(
      profile.id,
      { rules: [...profile.rules, item] },
      {
        createdRules: {
          ...state.createdRules,
          [profile.id]: [
            ...(ownValue(state.createdRules, profile.id) ?? []),
            item.id,
          ],
        },
      },
    );
    setState((previous) => ({
      ...previous,
      confirming: undefined,
      selectedRules: { ...previous.selectedRules, [profile.id]: item.id },
      expandedRules: {
        ...previous.expandedRules,
        [profile.id]: keepOthers
          ? [...(ownValue(previous.expandedRules, profile.id) ?? []), item.id]
          : [item.id],
      },
      ruleDrafts: {
        ...previous.ruleDrafts,
        [profile.id]: {
          ...(ownValue(previous.ruleDrafts, profile.id) ?? {}),
          [item.id]: config,
        },
      },
    }));
  };
  const profileIndex = profile ? profiles.indexOf(profile) : -1,
    ruleIndex =
      profile && selectedRule ? profile.rules.indexOf(selectedRule) : -1;
  return (
    <div
      className="highlight-editor"
      data-preview-enabled={previewEnabled && Boolean(profile)}
      data-preview-open={previewEnabled && state.previewOpened}
      style={
        {
          "--highlight-profiles-width": `${widthRatio}fr`,
          "--highlight-rules-width": `${1 - widthRatio}fr`,
          "--highlight-profiles-height": `${heightRatio}fr`,
          "--highlight-rules-height": `${1 - heightRatio}fr`,
          "--highlight-tables-share": `${tablesRatio}fr`,
          "--highlight-preview-share": `${1 - tablesRatio}fr`,
        } as CSSProperties
      }
    >
      <div className="highlight-master-detail highlight-table-lists">
        <section className="highlight-profile-list" aria-label="Profiles">
          <header className="highlight-panel-heading">
            <Text size="sm" fw={600}>
              Profiles ({profiles.length})
            </Text>
            <div className="toolbar-spacer" />
            <ActionIcon
              size="sm"
              variant="subtle"
              aria-label={`Move profile ${profileIndex + 1} up`}
              disabled={profileIndex <= 0}
              onClick={() =>
                profile && reorderProfiles(profile.id, profileIndex - 1)
              }
            >
              <IconArrowUp size={14} />
            </ActionIcon>
            <ActionIcon
              size="sm"
              variant="subtle"
              aria-label={`Move profile ${profileIndex + 1} down`}
              disabled={profileIndex < 0 || profileIndex >= profiles.length - 1}
              onClick={() =>
                profile && reorderProfiles(profile.id, profileIndex + 1)
              }
            >
              <IconArrowDown size={14} />
            </ActionIcon>
            <ActionIcon
              size="sm"
              aria-label="Add profile"
              data-tooltip="Add profile"
              disabled={profiles.length >= 20}
              onClick={(event) => addProfile(event.shiftKey)}
            >
              <IconPlus size={16} />
            </ActionIcon>
          </header>
          <div className="highlight-items-scroll">
            <DndContext
              sensors={sensors}
              collisionDetection={tableCollisionDetection}
              onDragStart={({ active }) => selectProfile(String(active.id))}
              onDragEnd={({ active, over }) =>
                over &&
                reorderProfiles(
                  String(active.id),
                  profiles.findIndex((item) => item.id === over.id),
                )
              }
            >
              <SortableContext
                items={profiles.map((item) => item.id)}
                strategy={verticalListSortingStrategy}
              >
                <table
                  className="highlight-items-table highlight-profiles-table"
                  aria-label="Highlight profiles"
                >
                  <colgroup>
                    <col className="highlight-col-grip" />
                    <col className="highlight-col-expand" />
                    <col className="highlight-col-priority" />
                    <col className="highlight-col-enabled" />
                    <col />
                    <col />
                    <col className="highlight-col-count" />
                    <col className="highlight-col-actions" />
                  </colgroup>
                  <thead>
                    <tr>
                      <th />
                      <th />
                      <th>#</th>
                      <th>On</th>
                      <th>Name</th>
                      <th>Log groups</th>
                      <th>Rules</th>
                      <th />
                    </tr>
                  </thead>
                  {profiles.map((item, index) => {
                    const draft = ownValue(state.profileDrafts, item.id),
                      expanded = state.expandedProfiles.includes(item.id);
                    const confirming =
                      state.confirming?.kind === "profile" &&
                      state.confirming.profileId === item.id;
                    return (
                      <ItemRow
                        key={item.id}
                        id={item.id}
                        kind="profile"
                        label={item.name || "Untitled profile"}
                        position={index}
                        selected={profile?.id === item.id}
                        expanded={expanded}
                        editing={Boolean(draft)}
                        confirming={confirming}
                        columns={8}
                        onSelect={() => selectProfile(item.id)}
                        onExpand={(keep) => toggleProfile(item.id, keep)}
                        isNew={state.createdProfiles.includes(item.id)}
                        invalid={Boolean(draft && profileDraftError(draft))}
                        onEdit={(keep) => beginProfileEdit(item, keep)}
                        onSave={() => saveProfile(item)}
                        onCancelEdit={() => cancelProfileEdit(item.id)}
                        onCancelDelete={cancelDelete}
                        onConfirmDelete={() => removeProfile(item.id)}
                        onDelete={() =>
                          setState((previous) => ({
                            ...previous,
                            confirming: { kind: "profile", profileId: item.id },
                          }))
                        }
                        detail={
                          <ProfileFields
                            draft={
                              draft ?? {
                                name: item.name,
                                groupPattern: item.groupPattern,
                                groupIgnoreCase: item.groupIgnoreCase,
                              }
                            }
                            readOnly={!draft}
                            onChange={(change) =>
                              draft &&
                              setProfileDraft(item.id, { ...draft, ...change })
                            }
                          />
                        }
                      >
                        <td
                          onClick={(event) => event.stopPropagation()}
                          onDoubleClick={(event) => event.stopPropagation()}
                        >
                          <Switch
                            size="xs"
                            aria-label={`Profile ${item.name || "Untitled profile"} enabled`}
                            checked={item.enabled}
                            onChange={(event) =>
                              patchProfile(item.id, {
                                enabled: event.currentTarget.checked,
                              })
                            }
                          />
                        </td>
                        <td data-tooltip={item.name}>
                          <span className="highlight-rule-ellipsis">
                            {item.name || "Untitled profile"}
                            {draft && (
                              <small className="highlight-draft-dot"> ·</small>
                            )}
                          </span>
                        </td>
                        <td
                          data-tooltip={item.groupPattern || "All log groups"}
                        >
                          <code className="highlight-rule-ellipsis">
                            {item.groupPattern || "All groups"}
                          </code>
                        </td>
                        <td>{item.rules.length}</td>
                      </ItemRow>
                    );
                  })}
                </table>
              </SortableContext>
            </DndContext>
            {!profiles.length && (
              <Text size="sm" c="dimmed" p="md">
                Add a profile to configure highlight rules.
              </Text>
            )}
          </div>
        </section>
        <HighlightPaneDivider
          label="Resize profile and rule lists"
          values={{
            x: state.listWidthRatio ?? 0.85 / 2.2,
            y: state.listHeightRatio ?? 0.5,
          }}
          onDraft={(axis, value) =>
            sizeDraft(
              axis === "x" ? "listWidthRatio" : "listHeightRatio",
              value,
            )
          }
          onCommit={(axis, value) =>
            sizeCommit(
              axis === "x" ? "listWidthRatio" : "listHeightRatio",
              value,
            )
          }
        />
        <section className="highlight-rule-list" aria-label="Rules">
          <header className="highlight-panel-heading">
            <Text
              size="sm"
              fw={600}
              className="highlight-list-title"
              data-tooltip={profile?.name}
            >
              Rules
              {profile
                ? ` (${profile.rules.length}) · ${profile.name || "Untitled profile"}`
                : ""}
            </Text>
            <div className="toolbar-spacer" />
            <ActionIcon
              size="sm"
              variant="subtle"
              aria-label={`Move rule ${ruleIndex + 1} up`}
              disabled={ruleIndex <= 0}
              onClick={() =>
                selectedRule && reorderRules(selectedRule.id, ruleIndex - 1)
              }
            >
              <IconArrowUp size={14} />
            </ActionIcon>
            <ActionIcon
              size="sm"
              variant="subtle"
              aria-label={`Move rule ${ruleIndex + 1} down`}
              disabled={
                ruleIndex < 0 || ruleIndex >= (profile?.rules.length ?? 0) - 1
              }
              onClick={() =>
                selectedRule && reorderRules(selectedRule.id, ruleIndex + 1)
              }
            >
              <IconArrowDown size={14} />
            </ActionIcon>
            <ActionIcon
              size="sm"
              aria-label="Add rule"
              data-tooltip="Add rule"
              disabled={!profile || profile.rules.length >= 20}
              onClick={(event) => addRule(event.shiftKey)}
            >
              <IconPlus size={16} />
            </ActionIcon>
          </header>
          <div className="highlight-items-scroll">
            <DndContext
              sensors={sensors}
              collisionDetection={tableCollisionDetection}
              onDragStart={({ active }) => selectRule(String(active.id))}
              onDragEnd={({ active, over }) =>
                over &&
                reorderRules(
                  String(active.id),
                  profile?.rules.findIndex((item) => item.id === over.id) ?? -1,
                )
              }
            >
              <SortableContext
                items={profile?.rules.map((item) => item.id) ?? []}
                strategy={verticalListSortingStrategy}
              >
                <table
                  className="highlight-items-table highlight-rules-table"
                  aria-label="Highlight rules"
                >
                  <colgroup>
                    <col className="highlight-col-grip" />
                    <col className="highlight-col-expand" />
                    <col className="highlight-col-priority" />
                    <col className="highlight-col-enabled" />
                    <col className="highlight-col-scope" />
                    <col />
                    <col className="highlight-col-colors" />
                    <col className="highlight-col-actions" />
                  </colgroup>
                  <thead>
                    <tr>
                      <th />
                      <th />
                      <th>#</th>
                      <th>On</th>
                      <th>Search / highlight</th>
                      <th>Regex</th>
                      <th>Colors</th>
                      <th />
                    </tr>
                  </thead>
                  {profile?.rules.map((item, index) => {
                    const draft = ownValue(
                        ownValue(state.ruleDrafts, profile.id) ?? {},
                        item.id,
                      ),
                      expanded = (
                        ownValue(state.expandedRules, profile.id) ?? []
                      ).includes(item.id);
                    const confirming =
                      state.confirming?.kind === "rule" &&
                      state.confirming.profileId === profile.id &&
                      state.confirming.ruleId === item.id;
                    return (
                      <ItemRow
                        key={profile.id + ":" + item.id}
                        id={item.id}
                        kind="rule"
                        label={String(index + 1)}
                        position={index}
                        selected={selectedRule?.id === item.id}
                        expanded={expanded}
                        editing={Boolean(draft)}
                        confirming={confirming}
                        columns={8}
                        onSelect={() => selectRule(item.id)}
                        onExpand={(keep) => toggleRule(item.id, keep)}
                        isNew={(
                          ownValue(state.createdRules, profile.id) ?? []
                        ).includes(item.id)}
                        invalid={Boolean(draft && ruleDraftError(draft))}
                        onEdit={(keep) => beginRuleEdit(item, keep)}
                        onSave={() => saveRule(profile.id, item)}
                        onCancelEdit={() => cancelRuleEdit(profile.id, item.id)}
                        onCancelDelete={cancelDelete}
                        onConfirmDelete={() => removeRule(profile.id, item.id)}
                        onDelete={() =>
                          setState((previous) => ({
                            ...previous,
                            confirming: {
                              kind: "rule",
                              profileId: profile.id,
                              ruleId: item.id,
                            },
                          }))
                        }
                        detail={
                          <RuleFields
                            draft={draft ?? item}
                            readOnly={!draft}
                            onChange={(change) =>
                              draft &&
                              setRuleDraft(profile.id, item.id, {
                                ...draft,
                                ...change,
                              })
                            }
                          />
                        }
                      >
                        <td
                          onClick={(event) => event.stopPropagation()}
                          onDoubleClick={(event) => event.stopPropagation()}
                        >
                          <Switch
                            size="xs"
                            aria-label={`Rule ${index + 1} enabled`}
                            checked={item.enabled}
                            onChange={(event) =>
                              patchRule(profile.id, item.id, {
                                enabled: event.currentTarget.checked,
                              })
                            }
                          />
                        </td>
                        <td
                          data-tooltip={
                            item.scope === "structured"
                              ? `Structured property: ${item.path || "(root)"}`
                              : "Entire message"
                          }
                        >
                          <span className="highlight-rule-ellipsis">
                            {item.scope === "structured"
                              ? item.path || "Root"
                              : "Message"}
                          </span>
                          <small>
                            {item.target === "row"
                              ? "Entire row"
                              : "Match text"}
                          </small>
                        </td>
                        <td
                          data-tooltip={
                            item.pattern +
                            (item.ignoreCase ? " (ignore case)" : "")
                          }
                        >
                          <code className="highlight-rule-ellipsis">
                            {item.pattern || "—"}
                            {draft && (
                              <small className="highlight-draft-dot"> ·</small>
                            )}
                          </code>
                        </td>
                        <td>
                          <ColorSwatches rule={item} />
                        </td>
                      </ItemRow>
                    );
                  })}
                </table>
              </SortableContext>
            </DndContext>
            {!profile?.rules.length && (
              <Text size="sm" c="dimmed" p="md">
                {profile
                  ? "No rules in this profile."
                  : "Select a profile to view its rules."}
              </Text>
            )}
          </div>
        </section>
      </div>
      {previewEnabled && profile && state.previewOpened && (
        <HighlightPaneDivider
          label="Resize highlight preview"
          defaultAxis="y"
          values={{
            x: state.tablesRatio ?? 1 / 1.85,
            y: state.tablesRatio ?? 1 / 1.85,
          }}
          onDraft={(_, value) => sizeDraft("tablesRatio", value)}
          onCommit={(_, value) => sizeCommit("tablesRatio", value)}
        />
      )}
      {previewEnabled && profile && (
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
            Preview{" "}
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
      )}
      <Text size="xs" c="dimmed" className="highlight-editor-note">
        Drag to change priority · Space and arrow keys also reorder. Up to 20
        profiles and 20 rules each.
      </Text>
    </div>
  );
}
