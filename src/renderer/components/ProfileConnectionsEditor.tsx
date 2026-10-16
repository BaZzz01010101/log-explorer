import { useState } from "react";
import { ownValue } from "../../shared/records";
import {
  ActionIcon,
  Alert,
  Badge,
  Button,
  Checkbox,
  Group,
  Paper,
  Select,
  Stack,
  Text,
} from "@mantine/core";
import { IconPlus, IconX } from "@tabler/icons-react";
import type { Connection, Preferences } from "../../shared/contracts";
import { AWS_REGIONS } from "../../shared/aws-regions";
import {
  knownProfileNames,
  profileIsEnabled,
  setProfileRegion,
} from "../explorer-configuration";

export function ProfileConnectionsEditor({
  connections,
  preferences,
  knownProfiles,
  discoveryEnabled,
  onConnections,
  onVisibility,
}: {
  connections: Connection[];
  preferences: Preferences;
  knownProfiles: string[];
  discoveryEnabled: boolean;
  onConnections(connections: Connection[]): void;
  onVisibility(value: Record<string, boolean>): void;
}) {
  const [profileToAdd, setProfileToAdd] = useState<string | null>(null);
  const [regionToAdd, setRegionToAdd] = useState<Record<string, string | null>>(
    {},
  );
  const [error, setError] = useState("");
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
    <Stack gap="sm">
      <Text size="sm" fw={600}>
        Profiles and regions
      </Text>
      <Text size="xs" c="dimmed">
        Add the profiles and regions you want in Explorer. Removing an entry
        keeps its saved connection and open tabs.
      </Text>
      {!discoveryEnabled && (
        <Alert color="blue" p="xs">
          Configured profiles remain editable. Enable the packaged AWS session
          above to discover additional local profile names.
        </Alert>
      )}
      {error && (
        <Alert color="red" p="xs">
          {error}
        </Alert>
      )}
      <Group align="end" wrap="nowrap">
        <Select
          label="Known profile"
          aria-label="Known profile to add"
          placeholder={
            available.length ? "Choose a profile…" : "No additional profiles"
          }
          searchable
          data={available}
          value={available.includes(profileToAdd ?? "") ? profileToAdd : null}
          onChange={setProfileToAdd}
          size="xs"
          style={{ flex: 1 }}
          disabled={!available.length}
        />
        <Button
          size="xs"
          aria-label="Add profile"
          leftSection={<IconPlus size={14} />}
          disabled={!profileToAdd || !available.includes(profileToAdd)}
          onClick={() => {
            if (
              profileToAdd &&
              available.includes(profileToAdd) &&
              changeVisibility(profileToAdd, true)
            )
              setProfileToAdd(null);
          }}
        >
          Add profile
        </Button>
      </Group>
      {!added.length && (
        <Text size="xs" c="dimmed">
          Add a profile to choose its regions.
        </Text>
      )}
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
            label: region.name + " · " + region.id,
          })),
          ...[...new Set(existing.map((connection) => connection.region))]
            .filter((id) => !AWS_REGIONS.some((region) => region.id === id))
            .map((id) => ({ value: id, label: id + " · Custom region" })),
        ];
        const choices = catalog.filter(
          (region) => !selected.includes(region.value),
        );
        const draft = ownValue(regionToAdd, profile) ?? null;
        return (
          <Paper withBorder p="sm" key={profile} data-profile={profile}>
            <Stack gap="sm">
              <Group justify="space-between" wrap="nowrap">
                <Group gap="xs" wrap="nowrap">
                  <Text fw={600} size="sm" style={{ overflowWrap: "anywhere" }}>
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
              {selected.length === 0 && (
                <Text size="xs" c="dimmed">
                  Add a region to show this profile in Explorer.
                </Text>
              )}
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
              <Group align="end" wrap="nowrap">
                <Select
                  aria-label={`Add region for ${profile}`}
                  placeholder="Choose a region or location…"
                  searchable
                  data={choices}
                  value={
                    choices.some((region) => region.value === draft)
                      ? draft
                      : null
                  }
                  onChange={(region) =>
                    setRegionToAdd((previous) => ({
                      ...previous,
                      [profile]: region,
                    }))
                  }
                  size="xs"
                  style={{ flex: 1 }}
                  disabled={!choices.length}
                />
                <Button
                  size="xs"
                  variant="light"
                  aria-label={`Confirm add region for ${profile}`}
                  disabled={!draft || selected.includes(draft)}
                  onClick={() => {
                    if (draft && changeRegion(profile, draft, true))
                      setRegionToAdd((previous) => ({
                        ...previous,
                        [profile]: null,
                      }));
                  }}
                >
                  Add region
                </Button>
              </Group>
            </Stack>
          </Paper>
        );
      })}
      {connections.some((connection) => connection.mode === "offline") && (
        <details>
          <summary>Offline fixture regions</summary>
          <Stack gap="xs" mt="xs">
            {connections
              .filter((connection) => connection.mode === "offline")
              .map((connection) => (
                <Checkbox
                  key={connection.id}
                  label={`${connection.name} · ${connection.region}`}
                  aria-label={`Show fixture connection ${connection.id}`}
                  checked={connection.enabled !== false}
                  onChange={(event) =>
                    onConnections(
                      connections.map((item) =>
                        item.id === connection.id
                          ? { ...item, enabled: event.currentTarget.checked }
                          : item,
                      ),
                    )
                  }
                />
              ))}
          </Stack>
        </details>
      )}
    </Stack>
  );
}
