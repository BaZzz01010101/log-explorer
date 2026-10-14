import { describe, expect, it } from "vitest";
import { mkdtemp, readFile, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { WorkspaceStore } from "../src/main/persistence";

describe("atomic workspace persistence", () => {
  it("serializes concurrent writes and keeps a recoverable prior copy", async () => {
    const dir = await mkdtemp(join(tmpdir(), "log-explorer-test-"));
    try {
      const store = new WorkspaceStore(dir);
      await Promise.all([
        store.save({ version: 1, name: "one" }),
        store.save({ version: 1, name: "two" }),
      ]);
      expect((await store.load()).workspace).toEqual({
        version: 1,
        name: "two",
      });
      expect(
        JSON.parse(await readFile(join(dir, "workspace.backup.json"), "utf8")),
      ).toEqual({ version: 1, name: "one" });
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
  it("recovers corrupt JSON from backup with an explicit warning", async () => {
    const dir = await mkdtemp(join(tmpdir(), "log-explorer-test-"));
    try {
      const store = new WorkspaceStore(dir);
      await store.save({ version: 1, name: "good" });
      await store.save({ version: 1, name: "later" });
      await writeFile(join(dir, "workspace.json"), "{broken");
      const restored = await store.load();
      expect(restored.workspace).toEqual({ version: 1, name: "good" });
      expect(restored.warning).toMatch(/backup/);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
  it("recovers a valid backup when the primary workspace is missing", async () => {
    const dir = await mkdtemp(join(tmpdir(), "log-explorer-test-"));
    try {
      const store = new WorkspaceStore(dir);
      await store.save({ version: 1, name: "recoverable" });
      await store.save({ version: 1, name: "latest" });
      await rm(join(dir, "workspace.json"));
      const restored = await store.load();
      expect(restored.workspace).toEqual({ version: 1, name: "recoverable" });
      expect(restored.warning).toMatch(/backup/);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
  it("starts without a recovery warning when no workspace or backup exists", async () => {
    const dir = await mkdtemp(join(tmpdir(), "log-explorer-test-"));
    try {
      expect(await new WorkspaceStore(dir).load()).toEqual({ workspace: null });
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
