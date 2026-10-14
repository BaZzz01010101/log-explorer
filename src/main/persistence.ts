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

export class WorkspaceStore {
  private pending: Promise<void> = Promise.resolve();
  constructor(
    private readonly directory: string,
    private readonly validate: (value: unknown) => unknown = (value) => value,
  ) {}
  private async read(path: string): Promise<unknown> {
    if ((await stat(path)).size > 5_000_000)
      throw new Error("Workspace exceeds the size limit");
    return this.validate(JSON.parse(await readFile(path, "utf8")));
  }
  async load(): Promise<WorkspaceLoad> {
    await this.pending;
    try {
      return {
        workspace: await this.read(join(this.directory, "workspace.json")),
      };
    } catch (error) {
      const primaryMissing = (error as NodeJS.ErrnoException).code === "ENOENT";
      try {
        return {
          workspace: await this.read(
            join(this.directory, "workspace.backup.json"),
          ),
          warning:
            "The workspace file was missing or unreadable. Restored the previous backup.",
        };
      } catch (backupError) {
        if (
          primaryMissing &&
          (backupError as NodeJS.ErrnoException).code === "ENOENT"
        )
          return { workspace: null };
        return {
          workspace: null,
          warning:
            "The workspace file was missing or unreadable. Starting a fresh workspace; existing files are retained until you save.",
        };
      }
    }
  }
  async save(workspace: unknown): Promise<void> {
    const serialized = JSON.stringify(this.validate(workspace), null, 2);
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
      // Only a valid previous workspace may replace the usable backup.
      let validPrevious = false;
      try {
        await this.read(target);
        validPrevious = true;
      } catch (error) {
        const code = (error as NodeJS.ErrnoException).code;
        if (code && code !== "ENOENT") throw error;
      }
      if (validPrevious)
        await copyFile(target, join(this.directory, "workspace.backup.json"));
      await rename(temporary, target);
    });
    this.pending = task.catch(() => {});
    return task;
  }
  flush(): Promise<void> {
    return this.pending;
  }
}
