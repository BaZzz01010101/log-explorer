import {
  mkdtemp,
  readFile,
  readdir,
  rm,
  utimes,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LocalUpdates, localUpdateDirectory } from "../src/main/local-update";

let directory: string;
beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), "local-update-"));
});
afterEach(() => rm(directory, { recursive: true, force: true }));
const announce = (content: unknown, age = 0) => {
  const path = join(directory, "local-update.json");
  const at = new Date(Date.now() - age);
  return writeFile(
    path,
    typeof content === "string" ? content : JSON.stringify(content),
  ).then(() => utimes(path, at, at));
};

describe("local updates", () => {
  it.runIf(process.platform === "win32")(
    "looks only beside a packaged win-unpacked folder",
    () => {
      const executable = "D:\\app\\release\\win-unpacked\\AWS Log Explorer.exe";
      const base = { packaged: true, platform: "win32", executable };
      expect(localUpdateDirectory(base)).toBe("D:\\app\\release");
      expect(
        localUpdateDirectory({ ...base, packaged: false }),
      ).toBeUndefined();
      expect(
        localUpdateDirectory({ ...base, platform: "linux" }),
      ).toBeUndefined();
      expect(
        localUpdateDirectory({
          ...base,
          executable:
            "C:\\Program Files\\AWS Log Explorer\\AWS Log Explorer.exe",
        }),
      ).toBeUndefined();
    },
  );

  it("reports a waiting build, a newer one and its end", async () => {
    const changes = vi.fn();
    const updates = new LocalUpdates(directory, "0.1.1", changes);
    expect(await updates.check()).toBeNull();
    await announce({ version: "0.1.2", token: "a" });
    expect(await updates.check()).toBe("0.1.2");
    await updates.check();
    await announce({ version: "0.1.3", token: "b" });
    await updates.check();
    await rm(join(directory, "local-update.json"));
    await updates.check();
    expect(changes.mock.calls).toEqual([["0.1.2"], ["0.1.3"], [null]]);
  });

  it("ignores the running version, a script that stopped and damaged files", async () => {
    const updates = new LocalUpdates(directory, "0.1.1", () => {});
    for (const [content, age] of [
      [{ version: "0.1.1" }, 0],
      [{ version: "0.1.2" }, 60_000],
      [{ version: "../evil" }, 0],
      ["{", 0],
      [{ version: "0.1.2", padding: "x".repeat(5000) }, 0],
    ] as const) {
      await announce(content, age);
      expect(
        await updates.check(),
        JSON.stringify(content).slice(0, 40),
      ).toBeNull();
      expect(await updates.requestRestart([])).toBe(false);
    }
    expect(await readdir(directory)).toEqual(["local-update.json"]);
    expect(
      await new LocalUpdates(undefined, "0.1.1", () => {}).requestRestart([]),
    ).toBe(false);
  });

  it("asks for a restart and takes the request back", async () => {
    const updates = new LocalUpdates(directory, "0.1.1", () => {});
    await announce({ version: "0.1.2" });
    expect(await updates.requestRestart(["--flag"])).toBe(true);
    const path = join(directory, "local-update-restart.json");
    expect(JSON.parse(await readFile(path, "utf8"))).toEqual({
      version: "0.1.2",
      args: ["--flag"],
    });
    await updates.cancelRestart();
    expect(await readdir(directory)).toEqual(["local-update.json"]);
  });

  it("drops a request left by an earlier run when the app starts", async () => {
    await writeFile(join(directory, "local-update-restart.json"), "{}");
    const updates = new LocalUpdates(directory, "0.1.1", () => {});
    await updates.start();
    expect(await readdir(directory)).toEqual([]);
    updates.stop();
  });
});
