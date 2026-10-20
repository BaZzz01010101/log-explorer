import { expect, it, vi } from "vitest";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { resolve, join } from "node:path";
import { AwsAccessPreference } from "../src/main/aws-access-preference";
import { setAwsAccess } from "../src/main/aws-access-toggle";

it("persists revocation before waiting for live-query cleanup", async () => {
  const root = resolve(".tmp/aws-access-toggle");
  await mkdir(root, { recursive: true });
  const directory = await mkdtemp(join(root, "case-"));
  const path = join(directory, "access-settings.json");
  let finish!: () => void;
  const pendingCleanup = new Promise<void>((resolve) => {
    finish = resolve;
  });
  const access = new AwsAccessPreference(true, path);
  access.setEnabled(true);
  const request = setAwsAccess(access, false, () => pendingCleanup);
  try {
    expect(access.enabled).toBe(false);
    expect(new AwsAccessPreference(true, path).enabled).toBe(false);
  } finally {
    finish();
    await request;
    await rm(directory, { recursive: true, force: true });
  }
});

it("attempts cleanup even if persisting revocation fails", async () => {
  const shutdown = vi.fn(async () => {});
  await expect(
    setAwsAccess(
      {
        setEnabled() {
          throw new Error("write failed");
        },
      },
      false,
      shutdown,
    ),
  ).rejects.toThrow("write failed");
  expect(shutdown).toHaveBeenCalledOnce();
});

it("leaves access revoked when cleanup fails", async () => {
  const setEnabled = vi.fn();
  await expect(
    setAwsAccess({ setEnabled }, false, async () => {
      throw new Error("cleanup failed");
    }),
  ).rejects.toThrow("cleanup failed");
  expect(setEnabled).toHaveBeenCalledExactlyOnceWith(false);
});

it("enables access without shutting down queries", async () => {
  const setEnabled = vi.fn(),
    shutdown = vi.fn(async () => {});
  await setAwsAccess({ setEnabled }, true, shutdown);
  expect(setEnabled).toHaveBeenCalledExactlyOnceWith(true);
  expect(shutdown).not.toHaveBeenCalled();
});
