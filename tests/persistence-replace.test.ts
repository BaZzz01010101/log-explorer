import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it } from "vitest";
import { replaceFile, WorkspaceStore } from "../src/main/persistence";

const locked = (code: string) =>
  Object.assign(new Error(`${code}: file in use`), { code });

it("retries a replace while another process briefly holds the file", async () => {
  let calls = 0;
  await replaceFile("from", "to", async () => {
    calls++;
    if (calls < 3) throw locked("EPERM");
  });
  expect(calls).toBe(3);
});

it("does not retry other errors and gives up on a lock that persists", async () => {
  let calls = 0;
  await expect(
    replaceFile("from", "to", async () => {
      calls++;
      throw locked("ENOSPC");
    }),
  ).rejects.toThrow("ENOSPC");
  expect(calls).toBe(1);
  calls = 0;
  await expect(
    replaceFile("from", "to", async () => {
      calls++;
      throw locked("EBUSY");
    }),
  ).rejects.toThrow("EBUSY");
  expect(calls).toBe(21);
});

let directory = "";
afterEach(async () => {
  if (directory) await rm(directory, { recursive: true, force: true });
  directory = "";
});

// On Windows a concurrent reader makes a plain rename fail with EPERM almost
// every time; saves must still land.
it("saves while another reader keeps polling the workspace file", async () => {
  directory = await mkdtemp(join(tmpdir(), "workspace-replace-"));
  const store = new WorkspaceStore(directory);
  await store.save({ version: 0 });
  let reading = true;
  // Reads every couple of milliseconds, like an aggressive scanner; a reader
  // with no pause at all can starve the writer under heavy machine load.
  const reader = (async () => {
    while (reading) {
      await readFile(join(directory, "workspace.json"), "utf8").catch(() => {});
      await new Promise((done) => setTimeout(done, 2));
    }
  })();
  try {
    for (let version = 1; version <= 20; version++)
      await store.save({ version, padding: "x".repeat(100_000) });
  } finally {
    reading = false;
    await reader;
  }
  const saved = JSON.parse(
    await readFile(join(directory, "workspace.json"), "utf8"),
  );
  expect(saved.version).toBe(20);
});
