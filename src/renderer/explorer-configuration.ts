import type { Connection, Preferences } from "../shared/contracts";

export interface ExplorerProfile {
  key: string;
  profile: string;
  mode: Connection["mode"];
  label: string;
  connections: Connection[];
}
export const profileIsEnabled = (
  profile: string,
  connections: Connection[],
  visibility: Record<string, boolean>,
) =>
  (Object.hasOwn(visibility, profile) ? visibility[profile] : undefined) ??
  connections.some(
    (connection) => connection.mode === "aws" && connection.profile === profile,
  );
export function knownProfileNames(
  known: string[],
  connections: Connection[],
): string[] {
  return [
    ...new Set([
      ...known,
      ...connections
        .filter((connection) => connection.mode === "aws")
        .map((connection) => connection.profile),
    ]),
  ].sort((a, b) => a.localeCompare(b));
}
export function explorerProfiles(
  connections: Connection[],
  preferences: Pick<Preferences, "profileVisibility">,
  activeId: string,
): ExplorerProfile[] {
  const accounts = new Map<string, ExplorerProfile>();
  for (const connection of connections) {
    if (
      connection.enabled === false ||
      (connection.mode === "aws" &&
        !profileIsEnabled(
          connection.profile,
          connections,
          preferences.profileVisibility ?? {},
        ))
    )
      continue;
    const key = JSON.stringify([connection.mode, connection.profile]);
    let account = accounts.get(key);
    if (!account) {
      account = {
        key,
        profile: connection.profile,
        mode: connection.mode,
        label:
          connection.mode === "offline"
            ? `Offline fixtures · ${connection.profile}`
            : connection.profile,
        connections: [],
      };
      accounts.set(key, account);
    }
    const existing = account.connections.findIndex(
      (item) => item.region === connection.region,
    );
    if (existing < 0) account.connections.push(connection);
    else if (connection.id === activeId)
      account.connections[existing] = connection;
  }
  const result = [...accounts.values()].sort(
    (a, b) =>
      a.mode.localeCompare(b.mode) || a.profile.localeCompare(b.profile),
  );
  for (const account of result)
    account.connections.sort((a, b) => a.region.localeCompare(b.region));
  return result;
}
export function setProfileRegion(
  connections: Connection[],
  profile: string,
  region: string,
  enabled: boolean,
  nextId: () => string,
): Connection[] {
  if (
    !profile.trim() ||
    profile.length > 256 ||
    !/^[a-z]{2}(?:-[a-z]+)+-\d+$/.test(region)
  )
    throw new Error("Choose a valid profile and region.");
  const existing = connections.some(
    (connection) =>
      connection.mode === "aws" &&
      connection.profile === profile &&
      connection.region === region,
  );
  if (existing)
    return connections.map((connection) =>
      connection.mode === "aws" &&
      connection.profile === profile &&
      connection.region === region
        ? { ...connection, enabled }
        : connection,
    );
  if (!enabled) return connections;
  if (connections.length >= 50)
    throw new Error(
      "A workspace can configure at most 50 connection regions. Remove an unused advanced connection before adding another.",
    );
  return [
    ...connections,
    {
      id: nextId(),
      name: `${profile} · ${region}`.slice(0, 120),
      profile,
      region,
      mode: "aws",
      enabled: true,
    },
  ];
}
