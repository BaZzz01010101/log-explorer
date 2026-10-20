import { expect, it } from "vitest";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { resolve, join } from "node:path";
import { AwsAccessPreference } from "../src/main/aws-access-preference";

it("persists explicit enable and revoke choices across restarts without workspace data", async () => {
  const root = resolve(".tmp/aws-access-preference");
  await mkdir(root, { recursive: true });
  const directory = await mkdtemp(join(root, "case-")),
    path = join(directory, "access-settings.json");
  try {
    const access = new AwsAccessPreference(true, path);
    expect(access.enabled).toBe(false);
    access.setEnabled(true);
    expect(JSON.parse(await readFile(path, "utf8"))).toEqual({
      awsEnabled: true,
    });
    expect(new AwsAccessPreference(true, path).enabled).toBe(true);
    new AwsAccessPreference(true, path).setEnabled(false);
    expect(new AwsAccessPreference(true, path).enabled).toBe(false);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

it("hard-offline and development modes ignore and never overwrite remembered access", async () => {
  const root = resolve(".tmp/aws-access-preference");
  await mkdir(root, { recursive: true });
  const directory = await mkdtemp(join(root, "case-")),
    path = join(directory, "access-settings.json");
  try {
    await writeFile(path, JSON.stringify({ awsEnabled: true }));
    const access = new AwsAccessPreference(false, path);
    expect(access.enabled).toBe(false);
    expect(() => access.setEnabled(true)).toThrow(/packaged|disabled/);
    access.setEnabled(false);
    expect(JSON.parse(await readFile(path, "utf8")).awsEnabled).toBe(true);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

it("revokes in-memory access even when a preference write fails", async () => {
  const root = resolve(".tmp/aws-access-preference");
  await mkdir(root, { recursive: true });
  const directory = await mkdtemp(join(root, "case-")),
    path = join(directory, "access-settings.json");
  try {
    const access = new AwsAccessPreference(true, path);
    access.setEnabled(true);
    await rm(path);
    await mkdir(path);
    expect(() => access.setEnabled(false)).toThrow();
    expect(access.enabled).toBe(false);
    expect(() => access.setEnabled(true)).toThrow();
    expect(access.enabled).toBe(false);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
