import { expect, it } from "vitest";
import { createWorkspace, restoreWorkspace } from "../src/renderer/workspace";
import { workspaceSchema } from "../src/main/security";
import {
  explorerProfiles,
  setProfileRegion,
  knownProfileNames,
  profileIsEnabled,
} from "../src/renderer/explorer-configuration";
import { AWS_REGIONS } from "../src/shared/aws-regions";

it("restores old connections as visible and persists disabled region/profile selections without removing tabs", () => {
  const workspace = createWorkspace();
  workspace.connections.push({
    ...workspace.connections[0],
    id: "prod",
    mode: "aws",
    profile: "production",
    region: "us-east-1",
    enabled: false,
  });
  workspace.preferences.profileVisibility = { production: false };
  const restored = restoreWorkspace(workspace);
  expect(restored.connections[0].enabled).not.toBe(false);
  expect(restored.connections[1].enabled).toBe(false);
  expect(workspaceSchema.parse(restored).preferences.profileVisibility).toEqual(
    { production: false },
  );
  expect(restored.tabs).toEqual(workspace.tabs);
  expect(
    explorerProfiles(
      restored.connections,
      restored.preferences,
      restored.activeConnectionId!,
    ),
  ).toHaveLength(1);
});
it("lists known and configured profiles, preserves selected regions when disabled and groups enabled regions by profile", () => {
  const workspace = createWorkspace();
  const prod = {
    ...workspace.connections[0],
    id: "prod",
    mode: "aws" as const,
    profile: "production",
    region: "us-east-1",
  };
  const connections = [
    ...workspace.connections,
    prod,
    { ...prod, id: "europe", region: "eu-west-1" },
  ];
  expect(knownProfileNames(["development", "production"], connections)).toEqual(
    ["development", "production"],
  );
  expect(profileIsEnabled("production", connections, {})).toBe(true);
  expect(profileIsEnabled("development", connections, {})).toBe(false);
  expect(
    explorerProfiles(
      connections,
      { profileVisibility: { production: false } },
      prod.id,
    ).flatMap((account) => account.connections),
  ).toEqual(workspace.connections);
  expect(
    explorerProfiles(connections, {}, prod.id)
      .find((account) => account.profile === "production")
      ?.connections.map((c) => c.region),
  ).toEqual(["eu-west-1", "us-east-1"]);
});
it("enables known regions idempotently, retains old IDs and tabs, and deduplicates endpoints", () => {
  const workspace = createWorkspace();
  const prod = {
    ...workspace.connections[0],
    id: "prod",
    mode: "aws" as const,
    profile: "production",
    region: "us-east-1",
  };
  let connections = [...workspace.connections, prod];
  connections = setProfileRegion(
    connections,
    "production",
    "us-east-1",
    false,
    () => "unused",
  );
  expect(connections.find((c) => c.id === "prod")?.enabled).toBe(false);
  connections = setProfileRegion(
    connections,
    "production",
    "us-east-1",
    true,
    () => "unused",
  );
  expect(connections.find((c) => c.id === "prod")?.enabled).toBe(true);
  connections = setProfileRegion(
    connections,
    "production",
    "eu-west-1",
    true,
    () => "europe",
  );
  expect(
    setProfileRegion(
      connections,
      "production",
      "eu-west-1",
      true,
      () => "extra",
    ),
  ).toHaveLength(3);
  const duplicate = { ...prod, id: "second-role-name" };
  expect(
    explorerProfiles([...connections, duplicate], {}, duplicate.id)
      .find((a) => a.profile === "production")
      ?.connections.find((c) => c.region === "us-east-1")?.id,
  ).toBe(duplicate.id);
});
it("offers installed SDK region names without pseudo-global regions and enforces the connection bound", () => {
  expect(
    AWS_REGIONS.find((region) => region.id === "eu-west-1")?.name,
  ).toContain("Ireland");
  expect(AWS_REGIONS.some((region) => region.id === "aws-global")).toBe(false);
  expect(new Set(AWS_REGIONS.map((region) => region.id)).size).toBe(
    AWS_REGIONS.length,
  );
  const connection = createWorkspace().connections[0];
  expect(() =>
    setProfileRegion(
      Array.from({ length: 50 }, (_, index) => ({
        ...connection,
        id: String(index),
      })),
      "new",
      "us-east-1",
      true,
      () => "new",
    ),
  ).toThrow(/50/);
});

it("treats profile names that match JavaScript object properties as ordinary names", () => {
  expect(profileIsEnabled("constructor", [], {})).toBe(false);
  expect(profileIsEnabled("__proto__", [], {})).toBe(false);
  expect(
    profileIsEnabled(
      "constructor",
      [
        {
          ...createWorkspace().connections[0],
          mode: "aws",
          profile: "constructor",
        },
      ],
      {},
    ),
  ).toBe(true);
});
