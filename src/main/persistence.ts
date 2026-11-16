import {
  mkdir,
  readFile,
  writeFile,
  rename,
  copyFile,
  stat,
} from "node:fs/promises";
import { join } from "node:path";
import type { WorkspaceLoad } from "../shared/contracts";

/**
 * Windows refuses to replace a file another process has open (antivirus,
 * backup and sync tools, indexers), failing with EPERM/EACCES/EBUSY. Such
 * locks are brief, so the replace is retried for up to about two seconds.
 */
export async function replaceFile(
  from: string,
  to: string,
  move: (from: string, to: string) => Promise<void> = rename,
): Promise<void> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await move(from, to);
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code ?? "";
      if (attempt >= 20 || !["EPERM", "EACCES", "EBUSY"].includes(code))
        throw error;
      await new Promise((done) =>
        setTimeout(done, Math.min(10 * 2 ** attempt, 100)),
      );
    }
  }
}

function describeKept(kept: string[], directory: string): string {
  const names = kept.filter(Boolean);
  return names.length
    ? ` The unreadable file was kept as ${names.join(" and ")} in ${directory}.`
    : "";
}

export class WorkspaceStore {
  private pending: Promise<void> = Promise.resolve();
  /** True once workspace.json is known to hold a file this store read or wrote successfully. */
  private primaryKnownGood = false;
  constructor(
    private readonly directory: string,
    private readonly validate: (value: unknown) => unknown = (value) => value,
    /** Save-time check; callers that already validated pass a cheaper one. */
    private readonly validateSave: (value: unknown) => unknown = validate,
  ) {}
  private async read(path: string): Promise<unknown> {
    if ((await stat(path)).size > 5_000_000)
      throw new Error("Workspace exceeds the size limit");
    return this.validate(JSON.parse(await readFile(path, "utf8")));
  }
  /** Keeps an unreadable file for manual recovery; later saves never touch it. */
  private async quarantine(name: string, stamp: string): Promise<string> {
    const copy = name.replace(/\.json$/, `.corrupt-${stamp}.json`);
    try {
      await copyFile(join(this.directory, name), join(this.directory, copy));
      return copy;
    } catch {
      return "";
    }
  }
  async load(): Promise<WorkspaceLoad> {
    await this.pending;
    // Trust only what this load proves; a failed primary must be re-checked
    // before it may replace the backup.
    this.primaryKnownGood = false;
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    try {
      const workspace = await this.read(join(this.directory, "workspace.json"));
      this.primaryKnownGood = true;
      return { workspace };
    } catch (error) {
      const primaryMissing = (error as NodeJS.ErrnoException).code === "ENOENT";
      const kept = primaryMissing
        ? []
        : [await this.quarantine("workspace.json", stamp)];
      try {
        return {
          workspace: await this.read(
            join(this.directory, "workspace.backup.json"),
          ),
          warning: `The workspace file was missing or unreadable. Restored the previous backup.${describeKept(kept, this.directory)}`,
        };
      } catch (backupError) {
        const backupMissing =
          (backupError as NodeJS.ErrnoException).code === "ENOENT";
        if (primaryMissing && backupMissing) return { workspace: null };
        if (!backupMissing)
          kept.push(await this.quarantine("workspace.backup.json", stamp));
        return {
          workspace: null,
          warning: `The workspace file was missing or unreadable. Starting a fresh workspace.${describeKept(kept, this.directory)}`,
        };
      }
    }
  }
  async save(workspace: unknown): Promise<void> {
    const serialized = JSON.stringify(this.validateSave(workspace), null, 2);
    if (Buffer.byteLength(serialized, "utf8") > 5_000_000)
      throw new Error("Workspace exceeds the size limit");
    const task = this.pending.then(async () => {
      await mkdir(this.directory, { recursive: true });
      const target = join(this.directory, "workspace.json");
      const temporary = join(this.directory, "workspace.tmp");
      await writeFile(temporary, serialized, {
        encoding: "utf8",
        mode: 0o600,
        flush: true,
      });
      // Only a valid previous workspace may replace the usable backup. A file
      // this store loaded or wrote is known valid, so it is not re-parsed.
      let validPrevious = this.primaryKnownGood;
      if (!validPrevious)
        try {
          await this.read(target);
          validPrevious = true;
        } catch (error) {
          const code = (error as NodeJS.ErrnoException).code;
          if (code && code !== "ENOENT") throw error;
        }
      if (validPrevious)
        await copyFile(target, join(this.directory, "workspace.backup.json"));
      await replaceFile(temporary, target);
      this.primaryKnownGood = true;
    });
    this.pending = task.catch(() => {});
    return task;
  }
  flush(): Promise<void> {
    return this.pending;
  }
}
