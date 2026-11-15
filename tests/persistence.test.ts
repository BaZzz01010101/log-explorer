import { describe, expect, it } from "vitest";
import {
  mkdtemp,
  readdir,
  readFile,
  writeFile,
  rm,
} from "node:fs/promises";
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
  it("keeps unreadable workspace files across later saves", async () => {
    const dir = await mkdtemp(join(tmpdir(), "log-explorer-test-"));
    try {
      await writeFile(join(dir, "workspace.json"), "{primary");
      await writeFile(join(dir, "workspace.backup.json"), "{backup");
      const store = new WorkspaceStore(dir);
      const restored = await store.load();
      expect(restored.workspace).toBeNull();
      expect(restored.warning).toMatch(/kept as workspace\.corrupt-/);
      await store.save({ version: 1, name: "fresh" });
      await store.save({ version: 1, name: "fresher" });
      const files = await readdir(dir);
      const primary = files.find((f) => /^workspace\.corrupt-/.test(f));
      const backup = files.find((f) => /^workspace\.backup\.corrupt-/.test(f));
      expect(await readFile(join(dir, primary!), "utf8")).toBe("{primary");
      expect(await readFile(join(dir, backup!), "utf8")).toBe("{backup");
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
