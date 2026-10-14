import { expect, it } from "vitest";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { WorkspaceStore } from "../src/main/persistence";

it("rejects oversize Unicode by bytes before it can become unreadable at startup", async () => {
  const dir = await mkdtemp(join(tmpdir(), "explorer-bytes-"));
  try {
    await expect(
      new WorkspaceStore(dir).save({ value: "測".repeat(1_800_000) }),
    ).rejects.toThrow(/size limit/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
it("recovers a JSON-valid but invalid workspace from a schema-valid backup", async () => {
  const dir = await mkdtemp(join(tmpdir(), "explorer-schema-"));
  const validate = (value: unknown) => {
    if (
      !value ||
      typeof value !== "object" ||
      !("name" in value) ||
      typeof value.name !== "string"
    )
      throw new Error("Invalid workspace");
    return value;
  };
  try {
    const store = new WorkspaceStore(dir, validate);
    await store.save({ name: "good" });
    await store.save({ name: "latest" });
    await writeFile(join(dir, "workspace.json"), '{"name":42}');
    expect((await store.load()).workspace).toEqual({ name: "good" });
    await store.save({ name: "recovered" });
    await writeFile(join(dir, "workspace.json"), '{"name":42}');
    expect((await store.load()).workspace).toEqual({ name: "good" });
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
