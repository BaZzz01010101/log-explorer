import { useState, type Dispatch, type SetStateAction } from "react";
import {
  ActionIcon,
  Alert,
  Badge,
  Group,
  Paper,
  Stack,
  Text,
} from "@mantine/core";
import { IconX } from "@tabler/icons-react";
import type { Connection, Preferences } from "../../shared/contracts";
import { AWS_REGIONS } from "../../shared/aws-regions";
import {
  knownProfileNames,
  profileIsEnabled,
  setProfileRegion,
} from "../explorer-configuration";
import { ConnectionAddPicker } from "./ConnectionAddPicker";
import { SettingLabel } from "./SettingLabel";

export interface ProfileConnectionsEditorState {
  profileToAdd: string | null;
  regionToAdd: Record<string, string | null>;
  error: string;
}

export function createProfileConnectionsEditorState(): ProfileConnectionsEditorState {
  return { profileToAdd: null, regionToAdd: {}, error: "" };
}

export function ProfileConnectionsEditor({
  connections,
  preferences,
  knownProfiles,
  discoveryEnabled,
  onConnections,
  onVisibility,
  uiState,
  onUiStateChange,
}: {
  connections: Connection[];
  preferences: Preferences;
  knownProfiles: string[];
  discoveryEnabled: boolean;
  onConnections(connections: Connection[]): void;
  onVisibility(value: Record<string, boolean>): void;
  uiState?: ProfileConnectionsEditorState;
  onUiStateChange?: Dispatch<SetStateAction<ProfileConnectionsEditorState>>;
}) {
  const [localUiState, setLocalUiState] = useState(
    createProfileConnectionsEditorState,
  );
  const { error } = uiState ?? localUiState;
  const setUiState = onUiStateChange ?? setLocalUiState;
  const setError = (error: string) =>
    setUiState((previous) => ({ ...previous, error }));
  const visibility = preferences.profileVisibility ?? {};
  const names = knownProfileNames(
    [...knownProfiles, ...Object.keys(visibility)],
    connections,
  ).filter((profile) => profile.trim() && profile.length <= 256);
  const added = names.filter((profile) =>
    profileIsEnabled(profile, connections, visibility),
  );
  const available = names.filter((profile) => !added.includes(profile));
  const changeVisibility = (profile: string, enabled: boolean) => {
    if (
      !Object.hasOwn(visibility, profile) &&
      Object.keys(visibility).length >= 50
    ) {
      setError("At most 50 profiles can have saved visibility choices.");
      return false;
    }
    onVisibility({ ...visibility, [profile]: enabled });
    setError("");
    return true;
  };
  const changeRegion = (profile: string, region: string, enabled: boolean) => {
    try {
      onConnections(
        setProfileRegion(connections, profile, region, enabled, () =>
          crypto.randomUUID(),
        ),
      );
      setError("");
      return true;
    } catch (error) {
      setError(error instanceof Error ? error.message : String(error));
      return false;
    }
  };
  return (
    <Stack gap="sm" className="profile-connections-editor">
      <SettingLabel
        label="Profiles and regions"
        help="Choose the profiles and regions shown in Explorer. Removing an entry keeps its saved connection and open tabs."
      />
      {error && (
        <Alert color="red" p="xs">
          {error}
        </Alert>
      )}
      <ConnectionAddPicker
        label="Add profile"
        searchLabel="Search profiles"
        placeholder="Search profiles…"
        options={available.map((profile) => ({
          value: profile,
          label: profile,
        }))}
        emptyMessage={
          discoveryEnabled
            ? "All known profiles have been added."
            : "No additional known profiles. Enable AWS access to discover local profiles."
        }
        noMatchesMessage="No profiles match your search."
        onSelect={(profile) => changeVisibility(profile, true)}
      />
      <div className="settings-profile-cards">
        {added.map((profile) => {
          const existing = connections.filter(
            (connection) =>
              connection.mode === "aws" && connection.profile === profile,
          );
          const selected = [
            ...new Set(
              existing
                .filter((connection) => connection.enabled !== false)
                .map((connection) => connection.region),
            ),
          ].sort();
          const catalog = [
            ...AWS_REGIONS.map((region) => ({
              value: region.id,
              label: region.id,
              description: region.name,
            })),
            ...[...new Set(existing.map((connection) => connection.region))]
              .filter((id) => !AWS_REGIONS.some((region) => region.id === id))
              .map((id) => ({
                value: id,
                label: id,
                description: "Custom configured region",
              })),
          ];
          const choices = catalog.filter(
            (region) => !selected.includes(region.value),
          );
          return (
            <Paper
              withBorder
              p="sm"
              key={profile}
              data-profile={profile}
              className="settings-profile-card"
            >
              <Stack gap="sm">
                <Group
                  justify="space-between"
                  wrap="nowrap"
                  className="settings-profile-heading"
                >
                  <Group gap="xs" className="settings-profile-title">
                    <Text
                      fw={600}
                      size="sm"
                      style={{ overflowWrap: "anywhere" }}
                    >
                      {profile}
                    </Text>
                    <Badge size="xs" variant="light">
                      {selected.length}{" "}
                      {selected.length === 1 ? "region" : "regions"}
                    </Badge>
                  </Group>
                  <ActionIcon
                    aria-label={`Remove profile ${profile}`}
                    variant="subtle"
                    color="red"
                    onClick={() => changeVisibility(profile, false)}
                  >
                    <IconX size={14} />
                  </ActionIcon>
                </Group>
                {selected.map((region) => (
                  <Group
                    key={region}
                    className="configured-region"
                    justify="space-between"
                    wrap="nowrap"
                  >
                    <div>
                      <Text size="xs" fw={500}>
                        {region}
                      </Text>
                      <Text size="xs" c="dimmed">
                        {AWS_REGIONS.find((item) => item.id === region)?.name ??
                          "Custom configured region"}
                      </Text>
                    </div>
                    <ActionIcon
                      size="sm"
                      variant="subtle"
                      color="red"
                      aria-label={`Remove ${profile} region ${region}`}
                      onClick={() => changeRegion(profile, region, false)}
                    >
                      <IconX size={13} />
                    </ActionIcon>
                  </Group>
                ))}
                <ConnectionAddPicker
                  label="Add region"
                  ariaLabel={`Add region for ${profile}`}
                  searchLabel={`Search regions for ${profile}`}
                  placeholder="Search regions or locations…"
                  options={choices}
                  emptyMessage="All known regions have been added."
                  noMatchesMessage="No regions match your search."
                  onSelect={(region) => changeRegion(profile, region, true)}
                />
              </Stack>
            </Paper>
          );
        })}
      </div>
    </Stack>
  );
}
